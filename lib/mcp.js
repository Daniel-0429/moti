'use strict';

const DEFAULT_MCP_URL = 'https://tizhuang.qcscience.cc/mcp';
const PROTOCOL_VERSION = '2025-06-18';

class McpError extends Error {
  constructor(message, options) {
    super(message);
    this.name = 'McpError';
    this.code = (options && options.code) || 'MCP_ERROR';
    this.status = options && options.status;
    this.detail = options && options.detail;
  }
}

function parseSse(text) {
  const events = [];
  const blocks = String(text).split(/\r?\n\r?\n/);
  for (let i = 0; i < blocks.length; i++) {
    const lines = blocks[i].split(/\r?\n/);
    const data = [];
    for (let j = 0; j < lines.length; j++) {
      if (lines[j].indexOf('data:') === 0) data.push(lines[j].slice(5).replace(/^ /, ''));
    }
    if (!data.length) continue;
    const payload = data.join('\n');
    try {
      events.push(JSON.parse(payload));
    } catch (e) {
      // 忽略无法解析的 SSE 注释/心跳
    }
  }
  return events;
}

class McpClient {
  constructor(options) {
    this.url = options.url || DEFAULT_MCP_URL;
    this.apiKey = options.apiKey || '';
    this.sessionId = null;
    this.initialized = false;
    this.nextId = 1;
    this.timeoutMs = options.timeoutMs || 30000;
    this._chain = Promise.resolve();
    this._tools = null;
    this._quota = null;
    this._quotaAt = 0;
  }

  headers() {
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'X-API-Key': this.apiKey,
    };
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;
    return headers;
  }

  enqueue(task) {
    const run = this._chain.then(task, task);
    this._chain = run.then(function () {}, function () {});
    return run;
  }

  async request(method, params, id) {
    const controller = new AbortController();
    const timer = setTimeout(function () {
      controller.abort();
    }, this.timeoutMs);

    let response;
    try {
      response = await fetch(this.url, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: id,
          method: method,
          params: params || {},
        }),
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timer);
      if (error && error.name === 'AbortError') {
        throw new McpError('题庄接口超时（' + Math.round(this.timeoutMs / 1000) + ' 秒）', { code: 'TIMEOUT' });
      }
      throw new McpError('无法连接题庄接口：' + (error && error.message ? error.message : '网络错误'), { code: 'NETWORK' });
    }
    const session = response.headers.get('mcp-session-id');
    if (session) this.sessionId = session;

    const contentType = response.headers.get('content-type') || '';
    let text = '';
    try {
      text = await response.text();
    } catch (error) {
      throw new McpError('读取题庄响应失败：' + (error && error.message ? error.message : '网络错误'), {
        code: 'NETWORK',
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      let detail = text;
      try {
        const parsed = JSON.parse(text);
        if (parsed && parsed.error && parsed.error.message) detail = parsed.error.message;
      } catch (e) {}
      throw new McpError('题庄接口返回 HTTP ' + response.status + (detail ? '：' + String(detail).slice(0, 300) : ''), {
        code: response.status === 401 || response.status === 403 ? 'AUTH' : 'HTTP',
        status: response.status,
        detail: text.slice(0, 1000),
      });
    }

    if (contentType.indexOf('text/event-stream') !== -1) {
      const events = parseSse(text);
      for (let i = 0; i < events.length; i++) {
        if (events[i] && events[i].id === id) return events[i];
      }
      throw new McpError('题庄接口没有返回有效的 SSE 响应', { code: 'BAD_RESPONSE', detail: text.slice(0, 1000) });
    }

    try {
      return JSON.parse(text);
    } catch (e) {
      throw new McpError('题庄接口返回了无法解析的数据', { code: 'BAD_RESPONSE', detail: text.slice(0, 1000) });
    }
  }

  async ensureInitialized() {
    if (this.initialized) return;

    const init = await this.request(
      'initialize',
      {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'ink-tizhuang', version: '1.0.0' },
      },
      this.nextId++
    );

    if (!init || init.error) {
      throw new McpError('题庄 MCP 初始化失败：' + (init && init.error ? init.error.message : '未知错误'), {
        code: 'INIT',
        detail: init,
      });
    }

    // notifications/initialized 没有 id，服务端通常返回 202
    try {
      await this.request('notifications/initialized', {}, undefined);
    } catch (e) {
      // 有的服务端不接受该通知，不影响后续 tools 调用
    }

    this.initialized = true;
    return init.result;
  }

  async rpc(method, params, options) {
    const self = this;
    return this.enqueue(async function () {
      await self.ensureInitialized();

      async function call() {
        const id = self.nextId++;
        return self.request(method, params, id);
      }

      let result;
      try {
        result = await call();
      } catch (error) {
        // 会话过期时重新初始化一次；认证/额度/超时错误不重试
        const sessionExpired = error && (error.status === 404 || error.status === 400) &&
          /session|会话/i.test(String(error.message || ''));
        if (!sessionExpired) throw error;
        self.sessionId = null;
        self.initialized = false;
        await self.ensureInitialized();
        result = await call();
      }

      if (result && result.error) {
        throw new McpError(result.error.message || '题庄接口返回错误', {
          code: result.error.code || 'RPC_ERROR',
          detail: result.error.data,
        });
      }
      return result ? result.result : null;
    });
  }

  async listTools() {
    if (this._tools) return this._tools;
    const result = await this.rpc('tools/list', {});
    this._tools = (result && result.tools) || [];
    return this._tools;
  }

  async callTool(name, args) {
    const result = await this.rpc('tools/call', { name: name, arguments: args || {} });

    if (result && result.isError) {
      const first = result.content && result.content[0];
      throw new McpError((first && first.text) || '题庄工具调用失败', { code: 'TOOL_ERROR', detail: result });
    }

    if (result && result.structuredContent) return result.structuredContent;

    const content = (result && result.content) || [];
    for (let i = 0; i < content.length; i++) {
      if (content[i] && content[i].type === 'text') {
        try {
          return JSON.parse(content[i].text);
        } catch (e) {
          return { text: content[i].text };
        }
      }
    }
    return result || {};
  }

  async getQuota(force) {
    const now = Date.now();
    if (!force && this._quota && now - this._quotaAt < 60000) return this._quota;
    const data = await this.callTool('get_quota', {});
    this._quota = data;
    this._quotaAt = now;
    return data;
  }
}

module.exports = {
  McpClient: McpClient,
  McpError: McpError,
  DEFAULT_MCP_URL: DEFAULT_MCP_URL,
};
