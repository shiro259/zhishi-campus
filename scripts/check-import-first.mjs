/**
 * 一次性校验：确认 @import 令牌位于每个 SCSS 块的第一行（变量使用之前）
 * 用法：node scripts/check-import-first.mjs
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

const files = [
  path.join(ROOT, 'App.vue'),
  ...walk(path.join(ROOT, 'pages')).filter((f) => f.endsWith('.vue')),
  ...walk(path.join(ROOT, 'components')).filter((f) => f.endsWith('.vue'))
]

let ok = 0
const bad = []

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8')
  const m = src.match(/<style[^>]*lang="scss"[^>]*>\r?\n([^\r\n]*)/)
  if (!m) continue
  const first = m[1].trim()
  if (first.startsWith('@import')) ok++
  else bad.push(`${path.relative(ROOT, file)} -> 首行是 ${JSON.stringify(first)}`)
}

console.log(`@import 位于 SCSS 块首行：${ok} 个文件正确`)
if (bad.length) {
  console.log('以下文件首行不是 @import：')
  bad.forEach((b) => console.log('  - ' + b))
  process.exitCode = 1
} else {
  console.log('全部正确 ✅')
}
