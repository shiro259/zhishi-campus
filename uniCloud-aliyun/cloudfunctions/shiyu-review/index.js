'use strict';

/**
 * shiyu-review —— 评价云函数
 *
 * 职责：
 *  - list     公开评价列表（只返回已审核通过的，对应 schema 里的 read 规则）
 *  - create   发布评价（默认进入待审核状态）
 *  - mine     我的评价（含审核中与未通过，便于用户看到自己提交了哪些）
 *  - pending  待审核（管理端，需要管理口令）
 *  - all      全部评价（管理端，含已通过/已拒绝/待审核，需要管理口令）
 *  - audit    审核通过 / 拒绝（管理端，需要管理口令）
 *
 * 说明：评价表 schema 的 permission 为
 *   read:   doc.status == 1     —— 客户端只能读已通过的
 *   create/update/delete: false —— 全部写操作必须经过本云函数
 */

const common = require('../common/shiyu-common/index.js');

const db = uniCloud.database();

/** 审核状态取值 */
const STATUS_PENDING = 0;
const STATUS_PASSED = 1;
const STATUS_REJECTED = 2;

exports.main = async (event) => {
  const action = event && event.action;

  try {
    switch (action) {
      case 'list':
        return await handleList(event);
      case 'create':
        return await handleCreate(event);
      case 'mine':
        return await handleMine(event);
      case 'pending':
        return await handlePending(event);
      case 'all':
        return await handleAll(event);
      case 'audit':
        return await handleAudit(event);
      default:
        return common.fail('未知的 action: ' + action);
    }
  } catch (e) {
    console.error('[shiyu-review] 执行异常', action, e);
    return common.fail('评价服务异常：' + (e && e.message ? e.message : '未知错误'));
  }
};

/** 公开评价列表：只返回已通过审核的评价 */
async function handleList(event) {
  const { page, pageSize, skip } = common.normalizePaging(event.page, event.pageSize, 50);

  const where = { status: STATUS_PASSED };
  if (event.dish_id) where.dish_id = String(event.dish_id);

  const collection = db.collection('reviews').where(where);

  const [countRes, listRes] = await Promise.all([
    collection.count(),
    db.collection('reviews')
      .where(where)
      .orderBy('create_date', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get()
  ]);

  const total = (countRes && countRes.total) || 0;
  const list = (listRes.data || []).map(common.withId);

  return common.ok({
    list,
    total,
    page,
    pageSize,
    hasMore: skip + list.length < total
  });
}

/**
 * 发布评价
 * 入参：{ dish_id, dish_name, rating, content, images, nickname, avatar, uid }
 */
async function handleCreate(event) {
  const dishId = String(event.dish_id || '').trim();
  const content = String(event.content || '').trim();
  const rating = parseInt(event.rating, 10);

  if (!dishId) return common.fail('缺少菜品 id');
  if (!content) return common.fail('评价内容不能为空');
  if (content.length < 5) return common.fail('评价内容至少 5 个字');
  if (!rating || rating < 1 || rating > 5) return common.fail('评分必须在 1~5 之间');

  // 菜品名校验：优先用入参，缺失时按 id 回查，保证后台审核时能直接看到菜名
  let dishName = String(event.dish_name || '').trim();
  if (!dishName) {
    try {
      const dishRes = await db.collection('dishes').doc(dishId).get();
      const dish = dishRes && dishRes.data && dishRes.data[0];
      if (dish) dishName = dish.name || '';
    } catch (e) {
      // 菜品不存在也允许评价，仅菜名留空
    }
  }

  const doc = {
    dish_id: dishId,
    dish_name: dishName,
    user_id: String(event.uid || event.user_id || 'anonymous'),
    nickname: String(event.nickname || '匿名同学').slice(0, 20),
    avatar: String(event.avatar || ''),
    rating,
    content: content.slice(0, 200),
    images: Array.isArray(event.images) ? event.images.slice(0, 3) : [],
    like_count: 0,
    status: STATUS_PENDING,
    create_date: Date.now()
  };

  const res = await db.collection('reviews').add(doc);

  return common.ok({ id: res.id, status: STATUS_PENDING }, '评价已提交，审核通过后展示');
}

/** 我的评价：按 uid 查全部状态 */
async function handleMine(event) {
  const uid = String(event.uid || '').trim();
  if (!uid) return common.ok({ list: [], total: 0, hasMore: false });

  const { page, pageSize, skip } = common.normalizePaging(event.page, event.pageSize, 50);
  const where = { user_id: uid };

  const [countRes, listRes] = await Promise.all([
    db.collection('reviews').where(where).count(),
    db.collection('reviews')
      .where(where)
      .orderBy('create_date', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get()
  ]);

  const total = (countRes && countRes.total) || 0;
  const list = (listRes.data || []).map(common.withId);

  return common.ok({ list, total, page, pageSize, hasMore: skip + list.length < total });
}

/** 待审核列表（管理端） */
async function handlePending(event) {
  const auth = await common.verifyAdminToken(db, event.token || event.admin_token || '');
  if (!auth.ok) return common.fail(auth.message);

  const { page, pageSize, skip } = common.normalizePaging(event.page, event.pageSize, 100);
  const where = { status: STATUS_PENDING };

  const [countRes, listRes] = await Promise.all([
    db.collection('reviews').where(where).count(),
    db.collection('reviews')
      .where(where)
      .orderBy('create_date', 'asc')
      .skip(skip)
      .limit(pageSize)
      .get()
  ]);

  const total = (countRes && countRes.total) || 0;
  const list = (listRes.data || []).map(common.withId);

  return common.ok({ list, total, page, pageSize, hasMore: skip + list.length < total });
}

/**
 * 全部评价（管理端）：不筛状态，已通过 / 已拒绝 / 待审核都能看到，
 * 供审核页「全部」tab 使用。必须带管理口令。
 */
async function handleAll(event) {
  const auth = await common.verifyAdminToken(db, event.token || event.admin_token || '');
  if (!auth.ok) return common.fail(auth.message);

  const { page, pageSize, skip } = common.normalizePaging(event.page, event.pageSize, 100);

  const [countRes, listRes] = await Promise.all([
    db.collection('reviews').count(),
    db.collection('reviews')
      .orderBy('create_date', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get()
  ]);

  const total = (countRes && countRes.total) || 0;
  const list = (listRes.data || []).map(common.withId);

  return common.ok({ list, total, page, pageSize, hasMore: skip + list.length < total });
}

/**
 * 审核（管理端）
 * 入参：{ id, status: 1 通过 | 2 拒绝, token }
 * 通过后同步累加菜品评分与评价数，保证菜品列表的 rating 字段能反映真实评价。
 */
async function handleAudit(event) {
  const auth = await common.verifyAdminToken(db, event.token || event.admin_token || '');
  if (!auth.ok) return common.fail(auth.message);

  const id = String(event.id || '').trim();
  const status = parseInt(event.status, 10);

  if (!id) return common.fail('缺少评价 id');
  if (status !== STATUS_PASSED && status !== STATUS_REJECTED) {
    return common.fail('status 只能是 1（通过）或 2（拒绝）');
  }

  // 先取出原记录，用于判断状态是否发生变化（避免重复审核导致评分被重复累加）
  const before = await db.collection('reviews').doc(id).get();
  const review = before && before.data && before.data[0];
  if (!review) return common.fail('评价不存在');

  await db.collection('reviews').doc(id).update({
    status,
    audit_date: Date.now()
  });

  const changed = review.status !== status;
  if (changed && status === STATUS_PASSED) {
    await applyRatingToDish(review).catch((e) => {
      // 评分汇总失败不影响审核结果
      console.error('[shiyu-review] 更新菜品评分失败', e);
    });
  }

  return common.ok({ id, status }, status === STATUS_PASSED ? '已通过' : '已拒绝');
}

/**
 * 评价通过后重算该菜品的平均分与评价数
 *
 * 用「查询全部已通过评价后求平均」的方式，保证结果幂等、不会因重复审核而漂移。
 */
async function applyRatingToDish(review) {
  const dishId = review.dish_id;
  if (!dishId) return;

  const res = await db.collection('reviews')
    .where({ dish_id: dishId, status: STATUS_PASSED })
    .field({ rating: true })
    .limit(500)
    .get();

  const ratings = (res.data || []).map((r) => Number(r.rating) || 0).filter((n) => n > 0);
  if (!ratings.length) return;

  const avg = ratings.reduce((s, n) => s + n, 0) / ratings.length;

  await db.collection('dishes').doc(dishId).update({
    rating: Math.round(avg * 10) / 10,
    review_count: ratings.length
  });
}
