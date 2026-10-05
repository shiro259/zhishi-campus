'use strict'
/**
 * 食遇校园 · AI 配置云函数 + 管理员认证
 *
 * 部署：在 HBuilderX 中右键 shiyu-config → 上传部署
 *
 * ── 管理员认证设计 ────────────────────────────────────────────────
 * 1. 口令优先读云函数环境变量 ADMIN_USERNAME / ADMIN_PASSWORD / ADMIN_SECRET；
 *    没配环境变量时，自动在 shiyu-config 集合里初始化一份（默认 admin / admin123），
 *    所以开箱即用 —— 但请尽快用「修改管理员口令」改掉默认值。
 * 2. 登录成功只签发一个 HMAC 签名、带过期时间的 token，客户端存 token、不存口令。
 * 3. 所有管理员操作（get / save / test / change-password）都用验签判定。
 *    这就修掉了原来的假校验 —— 它只判断「token 非空」，任何人随手传个字符串
 *    就能读走配置、改 base_url、把 API Key 转发到自己的服务器。
 * 4. token 的签名里掺入了当前口令哈希，所以改口令后旧 token 会立刻全部失效。
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

function issueToken(username, secret, pwdHash, ttlMs) {
  var exp = Date.now() + ttlMs
  return username + '.' + exp + '.' + signToken(username, exp, secret, pwdHash)
}

/**
 * 读取（必要时初始化）管理员凭据
 * 环境变量优先 → 集合里已存的值 → 写入默认值
 */
async function loadAdminCredentials(col) {
  var res = await col.limit(1).get()
  var doc = (res.data && res.data[0]) || null

  var envUser = process.env.ADMIN_USERNAME || ''
  var envPwd = process.env.ADMIN_PASSWORD || ''
  var envSecret = process.env.ADMIN_SECRET || ''

  var username = envUser || (doc && doc.admin_username) || DEFAULT_ADMIN_USERNAME
  var pwdHash = envPwd
    ? sha256(envPwd)
    : (doc && doc.admin_password_hash) || sha256(DEFAULT_ADMIN_PASSWORD)
  var secret = envSecret || (doc && doc.admin_secret) || crypto.randomBytes(32).toString('hex')

  if (doc) {
    var patch = {}
    if (!doc.admin_username && !envUser) patch.admin_username = username
    if (!doc.admin_password_hash && !envPwd) patch.admin_password_hash = pwdHash
    if (!doc.admin_secret && !envSecret) patch.admin_secret = secret
    if (Object.keys(patch).length) await col.doc(doc._id).update(patch)
  } else {
    // 集合还是空的（还没保存过 AI 配置）：先建一条，把管理员凭据落盘，
    // 稍后保存 AI 配置时会复用同一条记录
    await col.add({
      admin_username: username,
      admin_password_hash: pwdHash,
      admin_secret: secret,
      create_date: Date.now()
    })
  }

  return {
    username: username,
    pwdHash: pwdHash,
    secret: secret,
    // 还在用默认口令 → 前端据此提示尽快修改
    usingDefaultPassword: !envPwd && safeEqual(pwdHash, sha256(DEFAULT_ADMIN_PASSWORD))
  }
}

exports.main = async (event, context) => {
  var action = event.action || 'get'
  var db = uniCloud.database()
  var col = db.collection('shiyu-config')

  // 需要额外 cred 信息（账号名 / 是否仍在用默认口令）的操作走这里；
  // 单纯判定权限请直接用共享块的 requireAdmin(db, token)。
  // 注意名字不要叫 requireAdmin，否则会遮蔽共享块里的同名函数。
  var requireAdminCred = async function () {
    var cred
    try {
      cred = await loadAdminCredentials(col)
    } catch (e) {
      return { ok: false, res: { code: 1, message: '读取管理员配置失败：' + e.message } }
    }
    var v = verifyToken(event.token, cred.secret, cred.pwdHash)
    if (!v.ok) return { ok: false, res: { code: 1, message: v.reason } }
    return { ok: true, cred: cred }
  }

  /* ------------------------------ 管理员登录 ------------------------------ */

  if (action === 'admin-login') {
    var loginName = String(event.username || '').trim()
    var loginPwd = String(event.password || '')
    if (!loginName || !loginPwd) {
      return { code: 1, message: '请输入管理员账号和口令' }
    }
    // token 用 '.' 分隔，账号里不能带 '.'
    if (loginName.indexOf('.') > -1) {
      return { code: 1, message: '管理员账号不能包含 “.” 字符' }
    }

    var cred
    try {
      cred = await loadAdminCredentials(col)
    } catch (e) {
      return { code: 1, message: '读取管理员配置失败：' + e.message }
    }

    // 账号与口令都要对；口令只比哈希，不看明文
    var nameOk = safeEqual(loginName.toLowerCase(), String(cred.username).toLowerCase())
    var pwdOk = safeEqual(sha256(loginPwd), cred.pwdHash)
    if (!nameOk || !pwdOk) {
      return { code: 1, message: '管理员账号或口令错误' }
    }

    return {
      code: 0,
      message: '登录成功',
      data: {
        token: issueToken(cred.username, cred.secret, cred.pwdHash, TOKEN_TTL_MS),
        username: cred.username,
        expires_in: TOKEN_TTL_MS,
        using_default_password: cred.usingDefaultPassword
      }
    }
  }

  /* --------------------------- 校验凭证是否有效 --------------------------- */

  if (action === 'verify-admin') {
    var vCred
    try {
      vCred = await loadAdminCredentials(col)
    } catch (e) {
      return { code: 1, message: '读取管理员配置失败：' + e.message }
    }
    var vres = verifyToken(event.token, vCred.secret, vCred.pwdHash)
    if (!vres.ok) return { code: 1, message: vres.reason }
    return {
      code: 0,
      data: { username: vres.username, using_default_password: vCred.usingDefaultPassword }
    }
  }

  /* ------------------------------ 修改口令 ------------------------------ */

  if (action === 'change-password') {
    var cpCred
    try {
      cpCred = await loadAdminCredentials(col)
    } catch (e) {
      return { code: 1, message: '读取管理员配置失败：' + e.message }
    }
    var cpv = verifyToken(event.token, cpCred.secret, cpCred.pwdHash)
    if (!cpv.ok) return { code: 1, message: cpv.reason }

    var oldPwd = String(event.old_password || '')
    var newPwd = String(event.new_password || '')
    if (!safeEqual(sha256(oldPwd), cpCred.pwdHash)) {
      return { code: 1, message: '原口令不正确' }
    }
    if (newPwd.length < 6) {
      return { code: 1, message: '新口令至少 6 位' }
    }
    if (safeEqual(sha256(newPwd), cpCred.pwdHash)) {
      return { code: 1, message: '新口令不能与原口令相同' }
    }
    if (process.env.ADMIN_PASSWORD) {
      // 口令来自环境变量，改库没用，必须去 uniCloud 控制台改环境变量
      return { code: 1, message: '当前口令由云函数环境变量 ADMIN_PASSWORD 决定，请到 uniCloud 控制台修改' }
    }

    try {
      var cpList = await col.limit(1).get()
      var cpDoc = cpList.data && cpList.data[0]
      if (!cpDoc) return { code: 1, message: '管理员配置不存在' }
      // 只更新口令哈希即可：token 签名里掺了口令摘要，旧凭证自动全部失效
      await col.doc(cpDoc._id).update({
        admin_password_hash: sha256(newPwd),
        update_date: Date.now()
      })
      return { code: 0, message: '口令已修改，请用新口令重新登录', data: { relogin: true } }
    } catch (e) {
      return { code: 1, message: '修改口令失败：' + e.message }
    }
  }

  /* ------------------------------ 读取配置 ------------------------------ */

  if (action === 'get') {
    var gAuth = await requireAdminCred()
    if (!gAuth.ok) return gAuth.res

    try {
      var res = await col.limit(1).get()
      if (res.data && res.data.length > 0) {
        var config = res.data[0]
        // 不返回完整 api_key，只返回掩码
        var maskedKey = ''
        if (config.api_key) {
          maskedKey = config.api_key.substring(0, 6) + '****' + config.api_key.substring(config.api_key.length - 4)
        }
        return {
          code: 0,
          data: {
            api_key: maskedKey,
            has_key: !!config.api_key,
            provider: config.provider || 'qwen',
            model: config.model || 'qwen-turbo',
            base_url: config.base_url || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
            temperature: typeof config.temperature === 'number' ? config.temperature : 0.8,
            admin_username: gAuth.cred.username,
            using_default_password: gAuth.cred.usingDefaultPassword
          }
        }
      }
      return {
        code: 0,
        data: {
          has_key: false,
          admin_username: gAuth.cred.username,
          using_default_password: gAuth.cred.usingDefaultPassword
        }
      }
    } catch (e) {
      return { code: 1, message: '读取配置失败：' + e.message }
    }
  }

  /* ------------------------------ 保存配置 ------------------------------ */

  if (action === 'save') {
    var sAuth = await requireAdminCred()
    if (!sAuth.ok) return sAuth.res

    try {
      var existing = await col.limit(1).get()
      var current = (existing.data && existing.data[0]) || null

      // 未传 api_key 时沿用云端已有的 Key。
      // 前端只能拿到掩码、不可能回传明文，所以「只改模型/温度」时前端会留空 ——
      // 老逻辑用 event.api_key || '' 直接覆盖，会把已配好的 Key 清空，
      // 之后 AI 推荐/聊天就全线报「尚未配置 API Key」，且完全看不出原因。
      var apiKey = event.api_key || ''
      if (!apiKey && current && current.api_key) {
        apiKey = current.api_key
      }
      if (!apiKey) {
        return { code: 1, message: '请先填写 API Key' }
      }

      // 温度：没传就沿用原值，再没有就用默认 0.8
      var temperature = Number(event.temperature)
      if (!isFinite(temperature)) {
        temperature = current && typeof current.temperature === 'number' ? current.temperature : 0.8
      }

      var data = {
        api_key: apiKey,
        provider: event.provider || (current && current.provider) || 'qwen',
        model: event.model || (current && current.model) || 'qwen-turbo',
        base_url: event.base_url || (current && current.base_url) || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        temperature: temperature,
        update_date: Date.now()
      }

      if (current) {
        await col.doc(current._id).update(data)
      } else {
        data.create_date = Date.now()
        await col.add(data)
      }
      return { code: 0, message: '保存成功' }
    } catch (e) {
      return { code: 1, message: '保存失败：' + e.message }
    }
  }

  /* ------------------------------ 测试连通性 ------------------------------ */

  if (action === 'test') {
    var tAuth = await requireAdminCred()
    if (!tAuth.ok) return tAuth.res

    var testUrl = ''
    var testModel = ''
    try {
      var configRes = await col.limit(1).get()
      if (!configRes.data || configRes.data.length === 0 || !configRes.data[0].api_key) {
        return { code: 1, message: '尚未配置 API Key' }
      }
      var cfg = configRes.data[0]
      var baseUrl = cfg.base_url || 'https://dashscope.aliyuncs.com/compatible-mode/v1'

      if (!/^https?:\/\//i.test(baseUrl)) {
        return {
          code: 1,
          message: 'base_url 配置有误：「' + baseUrl + '」缺少 http(s):// 前缀'
        }
      }
      testUrl = baseUrl.replace(/\/+$/, '').replace(/\/chat\/completions$/, '') + '/chat/completions'
      testModel = cfg.model || 'qwen-turbo'

      var testRes = await uniCloud.httpclient.request(testUrl, {
        method: 'POST',
        timeout: 10000,
        // 与 shiyu-chat 保持一致：显式按 JSON 解析，避免拿到字符串后报出莫名的 TypeError
        dataType: 'json',
        contentType: 'json',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + cfg.api_key
        },
        data: {
          model: testModel,
          messages: [{ role: 'user', content: '你好，回复ok' }],
          max_tokens: 10
        }
      })

      var body = testRes.data
      if (typeof body === 'string') {
        try { body = JSON.parse(body) } catch (parseErr) { /* 保持原样 */ }
      }
      var bodyText = typeof body === 'string'
        ? body.slice(0, 300)
        : JSON.stringify(body || {}).slice(0, 300)

      if (testRes.status === 200) {
        return { code: 0, message: '连接成功（' + testModel + '）' }
      }
      var msg = 'HTTP ' + testRes.status
      if (body && body.error && body.error.message) {
        msg = 'HTTP ' + testRes.status + '：' + body.error.message
      } else if (bodyText) {
        msg = 'HTTP ' + testRes.status + '：' + bodyText
      }
      return { code: 1, message: msg }
    } catch (e) {
      // 附上地址与模型名（不含 api_key），用于区分域名写错 / 超时 / 不可达
      return {
        code: 1,
        message: '连接失败：' + ((e && (e.message || e.errMsg)) || '未知错误') +
          '\n请求地址：' + testUrl +
          '\n模型：' + testModel
      }
    }
  }

  return { code: 1, message: '未知操作' }
}
