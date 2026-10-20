/**
 * M3 推荐编排（实验3 表3-5；FR-04、IF-06）
 * 前置校验 → 查缓存 → 调 A1 → A2 校验 → 写缓存 → 返回统一结构。
 */
import { NS } from './d1-store.js';
import { cacheKey, CACHE_TTL_MS } from './d3-cache.js';

export const STATUS = {
  OK: 'OK',
  NO_PROFILE: 'NO_PROFILE',
  EMPTY_MENU: 'EMPTY_MENU',
  ERROR: 'ERROR',
};

export function createRecommendService({
  store,
  profile,
  menu,
  rules,
  risk,
  llm,
  validate,
  cache,
  aiSwitch,
  logger,
  now = () => Date.now(),
  config = {},
}) {
  const topN = config.topN ?? 3;

  /** 只上传候选菜品与画像标签摘要，不含忌口清单内容与任何身份信息（NFR-05 / IF-01） */
  function buildPayload(profileValue, candidates) {
    return {
      dishes: candidates.map((d) => ({
        dishId: d.dishId,
        name: d.name,
        price: d.price,
        ingredients: d.ingredients,
        allergenTags: d.allergenTags,
        tasteTags: d.tasteTags,
      })),
      profileSummary: {
        tasteTags: profileValue.tasteTags,
        healthGoal: profileValue.healthGoal,
        budget: profileValue.budget,
        avoidCount: profileValue.avoidList.length,
      },
      topN,
    };
  }

  async function recommend({ menuId = null, force = false } = {}) {
    const startedAt = now();
    const profileValue = profile.getProfile();
    if (!profileValue) {
      return { status: STATUS.NO_PROFILE, items: [], message: '还没有设置口味画像，先花 30 秒设置一下' };
    }

    const targetMenu = menuId ? menu.getMenu(menuId) : menu.getLatestMenu();
    if (!targetMenu) {
      logger?.warn('recommend.no_menu', {});
      return { status: STATUS.EMPTY_MENU, items: [], message: '暂无可靠菜单数据，先去维护今天的菜单' };
    }

    const candidates = menu.listDishes(targetMenu.menuId);
    const weights = store.read(NS.weights, { version: 1, mismatchTasteTags: {} });
    const key = cacheKey({ profileId: profileValue.profileId, menuId: targetMenu.menuId, weightsVersion: weights.version });

    if (!force) {
      const hit = cache.get(key);
      if (hit) {
        logger?.info('recommend.cache_hit', { key, latencyMs: now() - startedAt });
        return { ...hit.payload, cached: true, latencyMs: now() - startedAt };
      }
    }

    const payload = buildPayload(profileValue, candidates);
    const aiOutput = await llm.call(payload);

    const items = (aiOutput.items ?? []).map((it) => ({
      ...it,
      dish: candidates.find((d) => d.dishId === it.dishId) ?? null,
    }));
    const latencyMs = now() - startedAt;

    const result = {
      status: STATUS.OK,
      items,
      engine: 'ai',
      degraded: false,
      degradedReason: null,
      menuId: targetMenu.menuId,
      menuUpdatedAt: targetMenu.updatedAt,
      menuDate: targetMenu.date,
      candidateCount: candidates.length,
      weightsVersion: weights.version,
      latencyMs,
      cached: false,
    };

    logger?.info('recommend.done', {
      engine: 'ai',
      itemCount: items.length,
      candidateCount: candidates.length,
      latencyMs,
      tokens: aiOutput.usage?.tokens ?? null,
    });
    cache.put(key, result);
    return result;
  }

  return { recommend, buildPayload, STATUS, cacheTtlMs: CACHE_TTL_MS };
}
