/**
 * 比对「本机种子菜谱」与「云端 shiyu-seed 内置种子数据」
 *
 * 这两份数据是搜索的两个数据源：云端库由 shiyu-seed 写入，本机兜底用 local-dishes.js。
 * 一旦两者的 tags 不一致，同一个关键词走云端与走本地就会返回不同的菜 ——
 * 这正是「有时候搜不到、有时候搜到错误菜品」的根源，必须持续校验。
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')

// 本机菜谱
const localSrc = read('common/local-dishes.js').replace(/^export /gm, '')
const localMod = await import('data:text/javascript,' + encodeURIComponent(localSrc + '\nexport { LOCAL_DISHES };'))
const local = localMod.LOCAL_DISHES

// 云函数里的 SEED_DISHES：在沙箱里执行源码后取出
const seedSrc = read('uniCloud-aliyun/cloudfunctions/shiyu-seed/index.js')
const sandbox = {
  uniCloud: { database: () => ({ collection: () => ({}), command: {} }) },
  require: () => ({ verifyAdminToken: async () => ({ ok: false }) }),
  console: { log() {}, error() {}, warn() {} },
  exports: {},
  module: { exports: {} }
}
sandbox.global = sandbox
vm.createContext(sandbox)
// 只取 SEED_DISHES：源码里它是顶层 const，把 exports 之后的部分截掉再追加导出语句
const seedBody = seedSrc
  .replace(/exports\.main[\s\S]*$/, '')
  .replace(/^'use strict';?/m, '')
vm.runInContext(seedBody + '\nexports.SEED_DISHES = SEED_DISHES;', sandbox, { filename: 'shiyu-seed/index.js' })
const seed = sandbox.exports.SEED_DISHES

console.log('本机菜谱 ' + local.length + ' 道；shiyu-seed 内置 ' + seed.length + ' 道\n')

const byName = (rows) => {
  const m = new Map()
  rows.forEach((d) => m.set(String(d.name).trim(), d))
  return m
}
const l = byName(local)
const s = byName(seed)

const onlyLocal = [...l.keys()].filter((n) => !s.has(n))
const onlySeed = [...s.keys()].filter((n) => !l.has(n))
console.log('只在本地有的菜：' + (onlyLocal.length ? onlyLocal.join('、') : '（无）'))
console.log('只在云端有的菜：' + (onlySeed.length ? onlySeed.join('、') : '（无）'))

let diff = 0
const diffs = []
for (const [name, ld] of l) {
  const sd = s.get(name)
  if (!sd) continue
  const lt = (ld.tags || []).join(',')
  const st = (sd.tags || []).join(',')
  const fields = []
  if (lt !== st) fields.push(`tags 本地[${lt}] ≠ 云端[${st}]`)
  for (const f of ['canteen', 'window', 'category']) {
    if ((ld[f] || '') !== (sd[f] || '')) fields.push(`${f} 本地[${ld[f]}] ≠ 云端[${sd[f]}]`)
  }
  if (Number(ld.price) !== Number(sd.price)) fields.push(`price 本地[${ld.price}] ≠ 云端[${sd.price}]`)
  if (fields.length) { diff++; diffs.push({ name, fields }) }
}

console.log('\n字段不一致的菜：' + diff + ' / ' + [...l.keys()].filter((n) => s.has(n)).length)
diffs.forEach((d) => console.log('  ' + d.name + '\n      ' + d.fields.join('\n      ')))

// 搜索口径层面的影响：同一个词两份数据会命中同一批吗
console.log('\n================ 同一关键词两份数据的命中对比 ================')
const search = (rows, kw) => rows
  .filter((d) => {
    const parts = [d.name, d.window, d.canteen, d.category, ...(d.tags || [])]
    return parts.some((x) => typeof x === 'string' && x.toLowerCase().includes(kw))
  })
  .map((d) => d.name).sort()

const words = ['辣', '清淡', '鸡', '面', '米', '蛋', '豆腐', '鱼', '虾', '粉', '牛肉', '羊肉', '海鲜', '花生']
let mismatch = 0
for (const w of words) {
  const a = search(local, w)
  const b = search(seed, w)
  const same = JSON.stringify(a) === JSON.stringify(b)
  if (!same) mismatch++
  console.log(`「${w}」本地 ${a.length} 条 / 云端 ${b.length} 条 ${same ? '一致' : '★不一致'}`)
  if (!same) {
    console.log('      本地：' + a.join('、'))
    console.log('      云端：' + b.join('、'))
  }
}
console.log('\n不一致的关键词：' + mismatch + ' / ' + words.length)

/* ================= 图片字段是否与「菜名 → 图片」映射一致 ================= */
// scripts/dish-image-map.json 是按菜名映射的（本地菜谱与云端种子共用），
// 组件也是按这个映射取图。若菜品自带的 image 字段与映射不符 → 会出现「串图」（张冠李戴）。
console.log('\n================ 图片映射一致性 ================')
const imgMap = JSON.parse(read('scripts/dish-image-map.json')).map
const manifestSrc = read('common/dish-images.js')
const files = new Set(
  (manifestSrc.match(/DISH_IMAGE_FILES = \[([\s\S]*?)\]/)[1].match(/"[^"]+"/g) || [])
    .map((s) => s.replace(/"/g, ''))
)
console.log('映射表 ' + Object.keys(imgMap).length + ' 条；实际存在的图片清单 ' + files.size + ' 张')

for (const [label, rows] of [['本机菜谱', local], ['云端种子', seed]]) {
  let wrong = 0, missingFile = 0, noMap = 0
  const samples = []
  for (const d of rows) {
    const want = imgMap[String(d.name).trim()]
    if (!want) { noMap++; continue }
    const have = String(d.image || '').replace(/^.*\//, '')
    if (have && have !== want) { wrong++; samples.push(`${d.name}: 数据里是 ${have}，映射表说是 ${want}`) }
    if (!files.has(want)) { missingFile++; samples.push(`${d.name}: 映射的 ${want} 文件不存在`) }
  }
  console.log(`${label}：image 字段与映射不符 ${wrong} 道；映射的文件不存在 ${missingFile} 道；映射表里没有 ${noMap} 道`)
  samples.slice(0, 12).forEach((s) => console.log('    ' + s))
}
