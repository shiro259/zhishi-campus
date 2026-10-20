/**
 * D1 本地存储封装（实验3 表3-5 的 D1）
 * 职责：把浏览器 localStorage / 内存适配器统一成"命名空间 + JSON 序列化"的读写接口。
 * 设计依据：ADR-003（业务数据只存本机，最小化采集）；NFR-04（不因重启丢失）、NFR-07（按命名空间批量清空）。
 */

/** 命名空间常量：所有键都必须带 zs: 前缀，清空与审计才有唯一入口 */
export const NS = {
  profile: 'zs:profile',
  record: 'zs:record',
  feedback: 'zs:feedback',
  weights: 'zs:weights',
  menuIndex: 'zs:menuIndex',
  meta: 'zs:meta',
  menu: (menuId) => `zs:menu:${menuId}`,
  cache: (key) => `zs:cache:${key}`,
};

export const NS_PREFIX = 'zs:';

/** 浏览器适配器：直接使用 localStorage */
export function createLocalStorageAdapter(ls) {
  return {
    getItem: (key) => ls.getItem(key),
    setItem: (key, value) => ls.setItem(key, value),
    removeItem: (key) => ls.removeItem(key),
    keys: () => {
      const out = [];
      for (let i = 0; i < ls.length; i += 1) out.push(ls.key(i));
      return out.filter((k) => k != null);
    },
  };
}

/** 内存适配器：Node 测试与"清空后恢复"演示使用 */
export function createMemoryAdapter(initial = {}) {
  const map = new Map(Object.entries(initial).map(([k, v]) => [k, String(v)]));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
    keys: () => [...map.keys()],
  };
}

export function createStore(adapter, { logger } = {}) {
  function read(key, fallback = null) {
    try {
      const raw = adapter.getItem(key);
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (err) {
      // 读取失败不抛出：返回兜底值并留日志，避免整页崩溃（NFR-04 的异常分支）
      logger?.log('warn', 'store.read.failed', { key, message: err.message });
      return fallback;
    }
  }

  function write(key, value) {
    adapter.setItem(key, JSON.stringify(value));
    return value;
  }

  function remove(key) {
    adapter.removeItem(key);
  }

  function keys(prefix = NS_PREFIX) {
    return adapter.keys().filter((k) => k.startsWith(prefix));
  }

  function listNamespace(prefix) {
    return keys(prefix).map((key) => ({ key, value: read(key) }));
  }

  function clearNamespace(prefix) {
    const removed = keys(prefix);
    removed.forEach((k) => adapter.removeItem(k));
    return removed;
  }

  return { read, write, remove, keys, listNamespace, clearNamespace, adapter };
}
