/**
 * 一次性脚本：建立「菜名 → 图片文件」权威映射，并让本地数据与云端种子数据共用它
 *
 * 背景：本地菜谱（40 道）与云端种子数据（40 道）是两套不同的菜品清单，只有约 10 道同名。
 * 若按数组序号编号图片（d001、d002…），两套数据会互相串图——实测发现 10 道菜对不上。
 * 因此改为按**菜名**映射：图片文件名固定为 static/dishes/<槽位>.jpg，
 * 槽位由 scripts/dish-image-map.json 统一定义，两边数据源都引用同一份映射。
 *
 * 用法：node scripts/build-image-map.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')

const LOCAL_FILE = path.join(ROOT, 'common', 'local-dishes.js')
const SEED_FILE = path.join(ROOT, 'uniCloud-aliyun', 'cloudfunctions', 'shiyu-seed', 'index.js')
const MAP_FILE = path.join(HERE, 'dish-image-map.json')

/* ---------------------- 1. 解析本地菜谱：id -> 菜名 ---------------------- */
const localSrc = fs.readFileSync(LOCAL_FILE, 'utf8')
const localDishes = []
for (const m of localSrc.matchAll(/id:\s*'(d\d{3})',\s*name:\s*'([^']+)'/g)) {
  localDishes.push({ id: m[1], name: m[2] })
}
if (localDishes.length !== 40) {
  throw new Error(`本地菜谱解析到 ${localDishes.length} 道，期望 40 道`)
}

/* ---------------------- 2. 解析云端种子：菜名列表 ---------------------- */
const seedSrc = fs.readFileSync(SEED_FILE, 'utf8')
const seedNames = []
// 菜品对象以 name 开头，且同一对象内后续出现 canteen 字段
for (const m of seedSrc.matchAll(/name:\s*'([^']+)',\s*\n\s*price:/g)) {
  seedNames.push(m[1])
}

/* ---------------------- 3. 生成映射 ---------------------- */

// 槽位定义在本地菜谱上（本地 id 就是槽位），保证本地图不变
const map = {}
for (const d of localDishes) {
  map[d.name] = `d${d.id.slice(1)}.jpg`
}

const usedSlots = new Set(Object.values(map))

/**
 * 云端独有的菜品：优先映射到「同菜系的本地菜品」图片槽位，
 * 这样即使没有专属照片，展示的也是同类菜品，不会出现内容错位。
 */
const SIMILAR = {
  水煮肉片: '麻婆豆腐',
  毛血旺: '麻辣香锅',
  辣子鸡: '宫保鸡丁',
  麻辣烫: '麻辣香锅',
  酸辣粉: '重庆小面',
  担担面: '重庆小面',
  炸酱面: '油泼面',
  阳春面: '兰州拉面',
  牛肉拉面: '兰州拉面',
  番茄鸡蛋面: '西红柿鸡蛋面',
  土豆炖牛肉: '红烧排骨',
  香菇滑鸡: '黄焖鸡米饭',
  咖喱鸡肉饭: '咖喱鸡排饭',
  番茄牛腩饭: '红烧排骨',
  红烧牛肉饭: '卤肉饭',
  照烧鸡腿饭: '蜜汁叉烧饭',
  孜然羊肉饭: '孜然羊肉串',
  蜜汁叉烧: '蜜汁叉烧饭',
  蒜蓉蒸虾: '清炒时蔬',
  蒜蓉粉丝娃娃菜: '蒜蓉油麦菜',
  干炒牛河: '广东肠粉',
  肉夹馍: '手抓饼',
  煎饼果子: '手抓饼',
  小笼包: '沙县蒸饺',
  鸡胸肉沙拉: '全麦三明治',
  藜麦蔬菜饭: '全麦三明治',
  牛奶燕麦碗: '水果酸奶杯'
}

const unmapped = []
for (const name of seedNames) {
  if (map[name]) continue
  const similar = SIMILAR[name]
  if (similar && map[similar]) {
    map[name] = map[similar]
    continue
  }
  unmapped.push(name)
}

// 仍无归属的云端菜品：分配空闲槽位，后续可单独补图
let nextFree = 1
for (const name of unmapped) {
  while (usedSlots.has(`d${String(nextFree).padStart(3, '0')}.jpg`)) nextFree++
  const slot = `d${String(nextFree).padStart(3, '0')}.jpg`
  map[name] = slot
  usedSlots.add(slot)
}

const output = {
  note: '菜名 -> 图片文件名（位于 static/dishes/）。本地菜谱与云端种子数据共用本映射，避免按序号编号导致串图。',
  generated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
  total: Object.keys(map).length,
  map
}
fs.writeFileSync(MAP_FILE, JSON.stringify(output, null, 2), 'utf8')

console.log(`映射表已生成：${path.relative(ROOT, MAP_FILE)}（共 ${Object.keys(map).length} 条）`)
if (unmapped.length) {
  console.log(`未找到同类菜的条目（已分配空闲槽位）：${unmapped.join('、')}`)
}

/* ---------------------- 4. 用映射重写两处 image 字段 ---------------------- */

// 本地菜谱：按 id -> 菜名 -> 文件名
let localOut = localSrc.replace(
  /(id:\s*'d\d{3}',\s*name:\s*'([^']+)'[\s\S]{0,400}?)image:\s*'[^']*'/g,
  (whole, head, name) => {
    const file = map[name]
    if (!file) return whole
    return head + `image: 'static/dishes/${file}'`
  }
)
fs.writeFileSync(LOCAL_FILE, localOut, 'utf8')
console.log('已更新 common/local-dishes.js')

// 云端种子：按菜名 -> 文件名
let seedOut = seedSrc.replace(
  /(name:\s*'([^']+)'[\s\S]{0,400}?)image:\s*'[^']*'/g,
  (whole, head, name) => {
    const file = map[name]
    if (!file) return whole
    return head + `image: 'static/dishes/${file}'`
  }
)
fs.writeFileSync(SEED_FILE, seedOut, 'utf8')
console.log('已更新 shiyu-seed/index.js')

/* ---------------------- 5. 校验一致性 ---------------------- */
const checkLocal = [...fs.readFileSync(LOCAL_FILE, 'utf8').matchAll(/name:\s*'([^']+)'[\s\S]{0,400}?image:\s*'static\/dishes\/([^']+)'/g)]
const checkSeed = [...fs.readFileSync(SEED_FILE, 'utf8').matchAll(/name:\s*'([^']+)'[\s\S]{0,400}?image:\s*'static\/dishes\/([^']+)'/g)]

let bad = 0
for (const [, name, file] of checkLocal) {
  const expect = map[name]
  if (expect !== file) { bad++; console.log(`  本地不一致: ${name} 期望 ${expect} 实际 ${file}`) }
}
for (const [, name, file] of checkSeed) {
  const expect = map[name]
  if (expect !== file) { bad++; console.log(`  云端不一致: ${name} 期望 ${expect} 实际 ${file}`) }
}
console.log(`校验完成：本地 ${checkLocal.length} 条 / 云端 ${checkSeed.length} 条，不一致 ${bad} 条`)
