/**
 * 一次性校验脚本：确认 SCSS 编译前置条件全部满足
 *
 * 1. 每个 <style lang="scss"> 块是否都有 @import '@/common/tokens.scss'
 * 2. 文件编码是否为 UTF-8 且无 BOM（BOM 会导致部分编译器解析异常）
 * 3. 中文是否完好（检测常见的乱码特征，例如被 GBK 误解后的「锟斤拷」式残留）
 * 4. 是否还有 calc() 内嵌 SCSS 插值这类非法 CSS
 *
 * 用法：node scripts/check-scss-ready.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const targets = [
  path.join(ROOT, 'App.vue'),
  ...walk(path.join(ROOT, 'pages')).filter((f) => f.endsWith('.vue')),
  ...walk(path.join(ROOT, 'components')).filter((f) => f.endsWith('.vue'))
]

let problems = []
let styleBlocks = 0
let withImport = 0

for (const file of targets) {
  const rel = path.relative(ROOT, file)
  const buf = fs.readFileSync(file)

  // BOM 检测
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    problems.push(`${rel}: 文件带 UTF-8 BOM，部分编译器会解析异常`)
  }

  const src = buf.toString('utf8')

  // 替换字符（真正的解码失败）才是硬错误
  const badChars = (src.match(/\uFFFD/g) || []).length
  if (badChars) {
    problems.push(`${rel}: 含 ${badChars} 个替换字符（U+FFFD），文件编码已损坏`)
  }

  // 常见乱码特征：GBK 被当作 UTF-8 或反之
  if (/锟斤拷|锟|烫烫|屯屯/.test(src)) {
    problems.push(`${rel}: 疑似中文乱码残留`)
  }

  // 每个 scss 块都要有 @import
  const styleRe = /<style([^>]*lang="scss"[^>]*)>/g
  let m
  while ((m = styleRe.exec(src))) {
    styleBlocks++
    const body = src.slice(m.index + m[0].length)
    const end = body.indexOf('</style>')
    const inner = end === -1 ? body : body.slice(0, end)
    if (/@import\s+['"]@\/common\/tokens\.scss['"]/.test(inner)) withImport++
    else problems.push(`${rel}: 有 <style lang="scss"> 块缺少 @import 令牌`)
  }

  // 非法 CSS：calc() 里直接用 SCSS 插值
  for (const mm of src.matchAll(/calc\([^)]*#\{[^)]*\)/g)) {
    problems.push(`${rel}: calc() 内使用 SCSS 插值会输出无单位值 -> ${mm[0]}`)
  }
}

console.log(`检查 ${targets.length} 个 .vue 文件`)
console.log(`SCSS 块 ${styleBlocks} 个，其中已 @import 令牌 ${withImport} 个`)
console.log('')

// 中文抽样：确认关键文案可正常读取
const samples = [
  ['pages/index/index.vue', '不知道吃啥'],
  ['pages/recommend/recommend.vue', '生成推荐'],
  ['common/tokens.scss', '设计令牌'],
  ['pages/dish-list/dish-list.vue', '食堂']
]
console.log('中文抽样检查：')
for (const [rel, needle] of samples) {
  const p = path.join(ROOT, rel)
  if (!fs.existsSync(p)) { console.log(`  ? ${rel} 不存在`); continue }
  const ok = fs.readFileSync(p, 'utf8').includes(needle)
  console.log(`  ${ok ? '✅' : '❌'} ${rel} 含「${needle}」`)
  if (!ok) problems.push(`${rel}: 未找到预期中文文案「${needle}」`)
}

console.log('')
if (problems.length) {
  console.log(`发现问题 ${problems.length} 项：`)
  problems.forEach((p) => console.log('  - ' + p))
  process.exitCode = 1
} else {
  console.log('SCSS 编译前置条件全部满足 ✅')
}
