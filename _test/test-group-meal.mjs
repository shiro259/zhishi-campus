/**
 * 多人拼饭算法回归测试
 *
 * 这个功能里"谁能吃"是**安全问题**（忌口判断错 = 过敏同学吃到过敏原），
 * 因此必须真跑算法逐条验证，而不是靠肉眼看代码。
 *
 * 用法：node --import ./scripts/register-alias.mjs _test/test-group-meal.mjs
 */
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const { planGroupMeal, canEat, isMeatDish, FOOD_TAGS } = await import(
  pathToFileURL(path.join(ROOT, 'common', 'group-meal.js')).href
)
const { LOCAL_DISHES } = await import(
  pathToFileURL(path.join(ROOT, 'common', 'local-dishes.js')).href
)

let pass = 0
const fails = []
const check = (name, cond, extra) => {
  if (cond) pass++
  else fails.push(name + (extra ? '  → ' + extra : ''))
}

/* ==================== 1. 基础判定 ==================== */

console.log('=== 1. 单菜判定（安全底线）===')

const mapo = LOCAL_DISHES.find((d) => d.name === '麻婆豆腐')     // tags: 辣,麻辣,下饭,葱,蒜,牛肉
const veg = LOCAL_DISHES.find((d) => d.name === '清炒时蔬')       // tags: 清淡,低卡,养胃
const coriander = LOCAL_DISHES.find((d) => (d.tags || []).includes('香菜'))

check('含牛肉的菜被忌牛肉的人拒绝',
  canEat(mapo, { allergies: ['牛肉'] }).ok === false,
  JSON.stringify(canEat(mapo, { allergies: ['牛肉'] })))
check('拒绝原因说明是哪样食材',
  canEat(mapo, { allergies: ['牛肉'] }).reason.indexOf('牛肉') >= 0,
  canEat(mapo, { allergies: ['牛肉'] }).reason)
check('不含忌口时可以通过',
  canEat(mapo, { allergies: ['海鲜'] }).ok === true)
check('纯素菜能被素食者接受',
  canEat(veg, { vegetarian: true }).ok === true,
  JSON.stringify(canEat(veg, { vegetarian: true })))
check('含肉菜被素食者拒绝',
  canEat(mapo, { vegetarian: true }).ok === false)
check('忌口为此菜标签时才拦截（不该误伤）',
  canEat(veg, { allergies: ['香菜'] }).ok === true)
if (coriander) {
  check('含香菜的菜被忌香菜的人拒绝',
    canEat(coriander, { allergies: ['香菜'] }).ok === false,
    coriander.name + ' tags=' + JSON.stringify(coriander.tags))
}

/* ==================== 2. 素食识别（不能只看标签）=== */

console.log('\n=== 2. 素食识别 ===')
// 这些菜名里带动物性字样，即使 tags 没写荤标签也必须判为荤
const meatByName = ['水煮肉片', '宫保鸡丁', '红烧排骨', '白切鸡', '番茄炒蛋']
meatByName.forEach((name) => {
  const d = LOCAL_DISHES.find((x) => x.name === name)
  if (d) check(`「${name}」判为荤菜`, isMeatDish(d) === true, JSON.stringify(d.tags))
})
const vegByName = ['清炒时蔬', '蒜蓉油麦菜', '酸辣土豆丝']
vegByName.forEach((name) => {
  const d = LOCAL_DISHES.find((x) => x.name === name)
  if (d) check(`「${name}」判为素菜`, isMeatDish(d) === false, JSON.stringify(d.tags))
})

/* ==================== 3. 拼饭主流程 ==================== */

console.log('\n=== 3. 四人拼饭 ===')

const members = [
  { name: '张三', taste: ['辣'], allergies: ['香菜', '内脏'] },
  { name: '李四', taste: ['清淡'], allergies: ['牛肉', '羊肉'] },
  { name: '王五', taste: [], vegetarian: true },
  { name: '赵六', taste: ['辣', '麻辣'], allergies: [] }
]

const plan = planGroupMeal(members, LOCAL_DISHES, { maxItems: 5 })

check('返回了共享菜列表', Array.isArray(plan.shared))
check('返回了部分人可吃的菜', Array.isArray(plan.partial))
check('返回了点菜方案', !!plan.combo && Array.isArray(plan.combo.items))
check('共享菜的覆盖率是 100%',
  plan.shared.every((d) => d.coverage === 100),
  JSON.stringify(plan.shared.map((d) => [d.name, d.coverage])))

// 最关键的安全断言：共享菜必须真的谁都能吃
console.log('\n  共享菜（全员可吃）:')
plan.shared.slice(0, 5).forEach((d) => console.log(`    ${d.name} ¥${d.price} [${d.tags.join(',')}]`))

let sharedViolation = 0
plan.shared.forEach((d) => {
  const dish = LOCAL_DISHES.find((x) => x.id === d.dish_id)
  members.forEach((m) => {
    if (!canEat(dish, m).ok) {
      sharedViolation++
      console.log(`    ✗ 违规：${d.name} 不该被判为"全员可吃"，${m.name} 不能吃（${canEat(dish, m).reason}）`)
    }
  })
})
check('共享菜中没有任何一道违反某人的忌口（安全底线）', sharedViolation === 0, `${sharedViolation} 处违规`)

// 素食者的菜里不能出现荤菜
const vegDishes = plan.shared.filter((d) => {
  const dish = LOCAL_DISHES.find((x) => x.id === d.dish_id)
  return canEat(dish, { vegetarian: true, allergies: [] }).ok
})
check('素食者能吃到的共享菜都是素菜',
  vegDishes.every((d) => {
    const dish = LOCAL_DISHES.find((x) => x.id === d.dish_id)
    return !isMeatDish(dish)
  }),
  JSON.stringify(vegDishes.map((d) => d.name)))

/* ==================== 4. 部分人可吃的菜要标清"谁不能吃" ==================== */

console.log('\n=== 4. 部分人可吃的菜 ===')
plan.partial.slice(0, 4).forEach((d) => {
  const who = d.blockers.map((b) => `${b.memberIndex}号(${b.reason})`).join(' ')
  console.log(`    ${d.name} 覆盖 ${d.coverage}%  不能吃: ${who || '无'}`)
})

check('部分人可吃的菜都标出了不能吃的人与原因',
  plan.partial.every((d) => d.blockers.length > 0 && d.blockers.every((b) => !!b.reason)),
  JSON.stringify(plan.partial.slice(0, 2)))
check('部分人可吃的菜覆盖率都在 1~99 之间',
  plan.partial.every((d) => d.coverage > 0 && d.coverage < 100))

/* ==================== 5. 方案：每个人都要有得吃 ==================== */

console.log('\n=== 5. 点菜方案 ===')
console.log('  ' + plan.summary)
plan.combo.items.forEach((d) => {
  console.log(`    ${d.kind === 'shared' ? '[全员]' : '[部分]'} ${d.name} ¥${d.price}`)
})
console.log('  人均 ¥' + plan.combo.perPerson)
plan.combo.perMember.forEach((pm) => {
  console.log(`    ${pm.memberIndex} 号可吃 ${pm.count} 道: ${pm.dishes.map((x) => x.name).join('、') || '（无）'}`)
})
plan.combo.warnings.forEach((w) => console.log('    ⚠️ ' + w))

check('方案里至少有一道全员可吃的菜（否则不叫拼饭）',
  plan.combo.items.some((d) => d.kind === 'shared'),
  JSON.stringify(plan.combo.items.map((d) => [d.name, d.kind])))
check('方案人数与实际一致', plan.combo.memberCount === members.length)
check('总价 = 各菜价格之和',
  Math.abs(plan.combo.totalPrice - plan.combo.items.reduce((s, d) => s + d.price, 0)) < 0.01,
  `${plan.combo.totalPrice} vs ${plan.combo.items.reduce((s, d) => s + d.price, 0)}`)
check('人均 = 总价 / 人数',
  Math.abs(plan.combo.perPerson - plan.combo.totalPrice / members.length) < 0.1)

/* ==================== 6. 极端场景：有人一道都吃不上 ==================== */

console.log('\n=== 6. 极端场景 ===')

// 全员忌口极其严格，导致没有共享菜
const strict = [
  { name: 'A', allergies: ['香菜', '葱', '蒜', '花生', '海鲜', '牛肉', '羊肉', '内脏', '鸡蛋', '牛奶'] },
  { name: 'B', allergies: ['香菜', '葱', '蒜', '花生', '海鲜', '牛肉', '羊肉', '内脏', '鸡蛋', '牛奶'] }
]
const p2 = planGroupMeal(strict, LOCAL_DISHES)
console.log(`  全员忌口 10 项 → 共享菜 ${p2.shared.length} 道，方案 ${p2.combo.items.length} 道`)
check('全员忌口过多时不会崩溃，且给出提示',
  p2.combo !== null && typeof p2.summary === 'string' && p2.summary.length > 0,
  JSON.stringify(p2.summary))
check('没有共享菜时不会谎报"全员可吃"',
  p2.combo.items.filter((d) => d.kind === 'shared').length === 0 || p2.shared.length > 0)

// 单人也能用（等价于普通推荐）
const single = planGroupMeal([{ name: '我', taste: ['辣'], allergies: ['香菜'] }], LOCAL_DISHES)
check('一个人时也能算出方案（退化可用）',
  single.combo && single.combo.items.length > 0,
  JSON.stringify(single.combo && single.combo.items.length))

// 空输入不崩
check('空成员列表不崩溃', planGroupMeal([], LOCAL_DISHES).shared.length === 0)
check('空菜品列表不崩溃', planGroupMeal(members, []).combo === null)

// 预算提示
const p3 = planGroupMeal(members, LOCAL_DISHES, { maxItems: 5, budgetPerPerson: 5 })
check('人均超预算时给出警告',
  p3.combo.warnings.some((w) => w.indexOf('超出') >= 0),
  JSON.stringify(p3.combo.warnings))

/* ==================== 7. 洞察文案 ==================== */

console.log('\n=== 7. 洞察 ===')
plan.insights.forEach((i) => console.log('  · ' + i))
check('洞察非空且有内容', plan.insights.length >= 2, JSON.stringify(plan.insights))

/* ==================== 8. 两份实现必须完全一致 ==================== */

console.log('\n=== 8. 前端 / 云端两份算法的交叉验证 ===')

// 云函数是 CJS 环境，不能 import 前端 ES module，所以算法存在两份实现
// （common/group-meal.js 与 cloudfunctions/shiyu-group/lib/group-meal.js）。
// 这里用同一批场景同时跑两份，逐字段比对 —— 一旦有人只改了一边，测试立刻失败。
const require = createRequire(import.meta.url)
const serverSide = require(
  path.join(ROOT, 'uniCloud-aliyun', 'cloudfunctions', 'shiyu-group', 'lib', 'group-meal.js')
)

const scenarios = [
  { name: '四人典型', members },
  { name: '全员严格忌口', members: strict },
  { name: '单人', members: [{ name: '我', taste: ['辣'], allergies: ['香菜'] }] },
  {
    name: '有素食+不吃重油',
    members: [
      { name: 'A', taste: ['清淡'], vegetarian: true },
      { name: 'B', taste: ['辣'], noFried: true },
      { name: 'C', allergies: ['花生', '海鲜'] }
    ]
  }
]

/** 把结果压成可比较的字符串（只取会显示给用户的字段） */
function fingerprint(plan) {
  return JSON.stringify({
    summary: plan.summary,
    stats: plan.stats,
    insights: plan.insights,
    shared: plan.shared.map((d) => [d.dish_id, d.name, d.coverage, d.groupScore, d.eaters, d.blockers]),
    partialCount: plan.partial.length,
    combo: plan.combo
      ? {
        items: plan.combo.items.map((d) => [d.dish_id, d.kind, d.price]),
        totalPrice: plan.combo.totalPrice,
        perPerson: plan.combo.perPerson,
        coverageOk: plan.combo.coverageOk,
        warnings: plan.combo.warnings,
        perMember: plan.combo.perMember.map((p) => [p.memberIndex, p.count])
      }
      : null
  })
}

for (const sc of scenarios) {
  const front = planGroupMeal(sc.members, LOCAL_DISHES, { maxItems: 5 })
  const server = serverSide.planGroupMeal(sc.members, LOCAL_DISHES, { maxItems: 5 })
  const same = fingerprint(front) === fingerprint(server)
  check(`「${sc.name}」两份实现结果一致`, same,
    same ? '' : '\n    前端: ' + fingerprint(front).slice(0, 200) + '\n    云端: ' + fingerprint(server).slice(0, 200))
}

// 单菜判定也要一致
const probeDishes = LOCAL_DISHES.slice(0, 15)
const probeMembers = [
  { allergies: ['香菜'] }, { allergies: ['花生', '牛肉'] },
  { vegetarian: true }, { noFried: true }, { allergies: [] }
]
let canEatMismatch = 0
probeDishes.forEach((d) => {
  probeMembers.forEach((m) => {
    const f = canEat(d, m)
    const s = serverSide.canEat(d, m)
    if (f.ok !== s.ok || f.reason !== s.reason) canEatMismatch++
  })
})
check('canEat 判定两份实现完全一致', canEatMismatch === 0, `${canEatMismatch} 处不一致`)

let meatMismatch = 0
LOCAL_DISHES.forEach((d) => {
  if (isMeatDish(d) !== serverSide.isMeatDish(d)) meatMismatch++
})
check('素食判定两份实现完全一致', meatMismatch === 0, `${meatMismatch} 处不一致`)

/* ==================== 结果 ==================== */

console.log('')
console.log(`断言通过: ${pass}`)
if (fails.length) {
  console.log(`断言失败: ${fails.length}`)
  fails.forEach((f) => console.log('  ✗ ' + f))
  process.exitCode = 1
} else {
  console.log('全部通过 ✅（忌口安全、素食识别、共享菜正确性、方案覆盖、极端场景均已验证）')
}
