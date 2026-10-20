/**
 * 模型网关（实验5 2.1）
 *
 * 两种模式：
 *  real —— 转发到 OpenAI 兼容的chat/completions 接口（DeepSeek），密钥只在服务端；
 *  mock —— 无密钥/无外网时的确定性替身：按同一份 JSON 契约返回，
 *          用来验证"输入组织—调用—结构化校验—引用核对"整条链路，不用于评价回答质量。
 *
 * 统一处理：超时（默认 20s）、网络错误与 5xx 重试 1 次、4xx 不重试、
 * 记录每次调用的时延与 token（服务端落盘 data/logs/lab5-*.jsonl）。
 */
import fs from 'node:fs';
import path from 'node:path';

export function createGateway({
  mode = 'real',
  baseUrl = 'https://api.deepseek.com/v1',
  model = 'deepseek-chat',
  apiKey = '',
  timeoutMs = 20000,
  retries = 1,
  temperature = 0.3,
  maxTokens = 700,
  logFile = null,
  now = () => Date.now(),
} = {}) {
  const calls = [];

  function log(entry) {
    calls.push(entry);
    if (logFile) {
      try {
        fs.mkdirSync(path.dirname(logFile), { recursive: true });
        fs.appendFileSync(logFile, `${JSON.stringify(entry)}\n`, 'utf8');
      } catch {
        /* 日志失败不影响主流程 */
      }
    }
  }

  async function once(messages) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
          stream: false,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const err = new Error(`模型服务返回 HTTP ${res.status} ${text.slice(0, 200)}`);
        err.status = res.status;
        err.code = res.status === 401 ? 'UNAUTHORIZED' : res.status === 429 ? 'RATE_LIMIT' : res.status >= 500 ? 'UPSTREAM_ERROR' : 'BAD_REQUEST';
        throw err;
      }
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content ?? '';
      return {
        content,
        usage: {
          promptTokens: data?.usage?.prompt_tokens ?? null,
          completionTokens: data?.usage?.completion_tokens ?? null,
          totalTokens: data?.usage?.total_tokens ?? null,
        },
        model: data?.model ?? model,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /** mock 替身：不产生虚构业务数据，只从上下文里摘句回填 JSON 契约 */
  function mockComplete(messages, { question }) {
    const userMsg = messages.find((m) => m.role === 'user')?.content ?? '';
    const lines = userMsg.split('\n');
    const ctxStart = lines.findIndex((l) => l.startsWith('【检索资料】'));
    const qStart = lines.findIndex((l) => l.startsWith('【用户问题】'));
    const contextLines = ctxStart >= 0 && qStart > ctxStart ? lines.slice(ctxStart + 1, qStart) : [];
    const contextText = contextLines.join('\n').trim();
    const innerQuestion = question ?? (qStart >= 0 ? lines.slice(qStart + 1).join('\n').trim() : '');

    // 拆出每个 [S#] 块的正文，保证 quote 是从对应片段原样截取的连续文字
    const blocks = [];
    let current = null;
    for (const line of contextLines) {
      const m = /^\[(S\d+)\]/.exec(line);
      if (m) {
        current = { id: m[1], lines: [] };
        blocks.push(current);
      } else if (current && line.trim()) {
        current.lines.push(line);
      }
    }
    const citations = blocks
      .map((b) => {
        const body = b.lines.join(' ');
        const sentence = body.split(/(?<=[。！？；])/).find((s) => s.trim().length >= 8) ?? body.slice(0, 30);
        return { id: b.id, quote: sentence.trim() };
      })
      .filter((c) => c.quote.length >= 8)
      .slice(0, 2);

    if (contextText === '') {
      // 直接组（没有检索资料）：替身只能回一段"无资料"的占位回答，用来验证链路形状
      const directQuestion = qStart >= 0 ? lines.slice(qStart + 1).join('\n').trim() : innerQuestion;
      return JSON.stringify({
        answer: `（mock 替身：本次没有提供检索资料）我无法依据资料回答「${directQuestion}」，真实模型会在这里自行作答。`,
        citations: [],
        insufficient: false,
        followup: '',
      });
    }
    const firstSentence = blocks.length > 0
      ? (blocks[0].lines.join(' ').split(/(?<=[。！？；])/).find((s) => s.trim().length >= 8) ?? blocks[0].lines.join(' ').slice(0, 90))
      : '';
    return JSON.stringify({
      answer: `根据资料：${firstSentence}（mock 替身仅验证链路，不评价回答质量）`,
      citations,
      insufficient: false,
      followup: '',
    });
  }

  async function chat({ messages, question = '', meta = {} }) {
    const startedAt = now();
    const requested = Math.ceil(messages.reduce((s, m) => s + (m.content?.length ?? 0), 0) * 0.65);
    if (mode === 'mock') {
      const content = mockComplete(messages, { question });
      const entry = {
        ts: new Date().toISOString(),
        mode,
        model: 'mock-llm-v1',
        promptChars: messages.reduce((s, m) => s + (m.content?.length ?? 0), 0),
        promptTokens: requested,
        completionTokens: Math.ceil(content.length * 0.65),
        totalTokens: requested + Math.ceil(content.length * 0.65),
        latencyMs: now() - startedAt,
        ok: true,
        ...meta,
      };
      log(entry);
      return { content, usage: entry, latencyMs: entry.latencyMs, model: entry.model, ok: true };
    }

    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const result = await once(messages);
        const latencyMs = now() - startedAt;
        const entry = {
          ts: new Date().toISOString(),
          mode,
          model: result.model,
          promptChars: messages.reduce((s, m) => s + (m.content?.length ?? 0), 0),
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          totalTokens: result.usage.totalTokens,
          latencyMs,
          attempt,
          ok: true,
          ...meta,
        };
        log(entry);
        return { content: result.content, usage: entry, latencyMs, model: result.model, ok: true };
      } catch (err) {
        lastError = err;
        const rawCode = typeof err.code === 'string' ? err.code : null;
        const code = rawCode ?? (err.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR');
        const retriable = !['UNAUTHORIZED', 'BAD_REQUEST', 'RATE_LIMIT'].includes(code);
        log({
          ts: new Date().toISOString(),
          mode,
          model,
          error: code,
          message: String(err.message).slice(0, 300),
          latencyMs: now() - startedAt,
          attempt,
          ok: false,
          ...meta,
        });
        if (!retriable || attempt >= retries) break;
      }
    }
    const err = new Error(`模型调用失败：${lastError?.message ?? '未知错误'}`);
    const rawCode = typeof lastError?.code === 'string' ? lastError.code : null;
    err.code = rawCode ?? (lastError?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR');
    throw err;
  }

  return { chat, mode, model, calls };
}
