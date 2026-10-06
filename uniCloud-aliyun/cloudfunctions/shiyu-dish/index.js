'use strict';
/**
 * ============================================================================
 * 云函数：shiyu-dish —— 菜品查询统一入口
 * ----------------------------------------------------------------------------
 * 项目：食遇校园 - AI智能食堂推荐
 *
 * 设计思路：
 *   1. 前端只对接一个云函数，用 event.action 做分发，减少云函数数量与冷启动开销；
 *   2. dishes 集合 schema 权限为「客户端只读、禁止写」，所有写操作走 shiyu-seed 等管理函数；
 *   3. 所有列表类查询强制 status == 1（只返回上架菜品），并用 .field() 精简返回字段，
 *      减少网络传输、加快小程序端渲染；
 *   4. 数据库主键 _id 统一额外映射出一份 id 字段返回给前端，
 *      前端全部用 id，避免混用 _id 造成取值错误。
 *
 * 支持的 action：
 *   - 'list'      : { keyword, canteen, category, sortByRating, page, pageSize }
 *   - 'detail'    : { id }
 *   - 'rank'      : { type: 'hot' | 'good' | 'new', limit }
 *   - 'canteens'  : 返回去重后的食堂名数组
 *   - 'categories': 返回去重后的分类数组
 *   - 'save'      : { dish, token } 新增/编辑菜品（管理端，需管理口令）
 *   - 'remove'    : { id, token, hard? } 下架（软删）或物理删除（管理端，需管理口令）
 *
 * 统一响应格式：成功 { code: 0, message: 'success', data } ；失败 { code: -1, message }
 * ============================================================================
 */

const common = require('../common/shiyu-common/index.js');

const db = uniCloud.database();
const dbCmd = db.command;

const COLLECTION = 'dishes';

// 列表类接口统一返回的字段（不含 create_date 等前端用不到的字段）
const LIST_FIELD = {
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
  review_count: true,
  recommend_count: true,
  is_new: true
};

// 详情接口返回全部业务字段
const DETAIL_FIELD = Object.assign({}, LIST_FIELD, { status: true, create_date: true });

// 分页单页上限（管理端统计需要一次拉全量，前端会传 pageSize: 999）
const MAX_PAGE_SIZE = 100;
const MAX_RANK_LIMIT = 50;

/**
 * 转义正则元字符，避免用户输入 ".*" 之类的关键字造成全表扫描或语法错误
 */
function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 构造大小写不敏感的正则查询对象
 * 优先使用 uniCloud 的 db.RegExp，个别环境不支持时退回原生 RegExp
 */
function buildLikeRegExp(keyword) {
  const regexp = escapeRegExp(keyword);
  if (typeof db.RegExp === 'function') {
    return db.RegExp({ regexp: regexp, options: 'i' });
  }
  return new RegExp(regexp, 'i');
}

/**
 * 把数据库文档转成前端结构：补一个 id 字段
 * 前端统一使用 id，这里做一层兼容映射
 */
function withId(doc) {
  if (!doc) {
    return doc;
  }
  return Object.assign({}, doc, { id: doc._id });
}

/**
 * 取整数参数并做上下界保护
 */
function toInt(value, defaultValue, min, max) {
  let n = parseInt(value, 10);
  if (isNaN(n)) {
    n = defaultValue;
  }
  if (min !== undefined && n < min) {
    n = min;
  }
  if (max !== undefined && n > max) {
    n = max;
  }
  return n;
}

/**
 * action = 'list'：条件分页查询菜品列表
 * 返回 { list, total, hasMore }
 */
async function handleList(payload) {
  const page = toInt(payload.page, 1, 1);
  const pageSize = toInt(payload.pageSize, 20, 1, MAX_PAGE_SIZE);
  const skip = (page - 1) * pageSize;

  // 组装 where 条件：只查上架菜品
  const where = { status: 1 };

  // 关键字模糊匹配菜品名（防注入：先转义正则元字符）
  if (payload.keyword && String(payload.keyword).trim() !== '') {
    where.name = buildLikeRegExp(String(payload.keyword).trim());
  }
  if (payload.canteen && String(payload.canteen).trim() !== '') {
    where.canteen = String(payload.canteen).trim();
  }
  if (payload.category && String(payload.category).trim() !== '') {
    where.category = String(payload.category).trim();
  }

  const collection = db.collection(COLLECTION);

  // 排序策略：
  //   sortByPrice  → 价格升序（管理端比价、学生省钱场景）
  //   sortByRating → 评分降序
  //   默认          → 推荐次数（热度）降序
  const isPriceSort = payload.sortByPrice === true || payload.sortByPrice === 'true' || payload.sortByPrice === 1;
  const isRatingSort = payload.sortByRating === true || payload.sortByRating === 'true' || payload.sortByRating === 1;

  let orderBy;
  if (isPriceSort) orderBy = [['price', 'asc'], ['rating', 'desc']];
  else if (isRatingSort) orderBy = [['rating', 'desc'], ['recommend_count', 'desc']];
  else orderBy = [['recommend_count', 'desc'], ['rating', 'desc']];

  let query = collection.where(where);
  orderBy.forEach(function (item) {
    query = query.orderBy(item[0], item[1]);
  });

  const listRes = await query.field(LIST_FIELD).skip(skip).limit(pageSize).get();
  const countRes = await collection.where(where).count();

  const total = (countRes && countRes.total) || 0;
  const list = (listRes.data || []).map(withId);

  return {
    code: 0,
    message: 'success',
    data: {
      list: list,
      total: total,
      page: page,
      pageSize: pageSize,
      hasMore: skip + list.length < total
    }
  };
}

/**
 * action = 'detail'：按 id 查询单个菜品
 */
async function handleDetail(payload) {
  const id = payload.id || payload._id;
  if (!id) {
    return { code: -1, message: '缺少参数 id' };
  }

  const res = await db
    .collection(COLLECTION)
    .where({ _id: id, status: 1 })
    .field(DETAIL_FIELD)
    .limit(1)
    .get();

  const dish = res.data && res.data[0];
  if (!dish) {
    return { code: -1, message: '菜品不存在' };
  }

  return { code: 0, message: 'success', data: withId(dish) };
}

/**
 * action = 'rank'：排行榜
 *   hot  → recommend_count 降序（被 AI 推荐次数最多）
 *   good → rating 降序（评分最高）
 *   new  → create_date 降序（最新上架）
 */
async function handleRank(payload) {
  const type = payload.type || 'hot';
  const limit = toInt(payload.limit, 10, 1, MAX_RANK_LIMIT);

  const orderMap = {
    hot: 'recommend_count',
    good: 'rating',
    new: 'create_date'
  };

  const orderField = orderMap[type];
  if (!orderField) {
    return { code: -1, message: '未知的榜单类型: ' + type };
  }

  let query = db.collection(COLLECTION).where({ status: 1 }).orderBy(orderField, 'desc');
  // 同类数据再按评分/推荐数兜底排序，保证顺序稳定
  if (type !== 'good') {
    query = query.orderBy('rating', 'desc');
  }

  const res = await query.field(LIST_FIELD).limit(limit).get();

  // 说明：rank 的 data 直接返回数组本身。
  // 前端 api 层（api/index.js 的 dishApi.rank）会把云函数 data 原样放进 { list: data }，
  // 页面再取 hot.list 渲染，因此这里必须是数组，不能再套一层 { list }。
  return {
    code: 0,
    message: 'success',
    data: (res.data || []).map(withId)
  };
}

/**
 * action = 'canteens' / 'categories'：去重取字段值
 * 说明：MongoDB 的 distinct 在部分版本/权限下行为不一致，
 *       这里按需求先拉取字段（上限 1000 条）再到 JS 层去重，结果稳定可控。
 */
async function handleDistinct(payload, fieldName) {
  const res = await db
    .collection(COLLECTION)
    .where({ status: 1 })
    .field({ [fieldName]: true })
    .limit(1000)
    .get();

  const seen = new Set();
  const values = [];
  (res.data || []).forEach(function (item) {
    const value = item && item[fieldName];
    if (value && !seen.has(value)) {
      seen.add(value);
      values.push(value);
    }
  });

  return { code: 0, message: 'success', data: values };
}

/**
 * 新增 / 编辑菜品（管理端，需要管理口令）
 * 入参：{ dish: { id?, name, price, canteen, window, category, tags, emoji, description }, token }
 */
async function handleSave(payload) {
  const auth = await common.verifyAdminToken(db, payload.token || payload.admin_token || '');
  if (!auth.ok) return { code: -1, message: auth.message };

  const dish = payload.dish || {};
  const name = String(dish.name || '').trim();
  const price = Number(dish.price);
  const canteen = String(dish.canteen || '').trim();
  const windowName = String(dish.window || '').trim();

  if (!name) return { code: -1, message: '菜品名称不能为空' };
  if (!price || price <= 0) return { code: -1, message: '价格必须大于 0' };
  if (!canteen) return { code: -1, message: '所属食堂不能为空' };
  if (!windowName) return { code: -1, message: '所属窗口不能为空' };

  const doc = {
    name: name,
    price: Math.round(price * 10) / 10,
    canteen: canteen,
    window: windowName,
    category: String(dish.category || '其他'),
    // 忌口过滤依赖 tags 里带食材名，这里统一去重并转成字符串数组
    tags: Array.isArray(dish.tags)
      ? Array.from(new Set(dish.tags.map(function (t) { return String(t); })))
      : [],
    emoji: String(dish.emoji || '🍽️'),
    description: String(dish.description || ''),
    status: dish.status === 0 ? 0 : 1,
    is_new: !!dish.is_new
  };

  const id = dish.id || dish._id;

  if (id) {
    const exist = await db.collection('dishes').doc(id).get();
    if (!exist || !exist.data || !exist.data.length) {
      return { code: -1, message: '要编辑的菜品不存在' };
    }
    await db.collection('dishes').doc(id).update(doc);
    return { code: 0, message: '已保存', data: { id: id, updated: true } };
  }

  doc.rating = Number(dish.rating) || 0;
  doc.review_count = 0;
  doc.recommend_count = 0;
  doc.create_date = Date.now();

  const res = await db.collection('dishes').add(doc);
  return { code: 0, message: '已新增', data: { id: res.id, created: true } };
}

/**
 * 下架 / 删除菜品（管理端，需要管理口令）
 * 默认做软下架（status = 0），传 hard: true 时物理删除。
 * 软下架可以保留历史评价与外键引用，是更安全的默认行为。
 */
async function handleRemove(payload) {
  const auth = await common.verifyAdminToken(db, payload.token || payload.admin_token || '');
  if (!auth.ok) return { code: -1, message: auth.message };

  const id = String(payload.id || '').trim();
  if (!id) return { code: -1, message: '缺少菜品 id' };

  const exist = await db.collection('dishes').doc(id).get();
  if (!exist || !exist.data || !exist.data.length) {
    return { code: -1, message: '菜品不存在' };
  }

  if (payload.hard === true) {
    await db.collection('dishes').doc(id).remove();
    return { code: 0, message: '已删除', data: { id: id, hard: true } };
  }

  await db.collection('dishes').doc(id).update({ status: 0 });
  return { code: 0, message: '已下架', data: { id: id, status: 0 } };
}

exports.main = async (event, context) => {
  const payload = event || {};
  const action = payload.action;

  console.log('[shiyu-dish] action =', action, ', params =', JSON.stringify(payload));

  try {
    switch (action) {
      case 'list':
        return await handleList(payload);
      case 'detail':
        return await handleDetail(payload);
      case 'rank':
        return await handleRank(payload);
      case 'canteens':
        return await handleDistinct(payload, 'canteen');
      case 'categories':
        return await handleDistinct(payload, 'category');
      case 'save':
        return await handleSave(payload);
      case 'remove':
        return await handleRemove(payload);
      default:
        return { code: -1, message: '未知的 action: ' + action };
    }
  } catch (e) {
    // 查询类异常统一兜底，保证云函数不会 500
    console.error('[shiyu-dish] 查询失败:', e && (e.message || e));
    return { code: -1, message: '查询失败：' + (e && e.message ? e.message : '未知错误') };
  }
};
