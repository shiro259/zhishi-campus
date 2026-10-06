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

// 引用公共模块 shiyu-common。
// 优先用「模块名」形式：这是 uniCloud 公共模块的标准引用方式，
// HBuilderX 上传云函数时会自动把依赖的公共模块一并打包进去。
// 注意不能只用相对路径 —— 上传时只传该函数自己的目录，云端不存在 ../common/ 这个兄弟目录。
// 但本地目录里两种都成立，所以这里带回退，谁可用用谁。
let common
try {
  // 首选：本目录下的副本。它随云函数一起上传，云端一定存在，
  // 不依赖「公共模块是否被打包」这件事（上传云函数只传该函数自己的目录）。
  common = require('./shiyu-common.js')
} catch (e) {
  try {
    // 次选：uniCloud 公共模块名（部分工具链会自动打包 common/ 下的模块）
    common = require('shiyu-common')
  } catch (e2) {
    // 最后：本地开发目录里的相对路径
    common = require('../common/shiyu-common/index.js')
  }
}

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

// 关键字搜索的扫描参数（见 scanByKeyword）：
// 分批取数避免依赖单个 get 的条数上限；总量上限远大于一个食堂的菜品数
const KEYWORD_SCAN_BATCH = 100;
const KEYWORD_SCAN_LIMIT = 1000;

// byIds 单次最多查多少个（收藏页一次要多少给多少，但不能无限）
const MAX_IDS = 200;

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
 * 关键字是否命中某道菜（菜名 / 标签 / 窗口 / 食堂 / 分类）
 *
 * ⚠️ 这里**刻意在 JS 里过滤，而不把正则交给数据库**，原因有三：
 *
 *   1. `db.RegExp` 在不同环境下的调用方式不一致（部分版本必须 `new`），
 *      构造失败会让整条查询抛异常 → 云函数返回失败 → 前端只好退回本机菜谱。
 *      用户看到的就是「搜索有时候搜不到、有时候搜出别的菜」——
 *      本项目的这个 bug 反复出现，根子就在这里。
 *   2. 数据库侧正则对**数组字段**（tags）的匹配语义、以及 `dbCmd.or` 嵌套
 *      `dbCmd.and` 的支持程度，各版本/各空间并不一致，不能依赖。
 *   3. 在 JS 里过滤可以与前端本地兜底（api/index.js 的 dishMatchesKeyword）
 *      使用**完全相同的口径与实现**，两条链路结果必然一致 ——
 *      而「两条链路结果不一致」正是用户感知到的「搜不到 / 搜出别的菜」。
 *
 * 菜单量级只有几十道，多扫一批数据的成本可以忽略。
 * 口径：不搜 description（描述里的无关词会带出不相干的菜）。
 *
 * @param {Object} doc 菜品文档
 * @param {string} kw 已小写化的关键词
 * @returns {boolean}
 */
function dishMatchesKeyword(doc, kw) {
  if (!doc || !kw) return false;
  var parts = [doc.name, doc.window, doc.canteen, doc.category];
  // 标签逐个参与匹配：MongoDB 的数组匹配就是「任一元素命中即命中」，
  // 拼成长串会让带空格的词跨两个标签命中，与数据库行为不一致
  if (Array.isArray(doc.tags)) {
    for (var i = 0; i < doc.tags.length; i++) {
      parts.push(doc.tags[i]);
    }
  }
  for (var j = 0; j < parts.length; j++) {
    var value = parts[j];
    if (typeof value === 'string' && value && value.toLowerCase().indexOf(kw) >= 0) {
      return true;
    }
  }
  return false;
}

/**
 * 关键字搜索：按硬条件分批取数，在 JS 里过滤
 *
 * 分批（每次 100 条）而不是一次取完，是为了不依赖单个 get 的条数上限；
 * 扫描上限 KEYWORD_SCAN_LIMIT 对校园食堂的菜单量级绰绰有余。
 * 取数时已按 orderBy 排好序，因此过滤后直接切片就是正确的分页结果。
 */
async function scanByKeyword(base, kw, orderBy) {
  const matched = [];
  let skip = 0;

  while (skip < KEYWORD_SCAN_LIMIT) {
    let query = db.collection(COLLECTION).where(base);
    orderBy.forEach(function (item) {
      query = query.orderBy(item[0], item[1]);
    });

    const res = await query.field(LIST_FIELD).skip(skip).limit(KEYWORD_SCAN_BATCH).get();
    const rows = (res && res.data) || [];

    for (let i = 0; i < rows.length; i++) {
      if (dishMatchesKeyword(rows[i], kw)) {
        matched.push(withId(rows[i]));
      }
    }

    if (rows.length < KEYWORD_SCAN_BATCH) break;
    skip += KEYWORD_SCAN_BATCH;
  }

  if (skip >= KEYWORD_SCAN_LIMIT) {
    console.warn('[shiyu-dish] 关键字搜索已达扫描上限 ' + KEYWORD_SCAN_LIMIT + ' 条，建议给菜品库加索引或改为数据库侧查询');
  }

  return matched;
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
  const base = { status: 1 };

  if (payload.canteen && String(payload.canteen).trim() !== '') {
    base.canteen = String(payload.canteen).trim();
  }
  if (payload.category && String(payload.category).trim() !== '') {
    base.category = String(payload.category).trim();
  }

  /**
   * 关键字模糊匹配
   *
   * 覆盖 菜名 / 标签 / 窗口 / 食堂 / 分类 —— 同学们习惯直接搜「辣」「清淡」
   * 「3号窗口」「第二食堂」这类词，只在菜名里找必然搜不到。
   * 其中「标签」是结构化的口味与食材（辣、清淡、花生、牛肉…），搜食材靠它最准。
   *
   * 具体匹配规则见 dishMatchesKeyword，它在 JS 层实现，与前端本地兜底同一份口径。
   */
  const kw = payload.keyword ? String(payload.keyword).trim().toLowerCase() : '';

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

  const collection = db.collection(COLLECTION);

  // ---------- 带关键字：JS 侧过滤后再分页 ----------
  if (kw) {
    const matched = await scanByKeyword(base, kw, orderBy);
    const total = matched.length;
    const list = matched.slice(skip, skip + pageSize);

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

  // ---------- 不带关键字：交给数据库分页与计数 ----------
  let query = collection.where(base);
  orderBy.forEach(function (item) {
    query = query.orderBy(item[0], item[1]);
  });

  const listRes = await query.field(LIST_FIELD).skip(skip).limit(pageSize).get();
  const countRes = await collection.where(base).count();

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

/**
 * 批量把菜品图片改写成云存储 fileID（管理端，需要管理口令）
 *
 * 用途：把菜品图从「本机 static/ 图片」迁到「uniCloud 云存储」。
 * 客户端负责逐张上传（拿到 fileID），这里一次性批量写回 —— 只改 image 字段，
 * 不动名称/价格等其它字段，也不会因为某一条失败而中断整批。
 *
 * 入参：{ items: [{ id, image }], token }
 * 返回：{ updated, failed: [{ id, reason }] }
 */
async function handleSetImages(payload) {
  const auth = await common.verifyAdminToken(db, payload.token || payload.admin_token || '');
  if (!auth.ok) return { code: -1, message: auth.message };

  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) return { code: -1, message: '缺少参数 items' };
  // 上限保护：一次最多 200 条，避免误传超大数组把函数拖死
  if (items.length > 200) return { code: -1, message: '单次最多更新 200 条，请分批处理' };

  let updated = 0;
  const failed = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i] || {};
    const id = String(item.id || '').trim();
    const image = String(item.image || '').trim();
    if (!id) {
      failed.push({ id: '', reason: '缺少菜品 id' });
      continue;
    }
    if (!image) {
      failed.push({ id: id, reason: '缺少 image' });
      continue;
    }
    try {
      const res = await db.collection(COLLECTION).doc(id).update({ image: image });
      const affected = (res && (res.updated || res.affected)) || 0;
      if (affected > 0) updated++;
      else failed.push({ id: id, reason: '菜品不存在或内容无变化' });
    } catch (e) {
      failed.push({ id: id, reason: (e && e.message) || '更新失败' });
    }
  }

  return {
    code: 0,
    message: 'success',
    data: { updated: updated, failed: failed, total: items.length }
  };
}

/**
 * action = 'byIds'：按 id 批量取菜品（公开读）
 *
 * 用途：收藏页要知道你收藏了哪几道菜，而收藏只是一串 id（存在本机）。
 * 逐个调 detail 会发 N 次请求（40 个收藏就是 40 次），所以这里一次取回。
 *
 * 细节：
 *   · 只返回**上架**的菜（status=1）—— 被下架/删除的收藏自然消失，不报错
 *   · 保持传入 ids 的顺序（收藏页按收藏时间倒序展示，顺序由调用方决定）
 *   · 上限 200 个，避免超长请求
 */
async function handleByIds(payload) {
  const raw = Array.isArray(payload.ids) ? payload.ids : [];
  const ids = [];
  for (let i = 0; i < raw.length; i++) {
    const id = String(raw[i] === undefined || raw[i] === null ? '' : raw[i]).trim();
    if (id && ids.indexOf(id) < 0) ids.push(id);
  }
  if (!ids.length) return { code: 0, message: 'success', data: { list: [] } };
  if (ids.length > MAX_IDS) {
    return { code: -1, message: '单次最多查询 ' + MAX_IDS + ' 个菜品' };
  }

  const res = await db
    .collection(COLLECTION)
    .where({ _id: dbCmd.in(ids), status: 1 })
    .field(LIST_FIELD)
    .limit(ids.length)
    .get();

  const rows = (res.data || []).map(withId);
  const byId = {};
  rows.forEach(function (d) {
    byId[d.id] = d;
  });

  const list = [];
  ids.forEach(function (id) {
    if (byId[id]) list.push(byId[id]);
  });

  return { code: 0, message: 'success', data: { list: list } };
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
      case 'byIds':
        return await handleByIds(payload);
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
      case 'setImages':
        return await handleSetImages(payload);
      default:
        return { code: -1, message: '未知的 action: ' + action };
    }
  } catch (e) {
    // 查询类异常统一兜底，保证云函数不会 500
    console.error('[shiyu-dish] 查询失败:', e && (e.message || e));
    return { code: -1, message: '查询失败：' + (e && e.message ? e.message : '未知错误') };
  }
};
