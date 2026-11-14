#!/usr/bin/env node
/* 临时调试脚本：连接题庄 MCP，打印工具列表与输入 schema。
 * 用法：node tools/mcp-probe.js [toolName] [jsonArgs]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(root, '.env.local');
const env = {};
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].trim();
  });
}

const KEY = env.TIZHUANG_API_KEY;
const URL = env.TIZHUANG_MCP_URL || 'https://tizhuang.qcscience.cc/mcp';
if (!KEY) {
  console.error('缺少 TIZHUANG_API_KEY');
  process.exit(1);
}

let sessionId = null;
let nextId = 1;

function headers(extra) {
  return Object.assign(
    {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'X-API-Key': KEY,
    },
    sessionId ? { 'Mcp-Session-Id': sessionId } : {},
    extra || {}
  );
}

async function parseResponse(res) {
  const sid = res.headers.get('mcp-session-id');
  if (sid) sessionId = sid;
  const ct = res.headers.get('content-type') || '';
  const text = await res.text();
  if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + text.slice(0, 500));
  if (ct.indexOf('text/event-stream') !== -1) {
    const events = text.split(/\r?\n\r?\n/);
    for (const ev of events) {
      const data = ev
        .split(/\r?\n/)
        .filter((l) => l.indexOf('data:') === 0)
        .map((l) => l.slice(5).trim())
        .join('\n');
      if (data) {
        try {
          return JSON.parse(data);
        } catch (e) {}
      }
    }
    throw new Error('无法解析 SSE 响应: ' + text.slice(0, 500));
  }
  return JSON.parse(text);
}

async function rpc(method, params, notify) {
  const body = { jsonrpc: '2.0', method, params: params || {} };
  if (!notify) body.id = nextId++;
  const res = await fetch(URL, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  if (notify) {
    const sid = res.headers.get('mcp-session-id');
    if (sid) sessionId = sid;
    await res.text();
    return null;
  }
  const data = await parseResponse(res);
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data.result;
}

(async () => {
  const init = await rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'ink-tizhuang', version: '0.1.0' },
  });
  console.log('=== initialize ===');
  console.log(JSON.stringify(init, null, 2));
  await rpc('notifications/initialized', {}, true);

  const tools = await rpc('tools/list', {});
  console.log('\n=== tools/list ===');
  console.log(JSON.stringify(tools, null, 2));

  const toolName = process.argv[2];
  if (toolName) {
    const args = process.argv[3] ? JSON.parse(process.argv[3]) : {};
    const result = await rpc('tools/call', { name: toolName, arguments: args });
    console.log('\n=== tools/call ' + toolName + ' ===');
    console.log(JSON.stringify(result, null, 2));
  }
})().catch((e) => {
  console.error(e.stack || e);
  process.exit(1);
});
