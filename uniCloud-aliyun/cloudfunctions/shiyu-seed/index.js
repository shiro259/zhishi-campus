'use strict'
/**
 * 食遇校园 · 菜品库初始化云函数
 *
 * 部署：在 HBuilderX 中右键 shiyu-seed → 上传部署
 *
 * 用法（管理后台 → 数据初始化 / 重置菜品库，或云函数控制台直接调用）：
 *   { "action": "sync",  "token": "<管理员凭证>" }  补齐缺失菜品 + 修复缺少 status 的旧数据
 *   { "action": "reset", "token": "<管理员凭证>" }  清空菜品库后全量重建（破坏性操作）
 *
 * 返回 { total, inserted, repaired }，管理后台据此提示。
 *
 * 说明：这里内嵌了一份菜品库，与前端 common/local-dishes.js 保持一致
 * （云函数独立部署，无法直接 import 前端文件）。两处菜名必须一致，
 * 否则「首页显示第一食堂、点进去一道菜都没有」那类问题会再次出现。
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

/** 分类 → emoji（与前端 common/constants.js 的 EMOJI_MAP 对应） */
var EMOJI_BY_CATEGORY = {
  '川菜': '🌶️',
  '家常菜': '🍚',
  '面食': '🍜',
  '快餐': '🍗',
  '粤菜': '🥘',
  '小吃': '🥟',
  '地方菜': '🍲',
  '烧烤': '🍢',
  '饮品': '🧋',
  '轻食': '🥗'
}

/**
 * 内置菜品库（22 道）
 *
 * 食堂名必须与前端 getLocalCanteens() 完全一致：第一食堂 / 第二食堂 / 第三食堂。
 * （「清真食堂」已按需求删除，原先属于它的 4 道菜移到了第二/第三食堂。）
 * floor / window 留空，等管理员在「菜品管理」里重填真实位置。
 */
var SEED_DISHES = [
  { id: 'd001', name: '麻婆豆腐', price: 8, canteen: '第一食堂', floor: null, window: '', category: '川菜', tags: ['辣', '下饭'], description: '经典川菜，麻辣鲜香，豆腐嫩滑，配米饭一绝。', rating: 4.0, review_count: 5, is_new: false },
  { id: 'd002', name: '宫保鸡丁', price: 12, canteen: '第一食堂', floor: null, window: '', category: '川菜', tags: ['辣', '甜', '下饭'], description: '鸡丁鲜嫩，花生酥脆，甜辣适口，人气爆款。', rating: 4.1, review_count: 36, is_new: false },
  { id: 'd003', name: '鱼香肉丝', price: 10, canteen: '第一食堂', floor: null, window: '', category: '川菜', tags: ['辣', '酸', '下饭'], description: '酸甜微辣，肉丝滑嫩，经典鱼香味型。', rating: 4.1, review_count: 6, is_new: false },
  { id: 'd004', name: '番茄炒蛋', price: 6, canteen: '第一食堂', floor: null, window: '', category: '家常菜', tags: ['清淡', '甜'], description: '酸甜可口，鸡蛋嫩滑，老少皆宜。', rating: 4.2, review_count: 17, is_new: false },
  { id: 'd005', name: '红烧排骨', price: 15, canteen: '第一食堂', floor: null, window: '', category: '家常菜', tags: ['咸香', '下饭'], description: '排骨软烂入味，酱香浓郁，分量十足。', rating: 4.1, review_count: 16, is_new: false },
  { id: 'd006', name: '兰州拉面', price: 10, canteen: '第二食堂', floor: null, window: '', category: '面食', tags: ['清淡', '汤面'], description: '手工拉面，汤清面爽，牛肉片香。', rating: 4.6, review_count: 51, is_new: false },
  { id: 'd007', name: '重庆小面', price: 9, canteen: '第二食堂', floor: null, window: '', category: '面食', tags: ['辣', '干拌面'], description: '麻辣鲜香，面条劲道，正宗重庆味。', rating: 4.8, review_count: 23, is_new: true },
  { id: 'd008', name: '黄焖鸡米饭', price: 14, canteen: '第二食堂', floor: null, window: '', category: '快餐', tags: ['咸香', '下饭'], description: '鸡肉鲜嫩，汤汁浓郁，米饭管够。', rating: 4.0, review_count: 45, is_new: false },
  { id: 'd009', name: '沙县蒸饺', price: 8, canteen: '第二食堂', floor: null, window: '', category: '小吃', tags: ['清淡'], description: '皮薄馅大，蘸醋吃更香，早餐首选。', rating: 4.3, review_count: 48, is_new: false },
  { id: 'd010', name: '皮蛋瘦肉粥', price: 6, canteen: '第二食堂', floor: null, window: '', category: '小吃', tags: ['清淡', '养胃'], description: '粥稠米香，皮蛋瘦肉搭配，暖胃又营养。', rating: 4.0, review_count: 35, is_new: false },
  { id: 'd011', name: '广东肠粉', price: 7, canteen: '第三食堂', floor: null, window: '', category: '粤菜', tags: ['清淡', '早餐'], description: '米浆蒸制，滑嫩Q弹，淋上酱汁超满足。', rating: 4.8, review_count: 23, is_new: true },
  { id: 'd012', name: '白切鸡', price: 16, canteen: '第三食堂', floor: null, window: '', category: '粤菜', tags: ['清淡', '鲜嫩'], description: '皮爽肉滑，原汁原味，配姜葱酱绝佳。', rating: 4.0, review_count: 5, is_new: false },
  { id: 'd013', name: '蜜汁叉烧饭', price: 15, canteen: '第三食堂', floor: null, window: '', category: '粤菜', tags: ['甜', '下饭'], description: '叉烧肥瘦相间，蜜汁香甜，米饭吸满肉汁。', rating: 4.2, review_count: 17, is_new: false },
  { id: 'd014', name: '螺蛳粉', price: 12, canteen: '第三食堂', floor: null, window: '', category: '地方菜', tags: ['辣', '酸', '汤面'], description: '酸辣鲜爽，配料丰富，闻着臭吃着香。', rating: 4.4, review_count: 29, is_new: true },
  { id: 'd015', name: '麻辣香锅', price: 18, canteen: '第三食堂', floor: null, window: '', category: '地方菜', tags: ['辣', '重油'], description: '自选食材，麻辣干香，重口味必点。', rating: 4.3, review_count: 28, is_new: false },
  { id: 'd016', name: '牛肉拉面', price: 11, canteen: '第二食堂', floor: null, window: '', category: '面食', tags: ['清淡', '汤面'], description: '汤浓面劲，牛肉片实在，分量管饱。', rating: 4.5, review_count: 30, is_new: false },
  { id: 'd017', name: '大盘鸡', price: 20, canteen: '第三食堂', floor: null, window: '', category: '地方菜', tags: ['辣', '咸香'], description: '鸡肉土豆配皮带面，新疆特色，香辣过瘾。', rating: 4.6, review_count: 41, is_new: false },
  { id: 'd018', name: '烤羊肉串', price: 3, canteen: '第三食堂', floor: null, window: '', category: '烧烤', tags: ['辣', '咸香'], description: '现烤羊肉，外焦里嫩，撒上孜然辣椒面。', rating: 4.7, review_count: 22, is_new: true },
  { id: 'd019', name: '手抓饭', price: 13, canteen: '第三食堂', floor: null, window: '', category: '地方菜', tags: ['咸香'], description: '胡萝卜羊肉焖饭，油润不腻，香气扑鼻。', rating: 4.3, review_count: 18, is_new: false },
  { id: 'd020', name: '珍珠奶茶', price: 10, canteen: '第一食堂', floor: null, window: '', category: '饮品', tags: ['甜'], description: 'Q弹珍珠，香浓奶茶，下午茶必备。', rating: 4.6, review_count: 11, is_new: false },
  { id: 'd021', name: '水果沙拉', price: 12, canteen: '第二食堂', floor: null, window: '', category: '轻食', tags: ['清淡', '健康'], description: '新鲜水果搭配酸奶，低脂健康。', rating: 4.2, review_count: 27, is_new: true },
  { id: 'd022', name: '蔬菜沙拉', price: 8, canteen: '第二食堂', floor: null, window: '', category: '轻食', tags: ['清淡', '健康'], description: '新鲜时蔬，油醋汁调味，减脂首选。', rating: 4.5, review_count: 10, is_new: false }
]

/**
 * 由内置数据构造待写入的菜品文档
 *
 * 同时写入 _id 和 id：_id 用 d001 这类稳定值，重复 sync 不会重复插入；
 * 而前端很多地方读的是 d.id（例如推荐页的 goDetail(d.id)），所以两个都要有。
 * 不写 create_date，交给 schema 的 forceDefaultValue($env:'now') 自动填。
 */
function buildDoc(src) {
  var doc = {
    _id: src.id,
    id: src.id,
    name: src.name,
    price: src.price,
    canteen: src.canteen,
    window: src.window || '',
    category: src.category,
    tags: src.tags.slice(0),
    emoji: EMOJI_BY_CATEGORY[src.category] || '🍽️',
    image: '',
    description: src.description,
    rating: src.rating,
    review_count: src.review_count,
    recommend_count: 0,
    status: 1,
    is_new: src.is_new
  }
  // 楼层可能暂缺（等管理员重填位置），缺了就不写这个字段
  if (src.floor) doc.floor = src.floor
  return doc
}

/** 当前有效的食堂名单（与 common/constants.js 的 CANTEEN_FLOORS 一致） */
var VALID_CANTEENS = ['第一食堂', '第二食堂', '第三食堂']

/**
 * 找出食堂名已失效的历史菜品
 *
 * 删掉「清真食堂」之后，云端可能还留着挂在它下面的菜。
 * 这类孤儿数据会连累整个菜品列表：前端 isCloudDishDataTrustworthy 发现
 * 云端返回了本地不认识的食堂名，就会整体退回本地 40 道菜，
 * 表现为「管理后台改了菜，学生端却看不到」。
 */
async function findOrphanCanteenDishes(col) {
  var res = await col.limit(1000).get()
  var rows = (res && res.data) || []
  var orphans = []
  for (var i = 0; i < rows.length; i++) {
    var c = rows[i].canteen
    if (c && VALID_CANTEENS.indexOf(c) < 0) orphans.push(rows[i])
  }
  return orphans
}

/** 清空 dishes 集合：先试批量删除，再核对一遍，最后逐条兜底删干净 */
async function removeAllDishes(col, db) {
  try {
    await col.where({ _id: db.command.exists(true) }).remove()
  } catch (e) {
    // 落到下面的兜底
  }
  var left = await col.limit(1000).get()
  var rows = (left && left.data) || []
  for (var i = 0; i < rows.length; i++) {
    await col.doc(rows[i]._id).remove()
  }
}

exports.main = async (event, context) => {
  var action = event.action || 'sync'
  var db = uniCloud.database()
  var col = db.collection('dishes')

  // reset 是清库操作，sync 也会写库，两者都必须管理员
  var auth = await requireAdmin(db, event.token)
  if (!auth.ok) return { code: 1, message: auth.reason }

  try {
    if (action === 'reset') {
      await removeAllDishes(col, db)
    } else if (action !== 'sync') {
      return { code: 1, message: '未知操作：' + action }
    }

    // 建立索引：_id / id / name 三种键都能命中，兼容历史上不同结构的数据
    var existing = await col.limit(1000).get()
    var rows = (existing && existing.data) || []
    var byId = {}
    var byName = {}
    for (var i = 0; i < rows.length; i++) {
      var d = rows[i]
      if (d._id !== undefined) byId[d._id] = d
      if (d.id) byId[d.id] = d
      if (d.name) byName[d.name] = d
    }

    var inserted = 0
    var repaired = 0

    // 第一步：修复历史数据。
    // 旧版本写进库里的菜品没有 status 字段，而菜品列表查询带 where({status:1})，
    // 这类记录永远查不出来；食堂/分类枚举却不带这个条件 ——
    // 于是就出现「首页能看到第一食堂，点进去一道菜都没有」。
    // 凡是**完全没有** status 字段的记录一律补成 1（无法判断管理员本意）；
    // 而显式 status:0 的是管理员主动下架的，绝不改动。
    for (var k = 0; k < rows.length; k++) {
      var row = rows[k]
      if (row.status === undefined || row.status === null) {
        await col.doc(row._id).update({ status: 1 })
        row.status = 1
        repaired++
      }
    }

    // 第二步：补齐缺失的内置菜品
    for (var j = 0; j < SEED_DISHES.length; j++) {
      var src = SEED_DISHES[j]
      var hit = byId[src.id] || byName[src.name]

      if (hit) {
        continue
      }

      await col.add(buildDoc(src))
      inserted++
    }

    var after = await col.limit(1000).get()
    var total = ((after && after.data) || []).length

    // 食堂名单变更后（本次删掉了「清真食堂」），云端可能残留挂在已废弃食堂下的菜品。
    // 这类孤儿数据会让前端整体退回本地菜谱（isCloudDishDataTrustworthy 会判定数据不可信），
    // 表现就是「后台改了菜、学生端却看不到」。这里只统计并提示，不擅自删除，
    // 请管理员确认后用「重置菜品库」清掉。
    var orphans = await findOrphanCanteenDishes(col)

    var message = action === 'reset'
      ? '菜品库已重置，共 ' + total + ' 道菜品'
      : '同步完成，共 ' + total + ' 道菜品'
    if (orphans.length) {
      message += '；另外发现 ' + orphans.length +
        ' 道菜的食堂已不存在（' + orphans[0].canteen + ' 等），建议执行「重置菜品库」清理，否则学生端会整体退回本地数据'
    }

    return {
      code: 0,
      message: message,
      data: {
        total: total,
        inserted: inserted,
        repaired: repaired,
        orphans: orphans.length
      }
    }
  } catch (e) {
    return { code: 1, message: '菜品库初始化失败：' + ((e && e.message) || '未知错误') }
  }
}
