/**
 * 菜品搜索验证（真跑，不重述逻辑）
 *
 * [A] 用内存假数据库执行**真实的云函数** uniCloud-aliyun/cloudfunctions/shiyu-dish/index.js
 *     的 handleList —— 验的是线上真正跑的那段代码。
 * [B] import 真实的 api/index.js，走它的本地兜底链路 localDishList。
 * [C] 核心断言：同一个关键词，两条链路必须返回**完全相同**的一批菜。
 *     这正是用户报的「有时候搜不到，有时候搜索到错误菜品」。
 * [D] 竞态守卫：翻页/搜索交错时，过期响应必须被丢弃。
 */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { register } from 'node:module'
import { execFileSync } from 'node:child_process'
import vm from 'node:vm'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')

let pass = 0, fail = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) { pass++; console.log('  PASS  ' + name) }
  else {
    fail++
    console.log('  FAIL  ' + name)
    console.log('        got:  ' + JSON.stringify(got))
    console.log('        want: ' + JSON.stringify(want))
  }
}

/* ============================ 内存假数据库 ============================ */

const isOp = (c) => c && typeof c === 'object' && c.__op

/** 单个字段是否命中（值与正则语义与 MongoDB 对齐：数组字段「任一元素命中即命中」） */
function fieldHit(value, cond) {
  if (cond instanceof RegExp) {
    if (Array.isArray(value)) return value.some((v) => typeof v === 'string' && cond.test(v))
    return typeof value === 'string' && cond.test(value)
  }
  if (Array.isArray(value)) return value.includes(cond)
  return value === cond
}

function matchDoc(doc, cond) {
  if (!cond) return true
  if (isOp(cond)) {
    if (cond.__op === 'and') return cond.list.every((c) => matchDoc(doc, c))
    if (cond.__op === 'or') return cond.list.some((c) => matchDoc(doc, c))
    throw new Error('未知操作符 ' + cond.__op)
  }
  return Object.keys(cond).every((k) => fieldHit(doc[k], cond[k]))
}

function makeDb(rows) {
  const store = { dishes: rows.map((r) => ({ ...r })) }

  function query(name, cond) {
    const api = {
      _order: [],
      _field: null,
      _skip: 0,
      _limit: Infinity,
      orderBy(f, d) { api._order.push([f, d]); return api },
      field(f) { api._field = f; return api },
      skip(n) { api._skip = n; return api },
      limit(n) { api._limit = n; return api },
      _rows() {
        let out = store[name].filter((d) => matchDoc(d, cond))
        for (const [f, dir] of [...api._order].reverse()) {
          out = [...out].sort((a, b) => {
            const x = a[f], y = b[f]
            if (x === y) return 0
            return (x > y ? 1 : -1) * (dir === 'desc' ? -1 : 1)
          })
        }
        return out
      },
      async get() {
        let out = api._rows().slice(api._skip, api._skip + (api._limit === Infinity ? undefined : api._limit))
        if (api._field) {
          const keys = Object.keys(api._field).filter((k) => api._field[k])
          out = out.map((d) => {
            const o = {}
            for (const k of keys) if (k in d) o[k] = d[k]
            // 真实 uniCloud 的 _id 始终返回
            if (!('_id' in o) && '_id' in d) o._id = d._id
            return o
          })
        }
        return { data: out.map((d) => ({ ...d })) }
      },
      async count() { return { total: api._rows().length } },
      doc(id) {
        return {
          async get() { return { data: store[name].filter((d) => d._id === id).map((d) => ({ ...d })) } },
          async update(patch) { store[name].forEach((d) => { if (d._id === id) Object.assign(d, patch) }); return { updated: 1 } },
          async remove() { store[name] = store[name].filter((d) => d._id !== id); return { deleted: 1 } }
        }
      }
    }
    return api
  }

  const database = () => ({
    collection: (name) => ({
      where: (cond) => query(name, cond),
      doc: (id) => query(name, { _id: id }).doc(id),
      add: async (d) => { store[name].push({ ...d, _id: 'new_' + store[name].length }); return { id: 'new' } }
    }),
    command: {
      and: (...a) => ({ __op: 'and', list: a.length === 1 && Array.isArray(a[0]) ? a[0] : a }),
      or: (...a) => ({ __op: 'or', list: a.length === 1 && Array.isArray(a[0]) ? a[0] : a })
    },
    RegExp: ({ regexp, options }) => new RegExp(regexp, options)
  })
  return { database, store }
}

/** 在沙箱里执行真实的云函数源码，取出 exports.main */
function loadCloudFn(relPath, rows) {
  const src = read(relPath)
  const fake = makeDb(rows)
  const sandbox = {
    uniCloud: { database: fake.database },
    // 云函数只用到 shiyu-common 的口令校验，本测试不涉及
    require: () => ({ verifyAdminToken: async () => ({ ok: false, message: '跳过' }) }),
    console: { log() {}, error() {}, warn() {} },
    exports: {},
    module: { exports: {} },
    Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Set, Map, isNaN, parseInt, parseFloat, Promise, Error
  }
  sandbox.global = sandbox
  vm.createContext(sandbox)
  vm.runInContext(src, sandbox, { filename: relPath })
  return { main: sandbox.exports.main || sandbox.module.exports.main, store: fake.store }
}

/* ============================ 数据准备 ============================ */

register(pathToFileURL(join(HERE, 'hooks.mjs')).href)
const { LOCAL_DISHES } = await import('../common/local-dishes.js')

const cloudRows = LOCAL_DISHES.map((d) => ({ ...d, _id: d.id }))
const dlSrc = read('pages/dish-list/dish-list.vue')
const cloud = loadCloudFn('uniCloud-aliyun/cloudfunctions/shiyu-dish/index.js', cloudRows)
check('云函数导出了 main', typeof cloud.main, 'function')

/** 云端搜索：真跑云函数 handleList */
async function cloudSearch(kw) {
  const res = await cloud.main({ action: 'list', keyword: kw, page: 1, pageSize: 100 })
  if (res.code !== 0) throw new Error('云函数返回失败：' + res.message)
  return res.data.list.map((d) => d.name).sort()
}

/** 本地兜底搜索：真跑 api/index.js 的 dishApi.list（让云调用失败即降级） */
globalThis.uniCloud = {
  callFunction: ({ fail }) => { fail({ errMsg: 'mock: 断网' }) }
}
globalThis.uni = { getStorageSync: () => '', setStorageSync: () => {}, removeStorageSync: () => {} }
const { dishApi } = await import('../api/index.js')

async function localSearch(kw) {
  const res = await dishApi.list({ keyword: kw, page: 1, pageSize: 100 })
  return res.list.map((d) => d.name).sort()
}

/* ============================ [A] 云端 ============================ */

console.log('\n[A] 云端（真跑 shiyu-dish 的 handleList）')
const probes = ['麻婆豆腐', '宫保', '辣', '清淡', '牛肉', '花生', '面', '川菜', '第一食堂', '第二食堂', '不存在的东西']
for (const kw of probes) {
  const hit = await cloudSearch(kw)
  console.log(`    「${kw}」→ ${hit.length} 条 ${hit.length ? '（' + hit.slice(0, 3).join('、') + (hit.length > 3 ? '…' : '') + '）' : ''}`)
}
check('云端能按菜名搜到', (await cloudSearch('麻婆豆腐')), ['麻婆豆腐'])
check('云端能按标签搜「辣」', (await cloudSearch('辣')).length > 0, true)
check('云端能按标签搜「清淡」', (await cloudSearch('清淡')).length > 0, true)
check('云端能按标签搜食材「花生」', (await cloudSearch('花生')).length > 0, true)
check('云端能按分类搜「川菜」', (await cloudSearch('川菜')).length > 0, true)
check('云端能按食堂搜「第一食堂」', (await cloudSearch('第一食堂')).length > 0, true)
check('搜不存在的词返回空', (await cloudSearch('不存在的东西')).length, 0)

/* ============================ [B] 本地兜底 ============================ */

console.log('\n[B] 本地兜底（真跑 api/index.js 的 dishApi.list → localDishList）')
const localSample = await localSearch('辣')
console.log(`    本地「辣」→ ${localSample.length} 条`)
check('本地降级链路真的生效（engine=local）',
  (await dishApi.list({ keyword: '辣', page: 1, pageSize: 5 })).engine, 'local')
check('本地能按标签搜「辣」', localSample.length > 0, true)

/* ============================ [C] 两条链路必须一致 ============================ */

console.log('\n[C] 同一关键词，云端结果 === 本地结果（本次 bug 的核心）')
const shared = ['麻婆豆腐', '宫保', '辣', '麻辣', '清淡', '牛肉', '花生', '面', '川菜', '第一食堂', '第二食堂',
  '第三食堂', '汤面', '下饭', '豆腐', '鸡', '鱼', '辣 牛肉', '素', '粥']
let mismatch = 0
for (const kw of shared) {
  const c = await cloudSearch(kw)
  const l = await localSearch(kw)
  if (JSON.stringify(c) !== JSON.stringify(l)) {
    mismatch++
    console.log(`  FAIL  「${kw}」不一致`)
    console.log(`        云端(${c.length})：` + JSON.stringify(c))
    console.log(`        本地(${l.length})：` + JSON.stringify(l))
  } else {
    pass++
  }
}
check(`全部 ${shared.length} 个关键词两条链路结果一致`, mismatch, 0)

/* ============================ [C2] 云函数还是旧版本 / 云端库不全 ============================ */

console.log('\n[C2] 云端返回空结果时必须退回本机菜谱（用户报的「还是搜索不到」）')
{
  // 模拟两种真实故障：
  //   ① 云函数没重新上传 → 只按菜名匹配，「辣」「3号窗口」必然 0 条
  //   ② 云端库里没有这道菜（只建了几道测试菜）
  const oldCloudSearch = (kw, rows) => {
    const k = String(kw).trim().toLowerCase()
    return rows.filter((d) => String(d.name || '').toLowerCase().includes(k)).map((d) => d.name).sort()
  }

  const realCall = globalThis.uniCloud
  let cloudReply = { list: [], total: 0 }

  // 让 api/index.js 里的云端链路「成功返回」我们指定的结果
  globalThis.uniCloud = {
    callFunction: ({ success }) => success({ result: { code: 0, message: 'success', data: cloudReply } })
  }

  async function searchWith(kw, reply) {
    cloudReply = reply
    const res = await dishApi.list({ keyword: kw, page: 1, pageSize: 100 })
    return { names: res.list.map((d) => d.name).sort(), engine: res.engine }
  }

  // ① 旧版云函数：搜「辣」云端 0 条
  const r1 = await searchWith('辣', { list: [], total: 0 })
  console.log(`    旧版云函数搜「辣」→ engine=${r1.engine}，${r1.names.length} 条`)
  check('云端 0 条时不再显示空列表，而是退回本机菜谱', r1.names.length > 0, true)
  check('退回的是本机菜谱（engine=local）', r1.engine, 'local')
  check('退回结果与本机搜索完全一致', r1.names, await localSearch('辣'))

  // ② 云端库里只有 2 道测试菜，用户搜的菜不在里面
  const r2 = await searchWith('宫保', { list: [], total: 2 })
  console.log(`    云端库不全搜「宫保」→ engine=${r2.engine}，${r2.names.length} 条`)
  check('云端库不全时也能搜到本机菜谱里的菜', r2.names, ['宫保鸡丁'])

  // ③ 云端确实有结果时，必须原样用云端结果（不能被本机覆盖）
  const cloudRow = { id: 'x1', name: '云端专属菜', canteen: '第一食堂', window: '1号窗口', category: '其他', tags: ['辣'], status: 1 }
  const r3 = await searchWith('辣', { list: [cloudRow], total: 1 })
  console.log(`    云端有结果时 → engine=${r3.engine}，${r3.names.join('、')}`)
  check('云端有结果时用云端结果，不覆盖', r3.names, ['云端专属菜'])
  check('云端有结果时 engine=cloud', r3.engine, 'cloud')

  // ④ 两边都没有 → 老老实实返回空（不编造数据）
  const r4 = await searchWith('根本不存在的东西', { list: [], total: 0 })
  console.log(`    两边都没有 → engine=${r4.engine}，${r4.names.length} 条`)
  check('两边都没有时返回空', r4.names.length, 0)

  // ⑤ 翻页请求不能被兜底逻辑改道（否则分页会错乱）
  cloudReply = { list: [], total: 0 }
  const r5 = await dishApi.list({ keyword: '辣', page: 2, pageSize: 10 })
  check('第 2 页走云端原始结果（兜底只作用于第 1 页）', r5.engine, 'cloud')

  globalThis.uniCloud = realCall
}

/* ============================ [C3] 筛选条件还叠着 ============================ */

console.log('\n[C3] 带着食堂筛选搜别的食堂的菜（用户报的「搜菜名也搜不到」）')
{
  // 场景：从首页「第二食堂」入口进来的，筛选条上还留着「第二食堂」，
  // 此时搜「宫保鸡丁」（第一食堂的菜）→ 必须还能搜到，并放开筛选。
  const realCall = globalThis.uniCloud
  let cloudCalls = []

  globalThis.uniCloud = {
    callFunction: ({ data, success }) => {
      cloudCalls.push({ canteen: data.canteen, keyword: data.keyword })
      // 模拟「云端库齐全」：按参数真实过滤（含食堂）
      const k = String(data.keyword || '').trim().toLowerCase()
      const rows = LOCAL_DISHES.filter((d) => {
        if (data.canteen && d.canteen !== data.canteen) return false
        if (data.category && d.category !== data.category) return false
        if (!k) return true
        const parts = [d.name, d.window, d.canteen, d.category, ...(d.tags || [])]
        return parts.some((x) => typeof x === 'string' && x.toLowerCase().includes(k))
      }).map((d) => ({ ...d, _id: d.id }))
      success({ result: { code: 0, message: 'success', data: { list: rows, total: rows.length, hasMore: false } } })
    }
  }

  const res = await dishApi.list({ keyword: '宫保鸡丁', canteen: '第二食堂', page: 1, pageSize: 20 })
  console.log(`    第二食堂里搜「宫保鸡丁」→ engine=${res.engine}，${res.list.length} 条，relaxedFilters=${!!res.relaxedFilters}`)
  check('带错筛选也能搜到（放开筛选后重搜）', res.list.map((d) => d.name), ['宫保鸡丁'])
  check('回传 relaxedFilters 让页面同步清空筛选条', res.relaxedFilters, true)
  check('第二次请求确实去掉了食堂筛选', cloudCalls.length >= 2 && !cloudCalls[1].canteen, true)
  check('关键词在两次请求里都保留', cloudCalls[1].keyword, '宫保鸡丁')

  // 筛选正确时不该多问一次
  cloudCalls = []
  const ok = await dishApi.list({ keyword: '宫保鸡丁', canteen: '第一食堂', page: 1, pageSize: 20 })
  check('筛选正确时只请求一次', cloudCalls.length, 1)
  check('筛选正确时不标记 relaxedFilters', !!ok.relaxedFilters, false)
  check('筛选正确时结果正确', ok.list.map((d) => d.name), ['宫保鸡丁'])

  // 真没有这道菜时，不能因为放开了筛选就编出结果
  cloudCalls = []
  const none = await dishApi.list({ keyword: '不存在的菜', canteen: '第二食堂', page: 1, pageSize: 20 })
  check('搜不到的菜仍然搜不到（不编造结果）', none.list.length, 0)

  // 页面侧：拿到 relaxedFilters 后必须真的清空筛选（否则筛选条会撒谎）
  check('页面拿到 relaxedFilters 会清空食堂筛选', /filters\.value\.canteen = ''/.test(dlSrc), true)
  check('页面显示「已放开筛选」的提示条', /class="relax-tip"/.test(dlSrc), true)
  check('提示条有样式', /\.relax-tip \{/.test(dlSrc), true)

  globalThis.uniCloud = realCall
}



/* ============================ [D] 不搜 description ============================ */

console.log('\n[D] description 不参与搜索（避免搜出不相干的菜）')
const descWords = ['皮带面', '神器', '零失败', '食堂阿姨']
for (const w of descWords) {
  const c = await cloudSearch(w)
  const l = await localSearch(w)
  const inDesc = LOCAL_DISHES.filter((d) => String(d.description || '').includes(w)).length
  console.log(`    「${w}」出现在 ${inDesc} 道菜的描述里，云端命中 ${c.length} 条 / 本地命中 ${l.length} 条`)
  check(`「${w}」描述词不产生命中（云端）`, c.length, 0)
  check(`「${w}」描述词不产生命中（本地）`, l.length, 0)
}

/* ============================ [E] 源码层面的口径断言 ============================ */

console.log('\n[E] 源码口径')
const dishSrc = read('uniCloud-aliyun/cloudfunctions/shiyu-dish/index.js')
// 云端口径：JS 侧匹配，覆盖 name/tags/window/canteen/category，不含 description
check('云端有 JS 侧匹配函数 dishMatchesKeyword', /function dishMatchesKeyword\(doc, kw\)/.test(dishSrc), true)
check('云端匹配覆盖菜名/窗口/食堂/分类',
  /var parts = \[doc\.name, doc\.window, doc\.canteen, doc\.category\]/.test(dishSrc), true)
check('云端匹配把 tags 逐个纳入',
  /for \(var i = 0; i < doc\.tags\.length; i\+\+\)/.test(dishSrc), true)
check('云端匹配不包含 description', /parts = \[doc\.name, doc\.window, doc\.canteen, doc\.category\]/.test(dishSrc)
  && !/parts\.push\(doc\.description\)/.test(dishSrc), true)
// 关键回归：不再把正则 / $or 交给数据库
check('云端不再构造 db.RegExp（部分版本必须 new，失败会整条查询异常）',
  /db\.RegExp\(\{|typeof db\.RegExp === 'function'/.test(dishSrc), false)
check('云端不再用 dbCmd.or 嵌套 and 做关键字查询',
  /dbCmd\.or\(\[[\s\S]{0,200}buildLikeRegExp/.test(dishSrc), false)
check('旧的正则助手已删除', /function buildLikeRegExp|function escapeRegExp/.test(dishSrc), false)
check('关键字查询走 JS 过滤后分页', /if \(kw\) \{[\s\S]{0,200}scanByKeyword\(base, kw, orderBy\)/.test(dishSrc), true)
check('扫描分批（不依赖单个 get 的条数上限）', /KEYWORD_SCAN_BATCH = 100/.test(dishSrc), true)

const apiSrc = read('api/index.js')
check('本地口径含 tags', /Array\.isArray\(d\.tags\)\) parts\.push\(\.\.\.d\.tags\)/.test(apiSrc), true)
check('本地口径逐字段 some() 命中，不拼接成串',
  /parts\.some\(\(x\) => typeof x === 'string' && x && x\.toLowerCase\(\)\.includes\(kw\)\)/.test(apiSrc), true)
check('本地口径不含 description', /parts = \[d\.name, d\.window, d\.canteen, d\.category\]/.test(apiSrc), true)
check('旧的 description 匹配已移除', /d\.description \|\| ''\)\.toLowerCase\(\)\.includes/.test(apiSrc), false)

/* ============================ [F] 竞态守卫 ============================ */

console.log('\n[F] 竞态守卫：过期响应必须被丢弃')
const dl = dlSrc
check('dish-list 有 seq 计数器', /let seq = 0/.test(dl), true)
check('发请求时递增并记住序号', /const mySeq = \+\+seq/.test(dl), true)
check('响应回来后比对序号', /if \(mySeq !== seq\) return/.test(dl), true)
check('finally 里也判序号（不误关 loading）', /if \(mySeq === seq\) \{\s*loading\.value = false/.test(dl), true)
check('reset（新搜索）不再被 loading 拦掉', /if \(!reset && \(loading\.value \|\| !hasMore\.value\)\) return/.test(dl), true)

const ad = read('pages/admin/dishes.vue')
check('admin/dishes 也有 seq 守卫',
  /let seq = 0/.test(ad) && /const mySeq = \+\+seq/.test(ad) && /if \(mySeq !== seq\) return/.test(ad), true)
check('admin/dishes 收到 relaxedFilters 会把 picker 复位到全部食堂',
  /res\.relaxedFilters && canteenIndex\.value !== 0/.test(ad), true)

// 真跑一遍竞态语义
let seq = 0
const applied = []
const start = (tag) => ({ mySeq: ++seq, tag })
const finish = (req) => { applied.push((req.mySeq !== seq ? '丢弃:' : '采用:') + req.tag) }
const slow = start('旧搜索(慢)')
const fast = start('新搜索(快)')
finish(fast)
finish(slow)
check('新结果被采用、后到的旧结果被丢弃', applied, ['采用:新搜索(快)', '丢弃:旧搜索(慢)'])

/* ============================ [F2] 边打边搜 ============================ */

console.log('\n[F2] 边打边搜（没有它，输入框里的字和列表对不上 → 表现为「搜不到」）')
check('dish-list 输入框绑定了 @input', /@input="onKeywordInput"/.test(dl), true)
check('dish-list 有防抖计时器', /let searchTimer = null/.test(dl), true)
check('输入变化会重置防抖', /if \(searchTimer\) clearTimeout\(searchTimer\)/.test(dl), true)
check('防抖到期才真正查询', /searchTimer = setTimeout\(\(\) => \{[\s\S]{0,300}?loadList\(true\)/.test(dl), true)
check('关键词没变就不重复请求', /if \(keyword\.value\.trim\(\) === appliedKeyword\.value\) return/.test(dl), true)
check('loadList 记录已查询的关键词', /appliedKeyword\.value = keyword\.value\.trim\(\)/.test(dl), true)
check('点搜索 / 清空会取消待触发的防抖', /function onSearch\(\) \{\s*cancelSearchTimer\(\)/.test(dl), true)
check('页面卸载时清掉计时器（不会在页面销毁后发请求）', /onUnmounted\(cancelSearchTimer\)/.test(dl), true)
check('占位符已说明搜索范围（不再只说「菜品名称」）', /placeholder="搜菜名、口味、窗口"/.test(dl), true)

// 真跑一遍防抖语义
{
  const timers = []
  const fakeSetTimeout = (fn, ms) => { const t = { fn, ms, cleared: false }; timers.push(t); return t }
  const fakeClearTimeout = (t) => { if (t) t.cleared = true }
  let keyword = ''
  let appliedKeyword = ''
  const requests = []
  const loadList = (reset) => { appliedKeyword = keyword.trim(); requests.push(appliedKeyword) }
  // 与 dish-list.vue 相同的逻辑
  let searchTimer = null
  const onKeywordInput = () => {
    if (searchTimer) fakeClearTimeout(searchTimer)
    searchTimer = fakeSetTimeout(() => {
      searchTimer = null
      if (keyword.trim() === appliedKeyword) return
      loadList(true)
    }, 350)
  }
  const fire = (t) => { if (!t.cleared) t.fn() }

  for (const ch of '牛肉') { keyword += ch; onKeywordInput() }   // 连打两个字
  fire(timers[timers.length - 1])                                 // 只有最后一次生效
  check('连打「牛肉」只发 1 次请求', requests, ['牛肉'])

  keyword = ''                                                    // 清空
  onKeywordInput()
  fire(timers[timers.length - 1])
  check('清空后再搜一次空关键词', requests, ['牛肉', ''])
  fire(timers[timers.length - 1])                                 // 再触发一次也不会重复
  check('关键词没变则不重复请求', requests, ['牛肉', ''])
}

/* ============================ [C4] 云端是真菜单时不许掺本机种子菜 ============================ */

console.log('\n[C4] 云端菜库是真实菜单时，搜不到就是真的没有（不许塞本机种子菜）')
{
  // 场景：云端菜库是真实菜单（15 道，含「土豆炖牛肉」，但没有「兰州拉面」）。
  // 用**全新的模块实例**跑，避免前面几节留下的 dishListSource / cloudMenuTrusted 状态干扰。
  const cloudMenu = [
    { id: 'c1', name: '土豆炖牛肉', price: 16, canteen: '第一食堂', window: '家常窗口', category: '家常菜', tags: ['咸香', '牛肉'], status: 1 },
    { id: 'c2', name: '辣子鸡', price: 15, canteen: '第一食堂', window: '川味窗口', category: '川菜', tags: ['辣', '鸡肉'], status: 1 },
    { id: 'c3', name: '清炒油麦菜', price: 6, canteen: '第一食堂', window: '素菜窗口', category: '素菜', tags: ['清淡'], status: 1 },
    ...Array.from({ length: 12 }, (_, i) => ({
      id: 'c' + (i + 4), name: '云端菜' + (i + 4), price: 10, canteen: '第二食堂',
      window: '7号窗口', category: '家常菜', tags: ['咸香'], status: 1
    }))
  ]

  globalThis.uniCloud = {
    callFunction: ({ data, success }) => {
      const k = String(data.keyword || '').trim().toLowerCase()
      const rows = cloudMenu.filter((d) => {
        if (data.canteen && d.canteen !== data.canteen) return false
        if (!k) return true
        return [d.name, d.window, d.canteen, d.category, ...(d.tags || [])]
          .some((x) => typeof x === 'string' && x.toLowerCase().includes(k))
      }).map((d) => ({ ...d, _id: d.id }))
      success({ result: { code: 0, message: 'success', data: { list: rows, total: rows.length, hasMore: false } } })
    }
  }

  const fresh = await import('../api/index.js?v=c4')

  // ① 先加载完整菜单 → 前端由此确认「云端菜库是真实菜单」
  const menu = await fresh.dishApi.list({ page: 1, pageSize: 100 })
  console.log(`    完整菜单 → engine=${menu.engine}，${menu.list.length} 道`)
  check('完整菜单走云端', menu.engine, 'cloud')

  // ② 搜「牛肉」：云端只有土豆炖牛肉
  const beef = await fresh.dishApi.list({ keyword: '牛肉', page: 1, pageSize: 100 })
  console.log(`    搜「牛肉」→ ${beef.list.map((d) => d.name).join('、')}`)
  check('搜牛肉只返回云端真实存在的菜', beef.list.map((d) => d.name), ['土豆炖牛肉'])

  // ③ 关键：搜「兰州拉面」——它只存在于本机种子菜谱，云端菜单里没有
  const phantom = await fresh.dishApi.list({ keyword: '兰州拉面', page: 1, pageSize: 100 })
  console.log(`    搜「兰州拉面」→ engine=${phantom.engine}，${phantom.list.length} 条`)
  check('云端真实菜单里没有的菜，绝不从本机种子菜谱里塞进来', phantom.list.length, 0)
  check('且不标记为本地数据源', phantom.engine, 'cloud')

  // ④ 带食堂筛选搜别的食堂的菜 → 只放开筛选重搜云端，仍然不掺本机菜
  const relaxed = await fresh.dishApi.list({ keyword: '土豆炖牛肉', canteen: '第二食堂', page: 1, pageSize: 100 })
  console.log(`    第二食堂里搜「土豆炖牛肉」→ ${relaxed.list.map((d) => d.name).join('、')}（relaxed=${!!relaxed.relaxedFilters}）`)
  check('放开筛选后仍用云端结果', relaxed.list.map((d) => d.name), ['土豆炖牛肉'])
  check('标记了 relaxedFilters', relaxed.relaxedFilters, true)
  check('结果里没有本机种子菜', relaxed.list.some((d) => d.name === '兰州拉面'), false)

  // ⑤ 源码层面：兜底必须受「云端菜库是否真实」约束
  const apiSrc2 = read('api/index.js')
  check('新增 cloudMenuTrusted 状态', /let cloudMenuTrusted = null/.test(apiSrc2), true)
  check('完整菜单加载时判定云端菜库是否真实', /cloudMenuTrusted = isCloudDishDataTrustworthy\(res\)/.test(apiSrc2), true)
  check('searchFallback 接收 knownRealMenu 参数', /async function searchFallback\(params, cloudRes, knownRealMenu\)/.test(apiSrc2), true)
  check('已知真实菜单时直接返回空结果', /if \(knownRealMenu\) return cloudRes/.test(apiSrc2), true)
}

/* ============================ [H] 两份数据必须同源 ============================ */

console.log('\n[H] 本机菜谱与云端种子必须同源（否则同一个词两条链路结果不同）')
{
  const { loadSeedDishes, loadChatFallback, diffDatasets, diffDishLists } = await import('./load-seed.mjs')
  const seed = loadSeedDishes()
  const localNow = LOCAL_DISHES
  console.log(`    本机菜谱 ${localNow.length} 道；云端种子 ${seed.length} 道`)
  const problems = diffDatasets(localNow, seed)
  check('两份数据逐条一致（菜名集合 / tags / 食堂 / 窗口 / 分类 / 价格）', problems, [])

  // AI 聊天云函数内嵌的那份兜底菜品库（读库失败时喂给大模型）
  const chatFallback = loadChatFallback()
  const chatDiff = diffDishLists(localNow, chatFallback, '本机菜谱', 'AI 兜底库')
  console.log(`    AI 聊天兜底库 ${chatFallback.length} 道，差异 ${chatDiff.length} 处`)
  check('AI 聊天的兜底菜品库与菜单一致（否则 AI 会推荐菜单里没有的菜）', chatDiff, [])

  // 忌口是硬过滤：tags 里没有该食材名，过敏同学就可能被推荐到忌口菜
  const { ALLERGY_OPTIONS } = await import('../common/constants.js')
  const allTags = new Set()
  localNow.forEach((d) => (d.tags || []).forEach((t) => allTags.add(t)))
  const uncovered = ALLERGY_OPTIONS.filter((w) => !allTags.has(w))
  console.log(`    忌口词 ${ALLERGY_OPTIONS.length} 个，tags 里未覆盖：${uncovered.length ? uncovered.join('、') : '无'}`)
  check('每个忌口词都有菜品用 tag 标注（忌口硬过滤才有依据）', uncovered, [])

  // 食材只写在描述里、tags 里没有 → 搜不到 + 忌口过滤失效（麻婆豆腐的「牛肉末」就是这种情况）
  const holes = []
  localNow.forEach((d) => {
    const tags = d.tags || []
    const desc = String(d.description || '')
    const name = String(d.name || '')
    ALLERGY_OPTIONS.forEach((w) => {
      if (tags.includes(w)) return
      if (desc.includes(w) && !name.includes(w)) holes.push(`${d.name} 描述里有「${w}」但 tags 没标`)
    })
  })
  if (holes.length) holes.forEach((h) => console.log('    ⚠ ' + h))
  check('忌口食材只要出现在描述里就必须打标签（否则搜不到 + 忌口过滤失效）', holes, [])

  // AI 聊天兜底库与菜单一致后再查它的「示例对话」：示例里的 [DISH:id] 必须指向正确的菜
  {
    const chatSrc = read('uniCloud-aliyun/cloudfunctions/shiyu-chat/index.js')
    const byId = new Map(localNow.map((d) => [d.id, d]))
    const bad = []
    // 抓形如 `1. 宫保鸡丁 ¥12 — ...` 的示例行，逐行核对「ID ↔ 菜名 ↔ 价格」
    const exampleLines = chatSrc.match(/\\n1\.\s*[^']+/g) || []
    exampleLines.forEach((raw) => {
      const line = raw.replace(/\\n/g, '')
      const m = line.match(/1\.\s*(.+?)\s*¥(\d+(?:\.\d+)?)/)
      if (!m) return
      const [, name, price] = m
      const dish = localNow.find((d) => d.name === name.trim())
      if (!dish) { bad.push(`示例里的菜「${name}」不在菜品库里`); return }
      if (Number(dish.price) !== Number(price)) {
        bad.push(`示例里「${name}」写 ¥${price}，但菜品库里是 ¥${dish.price}`)
      }
    })
    // 示例末尾的 ID 列表。
    // 只校验「全是 d001 这种真实 ID」的块 —— 提示词里还有 [DISH:菜品ID,菜品ID] 这类
    // 格式说明，以及代码里的 /\[DISH:([^\]]+)\]/ 正则，它们不是示例，不该拿来核对。
    const idBlocks = [...chatSrc.matchAll(/\[DISH:([^\]]+)\]/g)]
      .map((m) => m[1].split(',').map((s) => s.trim()))
      .filter((ids) => ids.length && ids.every((id) => /^d\d{3}$/.test(id)))
    idBlocks.forEach((ids) => ids.forEach((id) => {
      if (!byId.has(id)) bad.push(`示例里的 [DISH:${id}] 在菜品库里不存在`)
    }))
    // 更强的核对：每个示例块里的 ID 所指的菜，名字必须出现在示例里
    idBlocks.forEach((ids) => {
      ids.forEach((id) => {
        const dish = byId.get(id)
        if (dish && !chatSrc.includes(dish.name)) {
          bad.push(`[DISH:${id}] 指向「${dish.name}」，但示例里没提到这道菜`)
        }
      })
    })
    console.log(`    AI 提示词示例里引用了 ${idBlocks.length} 组菜品 ID`)
    check('AI 提示词示例里的菜品 ID / 菜名 / 价格与菜品库一致', bad, [])
  }

  // 用户实际搜过的那个词
  const beef = localNow.filter((d) => [d.name, d.canteen, d.window, d.category, ...(d.tags || [])]
    .some((x) => typeof x === 'string' && x.includes('牛肉'))).map((d) => d.name)
  console.log(`    搜「牛肉」→ ${beef.length} 道：${beef.join('、')}`)
  check('搜「牛肉」能搜出 6 道（含描述里带牛肉末的麻婆豆腐）', beef.length, 6)
  check('麻婆豆腐因为描述里有牛肉末而被搜到', beef.includes('麻婆豆腐'), true)
  check('牛肉菜里包含用户期望的几道',
    ['土豆炖牛肉', '牛肉拉面', '红烧牛肉饭'].every((n) => beef.includes(n)), true)
}

/* ============================ [I] 图片回退机制 ============================ */

console.log('\n[I] 菜品图缺失时的回退（防止破图的那道保险）')
{
  // 菜品图已迁到云存储，本机 static/dishes 可能已被删除；
  // 这里验证的是**机制**而不是当前有没有图：
  // 清单里没有的文件名，绝不能拼出 URL（否则会发一次必然失败的请求、留一个破图占位）。
  const { dishImageSrc, dishUsesEmojiFallback } = await import('../common/utils.js')
  const ghost = dishImageSrc({ id: 'x', image: 'static/dishes/definitely-not-there.jpg' })
  check('清单里没有的本机图片不会拼出地址', ghost, '')
  check('这种菜品会走 emoji 回退', dishUsesEmojiFallback({ id: 'x', image: 'static/dishes/definitely-not-there.jpg' }), true)
  check('没有 image 字段时也走 emoji 回退', dishImageSrc({ id: 'x', name: '某菜' }), '')
  // 云存储 fileID 与 https 外链不查清单，直接放行（由组件去换临时地址）
  check('cloud:// 的 fileID 直接透传',
    dishImageSrc({ image: 'cloud://a.b/dishes/x.jpg' }), 'cloud://a.b/dishes/x.jpg')
  check('https 外链直接透传',
    dishImageSrc({ image: 'https://example.com/a.jpg' }), 'https://example.com/a.jpg')
}

/* ============================ 语法 ============================ */

console.log('\n[G] 语法')
let bad = 0
const jsFiles = ['api/index.js', 'common/local-dishes.js', 'uniCloud-aliyun/cloudfunctions/shiyu-dish/index.js']
for (const p of jsFiles) {
  const t = join(HERE, '_s.mjs')
  writeFileSync(t, read(p), 'utf8')
  try { execFileSync(process.execPath, ['--check', t], { stdio: 'pipe' }) }
  catch (e) { bad++; console.log('   FAIL ' + p + ' :: ' + String(e.stderr || e.message).split('\n').slice(0, 3).join(' ')) }
  unlinkSync(t)
}
for (const p of ['pages/dish-list/dish-list.vue', 'pages/admin/dishes.vue']) {
  const code = read(p).match(/<script[^>]*>([\s\S]*?)<\/script>/)[1]
  const t = join(HERE, '_s.mjs')
  writeFileSync(t, code, 'utf8')
  try { execFileSync(process.execPath, ['--check', t], { stdio: 'pipe' }) }
  catch (e) { bad++; console.log('   FAIL ' + p + ' :: ' + String(e.stderr || e.message).split('\n').slice(0, 3).join(' ')) }
  unlinkSync(t)
}
check('全部语法通过', bad, 0)

console.log('\n' + (fail === 0 ? '=== ALL PASS ===' : '=== ' + fail + ' FAILED ===') + '  (' + pass + ' passed)')
process.exit(fail === 0 ? 0 : 1)
