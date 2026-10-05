'use strict'
/**
 * 食遇校园 · 菜品查询云函数
 *
 * 部署：在 HBuilderX 中右键 shiyu-dish → 上传部署
 *
 * 支持的动作（与前端 api/index.js 的 dishApi 一一对应）：
 *   list       { keyword, canteen, category, sortByRating, sortByPrice, page, pageSize }
 *              → { list, total, hasMore, engine }
 *   detail     { id }                     → 菜品文档
 *   rank       { type: hot|good|new, limit } → { list }
 *   canteens   {}                         → 食堂名数组
 *   categories {}                         → 分类名数组
 *   save       { id?, dish, token }        → 管理员新增/编辑
 *   remove     { id, token }               → 管理员删除
 *
 * 约定：菜品同时有 _id 与 id（都是 d001 这类稳定值），前端读 d.id || d._id 都能拿到。
 */

var DEFAULT_ADMIN_USERNAME = 'admin'
var DEFAULT_ADMIN_PASSWORD = 'admin123'
var TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 天

/* >>> SHIYU-AUTH-SHARED BEGIN >>> */
// 管理员凭证验签（HMAC-SHA256 + 过期时间 + 口令摘要）。
// 这段代码在 shiyu-config / shiyu-dish / shiyu-review / shiyu-seed 中逐字相同：
// 让每个云函数都能独立部署、不依赖公共模块。改动时必须四处同步 ——
// 项目里有测试会比对这四个文件标记之间的内容是否完全一致。
var crypto = require('crypto')

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex')
}

/** 定长比较，避免时序侧信道 */
function safeEqual(a, b) {
  var bufA = Buffer.from(String(a))
  var bufB = Buffer.from(String(b))
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

/** 签名掺入口令哈希摘要：改口令后此前签发的 token 全部立即失效 */
function signToken(username, exp, secret, pwdHash) {
  return crypto
    .createHmac('sha256', secret)
    .update(username + '.' + exp + '.' + sha256(pwdHash).slice(0, 16))
    .digest('hex')
}

function verifyToken(token, secret, pwdHash) {
  if (!token || typeof token !== 'string') {
    return { ok: false, reason: '请先登录管理员账号' }
  }
  var parts = token.split('.')
  if (parts.length !== 3) {
    return { ok: false, reason: '管理员凭证格式不正确，请重新登录' }
  }
  var username = parts[0]
  var exp = Number(parts[1])
  if (!isFinite(exp)) {
    return { ok: false, reason: '管理员凭证格式不正确，请重新登录' }
  }
  if (Date.now() > exp) {
    return { ok: false, reason: '管理员登录已过期，请重新登录' }
  }
  if (!safeEqual(parts[2], signToken(username, exp, secret, pwdHash))) {
    return { ok: false, reason: '管理员凭证无效，请重新登录' }
  }
  return { ok: true, username: username }
}

/** 取管理员密钥与口令哈希：优先环境变量，其次 shiyu-config 集合里的字段 */
async function loadAdminSecrets(db) {
  var res = await db.collection('shiyu-config').limit(1).get()
  var doc = (res.data && res.data[0]) || {}
  var envSecret = process.env.ADMIN_SECRET || ''
  var envPwd = process.env.ADMIN_PASSWORD || ''
  return {
    secret: envSecret || doc.admin_secret || '',
    pwdHash: envPwd ? sha256(envPwd) : (doc.admin_password_hash || '')
  }
}

/**
 * 管理员操作入口校验
 * 密钥缺失时一律拒绝（fail closed）—— 绝不能在「还没初始化」时放行
 */
async function requireAdmin(db, token) {
  var secrets = await loadAdminSecrets(db)
  if (!secrets.secret || !secrets.pwdHash) {
    return { ok: false, reason: '管理员凭证尚未初始化，请先到登录页完成一次管理员登录' }
  }
  return verifyToken(token, secrets.secret, secrets.pwdHash)
}
/* <<< SHIYU-AUTH-SHARED END <<< */

/** 转义正则元字符，避免用户输入里的 ( [ 等把查询打崩 */
function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 按 id 找菜品的统一条件
 * 同时匹配 _id 与 id，兼容两种结构的记录
 */
function idFilter(db, id) {
  return db.command.or([{ _id: id }, { id: id }])
}

/** 找到菜品文档（没有则返回 null） */
async function findDish(col, db, id) {
  var res = await col.where(idFilter(db, id)).limit(1).get()
  var rows = (res && res.data) || []
  return rows.length ? rows[0] : null
}

/* --------------------------------- 查询 --------------------------------- */

async function listDishes(col, db, event) {
  var keyword = String(event.keyword || '').trim()
  var canteen = String(event.canteen || '').trim()
  var category = String(event.category || '').trim()
  var page = Math.max(1, parseInt(event.page, 10) || 1)
  var pageSize = Math.min(100, Math.max(1, parseInt(event.pageSize, 10) || 20))

  // 只返回上架菜品。前端 isCloudDishDataTrustworthy 也依赖 list/total 与 canteen 字段
  var cond = { status: 1 }
  if (canteen) cond.canteen = canteen
  if (category) cond.category = category

  var where = cond
  if (keyword) {
    var re = new RegExp(escapeRegExp(keyword), 'i')
    where = db.command.and([cond, db.command.or([{ name: re }, { description: re }])])
  }

  var countRes = await col.where(where).count()
  var total = (countRes && countRes.total) || 0

  var orderField = 'recommend_count'
  var orderDir = 'desc'
  if (event.sortByRating) {
    orderField = 'rating'
    orderDir = 'desc'
  } else if (event.sortByPrice) {
    orderField = 'price'
    orderDir = 'asc'
  }

  var res = await col
    .where(where)
    .orderBy(orderField, orderDir)
    .orderBy('_id', 'asc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()

  var list = (res && res.data) || []
  return {
    code: 0,
    data: {
      list: list,
      total: total,
      hasMore: (page - 1) * pageSize + list.length < total,
      engine: 'cloud'
    }
  }
}

async function detailDish(col, db, event) {
  var id = event.id
  if (!id) return { code: 1, message: '缺少菜品 id' }
  var dish = await findDish(col, db, id)
  if (!dish) return { code: 1, message: '菜品不存在' }
  return { code: 0, data: dish }
}

async function rankDishes(col, db, event) {
  var type = event.type || 'hot'
  var limit = Math.min(50, Math.max(1, parseInt(event.limit, 10) || 10))

  var where = { status: 1 }
  var orderField = 'recommend_count'
  if (type === 'good') {
    orderField = 'rating'
  } else if (type === 'new') {
    where.is_new = true
  }

  var res = await col
    .where(where)
    .orderBy(orderField, 'desc')
    .orderBy('_id', 'asc')
    .limit(limit)
    .get()

  return { code: 0, data: { list: (res && res.data) || [] } }
}

/** 某个字段的去重取值（仅上架菜品），用于食堂 / 分类枚举 */
async function distinctField(col, field) {
  var res = await col.where({ status: 1 }).field({}).limit(1000).get()
  var rows = (res && res.data) || []
  var names = []
  for (var i = 0; i < rows.length; i++) {
    var v = rows[i][field]
    if (v && names.indexOf(v) < 0) names.push(v)
  }
  return names
}

/* --------------------------------- 管理端写操作 --------------------------------- */

async function saveDish(col, db, event) {
  var auth = await requireAdmin(db, event.token)
  if (!auth.ok) return { code: 1, message: auth.reason }

  var input = event.dish || {}
  var name = String(input.name || '').trim()
  var canteen = String(input.canteen || '').trim()
  var window = String(input.window || '').trim()
  var price = Number(input.price)
  var floor = Number(input.floor)

  // dishes.schema.json 的 required 是 name / price / canteen / window，
  // 这里先自查一遍，给出人话提示，而不是把数据库报错抛给用户
  if (!name) return { code: 1, message: '请填写菜品名称' }
  if (!isFinite(price) || price < 0) return { code: 1, message: '请填写正确的价格' }
  if (!canteen) return { code: 1, message: '请选择所属食堂' }
  if (!window) return { code: 1, message: '请选择或填写所属窗口' }
  if (!isFinite(floor) || floor < 1) return { code: 1, message: '请选择所属楼层' }

  var payload = {
    name: name,
    price: Math.round(price * 10) / 10,
    canteen: canteen,
    floor: Math.round(floor),
    window: window,
    category: String(input.category || '其他').trim() || '其他',
    tags: Array.isArray(input.tags) ? input.tags : [],
    emoji: String(input.emoji || '🍽️'),
    image: String(input.image || '').trim(),
    description: String(input.description || '').trim(),
    status: Number(input.status) === 0 ? 0 : 1,
    update_date: Date.now()
  }

  var id = event.id || input.id || input._id

  if (id) {
    var found = await findDish(col, db, id)
    if (!found) return { code: 1, message: '菜品不存在，可能已被删除' }
    // 编辑时不动 rating / review_count / recommend_count：那些是评价与推荐的统计结果
    await col.doc(found._id).update(payload)
    return { code: 0, message: '保存成功', data: { id: found._id, updated: true } }
  }

  // 新增：自己生成稳定 id，同时写进 _id 与 id，保证前端两处都能读到
  var newId = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  payload._id = newId
  payload.id = newId
  payload.rating = 0
  payload.review_count = 0
  payload.recommend_count = 0
  payload.is_new = input.is_new === true

  await col.add(payload)
  return { code: 0, message: '新增成功', data: { id: newId, updated: false } }
}

async function removeDish(col, db, event) {
  var auth = await requireAdmin(db, event.token)
  if (!auth.ok) return { code: 1, message: auth.reason }

  var id = event.id
  if (!id) return { code: 1, message: '缺少菜品 id' }

  var found = await findDish(col, db, id)
  if (!found) return { code: 1, message: '菜品不存在，可能已被删除' }

  await col.doc(found._id).remove()
  return { code: 0, message: '已删除', data: { id: found._id } }
}

/* --------------------------------- 入口 --------------------------------- */

exports.main = async (event, context) => {
  var action = event.action || 'list'
  var db = uniCloud.database()
  var col = db.collection('dishes')

  try {
    if (action === 'list') return await listDishes(col, db, event)
    if (action === 'detail') return await detailDish(col, db, event)
    if (action === 'rank') return await rankDishes(col, db, event)
    if (action === 'canteens') return { code: 0, data: await distinctField(col, 'canteen') }
    if (action === 'categories') return { code: 0, data: await distinctField(col, 'category') }
    if (action === 'save') return await saveDish(col, db, event)
    if (action === 'remove') return await removeDish(col, db, event)
    return { code: 1, message: '未知操作：' + action }
  } catch (e) {
    return { code: 1, message: '菜品服务出错：' + ((e && e.message) || '未知错误') }
  }
}
