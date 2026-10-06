'use strict';
/**
 * ============================================================================
 * 云函数：shiyu-group —— 多人拼饭
 * ----------------------------------------------------------------------------
 * 输入：几个人的口味与忌口
 * 输出：一起吃饭时该怎么点 —— 哪些菜全员可吃、哪些只有部分人能碰、
 *       最后给出一个每个人都能吃到东西的点菜方案
 *
 * 与其它云函数的分工：
 *   shiyu-recommend  单轮推荐（一个人的偏好 → 一批菜）
 *   shiyu-agent      多轮推荐（一个人逐步改条件）
 *   shiyu-group      多人拼饭（几个人的约束取交集 + 给出点菜方案）← 本函数
 *
 * 为什么用算法而不是大模型：
 *   忌口是**安全问题**。把"含花生的菜能不能给这位同学吃"交给大模型，是拿安全赌概率。
 *   集合运算 + 打分可解释、可复现、可回归测试；大模型的价值放在把结论讲成人话（可选增强）。
 *
 * 统一响应格式：成功 { code: 0, message: 'success', data } ；失败 { code: -1, message }
 * ============================================================================
 */

const groupMeal = require('./lib/group-meal.js');

const db = uniCloud.database();

const COLLECTION = 'dishes';

// 候选菜品字段
const CANDIDATE_FIELD = {
  _id: true,
  name: true,
  price: true,
  canteen: true,
  window: true,
  category: true,
  tags: true,
  emoji: true,
  image: true,
  description: true,
  rating: true,
  recommend_count: true
};

// 单次召回上限
const MAX_CANDIDATES = 200;

/**
 * 读取候选菜品
 * 只取上架菜品；失败时返回空数组，由调用方决定如何提示
 */
async function queryCandidates(canteen) {
  try {
    const where = { status: 1 };
    if (canteen) where.canteen = String(canteen);

    const res = await db.collection(COLLECTION)
      .where(where)
      .field(CANDIDATE_FIELD)
      .limit(MAX_CANDIDATES)
      .get();

    const list = (res && res.data) || [];
    // 统一补齐 id 字段：算法里用 dish.id || dish._id，这里直接给 id 更省事
    return list.map(function (d) {
      return Object.assign({}, d, { id: d._id });
    });
  } catch (e) {
    console.error('[shiyu-group] 候选菜品查询失败:', e && (e.message || e));
    return [];
  }
}

/**
 * 规范化成员入参
 * 只保留认识的字段，去掉空值；同时对人数做上限保护
 */
function normalizeMembers(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.slice(0, 8).map(function (m, i) {
    const item = m || {};
    return {
      name: String(item.name || ('第' + (i + 1) + '人')).slice(0, 12),
      taste: Array.isArray(item.taste)
        ? item.taste.map(String).filter(function (t) { return groupMeal.TASTE_TAGS.indexOf(t) >= 0; })
        : [],
      // 忌口只接受已知食材词：写错一个不存在的词会导致"以为过滤了其实没有"
      allergies: Array.isArray(item.allergies)
        ? item.allergies.map(String).filter(function (a) { return groupMeal.FOOD_TAGS.indexOf(a) >= 0; })
        : [],
      vegetarian: !!item.vegetarian,
      noFried: !!item.noFried
    };
  });
}

exports.main = async (event, context) => {
  const startedAt = Date.now();
  const payload = event || {};

  try {
    const members = normalizeMembers(payload.members);

    if (!members.length) {
      return { code: -1, message: '请至少添加一位同学' };
    }

    const dishes = await queryCandidates(payload.canteen);

    if (!dishes.length) {
      return {
        code: 0,
        message: 'success',
        data: {
          members: members,
          shared: [],
          partial: [],
          combo: null,
          insights: [],
          stats: { dishTotal: 0, sharedCount: 0, partialCount: 0, excludedCount: 0 },
          summary: '菜品库还是空的，请先在管理后台执行「数据初始化」',
          engine: 'rule',
          elapsed: Date.now() - startedAt
        }
      };
    }

    const result = groupMeal.planGroupMeal(members, dishes, {
      budgetPerPerson: Number(payload.budgetPerPerson) || 0,
      maxItems: Number(payload.maxItems) || 5
    });

    console.log('[shiyu-group] 人数=' + members.length + ' 候选=' + dishes.length
      + ' 全员可吃=' + result.stats.sharedCount
      + ' 方案=' + (result.combo ? result.combo.items.length : 0)
      + ' 耗时=' + (Date.now() - startedAt) + 'ms');

    // 把"哪些菜被推荐"记一次热度（失败不影响主流程）
    if (result.combo && result.combo.items.length) {
      Promise.all(result.combo.items.map(function (item) {
        return db.collection(COLLECTION).doc(item.dish_id)
          .update({ recommend_count: db.command.inc(1) })
          .catch(function () { return null; });
      })).catch(function () { return null; });
    }

    return {
      code: 0,
      message: 'success',
      data: Object.assign({}, result, {
        engine: 'rule',
        elapsed: Date.now() - startedAt
      })
    };
  } catch (e) {
    console.error('[shiyu-group] 执行异常:', e && (e.message || e));
    return { code: -1, message: '拼饭计算失败：' + (e && e.message ? e.message : '未知错误') };
  }
};
