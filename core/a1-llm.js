/**
 * A1 模型调用（实验3 表3-5；FR-04、NFR-01、NFR-12）
 * 组装 IF-01 请求 → POST 到服务端转发层 → 5 秒超时、最多重试 1 次，记录时延与 token。
 * 关键点：业务层只依赖 IF-01 的 JSON 结构，换模型厂商不改业务代码（实验3 3.2 结论）。
 */
export function createLlmClient({
  endpoint = '/api/recommend',
  fetchImpl = globalThis.fetch,
  timeoutMs = 5000,
  retries = 1,
  headers = {},
  logger,
  now = () => Date.now(),
} = {}) {
  async function once(payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const err = new Error(body?.error?.message ?? `模型服务返回 HTTP ${res.status}`);
        err.code = body?.error?.code ?? `HTTP_${res.status}`;
        err.status = res.status;
        throw err;
      }
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function call(payload) {
    const startedAt = now();
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const data = await once(payload);
        logger?.info('llm.call.ok', { attempt, latencyMs: now() - startedAt, tokens: data?.usage?.tokens ?? null });
        return data;
      } catch (err) {
        lastError = err;
        const code = err.code ?? (err.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR');
        err.code = code;
        logger?.warn('llm.call.failed', { attempt, code, message: err.message, latencyMs: now() - startedAt });
      }
    }
    throw lastError;
  }

  return { call, timeoutMs, retries };
}
