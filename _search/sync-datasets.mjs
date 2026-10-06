/**
 * 把 shiyu-seed 的 SEED_DISHES 生成到 common/local-dishes.js
 *
 * 背景：项目里原本有**两份不同的 40 道菜**——
 *   · common/local-dishes.js          （客户端兜底用的本机菜谱）
 *   · shiyu-seed/index.js 的 SEED_DISHES（云端种子）
 * 40 道里只有 14 道同名，tags/价格/食堂/窗口/分类还各不相同，
 * 于是同一个关键词走云端和走本地会返回两批不同的菜 ——
 * 表现为「有时候搜不到、有时候搜到错误菜品」。
 *
 * 用户选择以「云端种子」那一份为准，因此本脚本把 SEED_DISHES 逐条写进本机菜谱，
 * 并补上本机菜谱需要的 id（d001…，与 image 字段的编号无关，image 一律照抄种子数据）。
 *
 * 用法：node _search/sync-datasets.mjs          # 只预览差异
 *       node _search/sync-datasets.mjs --write  # 真正写入
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const WRITE = process.argv.includes('--write')

/* ---------- 1. 取出 SEED_DISHES ---------- */
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
vm.runInContext(
  seedSrc.replace(/exports\.main[\s\S]*$/, '').replace(/^'use strict';?/m, '') +
    '\nexports.SEED_DISHES = SEED_DISHES;',
  sandbox,
  { filename: 'shiyu-seed/index.js' }
)
const seed = sandbox.exports.SEED_DISHES
console.log('从 shiyu-seed 读到 ' + seed.length + ' 道菜')

/* ---------- 2. 校验数据自洽 ---------- */
const map = JSON.parse(read('scripts/dish-image-map.json')).map
const problems = []
seed.forEach((d, i) => {
  const tag = `#${i + 1} ${d.name}`
  if (!d.name || !d.canteen || !d.window || !d.category) problems.push(tag + '：缺少 name/canteen/window/category')
  if (!Array.isArray(d.tags) || !d.tags.length) problems.push(tag + '：tags 为空')
  const want = map[d.name]
  if (want && String(d.image || '').replace(/^.*\//, '') !== want) {
    problems.push(tag + `：image=${d.image} 与菜名映射表(${want})不一致`)
  }
})
if (problems.length) {
  console.log('\n数据有问题，已停止：')
  problems.forEach((p) => console.log('  ' + p))
  process.exit(1)
}
console.log('自洽性校验通过（字段齐全、image 与菜名映射表一致）')

/* ---------- 3. 生成文件内容 ---------- */
/** 价格统一按数字字面量输出（8 / 7.5），不做多余格式化，避免把数值写成字符串 */
const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? String(n) : '0'
}
const q = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"
const arr = (list) => '[' + list.map(q).join(', ') + ']'

const lines = []
lines.push('/**')
lines.push(' * 本机菜谱（客户端兜底数据源）')
lines.push(' *')
lines.push(' * ⚠️ 这份数据必须与云端种子数据 uniCloud-aliyun/cloudfunctions/shiyu-seed/index.js')
lines.push(' *    的 SEED_DISHES 保持**完全一致**（菜名 / 食堂 / 窗口 / 分类 / tags / 价格 / image）。')
lines.push(' *')
lines.push(' * 原因：搜索的关键字匹配同时覆盖「菜名 / 标签 / 窗口 / 食堂 / 分类」。')
lines.push(' *   两份数据一旦分叉，同一个关键词走云端和走本地兜底就会返回两批不同的菜，')
lines.push(' *   用户看到的就是「有时候搜不到、有时候搜到错误菜品」。')
lines.push(' *')
lines.push(' * 改动方式：改完 shiyu-seed 的 SEED_DISHES 后运行')
lines.push(' *   node _search/sync-datasets.mjs --write')
lines.push(' * 由脚本把云端种子数据同步到本文件，避免手工改出偏差；')
lines.push(' * 再用 node _search/compare-datasets.mjs 复核两份是否一致。')
lines.push(' *')
lines.push(' * 字段与云端 dishes 集合一致：')
lines.push(' *   id / name / price / canteen / window / category / tags / emoji /')
lines.push(' *   image / description / rating / review_count / recommend_count / status / is_new')
lines.push(' *')
lines.push(' * tags 说明：除口味词（辣、麻辣、清淡、咸香、甜、酸、重油、鲜嫩、下饭、汤面、')
lines.push(' *   干拌面、养胃、早餐、低卡）外，还包含忌口相关食材名（香菜、葱、蒜、花生、')
lines.push(' *   海鲜、牛肉、羊肉、内脏、鸡蛋、牛奶）——推荐引擎据此做忌口硬过滤，')
lines.push(' *   含该食材的菜品必须把食材名写进 tags，否则过敏同学可能被推荐到忌口菜。')
lines.push(' */')
lines.push('')
lines.push('export const LOCAL_DISHES = [')

let lastCanteen = ''
let lastWindow = ''
seed.forEach((d, i) => {
  const id = 'd' + String(i + 1).padStart(3, '0')
  if (d.canteen !== lastCanteen || d.window !== lastWindow) {
    lines.push(`  // ===== ${d.canteen} · ${d.window} =====`)
    lastCanteen = d.canteen
    lastWindow = d.window
  }
  lines.push(`  { id: ${q(id)}, name: ${q(d.name)}, price: ${num(d.price)}, canteen: ${q(d.canteen)}, window: ${q(d.window)}, category: ${q(d.category)},`)
  lines.push(`    tags: ${arr(d.tags)}, emoji: ${q(d.emoji || '🍽️')}, image: ${q(d.image || '')}, description: ${q(d.description || '')},`)
  lines.push(`    rating: ${Number(d.rating) || 0}, review_count: ${Number(d.review_count) || 0}, recommend_count: ${Number(d.recommend_count) || 0}, status: ${d.status === 0 ? 0 : 1}, is_new: ${!!d.is_new} }${i === seed.length - 1 ? '' : ','}`)
})
lines.push(']')
lines.push('')
lines.push('/**')
lines.push(' * 获取去重后的食堂列表（保持菜品出现顺序：第一食堂、第二食堂、第三食堂）')
lines.push(' * @returns {string[]}')
lines.push(' */')
lines.push('export function getLocalCanteens() {')
lines.push('  const list = []')
lines.push('  LOCAL_DISHES.forEach(function (dish) {')
lines.push('    if (list.indexOf(dish.canteen) < 0) list.push(dish.canteen)')
lines.push('  })')
lines.push('  return list')
lines.push('}')
lines.push('')
lines.push('/**')
lines.push(' * 获取去重后的分类列表')
lines.push(' * @returns {string[]}')
lines.push(' */')
lines.push('export function getLocalCategories() {')
lines.push('  const list = []')
lines.push('  LOCAL_DISHES.forEach(function (dish) {')
lines.push('    if (list.indexOf(dish.category) < 0) list.push(dish.category)')
lines.push('  })')
lines.push('  return list')
lines.push('}')
lines.push('')

const out = lines.join('\r\n')

/* ---------- 4. 写入前先自检：生成的内容必须能解析出 40 道菜 ---------- */
{
  const check = out.replace(/^export /gm, '')
  const mod = await import(
    'data:text/javascript,' + encodeURIComponent(check + '\nexport { LOCAL_DISHES, getLocalCanteens, getLocalCategories };')
  )
  if (mod.LOCAL_DISHES.length !== seed.length) {
    console.log(`生成结果只有 ${mod.LOCAL_DISHES.length} 道，应为 ${seed.length} 道，已停止`)
    process.exit(1)
  }
  console.log('生成结果可正常解析：' + mod.LOCAL_DISHES.length + ' 道，食堂 ' + mod.getLocalCanteens().join('/'))
}

if (!WRITE) {
  console.log('\n（预览模式）加 --write 才会写入')
  process.exit(0)
}

writeFileSync(join(ROOT, 'common/local-dishes.js'), out, 'utf8')
console.log('\n已写入 common/local-dishes.js')

/* ---------- 5. 同步 AI 聊天云函数的兜底菜品库 ---------- */
// shiyu-chat 内嵌了一份 22 道菜的 FALLBACK_DISHES（读库失败时给大模型用），
// 它同样必须与菜单一致，否则 AI 会推荐菜单里根本没有的菜。
{
  const chatRel = 'uniCloud-aliyun/cloudfunctions/shiyu-chat/index.js'
  const src = read(chatRel)
  const eol = src.includes('\r\n') ? '\r\n' : '\n'

  const anchor = 'var FALLBACK_DISHES = ['
  const start = src.indexOf(anchor)
  if (start < 0) {
    console.log('⚠ ' + chatRel + ' 里没找到 FALLBACK_DISHES，跳过')
    process.exitCode = 1
  } else {
    const close = src.indexOf(eol + ']', start)
    if (close < 0) {
      console.log('⚠ ' + chatRel + ' 里没找到 FALLBACK_DISHES 的结束括号，跳过')
      process.exitCode = 1
    } else {
      const docStart = src.lastIndexOf('/**', start)
      const newDoc = [
        '/**',
        ' * 兜底菜品库（仅当 dishes 集合为空或读库失败时使用）',
        ' *',
        ' * 正常情况下应当从 dishes 集合读，这样管理后台改的位置/图片/价格',
        ' * 才能反映到 AI 回答里。这份内嵌数据必须与 common/local-dishes.js',
        ' * 以及 shiyu-seed 的 SEED_DISHES 完全一致，否则 AI 会推荐菜单里没有的菜。',
        ' *',
        ' * 由 node _search/sync-datasets.mjs --write 自动生成，请勿手工修改。',
        ' */'
      ].join(eol)

      const body = seed.map((d, i) => {
        const id = 'd' + String(i + 1).padStart(3, '0')
        return (
          `  { id: ${q(id)}, name: ${q(d.name)}, price: ${num(d.price)}, canteen: ${q(d.canteen)}, ` +
          `floor: ${d.floor || null}, window: ${q(d.window || '')}, category: ${q(d.category)}, ` +
          `tags: ${arr(d.tags)}, description: ${q(d.description || '')}, rating: ${Number(d.rating) || 0} }`
        )
      })

      const next =
        src.slice(0, docStart) +
        newDoc +
        eol +
        anchor +
        eol +
        body.join(',' + eol) +
        src.slice(close)
      writeFileSync(join(ROOT, chatRel), next, 'utf8')
      console.log('已写入 ' + chatRel + ' 的 FALLBACK_DISHES（' + seed.length + ' 道）')
    }
  }
}
