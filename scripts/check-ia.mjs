/**
 * 校验信息架构文档与导图是否与代码一致
 *
 * 为什么需要：架构图最容易犯的错是"画得漂亮但跟代码不一致"——
 * 写了不存在的页面、漏了已实现的云函数。这里逐项比对。
 *
 * 用法：node scripts/check-ia.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/* ---------------- 代码里的真实信息 ---------------- */

const pagesJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'pages.json'), 'utf8'))
const realPages = new Set(pagesJson.pages.map((p) => p.path))
const realTabbar = new Set((pagesJson.tabBar.list || []).map((t) => t.pagePath))

const cfDir = path.join(ROOT, 'uniCloud-aliyun', 'cloudfunctions')
const realFns = new Set(
  fs.readdirSync(cfDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(cfDir, d.name, 'index.js')))
    .map((d) => d.name)
)

const dbDir = path.join(ROOT, 'uniCloud-aliyun', 'database')
const realCollections = new Set(
  fs.readdirSync(dbDir)
    .filter((f) => f.endsWith('.schema.json'))
    .map((f) => f.replace('.schema.json', ''))
)

console.log(`代码实际：${realPages.size} 个页面 / ${realFns.size} 个云函数 / ${realCollections.size} 个集合`)
console.log('')

const problems = []

/* ---------------- 1. 校验 Markdown ---------------- */

const md = fs.readFileSync(path.join(ROOT, 'IA.md'), 'utf8')

// Markdown 里出现的页面路径必须真实存在
const mdRoutes = [...md.matchAll(/`(pages\/[a-z0-9-]+\/[a-z0-9-]+)`/g)].map((m) => m[1])
const mdBadRoutes = [...new Set(mdRoutes)].filter((r) => !realPages.has(r))
if (mdBadRoutes.length) problems.push('IA.md 提到了不存在的页面：' + mdBadRoutes.join(', '))

// Markdown 里提到的云函数必须真实存在
// 注意：`shiyu-sessions` 是**集合名**而不是云函数，正则会把两者都抓出来，
// 因此先排除"确实是集合名"的情况，否则会误报。
const mdFns = [...new Set([...md.matchAll(/\b(shiyu-[a-z]+|wechat-login)\b/g)].map((m) => m[1]))]
const mdBadFns = mdFns.filter((f) => !realFns.has(f) && !realCollections.has(f))
if (mdBadFns.length) problems.push('IA.md 提到了不存在的云函数：' + mdBadFns.join(', '))

// Markdown 里提到的集合必须真实存在
const mdCols = [...new Set([...md.matchAll(/`(dishes|reviews|shiyu-sessions|shiyu-config)`/g)].map((m) => m[1]))]
const mdBadCols = mdCols.filter((c) => !realCollections.has(c))
if (mdBadCols.length) problems.push('IA.md 提到了不存在的集合：' + mdBadCols.join(', '))

/* ---------------- 2. 校验导图 HTML 里的脚本语法 ---------------- */

const html = fs.readFileSync(path.join(ROOT, 'IA-mindmap.html'), 'utf8')
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/)
if (!scriptMatch) {
  problems.push('IA-mindmap.html 里没有找到 <script> 块')
} else {
  // 只做语法编译，不执行（里面有 DOM 调用）
  try {
    new vm.Script(scriptMatch[1], { filename: 'IA-mindmap.html<script>' })
    console.log('✅ 导图内联脚本语法通过')
  } catch (e) {
    problems.push('IA-mindmap.html 脚本语法错误：' + e.message)
  }
}

/* ---------------- 3. 导图里提到的页面/云函数 ---------------- */

const htmlRoutes = [...new Set([...html.matchAll(/'(pages\/[a-z0-9-]+\/[a-z0-9-]+)'/g)].map((m) => m[1]))]
const htmlBadRoutes = htmlRoutes.filter((r) => !realPages.has(r))
if (htmlBadRoutes.length) problems.push('导图提到了不存在的页面：' + htmlBadRoutes.join(', '))

const htmlFns = [...new Set([...html.matchAll(/label: '(shiyu-[a-z]+|wechat-login)'/g)].map((m) => m[1]))]
const htmlBadFns = htmlFns.filter((f) => !realFns.has(f) && !realCollections.has(f))
if (htmlBadFns.length) problems.push('导图提到了不存在的云函数：' + htmlBadFns.join(', '))

/* ---------------- 4. 覆盖度：代码里有、文档里没写的 ---------------- */

const documentedRoutes = new Set([...mdRoutes, ...htmlRoutes])
const missingInDoc = [...realPages].filter((p) => !documentedRoutes.has(p))
if (missingInDoc.length) problems.push('以下页面已实现但未写进架构文档：' + missingInDoc.join(', '))

const documentedFns = new Set([...mdFns, ...htmlFns])
// uni-admin 是模板自带的，不属于本项目业务，允许不写
const missingFns = [...realFns].filter((f) => !documentedFns.has(f) && f !== 'uni-admin')
if (missingFns.length) problems.push('以下云函数已实现但未写进架构文档：' + missingFns.join(', '))

/* ---------------- 5. tabBar 标注是否与 pages.json 一致 ---------------- */

const htmlTabRoutes = [...html.matchAll(/route: '(pages\/[a-z0-9-]+\/[a-z0-9-]+)', badge: 'tab'/g)].map((m) => m[1])
const wrongTab = htmlTabRoutes.filter((r) => !realTabbar.has(r))
if (wrongTab.length) problems.push('导图把这些页面标成了 tabBar，但 pages.json 里不是：' + wrongTab.join(', '))
const missedTab = [...realTabbar].filter((r) => !htmlTabRoutes.includes(r))
if (missedTab.length) problems.push('这些 tabBar 页面在导图里没标 tab：' + missedTab.join(', '))

/* ---------------- 结果 ---------------- */

console.log('')
console.log(`Markdown 覆盖页面 ${new Set(mdRoutes).size} 个 / 云函数 ${mdFns.length} 个`)
console.log(`导图覆盖页面 ${htmlRoutes.length} 个 / 云函数 ${htmlFns.length} 个`)
console.log('')

if (problems.length) {
  console.log(`发现 ${problems.length} 项不一致：`)
  problems.forEach((p) => console.log('  ✗ ' + p))
  process.exitCode = 1
} else {
  console.log('架构文档与导图均与代码一致 ✅')
  console.log(`（${realPages.size} 个页面、${realFns.size - 1} 个业务云函数全部覆盖）`)
}
