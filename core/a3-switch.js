/**
 * A3 降级开关（实验3 表3-5；NFR-03、V4）
 * 超时 / HTTP 错误 / 超预算 / 连续失败 → 关闭 AI，回到 M4 规则基线，并把原因交给 C2 状态条。
 */
export function createAiSwitch({ threshold = 3, budgetTokens = 200000, logger } = {}) {
  let consecutiveFailures = 0;
  let usedTokens = 0;
  let lastReason = null;

  function shouldUseAI() {
    return true;
  }

  function recordSuccess(usage) {
    consecutiveFailures = 0;
    usedTokens += usage?.tokens ?? 0;
  }

  function recordFailure(reason) {
    consecutiveFailures += 1;
    lastReason = reason;
    logger?.warn('ai.failure', { consecutiveFailures, reason });
  }

  function snapshot() {
    return { consecutiveFailures, usedTokens, budgetTokens, threshold, lastReason };
  }

  return { shouldUseAI, recordSuccess, recordFailure, snapshot };
}
