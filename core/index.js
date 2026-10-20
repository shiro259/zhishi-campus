/**
 * 应用装配（对应实验3 图3-2 的分层结构）
 * 表现层（web/）只通过本文件拿到 M1—M6、D1—D4、A1—A3，不直接读写存储。
 */
import { createStore, createLocalStorageAdapter, createMemoryAdapter, NS } from './d1-store.js';
import { createProfileService } from './m1-profile.js';
import { createMenuService } from './m2-menu.js';
import { createRecommendService, STATUS } from './m3-recommend.js';
import { createRules } from './m4-rules.js';
import { createRiskService } from './m5-risk.js';
import { createRecordService } from './m6-record.js';
import { createCache } from './d3-cache.js';
import { createDataService } from './d4-export.js';
import { createLlmClient } from './a1-llm.js';
import { createAiSwitch } from './a3-switch.js';
import { validateAiOutput } from './a2-validate.js';
import { createLogger } from './logger.js';

export const DEFAULT_CONFIG = {
  topN: 3,
  llmEndpoint: '/api/recommend',
  llmTimeoutMs: 5000,
  llmRetries: 1,
  aiSwitch: { threshold: 3, budgetTokens: 200000 },
};

export function createApp({ storage, sink, now = () => Date.now(), fetchImpl = globalThis.fetch, config = {}, logLevel = 'info' } = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const logger = createLogger({ sink, level: logLevel, scope: 'zhishi' });
  const store = createStore(storage, { logger });

  const profile = createProfileService({ store, logger });
  const menu = createMenuService({ store, logger, now });
  const rules = createRules({ now });
  const risk = createRiskService({ store, logger });
  const record = createRecordService({ store, logger, menu });
  const cache = createCache(store, { now });
  const aiSwitch = createAiSwitch({ logger, ...cfg.aiSwitch });
  const llm = createLlmClient({
    endpoint: cfg.llmEndpoint,
    fetchImpl,
    timeoutMs: cfg.llmTimeoutMs,
    retries: cfg.llmRetries,
    headers: cfg.llmHeaders ?? {},
    logger,
    now,
  });
  const recommend = createRecommendService({
    store,
    profile,
    menu,
    rules,
    risk,
    llm,
    validate: validateAiOutput,
    cache,
    aiSwitch,
    logger,
    now,
    config: cfg,
  });
  const data = createDataService({ store, logger });

  return {
    config: cfg,
    logger,
    store,
    profile,
    menu,
    rules,
    risk,
    record,
    cache,
    aiSwitch,
    llm,
    recommend,
    data,
    validateAiOutput,
    STATUS,
  };
}

export { createLocalStorageAdapter, createMemoryAdapter, NS, STATUS };
