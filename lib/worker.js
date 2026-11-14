import { McpClient, McpError, DEFAULT_MCP_URL } from './mcp.js';
import * as tizhuang from './tizhuang.js';
import { buildMockPaper } from './mock.js';

const CACHE_VERSION = 'v6';
const PAPER_TTL = 14 * 24 * 60 * 60;
const EDITION_TTL = 7 * 24 * 60 * 60;
const KNOWLEDGE_TTL = 30 * 60 * 1000;
const knowledgeCache = new Map();

let cachedClient = null;
let cachedClientKey = '';

function getClient(env) {
  const key = (env && env.TIZHUANG_API_KEY) || '';
  if (!key) return null;
  if (cachedClient && cachedClientKey === key) return cachedClient;
  cachedClient = new McpClient({
    url: (env && env.TIZHUANG_MCP_URL) || DEFAULT_MCP_URL,
    apiKey: key,
  });
  cachedClientKey = key;
  return cachedClient;
}

function getKv(env) {
  return env && env.MOTI_CACHE ? env.MOTI_CACHE : null;
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
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

function errorPayload(error) {
  return {
    code: (error && error.code) || 'ERROR',
    message: (error && error.message) || '服务暂时不可用',
  };
}

function classifyUpstream(error) {
  if (!error) return error;
  const text = String(error.message || '');
  if (/额度|quota|次数|余额/i.test(text)) error.code = 'QUOTA';
  else if (/认证|授权|key|token|unauthorized|401|403/i.test(text)) error.code = 'AUTH';
  return error;
}

function errorResponse(error) {
  const normalized = classifyUpstream(error);
  return json(errorPayload(normalized), errorStatus(normalized));
}

async function readBody(request) {
  try {
    const text = await request.text();
    if (!text) return {};
    return JSON.parse(text);
  } catch (e) {
    throw new McpError('请求格式不是合法 JSON', { code: 'BAD_REQUEST' });
  }
}

function paperCacheKey(profile) {
  return 'paper:' + CACHE_VERSION + ':' + tizhuang.todayKey() + ':' + tizhuang.configHash(profile);
}

async function readPaperCache(kv, profile) {
  if (!kv) return null;
  try {
    const data = await kv.get(paperCacheKey(profile), 'json');
    if (!data || !data.paper || data.paper.date !== tizhuang.todayKey()) return null;
    return data;
  } catch (e) {
    return null;
  }
}

async function writePaperCache(kv, profile, data) {
  if (!kv) return;
  try {
    await kv.put(paperCacheKey(profile), JSON.stringify(data), { expirationTtl: PAPER_TTL });
  } catch (e) {
    // 缓存失败不影响本次取题
  }
}

function editionCacheKey(stageKey, gradeId) {
  return 'editions:v1:' + stageKey + ':' + gradeId;
}

async function readEditionCache(kv, stageKey, gradeId) {
  if (!kv) return null;
  try {
    return await kv.get(editionCacheKey(stageKey, gradeId), 'json');
  } catch (e) {
    return null;
  }
}

async function writeEditionCache(kv, stageKey, gradeId, data) {
  if (!kv) return;
  try {
    await kv.put(editionCacheKey(stageKey, gradeId), JSON.stringify(data), { expirationTtl: EDITION_TTL });
  } catch (e) {
    // 忽略缓存写入失败
  }
}

async function handlePaper(context) {
  try {
    const body = await readBody(context.request);
    const profile = tizhuang.normalizeProfile(body);

    if (body.demo) {
      const result = buildMockPaper(profile);
      return json({
        paper: result.paper,
        quota: null,
        warnings: result.warnings,
        cached: false,
        demo: true,
      });
    }

    const client = getClient(context.env);
    if (!client) {
      throw new McpError('还没有配置题庄 Key。请在 Cloudflare Pages 的环境变量中添加 TIZHUANG_API_KEY。', {
        code: 'NO_KEY',
      });
    }

    const kv = getKv(context.env);
    if (!body.force) {
      const cached = await readPaperCache(kv, profile);
      if (cached) {
        return json({
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

    await writePaperCache(kv, profile, {
      paper: result.paper,
      quota: result.quota,
      warnings: result.warnings,
      cachedAt: Date.now(),
    });

    return json({
      paper: result.paper,
      quota: result.quota,
      warnings: result.warnings,
      cached: false,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

async function handleStatus(context) {
  try {
    const url = new URL(context.request.url);
    const client = getClient(context.env);
    const data = {
      ok: true,
      keyConfigured: !!client,
      mcpUrl: (context.env && context.env.TIZHUANG_MCP_URL) || DEFAULT_MCP_URL,
      lastQuota: null,
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

    return json(data);
  } catch (error) {
    return errorResponse(error);
  }
}

async function handleEditions(context) {
  try {
    const url = new URL(context.request.url);
    const stage = tizhuang.findStage(url.searchParams.get('stage'));
    if (!stage) throw new McpError('学段不正确', { code: 'BAD_REQUEST' });

    const grade = tizhuang.findGrade(stage, url.searchParams.get('grade'));
    if (!grade) throw new McpError('年级不正确', { code: 'BAD_REQUEST' });

    const kv = getKv(context.env);
    const force = url.searchParams.get('force') === '1';
    if (!force) {
      const cached = await readEditionCache(kv, stage.key, grade.id);
      if (cached) {
        return json({
          ok: true,
          stage: stage.key,
          grade: grade.id,
          editions: cached.editions || {},
          errors: cached.errors || {},
          cached: true,
        });
      }
    }

    const client = getClient(context.env);
    if (!client) {
      throw new McpError('还没有配置题庄 Key。请在 Cloudflare Pages 的环境变量中添加 TIZHUANG_API_KEY。', {
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
      await writeEditionCache(kv, stage.key, grade.id, {
        fetchedAt: Date.now(),
        editions: editions,
        errors: errors,
      });
    }

    return json({
      ok: true,
      stage: stage.key,
      grade: grade.id,
      editions: editions,
      errors: errors,
      cached: false,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

async function handleKnowledge(context) {
  try {
    const url = new URL(context.request.url);
    const stage = tizhuang.findStage(url.searchParams.get('stage'));
    if (!stage) throw new McpError('学段不正确', { code: 'BAD_REQUEST' });

    const subjectId = Number(url.searchParams.get('subject'));
    if (stage.subjects.indexOf(subjectId) === -1) {
      throw new McpError('学科不正确', { code: 'BAD_REQUEST' });
    }

    const keyword = String(url.searchParams.get('keyword') || '').trim().slice(0, 40);
    const cacheKey = stage.key + '|' + subjectId + '|' + keyword;
    const cached = knowledgeCache.get(cacheKey);
    if (cached && Date.now() - cached.at < KNOWLEDGE_TTL) {
      return json({
        ok: true,
        subject: subjectId,
        keyword: keyword,
        items: cached.items,
        cached: true,
      });
    }

    const client = getClient(context.env);
    if (!client) {
      throw new McpError('还没有配置题庄 Key。请在 Cloudflare Pages 的环境变量中添加 TIZHUANG_API_KEY。', {
        code: 'NO_KEY',
      });
    }

    let items;
    try {
      items = await tizhuang.searchKnowledge(client, stage.key, subjectId, keyword, 30);
    } catch (error) {
      throw classifyUpstream(error);
    }

    knowledgeCache.set(cacheKey, { at: Date.now(), items: items });
    return json({
      ok: true,
      subject: subjectId,
      keyword: keyword,
      items: items,
      cached: false,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

async function handleQuota(context) {
  try {
    const client = getClient(context.env);
    if (!client) {
      throw new McpError('还没有配置题庄 Key。', { code: 'NO_KEY' });
    }
    const raw = await client.getQuota(true);
    const quota = raw && raw.data ? raw.data : raw;
    return json({
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
    return errorResponse(error);
  }
}

async function handleTools(context) {
  try {
    const client = getClient(context.env);
    if (!client) {
      throw new McpError('还没有配置题庄 Key。', { code: 'NO_KEY' });
    }
    const tools = await client.listTools();
    return json({ ok: true, tools: tools });
  } catch (error) {
    return errorResponse(error);
  }
}

function methodNotAllowed(allow) {
  return new Response(JSON.stringify({ code: 'METHOD', message: '请使用 ' + allow }), {
    status: 405,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      Allow: allow,
    },
  });
}

export {
  handlePaper,
  handleStatus,
  handleEditions,
  handleKnowledge,
  handleQuota,
  handleTools,
  methodNotAllowed,
};
