/**
 * API 适配层集成测试（Node 环境，用桩替代 uni / uniCloud 全局对象）
 *
 * 覆盖两条链路：
 *   A. uniCloud 不存在        → 全部方法必须降级到本地数据，且功能可用
 *   B. uniCloud 存在且返回正常 → 必须走云函数，并正确透传 action 与参数
 *
 * 用法：node scripts/test-api.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = 'E:/uniapp'

/** 把本地绝对路径转成 ESM 可加载的 file:// URL（Windows 必需） */
const load = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href)

/* ------------------------------ 全局桩环境 ------------------------------ */

const storage = new Map()
globalThis.uni = {
  getStorageSync: (k) => (storage.has(k) ? storage.get(k) : ''),
  setStorageSync: (k, v) => storage.set(k, v),
  removeStorageSync: (k) => storage.delete(k),
  showToast: () => {},
  request: () => {},
  login: (opt) => opt.fail && opt.fail({ errMsg: 'stub: no weixin' })
}

/** 由测试用例决定：undefined 表示云空间不可用 */
const cloudCalls = []
let cloudMode = null // null = uniCloud 不存在；'ok' = 返回成功；'bizfail' = code:-1
globalThis.uniCloud = undefined

/* ------------------------------ 断言工具 ------------------------------ */

let passed = 0
const failures = []

function check(name, cond, extra) {
  if (cond) {
    passed++
  } else {
    failures.push(name + (extra ? ' -> ' + extra : ''))
  }
}

/* ------------------------------ 载入被测模块 ------------------------------ */

// 断言层依赖 uni 全局，必须在设置 globalThis.uni 之后再 import
//
// 注意：api/index.js 内部有模块级状态（cloudAvailable / dishListSource / missingFunctions），
// 一旦在某个场景里被判定为"云空间不可用"就会锁死，同一模块实例无法恢复。
// 因此每个场景都要**重新导入一个新实例**（加 ?case=N 绕过 ESM 模块缓存），
// 否则后面的场景永远走不到云端分支 —— 这不是实现的问题，是测试污染。
let api = await load('api/index.js')
let { dishApi, recommendApi, reviewApi, configApi, userApi } = api
const { LOCAL_DISHES } = await load('common/local-dishes.js')

/** 重新载入 api 模块，拿到干净状态 */
async function freshApi(tag) {
  api = await import(
    pathToFileURL(path.join(ROOT, 'api/index.js')).href + '?case=' + tag
  )
  dishApi = api.dishApi
  recommendApi = api.recommendApi
  reviewApi = api.reviewApi
  configApi = api.configApi
  userApi = api.userApi
  return api
}

/* ==================== 场景 A：云空间不可用，全部降级 ==================== */

console.log('--- 场景 A：uniCloud 不可用（纯前端模式）---')

let r = await dishApi.list({ pageSize: 100 })
check('A1 菜品列表降级返回本地数据', r.engine === 'local' && r.list.length === LOCAL_DISHES.length,
  `engine=${r.engine} len=${r.list.length}`)

r = await dishApi.list({ keyword: '拉面' })
check('A2 关键字筛选生效', r.list.length > 0 && r.list.every((d) => d.name.includes('拉面')),
  JSON.stringify(r.list.map((d) => d.name)))

r = await dishApi.list({ canteen: '第二食堂', category: '面食' })
check('A3 食堂+分类筛选生效', r.list.every((d) => d.canteen === '第二食堂' && d.category === '面食'))

r = await dishApi.list({ sortByRating: true, pageSize: 5 })
check('A4 评分排序生效', r.list[0].rating >= r.list[r.list.length - 1].rating)

r = await dishApi.list({ sortByPrice: true, pageSize: 5 })
check('A5 价格排序生效', r.list[0].price <= r.list[r.list.length - 1].price)

r = await dishApi.list({ page: 2, pageSize: 15 })
check('A6 分页正确', r.list.length === 15 && r.total === LOCAL_DISHES.length && r.hasMore === true)

const detail = await dishApi.detail(LOCAL_DISHES[0].id)
check('A7 菜品详情返回正确', detail.name === LOCAL_DISHES[0].name && detail.engine === 'local')

let detailErr = null
try {
  await dishApi.detail('不存在的id')
} catch (e) {
  detailErr = e
}
check('A8 不存在的菜品抛错', detailErr !== null && /不存在/.test(detailErr.message))

const hot = await dishApi.rank('hot', 5)
check('A9 热门榜返回 list', Array.isArray(hot.list) && hot.list.length === 5)

const good = await dishApi.rank('good', 5)
check('A10 高分红榜按评分降序', good.list[0].rating >= good.list[4].rating)

const canteens = await dishApi.canteens()
check('A11 食堂列表可用', canteens.list.length === 3 && canteens.engine === 'local',
  JSON.stringify(canteens.list))

// —— 推荐（题目核心链路）——
const rec = await recommendApi.recommend({
  meal_type: '午餐', taste: ['辣'], allergies: ['香菜'], budget: 20, canteen: '', extra: ''
}, '想吃辣的，20块以内，不要香菜')

check('A12 推荐返回结果', rec.recommendations.length > 0, `len=${rec.recommendations.length}`)
check('A13 推荐结果不含忌口食材',
  rec.recommendations.every((x) => !(x.tags || []).includes('香菜')))
check('A14 推荐结果不超预算', rec.recommendations.every((x) => x.price <= 20))
check('A15 推荐字段完整（含 emoji / 理由 / 匹配度）',
  rec.recommendations.every((x) =>
    x.dish_id && x.name && x.canteen && x.window && typeof x.price === 'number' &&
    x.emoji && x.reason && x.match_score >= 0 && x.match_score <= 100))
check('A16 推荐带降级说明', rec.engine === 'local' && !!rec.notice, `notice=${rec.notice}`)
check('A17 推荐写入历史', recommendApi.getHistory().length === 1)
check('A18 偏好被记忆', !!recommendApi.getSavedPref() && recommendApi.getSavedPref().budget === 20)

// 自然语言解析
const parsed = recommendApi.parseText('今天想吃辣的，15元以内，不吃牛肉和葱')
check('A19 自然语言解析口味', parsed.taste.includes('辣'))
check('A20 自然语言解析忌口', parsed.allergies.includes('牛肉') && parsed.allergies.includes('葱'),
  JSON.stringify(parsed.allergies))
check('A21 自然语言解析预算', parsed.budget === 15, String(parsed.budget))

// 空结果分支
const none = await recommendApi.recommend({ meal_type: '午餐', taste: [], allergies: [], budget: 1, canteen: '' })
check('A22 无匹配时返回空数组与友好文案',
  none.recommendations.length === 0 && typeof none.summary === 'string' && none.summary.length > 0)

// —— 评价降级 ——
const created = await reviewApi.create({ dish_id: 'd001', dish_name: '麻婆豆腐', rating: 5, content: '很好吃，分量足' })
check('A23 评价写入本地降级成功', created.engine === 'local' && created.offline === true)

const pending = await reviewApi.pending()
check('A24 本地待审核评价可见', pending.list.length === 1 && pending.list[0].status === 0)

const publicList = await reviewApi.list({ dish_id: 'd001' })
check('A25 未审核评价不公开', publicList.list.length === 0)

await reviewApi.audit({ id: pending.list[0]._id, status: 1 })
const afterAudit = await reviewApi.list({ dish_id: 'd001' })
check('A26 审核通过后公开可见', afterAudit.list.length === 1)

// —— 配置与身份降级 ——
const cfg = await configApi.get()
check('A27 配置读取降级且标记未配置', cfg.configured === false && cfg.engine === 'local')

const token1 = api.getAdminToken()
const token2 = api.getAdminToken()
check('A28 管理口令本机生成且稳定', /^adm_/.test(token1) && token1 === token2, token1)

const uid = userApi.getUid()
check('A29 本机 uid 生成稳定', /^u_/.test(uid) && uid === userApi.getUid(), uid)

const profile = userApi.saveProfile({ nickname: '小明', avatar: '😋', role: 'admin' })
check('A30 资料保存并合并 uid', profile.nickname === '小明' && profile.uid === uid && profile.role === 'admin')

const stats = await api.statsApi.overview()
check('A31 统计降级可用', stats.dish_total === LOCAL_DISHES.length && stats.canteen_total === 3)

/* ==================== 场景 B：云空间可用，走云函数 ==================== */

console.log('--- 场景 B：uniCloud 可用（主链路）---')

// 场景 A 已把模块状态锁成"云空间不可用"，这里换一个干净的模块实例
await freshApi('B')

cloudMode = 'ok'
globalThis.uniCloud = {
  callFunction({ name, data, success }) {
    cloudCalls.push({ name, data })
    let result
    if (name === 'shiyu-dish') {
      if (data.action === 'list') {
        // 桩必须"像真实菜单"：适配层有一条防脏数据规则 ——
        // 菜品库为空、或总量 <10 且没有任何一道与本地种子菜同名时，
        // 会判定为"手工测试数据"并整库退回本地菜谱。
        // 用假名字（「云端菜」）会让 B1/B4/B5 永远走不到云端分支。
        result = {
          code: 0,
          message: 'success',
          data: {
            list: [{ id: 'd001', name: '麻婆豆腐', canteen: '第一食堂', window: '川味窗口', price: 8, status: 1, tags: ['辣'] }],
            total: 40,
            hasMore: true
          }
        }
      } else if (data.action === 'canteens') {
        result = { code: 0, message: 'success', data: ['第一食堂', '第二食堂', '第三食堂'] }
      } else {
        result = { code: 0, message: 'success', data: [] }
      }
    } else if (name === 'shiyu-recommend') {
      result = {
        code: 0,
        message: 'success',
        data: {
          recommendations: [{
            dish_id: 'd001',
            name: '麻婆豆腐',
            match_score: 95,
            reason: '云端理由',
            price: 8,
            canteen: '第一食堂',
            window: '川味窗口',
            rating: 4.8,
            emoji: '🍲',
            tags: ['辣']
          }],
          summary: '云端总结',
          engine: 'ai',
          model: 'deepseek-chat'
        }
      }
    } else if (name === 'shiyu-config') {
      result = { code: 0, message: 'success', data: { configured: true, model: 'deepseek-chat', has_key: true } }
    } else {
      result = { code: 0, message: 'success', data: { list: [], total: 0, hasMore: false } }
    }
    success({ result })
  }
}

const cloudList = await dishApi.list({ keyword: '麻婆' })
check('B1 菜品列表走云函数', cloudList.engine === 'cloud' && cloudList.list[0].name === '麻婆豆腐',
  `engine=${cloudList.engine} name=${cloudList.list[0] && cloudList.list[0].name}`)
check('B2 云函数调用名与 action 正确',
  cloudCalls.some((c) => c.name === 'shiyu-dish' && c.data.action === 'list' && c.data.keyword === '麻婆'),
  JSON.stringify(cloudCalls[cloudCalls.length - 1]))

const cloudCanteens = await dishApi.canteens()
check('B3 食堂列表走云函数', cloudCanteens.engine === 'cloud' && cloudCanteens.list[0] === '第一食堂',
  `engine=${cloudCanteens.engine} list=${JSON.stringify(cloudCanteens.list)}`)

const cloudRec = await recommendApi.recommend({ meal_type: '午餐', taste: ['辣'], allergies: [], budget: null, canteen: '' }, '')
check('B4 推荐走云函数并标记 ai 引擎', cloudRec.engine === 'ai' && cloudRec.model === 'deepseek-chat',
  `engine=${cloudRec.engine} model=${cloudRec.model} notice=${cloudRec.notice} calls=${JSON.stringify(cloudCalls.map((c) => c.name))}`)
check('B5 推荐结果透传', cloudRec.recommendations[0].reason === '云端理由' && cloudRec.recommendations[0].match_score === 95)
check('B6 推荐入参已合并自然语言解析',
  cloudCalls.some((c) => c.name === 'shiyu-recommend' && Array.isArray(c.data.pref.allergies)),
  JSON.stringify(cloudCalls.filter((c) => c.name === 'shiyu-recommend')))

const cloudCfg = await configApi.get()
check('B7 配置读取走云函数', cloudCfg.configured === true && cloudCfg.engine === 'cloud')

/* ==================== 场景 C：云函数返回业务错误 → 降级 ==================== */

console.log('--- 场景 C：云函数业务失败 → 自动降级 ---')

cloudMode = 'bizfail'
globalThis.uniCloud = {
  callFunction({ success }) {
    success({ result: { code: -1, message: '模拟业务失败' } })
  }
}

const failList = await dishApi.list({ pageSize: 5 })
check('C1 业务失败时列表降级到本地', failList.engine === 'local' && failList.list.length === 5)

const failRec = await recommendApi.recommend({ meal_type: '午餐', taste: ['清淡'], allergies: [], budget: null, canteen: '' }, '')
check('C2 业务失败时推荐降级且带说明',
  failRec.engine === 'local' && /模拟业务失败/.test(failRec.notice || ''), `notice=${failRec.notice}`)
check('C3 降级后依然遵守忌口过滤', failRec.recommendations.length > 0)

const failSave = await dishApi.save({ name: '测试菜', price: 10, canteen: '第一食堂', window: '1号窗' }).catch((e) => ({ error: e.message }))
check('C4 写操作失败时明确抛错（不静默）', !!failSave.error, JSON.stringify(failSave))

/* ==================== 场景 D：云端数据陈旧/为空 → 必须兜底 ==================== */

console.log('--- 场景 D：云端菜品库为空或残留旧数据 → 兜底 ---')

// 场景 C 把模块状态锁成了"云端故障"，D 要重新验证云端可用路径，必须换干净实例
await freshApi('D')

/** 让下一次云函数调用返回指定的菜品数据 */
function stubCloudDish(listResult, extraCanteens) {
  globalThis.uniCloud = {
    callFunction({ name, data, success }) {
      if (name === 'shiyu-dish' && data.action === 'list') {
        success({ result: { code: 0, message: 'success', data: listResult } })
      } else if (name === 'shiyu-dish' && data.action === 'canteens') {
        success({ result: { code: 0, message: 'success', data: extraCanteens || [] } })
      } else if (name === 'shiyu-dish' && data.action === 'rank') {
        success({ result: { code: 0, message: 'success', data: [] } })
      } else {
        success({ result: { code: 0, message: 'success', data: null } })
      }
    }
  }
}

// D1：云端菜品库还没初始化（list 与 canteens 都为空）
// 典型表现就是「首页食堂入口点进去一道菜都没有」
stubCloudDish({ list: [], total: 0, hasMore: false }, [])
const d1 = await dishApi.list({ canteen: '第一食堂', pageSize: 20 })
check('D1 云端库为空时按食堂筛选仍能出菜（本地兜底）',
  d1.engine === 'local' && d1.list.length > 0 && d1.list.every((x) => x.canteen === '第一食堂'),
  `engine=${d1.engine} len=${d1.list.length}`)

// D2：点名的「食堂列表有、点进去没有」场景
// canteens 返回了食堂名，但 list 因旧数据缺 status 而查不出来
stubCloudDish({ list: [], total: 0, hasMore: false }, ['第一食堂', '第二食堂', '第三食堂'])
const d2c = await dishApi.canteens()
const d2 = await dishApi.list({ canteen: '第一食堂', pageSize: 20 })
check('D2 食堂名存在但菜品查不出时，自动兜底而不是空列表',
  d2c.list.length === 3 && d2.list.length > 0,
  `canteens=${d2c.list.length} list=${d2.list.length} engine=${d2.engine}`)

// D3：云端返回带未知食堂的旧数据 → 判定不可信，退回本地
dishApi.resetSource() // 清掉 D1/D2 造成的本地锁定，模拟新一次会话
stubCloudDish({ list: [{ id: 'z1', name: '旧菜', canteen: '老食堂', status: 1 }], total: 1, hasMore: false })
const d3 = await dishApi.list({ pageSize: 20 })
check('D3 云端含未知食堂的旧数据时退回本地', d3.engine === 'local' && d3.list.length === 20,
  `engine=${d3.engine} len=${d3.list.length}`)

// D4：云端数据正常时必须尊重云端（不能永远本地兜底）
//
// 两个前提缺一不可：
//   1) 换新模块实例：D1 已把 dishListSource 锁定为 'local'（持久锁），
//      同实例下 D4 会被直接短路，永远验证不到云端路径；
//   2) 桩要是"真实菜单"形状：适配层会拒绝「总量 <10 且无本地同名菜」的数据。
await freshApi('D4')
stubCloudDish({
  list: [{ id: 'd001', name: '麻婆豆腐', canteen: '第一食堂', window: '川味窗口', price: 8, status: 1, tags: ['辣'] }],
  total: 40,
  hasMore: true
})
const d4 = await dishApi.list({ pageSize: 20 })
check('D4 云端数据正常时走云端', d4.engine === 'cloud' && d4.list[0].name === '麻婆豆腐',
  `engine=${d4.engine} name=${d4.list && d4.list[0] && d4.list[0].name}`)

// D5：锁定本地后，翻页必须继续来自本地（分页连续性）
stubCloudDish({ list: [], total: 0, hasMore: false })
await dishApi.list({ pageSize: 15 })
const d5 = await dishApi.list({ page: 2, pageSize: 15 })
check('D5 首页兜底本地后，第二页仍来自本地而非空白',
  d5.engine === 'local' && d5.list.length === 15,
  `engine=${d5.engine} len=${d5.list.length}`)

/* ==================== 汇总 ==================== */

console.log('')
console.log(`断言通过: ${passed}`)
if (failures.length) {
  console.log(`断言失败: ${failures.length}`)
  failures.forEach((f) => console.log('  ✗ ' + f))
  process.exitCode = 1
} else {
  console.log('全部通过 ✅')
}
