/**
 * D3 推荐结果缓存（实验3 表3-5 的 D3）
 * key = hash(profileId, menuId, weightsVersion)，TTL 24 小时（NFR-01 缓存命中 <1 秒、NFR-12 降本）。
 * 写入时清理过期 key 与版本落后的同 menuId 缓存（实验3 表3-10 的 D2 检查项）。
 */
import { NS } from './d1-store.js';

export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export function cacheKey({ profileId, menuId, weightsVersion }) {
  return fnv1a(`${profileId}|${menuId}|${weightsVersion}`);
}

export function createCache(store, { now = () => Date.now() } = {}) {
  function get(key) {
    const entry = store.read(NS.cache(key), null);
    if (!entry) return null;
    if (now() - entry.createdAt > CACHE_TTL_MS) {
      store.remove(NS.cache(key));
      return null;
    }
    return entry;
  }

  function put(key, payload) {
    const entry = { createdAt: now(), payload };
    store.write(NS.cache(key), entry);
    return entry;
  }

  /** 清理：过期 key + 同 menuId 但版本落后的 key（避免长期使用累积无效缓存） */
  function sweep({ menuId, weightsVersion } = {}) {
    let removed = 0;
    for (const { key, value } of store.listNamespace('zs:cache:')) {
      const expired = !value || now() - value.createdAt > CACHE_TTL_MS;
      const stale = menuId && value?.payload?.menuId === menuId && value?.payload?.weightsVersion !== weightsVersion;
      if (expired || stale) {
        store.remove(key);
        removed += 1;
      }
    }
    return removed;
  }

  return { get, put, sweep, key: cacheKey };
}
