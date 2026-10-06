/**
 * shiyu-agent（可对话推荐 Agent）行为回归测试
 *
 * 用内存假数据库 + 真云函数跑完整对话，验证两件事：
 *   F1 多轮修正：能否记住"第一个是谁"、能否累积约束、能否排除已否掉的菜
 *   F2 矛盾澄清：能否识别用户需求自相矛盾，并给出可单击的选项
 *
 * 为什么必须真跑：这两个功能的正确性全在"多轮状态串联"上，
 * 只做静态检查看不出「第一轮排除的菜第二轮又冒出来」这类问题。
 *
 * 用法：node _test/test-agent.mjs
 */
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')

/* ====================== 内存假数据库 ====================== */

/** 模拟 uniCloud 的查询链：where / limit / field / get / orderBy / skip */
function makeQuery(store, name, cond) {
  const q = {
    _cond: cond || {},
    _limit: 0,
    _field: null,
    where(c) { return makeQuery(store, name, Object.assign({}, this._cond, c)) },
    limit(n) { this._limit = n; return this },
    field() { return this },
    orderBy() { return this },
    skip() { return this },
    async get() {
      let rows = (store[name] || []).filter((d) => matchCond(d, this._cond))
      if (this._limit) rows = rows.slice(0, this._limit)
      return { data: rows.map((r) => JSON.parse(JSON.stringify(r))) }
    },
    async count() {
      return { total: (store[name] || []).filter((d) => matchCond(d, this._cond)).length }
    },
    async update(patch) {
      const rows = (store[name] || []).filter((d) => matchCond(d, this._cond))
      rows.forEach((r) => Object.assign(r, resolvePatch(patch)))
      return { updated: rows.length }
    },
    async remove() {
      const before = (store[name] || []).length
      store[name] = (store[name] || []).filter((d) => !matchCond(d, this._cond))
      return { deleted: before - store[name].length }
    }
  }
  return q
}

/** 简单的条件匹配，支持 db.command 的 lte / inc / exists 标记 */
function matchCond(doc, cond) {
  return Object.keys(cond).every((k) => {
    const want = cond[k]
    const got = doc[k]
    if (want && typeof want === 'object' && want.__op) {
      if (want.__op === 'lte') return Number(got) <= Number(want.value)
      if (want.__op === 'exists') return want.value ? got !== undefined : got === undefined
      return true
    }
    return got === want
  })
}

/** 把 inc 这类更新指令解析成最终值（这里只用到 inc） */
function resolvePatch(patch) {
  const out = {}
  Object.keys(patch).forEach((k) => {
    const v = patch[k]
    if (v && typeof v === 'object' && v.__op === 'inc') out[k] = v.value // 简化：测试里不校验累加值
    else out[k] = v
  })
  return out
}

let idSeq = 1
function makeDb(store) {
  return {
    command: {
      lte: (v) => ({ __op: 'lte', value: v }),
      inc: (n) => ({ __op: 'inc', value: n }),
      exists: (b) => ({ __op: 'exists', value: b })
    },
    collection(name) {
      store[name] = store[name] || []
      const base = makeQuery(store, name, {})
      base.doc = (id) => ({
        async get() { return { data: (store[name] || []).filter((d) => d._id === id) } },
        async update(patch) {
          const row = (store[name] || []).find((d) => d._id === id)
          if (row) Object.assign(row, resolvePatch(patch))
          return { updated: row ? 1 : 0 }
        },
        async remove() {
          store[name] = (store[name] || []).filter((d) => d._id !== id)
          return { deleted: 1 }
        }
      })
      base.add = async (data) => {
        const doc = Object.assign({ _id: 'sess_' + (idSeq++) }, data)
        store[name].push(doc)
        return { id: doc._id }
      }
      return base
    }
  }
}

function makeUniCloud(store) {
  return {
    database: () => makeDb(store),
    httpclient: {
      async request() {
        // 测试里不真的调大模型：抛错让云函数走本地规则兜底
        throw new Error('测试环境不联网')
      }
    }
  }
}

/* ====================== 准备数据 ====================== */

// 用真实菜品数据当候选库，并在内存里赋予 _id
const { LOCAL_DISHES } = await import(
  pathToFileURL(path.join(ROOT, 'common', 'local-dishes.js')).href
)

const store = {
  dishes: LOCAL_DISHES.map((d) => Object.assign({}, d, { _id: d.id, status: 1 })),
  'shiyu-config': [], // 空 = 不配置 Key → 走本地规则，避免依赖网络
  'shiyu-sessions': []
}

globalThis.uniCloud = makeUniCloud(store)

// 加载真云函数（CJS）
const require = createRequire(import.meta.url)
const agent = require(path.join(ROOT, 'uniCloud-aliyun', 'cloudfunctions', 'shiyu-agent', 'index.js'))

/* ====================== 断言工具 ====================== */

let pass = 0
const fails = []
function check(name, cond, extra) {
  if (cond) pass++
  else fails.push(name + (extra ? '  → ' + extra : ''))
}

/* ====================== F1：多轮修正 ====================== */

console.log('=== F1 多轮修正 ===')

// 第 1 轮：说口味 + 预算
const sid = 'test-session-1'
const r1 = await agent.main({ sessionId: sid, text: '想吃辣的，20 元以内' })
check('R1 返回推荐列表', r1.code === 0 && r1.data.type === 'recommend' && r1.data.recommendations.length > 0,
  JSON.stringify(r1).slice(0, 160))
check('R1 记住会话 id 与轮次', r1.data.sessionId === sid && r1.data.turn === 1,
  `sessionId=${r1.data.sessionId} turn=${r1.data.turn}`)

const firstRoundNames = r1.data.recommendations.map((r) => r.name)
const firstDishId = r1.data.recommendations[0].dish_id
console.log('  第1轮推荐：' + firstRoundNames.join(' / '))

// 第 2 轮：只否定"第一个"，这是 F1 最关键的能力（指代解析）
const r2 = await agent.main({ sessionId: sid, text: '第一个太油了' })
const secondRoundIds = r2.data.recommendations.map((r) => r.dish_id)
console.log('  第2轮推荐：' + r2.data.recommendations.map((r) => r.name).join(' / '))

check('R2 被否掉的"第一个"不再出现',
  secondRoundIds.indexOf(firstDishId) < 0,
  `被否掉的 ${firstDishId} 仍在: ${secondRoundIds.join(',')}`)
check('R2 会话里记录了排除项', r2.data.excludedCount >= 1, `excludedCount=${r2.data.excludedCount}`)
check('R2 轮次递增到 2', r2.data.turn === 2, `turn=${r2.data.turn}`)

// 第 3 轮："再便宜点"应该真的把预算压下来（不是原样重推）
const beforeBudget = r2.data.prefSnapshot.budget
const r3 = await agent.main({ sessionId: sid, text: '还是有点贵，再便宜点' })
const afterBudget = r3.data.prefSnapshot.budget
console.log(`  第3轮：预算 ${beforeBudget} → ${afterBudget}，推荐 ` + r3.data.recommendations.map((r) => r.name).join(' / '))

check('R3 "再便宜点"真的下调了预算',
  afterBudget !== null && afterBudget < beforeBudget,
  `${beforeBudget} → ${afterBudget}`)
check('R3 新一批推荐都不超新预算',
  r3.data.recommendations.every((r) => r.price <= afterBudget),
  r3.data.recommendations.map((r) => r.price).join(','))
check('R3 之前否掉的菜依然被排除',
  r3.data.recommendations.map((r) => r.dish_id).indexOf(firstDishId) < 0)

// 第 4 轮：追加忌口，且是"累积"而不是"覆盖"
const r4 = await agent.main({ sessionId: sid, text: '不吃香菜' })
check('R4 忌口被累积进偏好',
  r4.data.prefSnapshot.allergies.indexOf('香菜') >= 0,
  JSON.stringify(r4.data.prefSnapshot.allergies))
check('R4 结果里没有含香菜的菜',
  r4.data.recommendations.every((r) => (r.tags || []).indexOf('香菜') < 0),
  JSON.stringify(r4.data.recommendations.map((r) => [r.name, r.tags])))

// 第 2 轮说过的"太油"必须在后续轮次依然生效（累积，不能被覆盖掉）
check('R4 "太油"的排除在后续轮次依然生效',
  (r4.data.prefSnapshot.excludeTags || []).indexOf('重油') >= 0,
  JSON.stringify(r4.data.prefSnapshot.excludeTags))
check('R4 结果里仍不含重油菜',
  r4.data.recommendations.every((r) => (r.tags || []).indexOf('重油') < 0),
  JSON.stringify(r4.data.recommendations.map((r) => [r.name, r.tags])))

// 光秃秃的口味词也要能识别（用户经常只写"清淡的"）
const plain = await agent.main({ sessionId: 'test-plain-1', text: '清淡的，15 元以内' })
check('R5 无前缀的口味词「清淡的」能被识别',
  (plain.data.prefSnapshot.taste || []).indexOf('清淡') >= 0,
  JSON.stringify(plain.data.prefSnapshot.taste))

/* ====================== 会话隔离 ====================== */

console.log('\n=== 会话隔离 ===')
const other = await agent.main({ sessionId: 'test-session-2', text: '清淡的，10 元以内' })
check('不同 sessionId 互不影响',
  other.data.turn === 1 && other.data.prefSnapshot.allergies.length === 0,
  `turn=${other.data.turn} allergies=${JSON.stringify(other.data.prefSnapshot.allergies)}`)

/* ====================== F2：矛盾澄清 ====================== */

console.log('\n=== F2 矛盾澄清 ===')

// 冲突一：爱吃辣 + 清淡
const c1 = await agent.main({ sessionId: 'test-conflict-1', text: '想吃辣的，但是要清淡一点' })
check('C1 识别出「爱辣 vs 清淡」冲突并先澄清',
  c1.code === 0 && c1.data.type === 'clarify',
  `type=${c1.data.type} question=${c1.data.question || ''}`)
check('C1 给出可单击选项', Array.isArray(c1.data.options) && c1.data.options.length >= 2,
  JSON.stringify(c1.data.options))
check('C1 澄清阶段不返回推荐', !c1.data.recommendations, '不该同时给推荐')
console.log('  提问：' + c1.data.question)
console.log('  说明：' + c1.data.detail)
console.log('  选项：' + c1.data.options.map((o) => o.label).join(' / '))

// 用户选了选项后应该继续推荐，而不是再问一遍同一个问题
const c1answer = await agent.main({
  sessionId: 'test-conflict-1',
  text: '微辣但少油',
  applyOption: { taste: ['辣'], excludeTags: ['重油'] }
})
check('C1 回答后转为推荐而不是重复追问',
  c1answer.data.type === 'recommend' && c1answer.data.recommendations.length > 0,
  `type=${c1answer.data.type}`)
check('C1 采纳了选项：结果不含重油菜',
  c1answer.data.recommendations.every((r) => (r.tags || []).indexOf('重油') < 0),
  JSON.stringify(c1answer.data.recommendations.map((r) => [r.name, r.tags])))

// 冲突二：忌口与"想吃"对撞
const c2 = await agent.main({ sessionId: 'test-conflict-2', text: '想吃牛肉面，但我不吃牛肉' })
check('C2 识别出「想吃牛肉 vs 忌牛肉」冲突',
  c2.data.type === 'clarify' && /牛肉/.test(c2.data.question || ''),
  `type=${c2.data.type} q=${c2.data.question || ''}`)
console.log('  提问：' + c2.data.question)

// 冲突三：超低预算 + 要吃饱
const c3 = await agent.main({ sessionId: 'test-conflict-3', text: '6 元以内，一定要吃饱' })
check('C3 识别出「预算太低 vs 要吃饱」并给出加钱选项',
  c3.data.type === 'clarify' && c3.data.options.length >= 2,
  `type=${c3.data.type} options=${JSON.stringify(c3.data.options && c3.data.options.map((o) => o.label))}`)
console.log('  提问：' + c3.data.question)
console.log('  选项：' + c3.data.options.map((o) => o.label).join(' / '))

/* ====================== 不能瞎问（防误报） ====================== */

console.log('\n=== 不该澄清的场景（防止问错问题）===')
const n1 = await agent.main({ sessionId: 'test-noconflict-1', text: '想吃辣的，20 元以内' })
check('N1 普通需求不该被追问', n1.data.type === 'recommend',
  `type=${n1.data.type} q=${n1.data.question || ''}`)

const n2 = await agent.main({ sessionId: 'test-noconflict-2', text: '清淡的，15 元以内，不要香菜' })
check('N2 口味+忌口并存不是冲突', n2.data.type === 'recommend',
  `type=${n2.data.type} q=${n2.data.question || ''}`)

/* ====================== 结果 ====================== */

console.log('')
console.log(`断言通过: ${pass}`)
if (fails.length) {
  console.log(`断言失败: ${fails.length}`)
  fails.forEach((f) => console.log('  ✗ ' + f))
  process.exitCode = 1
} else {
  console.log('全部通过 ✅（多轮修正、指代解析、约束累积、矛盾澄清、会话隔离均已验证）')
}
