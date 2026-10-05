'use strict'
/**
 * 食遇校园 · 评价云函数
 *
 * 部署：在 HBuilderX 中右键 shiyu-review → 上传部署
 *
 * 支持的动作（与前端 api/index.js 的 reviewApi 一一对应）：
 *   list    { dish_id?, page, pageSize, all? }  默认只回已通过审核的；all:true 需管理员
 *   create  { dish_id, dish_name, rating, content, images, nickname, avatar, user_id }
 *   mine    { uid, page, pageSize }
 *   pending { token, page, pageSize }           管理员：待审核
 *   audit   { id, status, token }               管理员：status 1 通过 / 2 拒绝
 *
 * 审核状态：0 待审核 / 1 已通过 / 2 已拒绝（与 reviews.schema.json 一致）
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

/** 分页查询的公共部分 */
async function pagedQuery(col, where, page, pageSize) {
  var countRes = await col.where(where).count()
  var total = (countRes && countRes.total) || 0
  var res = await col
    .where(where)
    .orderBy('create_date', 'desc')
    .orderBy('_id', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()
  var list = (res && res.data) || []
  return {
    list: list,
    total: total,
    hasMore: (page - 1) * pageSize + list.length < total
  }
}

/* --------------------------------- 查询 --------------------------------- */

async function listReviews(col, db, event) {
  var page = Math.max(1, parseInt(event.page, 10) || 1)
  var pageSize = Math.min(100, Math.max(1, parseInt(event.pageSize, 10) || 10))

  var where = {}
  if (event.all) {
    // 「全部状态」只在管理端使用，必须有管理员凭证，否则不通过审核的评价会被读走
    var auth = await requireAdmin(db, event.token)
    if (!auth.ok) return { code: 1, message: auth.reason }
  } else {
    where.status = 1
  }
  if (event.dish_id) where.dish_id = event.dish_id

  var paged = await pagedQuery(col, where, page, pageSize)
  return { code: 0, data: { list: paged.list, total: paged.total, hasMore: paged.hasMore } }
}

async function mineReviews(col, db, event) {
  var uid = String(event.uid || '').trim()
  var page = Math.max(1, parseInt(event.page, 10) || 1)
  var pageSize = Math.min(100, Math.max(1, parseInt(event.pageSize, 10) || 10))

  // 按本机 uid 归属；没有 uid 就没有「我的评价」
  if (!uid) {
    return { code: 0, data: { list: [], total: 0, hasMore: false } }
  }

  // 这里返回全部状态：同学要能看到自己那条「待审核」的评价
  var paged = await pagedQuery(col, { user_id: uid }, page, pageSize)
  return { code: 0, data: { list: paged.list, total: paged.total, hasMore: paged.hasMore } }
}

async function pendingReviews(col, db, event) {
  var auth = await requireAdmin(db, event.token)
  if (!auth.ok) return { code: 1, message: auth.reason }

  var page = Math.max(1, parseInt(event.page, 10) || 1)
  var pageSize = Math.min(100, Math.max(1, parseInt(event.pageSize, 10) || 20))

  var paged = await pagedQuery(col, { status: 0 }, page, pageSize)
  return { code: 0, data: { list: paged.list, total: paged.total, hasMore: paged.hasMore } }
}

/* --------------------------------- 写入 --------------------------------- */

async function createReview(col, db, event) {
  var dishId = String(event.dish_id || '').trim()
  var userId = String(event.user_id || event.uid || '').trim()
  var content = String(event.content || '').trim()
  var rating = Number(event.rating)

  if (!dishId) return { code: 1, message: '缺少菜品信息，请从菜品详情页进入' }
  if (!(rating >= 1 && rating <= 5)) return { code: 1, message: '评分需为 1~5 星' }
  if (content.length < 5) return { code: 1, message: '评价内容至少 5 个字' }
  if (content.length > 200) return { code: 1, message: '评价内容最多 200 字' }
  // reviews.schema.json 把 user_id 列为 required，缺了会被数据库拒绝，这里先给明确提示
  if (!userId) return { code: 1, message: '缺少用户标识，请重新进入小程序后再试' }

  await col.add({
    dish_id: dishId,
    dish_name: String(event.dish_name || '').slice(0, 40),
    user_id: userId,
    nickname: String(event.nickname || '匿名同学').slice(0, 20),
    avatar: String(event.avatar || ''),
    rating: Math.round(rating),
    content: content,
    images: Array.isArray(event.images) ? event.images : [],
    like_count: 0,
    // 一律待审核：管理后台审核通过后才会出现在学生端
    status: 0
  })

  // 菜品评价数 +1。属于埋点，失败不能影响评价提交本身
  try {
    await bumpDishCounter(db, dishId, 'review_count', 1)
  } catch (e) {
    // 忽略
  }

  return { code: 0, message: '评价已提交，审核通过后展示' }
}

async function auditReview(col, db, event) {
  var auth = await requireAdmin(db, event.token)
  if (!auth.ok) return { code: 1, message: auth.reason }

  var id = event.id
  var status = Number(event.status)
  if (!id) return { code: 1, message: '缺少评价 id' }
  if (status !== 1 && status !== 2) {
    return { code: 1, message: '审核状态只能是 1（通过）或 2（拒绝）' }
  }

  var found = await col.where({ _id: id }).limit(1).get()
  var rows = (found && found.data) || []
  if (!rows.length) return { code: 1, message: '评价不存在，可能已被删除' }
  var review = rows[0]

  await col.doc(id).update({ status: status, update_date: Date.now() })

  // 通过后重算该菜品平均分。属于统计，失败不影响审核结果本身
  if (status === 1 && review.dish_id) {
    try {
      await recomputeDishRating(db, review.dish_id)
    } catch (e) {
      // 忽略
    }
  }

  return { code: 0, message: status === 1 ? '已通过' : '已拒绝', data: { id: id, status: status } }
}

/* --------------------------------- 统计辅助 --------------------------------- */

/** 找到菜品文档（同时兼容 _id 与 id） */
async function findDishDoc(db, dishId) {
  var cmd = db.command
  var res = await db.collection('dishes').where(cmd.or([{ _id: dishId }, { id: dishId }])).limit(1).get()
  var rows = (res && res.data) || []
  return rows.length ? rows[0] : null
}

/** 累加菜品上的某个计数（review_count） */
async function bumpDishCounter(db, dishId, field, delta) {
  var dish = await findDishDoc(db, dishId)
  if (!dish) return
  var patch = {}
  patch[field] = db.command.inc(delta)
  await db.collection('dishes').doc(dish._id).update(patch)
}

/** 用已通过审核的评价重算菜品平均分（保留一位小数） */
async function recomputeDishRating(db, dishId) {
  var res = await db.collection('reviews').where({ dish_id: dishId, status: 1 }).limit(1000).get()
  var rows = (res && res.data) || []
  if (!rows.length) return

  var sum = 0
  for (var i = 0; i < rows.length; i++) {
    sum += Number(rows[i].rating) || 0
  }
  var avg = Math.round((sum / rows.length) * 10) / 10

  var dish = await findDishDoc(db, dishId)
  if (!dish) return
  await db.collection('dishes').doc(dish._id).update({ rating: avg })
}

/* --------------------------------- 入口 --------------------------------- */

exports.main = async (event, context) => {
  var action = event.action || 'list'
  var db = uniCloud.database()
  var col = db.collection('reviews')

  try {
    if (action === 'list') return await listReviews(col, db, event)
    if (action === 'mine') return await mineReviews(col, db, event)
    if (action === 'pending') return await pendingReviews(col, db, event)
    if (action === 'create') return await createReview(col, db, event)
    if (action === 'audit') return await auditReview(col, db, event)
    return { code: 1, message: '未知操作：' + action }
  } catch (e) {
    return { code: 1, message: '评价服务出错：' + ((e && e.message) || '未知错误') }
  }
}
