/**
 * 本地服务：静态资源 + IF-01 转发层（对应实验3 ADR-002 的"云函数只做转发"）
 *
 * 职责边界：
 *  ① 提供 web/ 与 core/ 静态资源（表现层与业务层都跑在浏览器里，业务数据只存本机）；
 *  ② 唯一对外接口 POST /api/recommend —— 托管模型密钥、超时与费用熔断，业务逻辑不下沉；
 *  ③ 日志落盘：data/logs/app.log（服务端事件）与 data/logs/llm-usage.jsonl（时延与 token，NFR-12 证据）。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { createMockModel } from './mock-llm.js';
import { createRetriever } from '../rag/retriever.js';
import { createGateway } from '../rag/gateway.js';
import { createRagService } from '../rag/index.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const PAGE_ROUTES = {
  '/': 'web/index.html',
  '/index.html': 'web/index.html',
  '/menu': 'web/menu.html',
  '/recommend': 'web/recommend.html',
  '/record': 'web/record.html',
  '/privacy': 'web/privacy.html',
  '/rag': 'web/rag.html',
};

/** 静态资源前缀 → 仓库内实际目录（表现层在 web/，业务层在 core/） */
const STATIC_PREFIXES = {
  '/core/': 'core/',
  '/js/': 'web/js/',
  '/css/': 'web/css/',
  '/sample-data/': 'sample-data/',
};

const logDir = path.resolve(config.root, config.logDir);
fs.mkdirSync(logDir, { recursive: true });
const appLogPath = path.join(logDir, 'app.log');
const usageLogPath = path.join(logDir, 'llm-usage.jsonl');

function appendLine(file, obj) {
  try {
    fs.appendFileSync(file, `${JSON.stringify(obj)}\n`, 'utf8');
  } catch {
    /* 日志失败不影响请求 */
  }
}

function logEvent(level, event, data = {}) {
  const entry = { ts: new Date().toISOString(), level, scope: 'server', event, ...data };
  if (!config.cleanMode) {
    console.log(`[${entry.ts}] ${level.toUpperCase()} ${event} ${JSON.stringify(data)}`);
  }
  appendLine(appLogPath, entry);
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

function readJsonBody(req, limitBytes = 512 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) {
        reject(Object.assign(new Error('请求体过大'), { code: 'PAYLOAD_TOO_LARGE' }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(Object.assign(new Error('请求体不是合法 JSON'), { code: 'BAD_JSON' }));
      }
    });
    req.on('error', reject);
  });
}

/** 真实模型调用：OpenAI 兼容接口，5 秒超时（ADR-002：密钥只在服务端） */
async function callRealModel(payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  try {
    const res = await fetch(`${config.llmBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.llmApiKey}`,
      },
      body: JSON.stringify({
        model: config.llmModel,
        messages: [
          { role: 'system', content: '你是校园食堂选餐助手，只能在候选菜品集合内挑选，输出 JSON。' },
          { role: 'user', content: JSON.stringify(payload) },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = new Error(`模型服务返回 HTTP ${res.status}`);
      err.code = res.status === 429 ? 'RATE_LIMIT' : 'UPSTREAM_ERROR';
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(text);
    return { items: parsed.items ?? [], engine: 'ai', model: config.llmModel, usage: { tokens: data?.usage?.total_tokens ?? null } };
  } finally {
    clearTimeout(timer);
  }
}

/** RAG 链路（实验5）：进程内单例，索引与检索器只建一次；模型网关复用服务端配置 */
let ragCtx = null;
function getRag() {
  if (ragCtx) return ragCtx;
  const indexFile = path.join(config.root, 'rag', 'index', 'chunks.json');
  if (!fs.existsSync(indexFile)) throw new Error('知识库索引不存在，请先运行 node rag/build-index.mjs');
  const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  const retriever = createRetriever({ chunks: index.chunks });
  const gateway = createGateway({
    mode: config.llmMode,
    baseUrl: config.llmBaseUrl,
    model: config.llmModel,
    apiKey: config.llmApiKey,
    // RAG 回答比"挑 3 道菜"更长，超时放宽到 3 倍（仍小于客户端的等待上限）
    timeoutMs: config.requestTimeoutMs * 3,
    logFile: path.join(logDir, 'rag-calls.jsonl'),
  });
  const rag = createRagService({ retriever, gateway });
  ragCtx = { index, retriever, rag };
  return ragCtx;
}

function serveStatic(req, res, pathname) {
  let rel = null;
  if (PAGE_ROUTES[pathname]) rel = PAGE_ROUTES[pathname];
  else {
    const prefix = Object.keys(STATIC_PREFIXES).find((p) => pathname.startsWith(p));
    if (prefix) rel = STATIC_PREFIXES[prefix] + pathname.slice(prefix.length);
  }
  if (!rel) return false;

  const target = path.resolve(config.root, rel);
  if (!target.startsWith(path.resolve(config.root))) {
    sendJson(res, 403, { error: { code: 'FORBIDDEN', message: '路径越界' } });
    return true;
  }
  fs.readFile(target, (err, buf) => {
    if (err) {
      sendJson(res, 404, { error: { code: 'NOT_FOUND', message: `缺少文件：${rel}` } });
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(target)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(buf);
  });
  return true;
}

export function createServer({ startedAt = new Date().toISOString() } = {}) {
  const mock = createMockModel({ mode: 'normal' });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host ?? '127.0.0.1'}`);
    const { pathname } = url;

    if (req.method === 'GET' || req.method === 'HEAD') {
      if (pathname === '/api/health') {
        let kbStats = null;
        try {
          const { index } = getRag();
          kbStats = index.stats;
        } catch { /* 索引没建时报 null，不影响健康检查 */ }
        return sendJson(res, 200, {
          ok: true,
          llmMode: config.llmMode,
          model: config.llmMode === 'real' ? config.llmModel : 'mock-llm-v1',
          modelMock: config.llmMode !== 'real',
          kbStats,
          node: process.version,
          port: config.port,
          startedAt,
          uptimeMs: Date.now() - Date.parse(startedAt),
        });
      }
      if (serveStatic(req, res, pathname)) return;
      return sendJson(res, 404, { error: { code: 'NOT_FOUND', message: `未找到资源 ${pathname}` } });
    }

    if (req.method === 'POST' && pathname === '/api/log') {
      try {
        const body = await readJsonBody(req, 64 * 1024);
        const entries = Array.isArray(body.entries) ? body.entries : [body];
        entries.forEach((e) => appendLine(appLogPath, { scope: 'web', ...e }));
        return sendJson(res, 200, { ok: true, count: entries.length });
      } catch (err) {
        return sendJson(res, 400, { error: { code: err.code ?? 'BAD_REQUEST', message: err.message } });
      }
    }

    if (req.method === 'POST' && pathname === '/api/rag') {
      try {
        const body = await readJsonBody(req, 16 * 1024);
        const question = String(body?.question ?? '').trim();
        if (!question) return sendJson(res, 400, { error: { code: 'EMPTY_QUESTION', message: '问题不能为空' } });
        const { rag } = getRag();
        const resData = await rag.ask({ question, topK: Number(body?.topK ?? 4) || 4 });
        logEvent('info', 'rag.answer', {
          questionChars: question.length,
          mode: config.llmMode,
          insufficient: resData.insufficient,
          citations: resData.citations.length,
          latencyMs: resData.latencyMs,
          tokens: resData.tokens?.totalTokens ?? null,
        });
        return sendJson(res, 200, { mode: config.llmMode, model: resData.model ?? null, ...resData });
      } catch (err) {
        const code = err.code ?? 'RAG_FAILED';
        logEvent('error', 'rag.failed', { code, message: String(err.message).slice(0, 300) });
        return sendJson(res, code === 'UNAUTHORIZED' ? 502 : 500, { error: { code, message: err.message } });
      }
    }

    if (req.method === 'POST' && pathname === '/api/recommend') {
      const startedAtReq = Date.now();
      let payload;
      try {
        payload = await readJsonBody(req);
      } catch (err) {
        logEvent('warn', 'if01.bad_request', { code: err.code, message: err.message });
        return sendJson(res, 400, { error: { code: err.code ?? 'BAD_REQUEST', message: err.message } });
      }

      // 本地测试开关：用请求头注入真实模型也会出现的故障，验证程序侧护栏（仅 mock 模式生效）
      const injected = config.llmMode === 'mock' ? req.headers['x-zs-mock-mode'] ?? url.searchParams.get('mock') ?? 'normal' : 'normal';
      const dishCount = payload?.dishes?.length ?? 0;
      logEvent('info', 'if01.request', { dishCount, topN: payload?.topN ?? null, injectedMode: injected, avoidCount: payload?.profileSummary?.avoidCount ?? null });

      try {
        let output;
        if (injected === 'timeout') {
          await new Promise((r) => setTimeout(r, config.requestTimeoutMs + 1500));
          output = { items: [], engine: 'ai', model: 'mock-llm-v1/timeout', usage: { tokens: 0 } };
          logEvent('warn', 'if01.timeout', { dishCount, latencyMs: Date.now() - startedAtReq });
          return sendJson(res, 504, { error: { code: 'TIMEOUT', message: '模型服务响应超时' } });
        }
        if (config.llmMode === 'real') {
          output = await callRealModel(payload);
        } else {
          output = await createMockModel({ mode: injected }).complete(payload);
        }

        const latencyMs = Date.now() - startedAtReq;
        appendLine(usageLogPath, {
          ts: new Date().toISOString(),
          mode: config.llmMode,
          injected,
          dishCount,
          tokens: output?.usage?.tokens ?? null,
          latencyMs,
          itemCount: output?.items?.length ?? 0,
        });
        logEvent('info', 'if01.response', { itemCount: output?.items?.length ?? 0, latencyMs, tokens: output?.usage?.tokens ?? null, model: output.model });
        return sendJson(res, 200, output);
      } catch (err) {
        const latencyMs = Date.now() - startedAtReq;
        const code = err.code ?? 'UPSTREAM_ERROR';
        const status = err.status ?? 502;
        appendLine(usageLogPath, { ts: new Date().toISOString(), mode: config.llmMode, injected, dishCount, tokens: null, latencyMs, error: code });
        logEvent('error', 'if01.failed', { code, status, message: err.message, latencyMs });
        return sendJson(res, status, { error: { code, message: err.message } });
      }
    }

    return sendJson(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: `${req.method} ${pathname} 不支持` } });
  });

  return server;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const startedAt = new Date().toISOString();
  const server = createServer({ startedAt });
  server.listen(config.port, config.host, () => {
    logEvent('info', 'server.started', {
      url: `http://${config.host}:${config.port}/`,
      llmMode: config.llmMode,
      model: config.llmMode === 'real' ? config.llmModel : 'mock-llm-v1',
      root: config.root,
      node: process.version,
    });
    if (!config.cleanMode) {
      console.log(`知食校园已启动：http://${config.host}:${config.port}/  （模型模式：${config.llmMode}）`);
    }
  });
  const shutdown = (sig) => {
    logEvent('info', 'server.stopped', { signal: sig });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
