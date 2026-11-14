'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { McpClient, McpError, DEFAULT_MCP_URL } = require('./lib/mcp');
const tizhuang = require('./lib/tizhuang');
const { buildMockPaper } = require('./lib/mock');

const ROOT = __dirname;
const CACHE_DIR = path.join(ROOT, '.cache', 'papers');
const EDITION_DIR = path.join(ROOT, '.cache', 'editions');
const EDITION_TTL = 7 * 24 * 60 * 60 * 1000;
const KNOWLEDGE_TTL = 30 * 60 * 1000;
const CACHE_VERSION = 'v6';
const knowledgeCache = {};

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || /^\s*#/.test(line)) continue;
    const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const key = match[1];
    let value = match[2];
    if ((value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') ||
        (value.charAt(0) === "'" && value.charAt(value.length - 1) === "'")) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(ROOT, '.env.local'));
loadEnvFile(path.join(ROOT, '.env'));

const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || '0.0.0.0';
const API_KEY = process.env.TIZHUANG_API_KEY || '';
const MCP_URL = process.env.TIZHUANG_MCP_URL || DEFAULT_MCP_URL;

const client = API_KEY
  ? new McpClient({ url: MCP_URL, apiKey: API_KEY, timeoutMs: 45000 })
  : null;

let lastQuota = null;

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(body);
}

function sendText(res, status, text, contentType) {
  res.writeHead(status, {
    'Content-Type': (contentType || 'text/plain') + '; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(text);
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    let data = '';
    req.on('data', function (chunk) {
      data += chunk;
      if (data.length > 2 * 1024 * 1024) {
        reject(new McpError('请求内容过大', { code: 'BAD_REQUEST' }));
        req.destroy();
      }
    });
    req.on('end', function () {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new McpError('请求格式不是合法 JSON', { code: 'BAD_REQUEST' }));
      }
    });
    req.on('error', reject);
  });
}

function cacheFile(profile) {
  const hash = tizhuang.configHash(profile);
  return path.join(CACHE_DIR, CACHE_VERSION + '-' + tizhuang.todayKey() + '-' + hash + '.json');
}

function readCache(profile) {
  try {
    const file = cacheFile(profile);
    if (!fs.existsSync(file)) return null;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data || !data.paper || data.paper.date !== tizhuang.todayKey()) return null;
    return data;
  } catch (e) {
    return null;
  }
}

function writeCache(profile, data) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cacheFile(profile), JSON.stringify(data), 'utf8');
  } catch (e) {
    console.warn('[cache] 写入失败：' + e.message);
  }
}

function cleanCache() {
  try {
    if (!fs.existsSync(CACHE_DIR)) return;
    const now = Date.now();
    const files = fs.readdirSync(CACHE_DIR);
    for (let i = 0; i < files.length; i++) {
      const file = path.join(CACHE_DIR, files[i]);
      const stat = fs.statSync(file);
      if (now - stat.mtimeMs > 14 * 24 * 60 * 60 * 1000) fs.unlinkSync(file);
    }
  } catch (e) {
    // 忽略缓存清理失败
  }

  try {
    if (!fs.existsSync(EDITION_DIR)) return;
    const now = Date.now();
    const files = fs.readdirSync(EDITION_DIR);
    for (let i = 0; i < files.length; i++) {
      const file = path.join(EDITION_DIR, files[i]);
      const stat = fs.statSync(file);
      if (now - stat.mtimeMs > 14 * 24 * 60 * 60 * 1000) fs.unlinkSync(file);
    }
  } catch (e) {
    // 忽略缓存清理失败
  }
}

function editionCacheFile(stageKey, gradeId) {
  return path.join(EDITION_DIR, stageKey + '-' + gradeId + '.json');
}

function readEditionCache(stageKey, gradeId) {
  try {
    const file = editionCacheFile(stageKey, gradeId);
    if (!fs.existsSync(file)) return null;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data || !data.fetchedAt) return null;
    if (Date.now() - data.fetchedAt > EDITION_TTL) return null;
    return data;
  } catch (e) {
    return null;
  }
}

function writeEditionCache(stageKey, gradeId, data) {
  try {
    fs.mkdirSync(EDITION_DIR, { recursive: true });
    fs.writeFileSync(editionCacheFile(stageKey, gradeId), JSON.stringify(data), 'utf8');
  } catch (e) {
    console.warn('[editions] 缓存写入失败：' + e.message);
  }
}

function errorStatus(error) {
  const code = error && error.code;
  if (code === 'BAD_REQUEST') return 400;
  if (code === 'NO_KEY') return 503;
  if (code === 'AUTH') return 502;
  if (code === 'QUOTA') return 429;
  if (code === 'TIMEOUT') return 504;
  if (code === 'NO_QUESTIONS') return 502;
  return 502;
}

function errorPayload(error, debug) {
  const code = (error && error.code) || 'ERROR';
  const payload = {
    code: code,
    message: (error && error.message) || '服务暂时不可用',
  };
  if (debug && error && error.detail) payload.detail = error.detail;
  return payload;
}

function classifyUpstream(error) {
  if (!error) return error;
  const text = String(error.message || '');
  if (/额度|quota|次数|余额/i.test(text)) error.code = 'QUOTA';
  else if (/认证|授权|key|token|unauthorized|401|403/i.test(text)) error.code = 'AUTH';
  return error;
}

async function handlePaper(req, res) {
  const body = await readBody(req);
  const profile = tizhuang.normalizeProfile(body);

  if (body.demo) {
    const result = buildMockPaper(profile);
    return sendJson(res, 200, {
      paper: result.paper,
      quota: null,
      warnings: result.warnings,
      cached: false,
      demo: true,
    });
  }

  if (!client) {
    throw new McpError('还没有配置题庄 Key。请在 .env.local 中填写 TIZHUANG_API_KEY，然后重启服务。', {
      code: 'NO_KEY',
    });
  }

  if (!body.force) {
    const cached = readCache(profile);
    if (cached) {
      return sendJson(res, 200, {
        paper: cached.paper,
        quota: cached.quota || null,
        warnings: cached.warnings || [],
        cached: true,
      });
    }
  }

  let result;
  try {
    result = await tizhuang.buildPaper(client, profile);
  } catch (error) {
    throw classifyUpstream(error);
  }

  if (result.quota) lastQuota = result.quota;
  writeCache(profile, {
    paper: result.paper,
    quota: result.quota,
    warnings: result.warnings,
    cachedAt: Date.now(),
  });

  console.log(
    '[paper] ' + result.paper.date + ' ' + profile.stage + '/' + profile.grade +
    ' 学科=' + profile.subjects.length + ' 题数=' + result.paper.questions.length +
    ' 额度剩余=' + (result.quota && result.quota.remaining != null ? result.quota.remaining : '?')
  );

  sendJson(res, 200, {
    paper: result.paper,
    quota: result.quota,
    warnings: result.warnings,
    cached: false,
  });
}

async function handleStatus(req, res, url) {
  const data = {
    ok: true,
    keyConfigured: !!client,
    mcpUrl: MCP_URL,
    lastQuota: lastQuota,
    stages: tizhuang.STAGES,
    subjects: tizhuang.SUBJECTS,
  };

  if (client && url.searchParams.get('quota') === '1') {
    try {
      const raw = await client.getQuota(true);
      const quota = raw && raw.data ? raw.data : raw;
      data.quota = {
        used: quota.used,
        remaining: quota.remaining,
        dailyLimit: quota.daily_limit,
        date: quota.date,
        plan: quota.plan,
      };
    } catch (error) {
      data.quotaError = classifyUpstream(error).message;
    }
  }

  sendJson(res, 200, data);
}

async function handleEditions(req, res, url) {
  const stage = tizhuang.findStage(url.searchParams.get('stage'));
  if (!stage) throw new McpError('学段不正确', { code: 'BAD_REQUEST' });

  const grade = tizhuang.findGrade(stage, url.searchParams.get('grade'));
  if (!grade) throw new McpError('年级不正确', { code: 'BAD_REQUEST' });

  const force = url.searchParams.get('force') === '1';
  if (!force) {
    const cached = readEditionCache(stage.key, grade.id);
    if (cached) {
      return sendJson(res, 200, {
        ok: true,
        stage: stage.key,
        grade: grade.id,
        editions: cached.editions || {},
        errors: cached.errors || {},
        cached: true,
      });
    }
  }

  if (!client) {
    throw new McpError('还没有配置题庄 Key。请在 .env.local 中填写 TIZHUANG_API_KEY，然后重启服务。', {
      code: 'NO_KEY',
    });
  }

  const editions = {};
  const errors = {};
  for (let i = 0; i < stage.subjects.length; i++) {
    const subjectId = stage.subjects[i];
    try {
      editions[subjectId] = await tizhuang.listEditions(client, stage.key, grade.id, subjectId);
    } catch (error) {
      const classified = classifyUpstream(error);
      const code = classified && classified.code;
      if (code === 'AUTH' || code === 'QUOTA' || code === 'TIMEOUT' || code === 'NETWORK' || code === 'INIT') {
        throw classified;
      }
      editions[subjectId] = [];
      errors[subjectId] = (error && error.message) || '教材版本获取失败';
    }
  }

  if (!Object.keys(errors).length) {
    writeEditionCache(stage.key, grade.id, {
      fetchedAt: Date.now(),
      editions: editions,
      errors: errors,
    });
  }

  sendJson(res, 200, {
    ok: true,
    stage: stage.key,
    grade: grade.id,
    editions: editions,
    errors: errors,
    cached: false,
  });
}

async function handleKnowledge(req, res, url) {
  const stage = tizhuang.findStage(url.searchParams.get('stage'));
  if (!stage) throw new McpError('学段不正确', { code: 'BAD_REQUEST' });

  const subjectId = Number(url.searchParams.get('subject'));
  if (stage.subjects.indexOf(subjectId) === -1) {
    throw new McpError('学科不正确', { code: 'BAD_REQUEST' });
  }

  const keyword = String(url.searchParams.get('keyword') || '').trim().slice(0, 40);
  const key = stage.key + '|' + subjectId + '|' + keyword;
  const now = Date.now();
  const cached = knowledgeCache[key];
  if (cached && now - cached.at < KNOWLEDGE_TTL) {
    return sendJson(res, 200, {
      ok: true,
      subject: subjectId,
      keyword: keyword,
      items: cached.items,
      cached: true,
    });
  }

  if (!client) {
    throw new McpError('还没有配置题庄 Key。请在 .env.local 中填写 TIZHUANG_API_KEY，然后重启服务。', {
      code: 'NO_KEY',
    });
  }

  let items;
  try {
    items = await tizhuang.searchKnowledge(client, stage.key, subjectId, keyword, 30);
  } catch (error) {
    throw classifyUpstream(error);
  }

  knowledgeCache[key] = { at: now, items: items };
  sendJson(res, 200, {
    ok: true,
    subject: subjectId,
    keyword: keyword,
    items: items,
    cached: false,
  });
}

async function handleQuota(req, res) {
  if (!client) {
    throw new McpError('还没有配置题庄 Key。', { code: 'NO_KEY' });
  }
  try {
    const raw = await client.getQuota(true);
    const quota = raw && raw.data ? raw.data : raw;
    sendJson(res, 200, {
      ok: true,
      quota: {
        used: quota.used,
        remaining: quota.remaining,
        dailyLimit: quota.daily_limit,
        date: quota.date,
        plan: quota.plan,
      },
    });
  } catch (error) {
    throw classifyUpstream(error);
  }
}

async function handleTools(req, res) {
  if (!client) {
    throw new McpError('还没有配置题庄 Key。', { code: 'NO_KEY' });
  }
  const tools = await client.listTools();
  sendJson(res, 200, { ok: true, tools: tools });
}

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);

  if (pathname === '/' || pathname === '/index.html') {
    pathname = '/index.html';
  }

  let file = null;
  if (pathname === '/index.html') {
    file = path.join(ROOT, 'index.html');
  } else if (pathname.indexOf('/assets/') === 0) {
    const name = path.basename(pathname);
    if (name !== pathname.slice('/assets/'.length)) return sendText(res, 404, 'Not Found');
    file = path.join(ROOT, 'assets', name);
  } else if (pathname === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }

  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return sendText(res, 404, 'Not Found');
  }

  const ext = path.extname(file).toLowerCase();
  const types = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain',
  };

  const content = fs.readFileSync(file);
  const headers = {
    'Content-Type': (types[ext] || 'application/octet-stream') + (types[ext] === 'image/png' || types[ext] === 'image/svg+xml' ? '' : '; charset=utf-8'),
    'Cache-Control': (ext === '.png' || ext === '.jpg' || ext === '.svg' || ext === '.ico')
      ? 'public, max-age=86400'
      : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };

  if (ext === '.html') {
    headers['X-Frame-Options'] = 'DENY';
    headers['Content-Security-Policy'] =
      "default-src 'self'; img-src 'self' data: https://tizhaung.tos-cn-beijing.volces.com; " +
      "style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
  }

  res.writeHead(200, headers);
  res.end(content);
}

const server = http.createServer(async function (req, res) {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));

  try {
    if (url.pathname === '/api/paper') {
      if (req.method !== 'POST') return sendJson(res, 405, { code: 'METHOD', message: '请使用 POST' });
      return await handlePaper(req, res);
    }

    if (url.pathname === '/api/status') {
      return await handleStatus(req, res, url);
    }

    if (url.pathname === '/api/editions') {
      return await handleEditions(req, res, url);
    }

    if (url.pathname === '/api/knowledge') {
      return await handleKnowledge(req, res, url);
    }

    if (url.pathname === '/api/quota') {
      return await handleQuota(req, res);
    }

    if (url.pathname === '/api/tools') {
      return await handleTools(req, res);
    }

    if (url.pathname.indexOf('/api/') === 0) {
      return sendJson(res, 404, { code: 'NOT_FOUND', message: '接口不存在' });
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendText(res, 405, 'Method Not Allowed');
    }

    serveStatic(req, res, url);
  } catch (error) {
    const debug = process.env.DEBUG === '1';
    if (!(error instanceof McpError)) console.error('[error]', error);
    else if (debug) console.error('[error]', error);
    sendJson(res, errorStatus(error), errorPayload(error, debug));
  }
});

server.on('error', function (error) {
  if (error && error.code === 'EADDRINUSE') {
    console.error('端口 ' + PORT + ' 已被占用。请先停止旧进程，或设置 PORT=其他端口 再启动。');
  } else {
    console.error('服务启动失败：' + (error && error.message ? error.message : error));
  }
  process.exit(1);
});

server.listen(PORT, HOST, function () {
  cleanCache();
  const lines = [];
  lines.push('墨题服务已启动');
  lines.push('本机：http://localhost:' + PORT);
  const nets = os.networkInterfaces();
  Object.keys(nets).forEach(function (name) {
    (nets[name] || []).forEach(function (net) {
      if (net.family === 'IPv4' && !net.internal) {
        lines.push('局域网：http://' + net.address + ':' + PORT + '（电纸书用这个地址）');
      }
    });
  });
  lines.push('题庄 Key：' + (API_KEY ? '已配置' : '未配置（可在 .env.local 中填写）'));
  console.log(lines.join('\n'));
});
