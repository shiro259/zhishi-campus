/**
 * 微信一键登录自检
 *
 * 这次的 bug 是「不管什么原因都显示『当前环境不支持微信登录』」，
 * 所以检查的重点不是「有没有写微信登录」，而是：
 *
 *   [1] 云函数 wechat-login：**真跑**一遍，验证每种失败都给出可执行的原因
 *       （缺环境变量 / AppID 错 / code 过期 / 网络异常 / 成功）
 *   [2] 前端按原因分别提示，不能再出现那句笼统的兜底文案
 *   [3] 非微信端不渲染按钮（条件编译），而不是渲染出来再报错
 *   [4] 登录页原有逻辑（同学身份 / 管理员口令 / 编辑模式）一个都没丢
 *
 * 用法：node _ui/check-wechat-login.mjs
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { createChecker, loadPage, checkCompile, checkLogic } from './lib/page-check.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const FN = 'uniCloud-aliyun/cloudfunctions/wechat-login/index.js'

const c = createChecker()

/* ==================== [1] 云函数：真跑 ==================== */
console.log('\n[1] 云函数 wechat-login（真跑，覆盖每种失败原因）')

/**
 * 在沙箱里执行云函数源码
 * @param {Object} env 环境变量
 * @param {Function} httpImpl 假的 uniCloud.httpclient.request
 * @param {Object} dbCfg 假的 shiyu-config 文档（数据库里的配置）
 */
function runCloudFn(env, httpImpl, dbCfg) {
  const src = read(FN)
  // 公共模块：直接加载真实源码，保证测的是同一份逻辑。
  // 它开头 require('crypto')，所以沙箱里要给出真实的 require。
  const commonSrc = read('uniCloud-aliyun/cloudfunctions/common/shiyu-common/index.js')
  const nodeRequire = createRequire(import.meta.url)
  const commonSandbox = {
    module: { exports: {} },
    exports: {},
    process: { env: env || {} },
    console,
    require: (id) => nodeRequire(id)
  }
  commonSandbox.global = commonSandbox
  vm.createContext(commonSandbox)
  vm.runInContext(commonSrc, commonSandbox, { filename: 'shiyu-common/index.js' })
  const common = commonSandbox.module.exports

  const configDoc = dbCfg || null
  const fakeDb = {
    collection: () => ({
      limit: () => ({ get: async () => ({ data: configDoc ? [configDoc] : [] }) }),
      where: () => ({ limit: () => ({ get: async () => ({ data: configDoc ? [configDoc] : [] }) }) }),
      doc: () => ({ get: async () => ({ data: configDoc ? [configDoc] : [] }), update: async () => ({ updated: 1 }) })
    }),
    command: { and: () => ({}), or: () => ({}), in: (x) => ({ $in: x }) }
  }

  const sandbox = {
    uniCloud: { httpclient: { request: httpImpl }, database: () => fakeDb },
    require: (id) => {
      // 云函数里 require 的是 shiyu-common，这里直接给真实实现
      if (String(id).indexOf('shiyu-common') >= 0) return common
      throw new Error('未 mock 的模块：' + id)
    },
    process: { env: env || {} },
    console,
    exports: {},
    module: { exports: {} }
  }
  sandbox.global = sandbox
  vm.createContext(sandbox)
  vm.runInContext(src, sandbox, { filename: FN })
  return async (event) => (sandbox.exports.main || sandbox.module.exports.main)(event)
}

// ① 缺少 code
{
  let called = false
  const call = runCloudFn({}, async () => {
    called = true
  })
  const res = await call({})
  c.ok('缺少 code 时明确说明要重新点击登录', res.code === -1 && res.message.includes('缺少 code'), res.message)
  c.ok('缺少 code 时不去请求微信接口', !called)
}

// ② 没配环境变量（这次最可能的原因）
{
  let called = false
  const call = runCloudFn({}, async () => {
    called = true
    return { data: {} }
  })
  const res = await call({ code: 'x' })
  console.log('    未配置时返回：' + res.message.split('\n')[0])
  c.ok('未配置 AppID/Secret 时直接给出配置指引', res.code === -1 && res.message.includes('尚未配置'))
  c.ok('提示里写清缺了哪个变量', res.message.includes('WECHAT_APPID') && res.message.includes('WECHAT_SECRET'))
  // 完整指引（去哪配、要重新部署）由 check 自检给出，避免与失败原因重复 —— 见下面 [1] 的自检断言
  c.ok('缺配置时不重复罗嗦，完整指引交给自检', !res.message.includes('重新部署'))
  c.ok('未配置时不去请求微信接口（不浪费一次外网调用）', !called)
  c.check('同时回传缺了哪些变量，便于前端展示', res.data.missing, ['WECHAT_APPID', 'WECHAT_SECRET'])
}

// ③ 只配了一半
{
  const call = runCloudFn({ WECHAT_APPID: 'wx123' }, async () => ({ data: {} }))
  const res = await call({ code: 'x' })
  c.check('只缺 Secret 时只报 Secret', res.data.missing, ['WECHAT_SECRET'])
}

// ④ 成功
{
  let seen = null
  const call = runCloudFn({ WECHAT_APPID: 'wx123', WECHAT_SECRET: 'sec' }, async (url, opt) => {
    seen = { url, opt }
    return { data: { openid: 'o-abc', session_key: 'sk' } }
  })
  const res = await call({ code: 'the-code' })
  c.ok('成功时返回 openid', res.code === 0 && res.data.openid === 'o-abc')
  c.ok('请求的是 jscode2session 接口', String(seen.url).includes('jscode2session'))
  c.ok('把 appid / secret / code 正确带上',
    seen.opt.data.appid === 'wx123' && seen.opt.data.secret === 'sec' && seen.opt.data.js_code === 'the-code')
  c.ok('声明了 JSON 返回类型', seen.opt.dataType === 'json')
  c.ok('设置了超时（默认 5 秒容易被云函数超时掩盖）', Number(seen.opt.timeout) >= 5000)
}

// ⑤ 微信返回错误码
const codes = [
  [40013, 'AppID'],
  [40029, 'code'],
  [40163, 'code'],
  [45011, '频繁']
]
for (const [errcode, expectWord] of codes) {
  const call = runCloudFn({ WECHAT_APPID: 'wx1', WECHAT_SECRET: 's' }, async () => ({
    data: { errcode, errmsg: 'some raw message' }
  }))
  const res = await call({ code: 'x' })
  const okMsg = res.code === -1 && res.message.includes(expectWord)
  c.ok(`errcode ${errcode} 翻译成可执行的说明（含「${expectWord}」）`, okMsg, res.message)
  c.ok(`errcode ${errcode} 不再把微信原始英文当唯一信息`, !/^微信登录失败：some raw message$/.test(res.message))
}

// ⑥ 未知错误码：保留原始信息，方便继续排查
{
  const call = runCloudFn({ WECHAT_APPID: 'wx1', WECHAT_SECRET: 's' }, async () => ({
    data: { errcode: 99999, errmsg: 'weird thing' }
  }))
  const res = await call({ code: 'x' })
  c.ok('未知错误码保留原文与 errcode', res.message.includes('weird thing') && res.message.includes('99999'), res.message)
}

// ⑦ 网络异常
{
  const call = runCloudFn({ WECHAT_APPID: 'wx1', WECHAT_SECRET: 's' }, async () => {
    throw new Error('request timeout')
  })
  const res = await call({ code: 'x' })
  c.ok('外网异常时提示检查网络/超时', res.message.includes('request timeout') && res.message.includes('外网'), res.message)
}

// ⑧ 配置自检（不需要真实 code）
{
  const call = runCloudFn({}, async () => ({ data: {} }))
  const res = await call({ action: 'check' })
  c.ok('自检模式下不需要 code 也能回答', res.code === 0 && res.data && res.data.configured === false)
  // 缺失项标签里带上了人话说明（「WECHAT_APPID（或后台的…）」），所以按包含判断
  c.ok('自检结果里列出缺哪些变量（含变量名）',
    res.data.missing.length === 2 &&
    res.data.missing.some((m) => m.includes('WECHAT_APPID')) &&
    res.data.missing.some((m) => m.includes('WECHAT_SECRET')),
    JSON.stringify(res.data.missing))
  c.ok('自检给出的指引能照着做（两种配法都说到）',
    res.data.hint.includes('管理后台') && res.data.hint.includes('环境变量'),
    res.data.hint)
  c.check('未配置时来源标为 none', res.data.source, 'none')
}
{
  const call = runCloudFn(
    { WECHAT_APPID: 'wx77b975b02cb7f1aa', WECHAT_SECRET: 'topsecretvalue' },
    async () => ({ data: {} })
  )
  const res = await call({ action: 'check' })
  c.ok('配好了则回报已就位', res.code === 0 && res.data.configured === true, JSON.stringify(res.data))
  c.ok('AppID 打码显示（能核对又不会泄露完整值）',
    res.data.appid_masked === 'wx77b9***f1aa', res.data.appid_masked)
  c.ok('自检结果里**绝不包含 Secret 明文**',
    !JSON.stringify(res).includes('topsecretvalue'))
  c.ok('已配置时也提示 code 失效的两种错误码',
    res.data.hint.includes('40013') && res.data.hint.includes('40029'))
  c.check('配置来自环境变量时如实标明', res.data.source, 'env')
}
{
  const call = runCloudFn({ WECHAT_APPID: 'wx123' }, async () => ({ data: {} }))
  const res = await call({ action: 'check' })
  c.ok('只缺一半也如实回报',
    res.data.missing.length === 1 && res.data.missing[0].includes('WECHAT_SECRET'),
    JSON.stringify(res.data.missing))
}

// ⑨ 改用数据库配置（管理后台填，不用进控制台）
{
  const dbCfg = { wechat_appid: 'wx77b975b02cb7f1aa', wechat_secret: 'db-secret' }
  let seen = null
  const call = runCloudFn({}, async (url, opt) => {
    seen = opt
    return { data: { openid: 'o-from-db' } }
  }, dbCfg)
  const res = await call({ code: 'c1' })
  c.ok('只配数据库（未配环境变量）也能登录', res.code === 0 && res.data.openid === 'o-from-db', JSON.stringify(res))
  c.ok('用的是数据库里的 AppID 与 Secret',
    seen.data.appid === 'wx77b975b02cb7f1aa' && seen.data.secret === 'db-secret')

  const st = await call({ action: 'check' })
  c.ok('自检回报「已就位」', st.data.configured === true)
  c.check('自检标明配置来源是数据库', st.data.source, 'database')
  c.ok('已就位时也说清来源是管理后台',
    st.data.hint.includes('管理后台'), st.data.hint)
  c.ok('自检结果绝不包含 Secret 明文', !JSON.stringify(st).includes('db-secret'))
}
{
  // 成对配置优先：数据库一对 > 环境变量一对（两者齐全时以数据库为准）
  let seen = null
  const call = runCloudFn(
    { WECHAT_APPID: 'wxenv0000000000000', WECHAT_SECRET: 'env-secret' },
    async (url, opt) => { seen = opt; return { data: { openid: 'o1' } } },
    { wechat_appid: 'wx77b975b02cb7f1aa', wechat_secret: 'db-secret' }
  )
  await call({ code: 'c1' })
  c.ok('两者都配时优先用数据库里那一对', seen.data.appid === 'wx77b975b02cb7f1aa', seen.data.appid)
}
{
  // 混搭（AppID 在数据库、Secret 在环境变量）：能用就用，但要如实标明来源
  let seen = null
  const call = runCloudFn({ WECHAT_SECRET: 'env-secret' }, async (url, opt) => {
    seen = opt
    return { data: { openid: 'o-mixed' } }
  }, { wechat_appid: 'wx77b975b02cb7f1aa' })
  const res = await call({ code: 'x' })
  c.ok('混搭配置也能登录（能用优先于严格）', res.code === 0 && res.data.openid === 'o-mixed', JSON.stringify(res))
  c.ok('混搭时两边的值都取到了',
    seen.data.appid === 'wx77b975b02cb7f1aa' && seen.data.secret === 'env-secret')
  const st = await call({ action: 'check' })
  c.check('自检把来源标为 mixed（提醒两处混用的风险）', st.data.source, 'mixed')
  c.ok('来源说明里提醒 AppID 与 Secret 要属于同一个小程序',
    st.data.hint.includes('同一个小程序'))
}/* ==================== [2] 前端按原因提示 ==================== */
console.log('\n[2] 前端错误提示')
const loginSrc = read('pages/login/login.vue')
const apiSrc = read('api/index.js')
// 先去掉注释：这次修改的说明里正好引用了那句旧文案，字符串匹配会误报
const loginCode = loginSrc
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

c.ok('登录页代码里不再有那句笼统的「当前环境不支持微信登录」',
  !loginCode.includes('当前环境不支持微信登录'))
c.ok('登录页用弹窗展示完整原因（toast 装不下）',
  /async function wxLogin\(\)[\s\S]*?uni\.showModal\(\{[\s\S]{0,200}?content: parts\.join/.test(loginSrc))
c.ok('失败时会自动做一次配置自检，把「哪一步没配好」写进提示',
  /async function diagnoseWechat\(\)[\s\S]{0,600}?checkWechatLogin\(\)/.test(loginSrc) &&
  /const diag = await diagnoseWechat\(\)/.test(loginSrc))
c.ok('自检也调不通时，把那本身当成结论（云函数没上传 / 云空间没关联）',
  /配置自检也调不通/.test(loginSrc) && /云函数还没上传部署/.test(loginSrc))
// 弹窗不能把同一段话印两遍（第一版就重复了「缺少环境变量 X」）
c.ok('配置没到位时，用自检结论替代那句干巴巴的失败原因（不重复）',
  /if \(diag\.configured === false\) \{[\s\S]{0,320}?parts\.push\(diag\.hint\)/.test(loginSrc))
c.ok('其余情况才「原因 + 自检结论」两条一起给',
  /parts\.push\(reason\)\s*if \(diag\.hint\) parts\.push\(diag\.hint\)/.test(loginSrc))
c.ok('弹窗内容由 parts 拼装（而不是把两段硬拼在一起）', /parts\.join\('\\n\\n'\)/.test(loginSrc))
c.ok('提示里保留「可以先手动填写昵称」的出路', loginSrc.includes('手动填写昵称进入'))
// 云函数的失败文案里不应再嵌一遍完整指引（否则前端自检结论会与它重复）
{
  const call = runCloudFn({}, async () => ({ data: {} }))
  const res = await call({ code: 'x' })
  c.ok('缺配置时云函数只说「缺什么」，完整指引交给前端自检',
    res.message.includes('尚未配置') && !res.message.includes('配置自检'))
}
c.ok('非微信端给出不同的原因',
  apiSrc.includes('当前不是微信小程序环境'))
c.ok('用户取消授权与授权失败区分开',
  apiSrc.includes('你取消了微信授权') && apiSrc.includes('微信授权失败'))
c.ok('微信没返回 code 也有提示', apiSrc.includes('微信没有返回授权码'))
c.ok('云函数的失败信息原样抛出（不再被吞掉）',
  /const data = await callCloud\(CLOUD_FN\.wechat, \{ code \}\)/.test(apiSrc))

/* ==================== [3] 条件编译 ==================== */
console.log('\n[3] 平台条件编译')
c.ok('api 里用 #ifdef MP-WEIXIN 包住取 code 的逻辑',
  /#ifdef MP-WEIXIN[\s\S]*?uni\.login\([\s\S]*?#endif/.test(apiSrc))
c.ok('api 里用 #ifndef MP-WEIXIN 给非小程序端明确报错',
  /#ifndef MP-WEIXIN[\s\S]*?throw new Error\('当前不是微信小程序环境[\s\S]*?#endif/.test(apiSrc))
c.ok('登录页按钮只在微信小程序端渲染',
  /<!-- #ifdef MP-WEIXIN -->[\s\S]*?class="wechat-btn"[\s\S]*?<!-- #endif -->/.test(loginSrc))

/* ==================== [4] 微信昵称 / 头像（平台限制下的合规做法） ==================== */
console.log('\n[4] 微信昵称头像：只能用官方「头像昵称填写能力」')
c.ok('头像用 open-type="chooseAvatar"（微信官方途径）',
  loginSrc.includes('open-type="chooseAvatar"') && loginSrc.includes('@chooseavatar="onChooseAvatar"'))
c.ok('chooseAvatar 只在微信小程序端渲染（其它端没有这个能力）',
  /<!-- #ifdef MP-WEIXIN -->[\s\S]{0,400}?open-type="chooseAvatar"[\s\S]{0,800}?<!-- #endif -->/.test(loginSrc))
c.ok('昵称输入框在微信端用 type="nickname"（键盘上方出现「使用微信昵称」）',
  /nicknameInputType\.value = 'nickname'/.test(loginSrc) && loginSrc.includes(':type="nicknameInputType"'))
c.ok('非微信端退回 type="text"（避免未知类型告警）',
  /const nicknameInputType = ref\('text'\)/.test(loginSrc))
c.ok('选中的微信头像会**上传到云存储**（临时路径重启后失效）',
  /function uploadAvatar\(tempPath\)[\s\S]{0,800}?uniCloud\.uploadFile/.test(loginSrc))
c.ok('上传用 cloudPath 唯一路径，避免互相覆盖',
  /cloudPath = 'avatars\/' \+ Date\.now\(\)/.test(loginSrc))
c.ok('上传失败时退回 emoji（不留下加载不出来的临时路径）',
  /catch \(err\) \{[\s\S]{0,500}?avatar\.value = randomAvatar\(\)/.test(loginSrc))
c.ok('上传失败提示里说明真机需要 uploadFile 合法域名',
  loginSrc.includes('uploadFile 合法域名'))
c.ok('注释里写明了微信为什么不再自动给昵称头像（2022-10-25 起匿名化）',
  loginSrc.includes('2022-10-25'))
// 关键回归：本机已有用户自己设置的昵称，不能被「微信一键登录」重置成占位值
c.ok('已设置过昵称时，微信登录不会把它覆盖回「微信同学」',
  /hasOwnName[\s\S]{0,260}?fromWx \|\| \(hasOwnName \? existingName : '微信同学'\)/.test(loginSrc))
c.ok('昵称仍是占位值时，引导用户去用微信头像/昵称',
  /if \(name === '微信同学'\)[\s\S]{0,700}?使用微信昵称/.test(loginSrc))
c.ok('头像预览能区分图片地址与 emoji（emoji 不能塞进 <image>）',
  /const avatarIsImage = computed[\s\S]{0,220}?wxfile:/.test(loginSrc))

/* ==================== [5] 原有逻辑没丢 ==================== */
const page = loadPage(ROOT, 'pages/login/login.vue')
checkCompile(ROOT, page, c)
// 有意删除的标识符必须逐条说明原因（这几项是前几轮按需求改掉的，一并记录在这里）
checkLogic(page, {
  adminUsername: '管理员登录改成只输管理口令，登录页不再有自选用户名（口令由云端校验）'
}, c)

console.log('\n[5] 登录页关键行为')
const keep = [
  ['同学身份：手动填写 → 本机保存', page.script.includes('async function submit()')],
  ['管理员：口令云端校验', page.script.includes('async function adminLogin()')],
  ['管理员不因微信登录被降级', page.script.includes('studentRole()')],
  ['编辑模式（从「我的」进来）保存后返回', page.script.includes('isEditMode')],
  ['微信登录成功后跳首页', /微信登录成功[\s\S]{0,80}goHome/.test(page.script)],
  ['管理员入口仍在（入口文案不再是自选角色）', page.tplSrc.includes('adminLogin') && page.tplSrc.includes('管理口令')]
]
keep.forEach(([name, ok]) => c.ok(name, ok))

process.exit(c.summary() === 0 ? 0 : 1)
