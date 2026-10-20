/**
 * M5 风险与确认（实验3 表3-5；FR-05、V3、NFR-06）
 * check(dish, avoidList) 只输出"可能含有 X，请向窗口确认"，绝不给安全结论；
 * confirm(dishId) 写时间戳；未确认时该菜品不可被记录。
 */
import { NS } from './d1-store.js';

const FORBIDDEN = /不含|没有问题|可以吃|放心吃|绝对安全|肯定安全|无需确认|安全可食/;

export function createRiskService({ store, logger }) {
  /** 命中忌口/过敏清单，返回提示文案 */
  function check(dish, avoidList = []) {
    const list = (avoidList ?? []).filter(Boolean);
    const hits = [];

    if (!dish) return { hit: false, unknown: false, hits: [], hint: '' };

    if (dish.ingredients == null || dish.ingredients.length === 0) {
      return { hit: false, unknown: true, hits: [], hint: '配料未知，请现场核对' };
    }

    const text = dish.ingredients.join('、');
    for (const item of list) {
      if (text.includes(item)) hits.push(item);
    }

    const hit = hits.length > 0;
    const hint = hit ? `可能含有${hits.join('/')}，请向窗口确认` : '';
    if (hint && FORBIDDEN.test(hint)) {
      // 兜底：本模块的模板本身不允许出现确定性表述
      logger?.error('risk.forbidden_wording', { dishId: dish.dishId });
    }
    return { hit, unknown: false, hits, hint };
  }

  function confirm(dishId) {
    const stamps = store.read(NS.meta, {}) ?? {};
    stamps.riskConfirmedAt = stamps.riskConfirmedAt ?? {};
    stamps.riskConfirmedAt[dishId] = new Date().toISOString();
    store.write(NS.meta, stamps);
    logger?.info('risk.confirmed', { dishId, at: stamps.riskConfirmedAt[dishId] });
    return stamps.riskConfirmedAt[dishId];
  }

  function isConfirmed(dishId) {
    const stamps = store.read(NS.meta, {}) ?? {};
    return Boolean(stamps.riskConfirmedAt?.[dishId]);
  }

  function confirmedAt(dishId) {
    const stamps = store.read(NS.meta, {}) ?? {};
    return stamps.riskConfirmedAt?.[dishId] ?? null;
  }

  return { check, confirm, isConfirmed, confirmedAt, FORBIDDEN };
}
