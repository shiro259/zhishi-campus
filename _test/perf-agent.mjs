/**
 * shiyu-agent 耗时拆解
 *
 * 目的：定位"多轮会话慢"到底慢在哪一段，而不是笼统地"优化"。
 * 做法：内存假数据库 + 假 HTTP（可控制大模型延迟），给每个阶段打点计时。
 *
 * 用法：node _test/perf-agent.mjs
 */
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/* ---------------- 内存假数据库（带调用计数与人为延迟）---------------- */

const store = { dishes: [], 'shiyu-config': [], 'shiyu-sessions': [] }
const dbStats = { calls: 0 }

function q(name, cond = {}) {
  const api = {
    where: (c) => q(name, Object.assign({}, cond, c)),
    limit: () => api,
    field: () => api,
    orderBy: () => api,
    skip: () => api,
    async get() {
      dbStats.calls++
      return { data: store[name].filter((d) => Object.keys(cond).every((k) => d[k] === cond[k])) }
    },
    async count() { dbStats.calls++; return { total: store[name].length } },
    async update() { dbStats.calls++; return { updated: 1 } },
    async remove() { dbStats.calls++; return { deleted: 1 } }
  }
  return api
}

function db() {
  return {
    command: { lte: (v) => v, inc: (n) => n, exists: () => false },
    collection(name) {
      store[name] = store[name] || []
      let idSeq = 1
      const base = q(name)
      base.doc = () => ({
        async get() { dbStats.calls++; return { data: [] } },
        async update() { dbStats.calls++; return { updated: 1 } },
        async remove() { dbStats.calls++; return { deleted: 1 } }
      })
      base.add = async (d) => { dbStats.calls++; store[name].push(Object.assign({ _id: 's' + idSeq++ }, d)); return { id: 'x' } }
      return base
    }
  }
}

/* ---------------- 假大模型：可设置延迟，用来观察端到端耗时 ---------------- */

let llmDelayMs = Number(process.argv[2]) || 12000
let llmCalled = false

function makeUniCloud() {
  return {
    database: () => db(),
    httpclient: {
      async request() {
        llmCalled = true
        await new Promise((r) => setTimeout(r, llmDelayMs))
        // 返回一个"合法"的模型输出，走完整校验路径
        return {
          status: 200,
          data: {
            choices: [{
              message: {
                content: JSON.stringify({
                  recommendations: [{ dish_id: 'd001', reason: '测试理由', match_score: 90 }],
                  summary: '测试总结'
                })
              }
            }]
          }
        }
      }
    }
  }
}

globalThis.uniCloud = makeUniCloud()

/* ---------------- 准备菜品 ---------------- */

const { LOCAL_DISHES } = await import(
  new URL('../common/local-dishes.js', import.meta.url).href
)
store.dishes = LOCAL_DISHES.map((d) => Object.assign({}, d, { _id: d.id, status: 1 }))
// 让大模型配置存在，从而走真实 LLM 分支
store['shiyu-config'].push({ _id: 'cfg', api_key: 'test-key', model: 'test-model' })

const require = createRequire(import.meta.url)
const agent = require(path.join(ROOT, 'uniCloud-aliyun', 'cloudfunctions', 'shiyu-agent', 'index.js'))

/* ---------------- 跑一轮，并看返回里的 elapsed ---------------- */

console.log(`模拟大模型延迟: ${llmDelayMs} ms\n`)

dbStats.calls = 0
const t0 = Date.now()
const r = await agent.main({ sessionId: 'perf1', text: '想吃辣的，20 元以内' })
const wall = Date.now() - t0

console.log('=== 单轮结果 ===')
console.log('  实际耗时:', wall, 'ms')
console.log('  云函数自报 elapsed:', r.data && r.data.elapsed, 'ms')
console.log('  是否调用了大模型:', llmCalled)
console.log('  engine:', r.data && r.data.engine)
console.log('  数据库调用次数:', dbStats.calls)
console.log('')

/* ---------------- 第二轮（会话已存在）---------------- */

dbStats.calls = 0
const t1 = Date.now()
const r2 = await agent.main({ sessionId: 'perf1', text: '第一个太油了' })
const wall2 = Date.now() - t1

console.log('=== 第二轮（会话已存在，应更快）===')
console.log('  实际耗时:', wall2, 'ms')
console.log('  云函数自报 elapsed:', r2.data && r2.data.elapsed, 'ms')
console.log('  数据库调用次数:', dbStats.calls)
console.log('')

/* ---------------- 汇总结论 ---------------- */

const llmOverhead = wall - llmDelayMs
console.log('=== 拆解结论 ===')
console.log(`  大模型本身占用: ${llmDelayMs} ms`)
console.log(`  其余全部开销:   ${llmOverhead} ms（含数据库 ${dbStats.calls} 次调用 + 计算 + 打分）`)
console.log('')

/* ---------------- 超时链路是否自洽 ---------------- */

console.log('=== 超时链路核对 ===')

// 从真实源码里读配置，避免"文档说改好了、代码其实没改"
const apiSrc = fs.readFileSync(path.join(ROOT, 'api', 'index.js'), 'utf8')
const agentSrc = fs.readFileSync(
  path.join(ROOT, 'uniCloud-aliyun', 'cloudfunctions', 'shiyu-agent', 'index.js'), 'utf8')
const agentPkg = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'uniCloud-aliyun', 'cloudfunctions', 'shiyu-agent', 'package.json'), 'utf8'))

const clientAgentTimeout = Number(
  (apiSrc.match(/callCloud\(CLOUD_FN\.agent,[^)]*timeout:\s*(\d+)/) || [])[1] || 8000)
const modelTimeout = Number((agentSrc.match(/AI_TIMEOUT\s*=\s*(\d+)/) || [])[1] || 0)
const cloudFnTimeout = Number(
  (agentPkg['cloudfunction-config'] && agentPkg['cloudfunction-config'].timeout) || 3) * 1000
const promptCandidates = Number((agentSrc.match(/MAX_PROMPT_CANDIDATES\s*=\s*(\d+)/) || [])[1] || 0)
const maxTokens = Number((agentSrc.match(/AI_MAX_TOKENS\s*=\s*(\d+)/) || [])[1] || 0)

console.log(`  客户端调 agent 超时: ${clientAgentTimeout} ms`)
console.log(`  云函数内模型超时:    ${modelTimeout} ms`)
console.log(`  云函数自身超时:      ${cloudFnTimeout} ms`)
console.log(`  候选上限:            ${promptCandidates} 条`)
console.log(`  模型输出上限:        ${maxTokens} tokens`)
console.log('')

let bad = 0
function expect(name, cond, detail) {
  if (cond) {
    console.log('  ✅ ' + name)
  } else {
    bad++
    console.log('  ❌ ' + name + (detail ? '  → ' + detail : ''))
  }
}

expect('客户端超时 > 模型超时（否则模型还没返回就被判超时）',
  clientAgentTimeout > modelTimeout,
  `客户端 ${clientAgentTimeout} 应大于模型 ${modelTimeout}`)

expect('云函数超时 > 客户端超时（留出收尾与回传时间）',
  cloudFnTimeout > clientAgentTimeout,
  `云函数 ${cloudFnTimeout} 应大于客户端 ${clientAgentTimeout}`)

expect('候选数量已收敛到 40 条以内（输入 token 直接影响首字延迟）',
  promptCandidates > 0 && promptCandidates <= 40,
  `当前 ${promptCandidates}`)

expect('模型输出上限已收敛（输出 token 是逐字生成的）',
  maxTokens > 0 && maxTokens <= 1200,
  `当前 ${maxTokens}`)

console.log('')
console.log('=== 端到端判定 ===')
console.log(`  本轮实测耗时: ${wall} ms（模拟模型 ${llmDelayMs} ms）`)
if (wall <= clientAgentTimeout) {
  console.log(`  ✅ 落在客户端 ${clientAgentTimeout} ms 超时之内，不会被误判超时`)
} else {
  console.log(`  ⚠️ 超过客户端 ${clientAgentTimeout} ms —— 模型确实太慢了，建议换更快的模型`)
}

if (bad) {
  console.log('')
  console.log(`超时链路有 ${bad} 项不自洽，需修配置`)
  process.exitCode = 1
} else {
  console.log('')
  console.log('超时链路自洽 ✅')
}
