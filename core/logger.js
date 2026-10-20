/**
 * 日志（实验4 2.5）：统一事件名 + 结构化字段，浏览器侧批量转发到本地服务落盘。
 * 位置：data/logs/app.log（服务端）；浏览器控制台同时打印一份。
 */
export function createLogger({ sink, level = 'info', scope = 'core' } = {}) {
  const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
  const min = LEVELS[level] ?? 20;

  function emit(lv, event, data = {}) {
    if ((LEVELS[lv] ?? 20) < min) return;
    const entry = {
      ts: new Date().toISOString(),
      level: lv,
      scope,
      event,
      ...data,
    };
    try {
      sink?.(entry);
    } catch {
      /* 日志失败不影响主流程 */
    }
    return entry;
  }

  return {
    log: emit,
    debug: (event, data) => emit('debug', event, data),
    info: (event, data) => emit('info', event, data),
    warn: (event, data) => emit('warn', event, data),
    error: (event, data) => emit('error', event, data),
  };
}

/** Node 侧采集器：测试里断言"关键事件是否被记录" */
export function createCollectingSink() {
  const entries = [];
  const sink = (entry) => entries.push(entry);
  sink.entries = entries;
  sink.byEvent = (event) => entries.filter((e) => e.event === event);
  return sink;
}
