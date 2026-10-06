/**
 * 模拟「微信一键登录失败」时用户会看到的弹窗内容
 *
 * 用真实云函数 + 与登录页完全相同的拼装方式跑一遍，
 * 把每种情况的提示打出来 —— 这样用户不用截图，也能直接对号入座。
 *
 * 用法：node _ui/demo-wechat-messages.mjs
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import vm from 'node:vm'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FN = 'uniCloud-aliyun/cloudfunctions/wechat-login/index.js'
const nodeRequire = createRequire(import.meta.url)

function runCloudFn(env, httpImpl, dbCfg) {
  const src = readFileSync(join(ROOT, FN), 'utf8')

  // 公共模块用真实源码（它开头 require('crypto')，沙箱里要给出真实 require）
  const commonSrc = readFileSync(
    join(ROOT, 'uniCloud-aliyun/cloudfunctions/common/shiyu-common/index.js'),
    'utf8'
  )
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
      limit: () => ({ get: async () => ({ data: configDoc ? [configDoc] : [] }) })
    }),
    command: {}
  }

  const sandbox = {
    uniCloud: {
      httpclient: { request: httpImpl || (async () => ({ data: {} })) },
      database: () => fakeDb
    },
    require: (id) => {
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
  const main = sandbox.exports.main || sandbox.module.exports.main
  return (event) => main(event)
}

/** 与登录页 wxLogin 的 catch 完全相同的拼装逻辑 */
function composeModal(reason, diag) {
  const parts = []
  if (diag.configured === false) {
    // 配置没到位：自检结论已经把话说全，不再重复那句「缺少环境变量 X」
    if (diag.hint) parts.push(diag.hint)
    else parts.push(reason)
  } else {
    parts.push(reason)
    if (diag.hint) parts.push(diag.hint)
  }
  parts.push('可以先在下面手动填写昵称进入，功能完全一样。')
  return parts.join('\n\n')
}

async function show(title, call, { checkOk = true } = {}) {
  let reason = ''
  let diag = { configured: null, hint: '' }
  try {
    const res = await call({ code: 'mock-code' })
    if (res.code === 0) {
      console.log('\n===== ' + title + ' =====\n（成功，不会有弹窗）')
      return
    }
    reason = res.message
  } catch (e) {
    reason = '微信授权失败：' + e.message
  }
  if (checkOk) {
    const st = await call({ action: 'check' })
    diag = { configured: !!(st && st.data && st.data.configured), hint: (st && st.data && st.data.hint) || '' }
  } else {
    diag = {
      configured: null,
      hint: '（配置自检也调不通：说明 wechat-login 云函数还没上传部署，或云服务空间未关联）'
    }
  }
  console.log('\n===== ' + title + ' =====')
  console.log('[弹窗标题] 微信一键登录没成功\n[内容]')
  console.log(composeModal(reason, diag).split('\n').map((l) => '  ' + l).join('\n'))
}

/* ① 没配环境变量（最可能） */
await show('① 没配 WECHAT_APPID / WECHAT_SECRET', runCloudFn({}))

/* ② 只配了一半 */
await show('② 只配了 AppID，忘了 Secret', runCloudFn({ WECHAT_APPID: 'wx77b975b02cb7f1aa' }))

/* ③ 配好了，但 AppID 与小程序不一致 */
await show(
  '③ 配好了但 AppID 不一致（微信返回 40013）',
  runCloudFn({ WECHAT_APPID: 'wx0000000000000000', WECHAT_SECRET: 's' }, async () => ({
    data: { errcode: 40013, errmsg: 'invalid appid' }
  }))
)

/* ④ 配好了，code 过期 */
await show(
  '④ 配好了但 code 已失效（微信返回 40163）',
  runCloudFn({ WECHAT_APPID: 'wx77b975b02cb7f1aa', WECHAT_SECRET: 's' }, async () => ({
    data: { errcode: 40163, errmsg: 'code been used' }
  }))
)

/* ⑤ 云函数压根没上传（连自检都调不通） */
await show('⑤ wechat-login 云函数没上传 / 云空间未关联', async () => {
  throw new Error('云函数 wechat-login 不存在，请先在 HBuilderX 中右键该函数 → 上传部署')
}, { checkOk: false })

console.log('\n（以上文案由真实云函数生成，与登录页弹窗一致）')
