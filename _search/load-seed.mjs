/**
 * 从 shiyu-seed 云函数源码里取出 SEED_DISHES
 *
 * 云函数不能直接被 import（它用 uniCloud / require，且顶层就建了 db），
 * 所以在沙箱里执行它的源码，只取那一个顶层 const。
 * compare-datasets.mjs 与 check.mjs 共用这个加载器，避免两处各写一份解析逻辑。
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

export function loadSeedDishes() {
  const src = readFileSync(
    join(ROOT, 'uniCloud-aliyun/cloudfunctions/shiyu-seed/index.js'),
    'utf8'
  )
  const sandbox = {
    uniCloud: { database: () => ({ collection: () => ({}), command: {} }) },
    require: () => ({ verifyAdminToken: async () => ({ ok: false, message: 'stub' }) }),
    console: { log() {}, error() {}, warn() {} },
    exports: {},
    module: { exports: {} }
  }
  sandbox.global = sandbox
  vm.createContext(sandbox)
  // 去掉 'use strict' 与 exports.main 之后的部分，再补一句导出
  const body = src.replace(/exports\.main[\s\S]*$/, '').replace(/^'use strict';?/m, '')
  vm.runInContext(body + '\nexports.SEED_DISHES = SEED_DISHES;', sandbox, {
    filename: 'shiyu-seed/index.js'
  })
  const list = sandbox.exports.SEED_DISHES
  if (!Array.isArray(list) || !list.length) {
    throw new Error('shiyu-seed/index.js 里没读到 SEED_DISHES')
  }
  return list
}

/**
 * 取出 AI 聊天云函数内嵌的兜底菜品库 FALLBACK_DISHES
 *
 * 它在 dishes 集合为空或读库失败时喂给大模型。这份数据若与菜单不一致，
 * AI 就会推荐菜单里根本没有的菜 —— 同样是「搜到/推荐了错误菜品」。
 */
export function loadChatFallback() {
  const src = readFileSync(
    join(ROOT, 'uniCloud-aliyun/cloudfunctions/shiyu-chat/index.js'),
    'utf8'
  )
  const sandbox = {
    uniCloud: { database: () => ({ collection: () => ({}) }) },
    console: { log() {}, error() {}, warn() {} },
    exports: {},
    module: { exports: {} }
  }
  sandbox.global = sandbox
  vm.createContext(sandbox)
  const body = src.replace(/exports\.main[\s\S]*$/, '').replace(/^'use strict';?/m, '')
  vm.runInContext(body + '\nexports.FALLBACK_DISHES = FALLBACK_DISHES;', sandbox, {
    filename: 'shiyu-chat/index.js'
  })
  const list = sandbox.exports.FALLBACK_DISHES
  if (!Array.isArray(list) || !list.length) {
    throw new Error('shiyu-chat/index.js 里没读到 FALLBACK_DISHES')
  }
  return list
}

/** 两份菜品列表的搜索相关字段是否一致（返回问题列表） */
export function diffDishLists(a, b, labelA, labelB) {
  const problems = []
  const key = (n) => String(n || '').trim()
  const setB = new Map(b.map((d) => [key(d.name), d]))
  a.forEach((d) => {
    const o = setB.get(key(d.name))
    if (!o) {
      problems.push(`${labelB} 里没有：${d.name}`)
      return
    }
    if ((d.tags || []).join(',') !== (o.tags || []).join(',')) {
      problems.push(`${d.name}：tags ${labelA}[${(d.tags || []).join(',')}] ≠ ${labelB}[${(o.tags || []).join(',')}]`)
    }
    if (key(d.canteen) !== key(o.canteen)) {
      problems.push(`${d.name}：canteen ${labelA}[${d.canteen}] ≠ ${labelB}[${o.canteen}]`)
    }
    if (Number(d.price) !== Number(o.price)) {
      problems.push(`${d.name}：price ${labelA}[${d.price}] ≠ ${labelB}[${o.price}]`)
    }
  })
  if (b.length !== a.length) problems.push(`条数不同：${labelA} ${a.length} 道，${labelB} ${b.length} 道`)
  return problems
}

/** 本机菜谱与云端种子在搜索相关字段上是否逐条一致，返回问题列表（空数组 = 完全一致） */export function diffDatasets(local, seed) {
  const problems = []
  const key = (n) => String(n || '').trim()
  const nameSet = (rows) => new Set(rows.map((d) => key(d.name)))
  const l = nameSet(local)
  const s = nameSet(seed)
  local.forEach((d) => { if (!s.has(key(d.name))) problems.push(`只在本地有：${d.name}`) })
  seed.forEach((d) => { if (!l.has(key(d.name))) problems.push(`只在云端有：${d.name}`) })

  const byName = new Map(seed.map((d) => [key(d.name), d]))
  local.forEach((d) => {
    const o = byName.get(key(d.name))
    if (!o) return
    if ((d.tags || []).join(',') !== (o.tags || []).join(',')) {
      problems.push(`${d.name}：tags 本地[${(d.tags || []).join(',')}] ≠ 云端[${(o.tags || []).join(',')}]`)
    }
    for (const f of ['canteen', 'window', 'category']) {
      if (key(d[f]) !== key(o[f])) problems.push(`${d.name}：${f} 本地[${d[f]}] ≠ 云端[${o[f]}]`)
    }
    if (Number(d.price) !== Number(o.price)) problems.push(`${d.name}：price 本地[${d.price}] ≠ 云端[${o.price}]`)
  })
  return problems
}
