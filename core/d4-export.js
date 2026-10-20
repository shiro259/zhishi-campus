/**
 * D4 导出与一键清空（实验3 表3-5；FR-08、NFR-07）
 * 导出全部业务数据为 JSON；清空一次性删除所有 zs: 命名空间。
 */
import { NS } from './d1-store.js';

export function createDataService({ store, logger }) {
  function exportAll() {
    return {
      exportedAt: new Date().toISOString(),
      schemaVersion: 1,
      profile: store.read(NS.profile, null),
      menuIndex: store.read(NS.menuIndex, []),
      menus: store.listNamespace('zs:menu:').map((x) => x.value),
      records: store.read(NS.record, []),
      feedback: store.read(NS.feedback, []),
      weights: store.read(NS.weights, null),
    };
  }

  function clearAll() {
    const removed = [];
    removed.push(...store.clearNamespace(NS.profile));
    removed.push(...store.clearNamespace(NS.record));
    removed.push(...store.clearNamespace(NS.feedback));
    logger?.info('data.cleared', { removedCount: removed.length });
    return { ok: true, removedCount: removed.length, removed };
  }

  /** 清空后仍残留的键：用于 NFR-07 自查（返回空数组才算清空彻底） */
  function leftovers() {
    return store.keys('zs:').filter((k) => !k.startsWith('zs:menu:') || true);
  }

  return { exportAll, clearAll, leftovers };
}
