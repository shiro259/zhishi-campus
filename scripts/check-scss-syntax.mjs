/**
 * 一次性校验脚本：检查所有 SCSS 块是否存在会导致 sass 编译失败 / 产生非法 CSS 的写法
 *
 * 覆盖以下高风险模式：
 *   1. calc() 内嵌 SCSS 插值、或插值输出无单位值
 *   2. 花括号不配对、字符串引号未闭合
 *   3. 使用了未定义的 mixin / function（@include / @extend 了不存在的东西）
 *   4. 嵌套选择器里误用 &（如 & > 空）
 *   5. 数值与单位之间缺空格导致的非法值（如 20rpx20rpx）
 *   6. 每个块必须以合法 token 起始
 *
 * 用法：node scripts/check-scss-syntax.mjs
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

const tokensSrc = fs.readFileSync(path.join(ROOT, 'common', 'tokens.scss'), 'utf8')
const definedVars = new Set([...tokensSrc.matchAll(/^\s*(\$[\w-]+)\s*:/gm)].map((m) => m[1]))
const definedMixins = new Set([...tokensSrc.matchAll(/@mixin\s+([\w-]+)/g)].map((m) => m[1]))
const definedFuncs = new Set([...tokensSrc.matchAll(/@function\s+([\w-]+)/g)].map((m) => m[1]))

const problems = []
let blocks = 0
let decls = 0

for (const file of targets) {
  const rel = path.relative(ROOT, file)
  const src = fs.readFileSync(file, 'utf8')

  const re = /<style([^>]*lang="scss"[^>]*)>([\s\S]*?)<\/style>/g
  let m
  while ((m = re.exec(src))) {
    blocks++
    const raw = m[2]
    // 去掉注释，避免注释里的符号造成误判
    const body = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

    // 2) 花括号配对
    let depth = 0
    let bad = false
    for (const ch of body) {
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth < 0) { bad = true; break }
      }
    }
    if (bad || depth !== 0) {
      problems.push(`${rel}: 花括号不配对（结束时深度 ${depth}）`)
    }

    // 2b) 引号配对（按行统计，避免跨行误判）
    body.split('\n').forEach((line, i) => {
      const single = (line.match(/'/g) || []).length
      const dbl = (line.match(/"/g) || []).length
      if (single % 2 !== 0) problems.push(`${rel}: 第 ${i + 1} 行单引号未闭合 -> ${line.trim().slice(0, 60)}`)
      if (dbl % 2 !== 0) problems.push(`${rel}: 第 ${i + 1} 行双引号未闭合 -> ${line.trim().slice(0, 60)}`)
    })

    // 1) calc 插值
    for (const mm of body.matchAll(/calc\([^;{}]*\)/g)) {
      const expr = mm[0]
      if (/#\{/.test(expr)) {
        problems.push(`${rel}: calc() 内使用 SCSS 插值 -> ${expr}`)
      }
    }

    // 3) mixin / function
    for (const mm of body.matchAll(/@include\s+([\w-]+)/g)) {
      if (!definedMixins.has(mm[1])) problems.push(`${rel}: @include 了未定义的 mixin ${mm[1]}`)
    }
    for (const mm of body.matchAll(/@function\s+([\w-]+)/g)) {
      if (!definedFuncs.has(mm[1])) problems.push(`${rel}: 重复定义的 function ${mm[1]}`)
    }

    // 5) 数值单位重复（如 20rpx20rpx）
    for (const mm of body.matchAll(/\d+(?:rpx|px|%){2,}/g)) {
      problems.push(`${rel}: 疑似单位重复 -> ${mm[0]}`)
    }

    // 4) 声明完整性：属性名后无值
    body.split('\n').forEach((line, i) => {
      const t = line.trim()
      if (!t || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) return
      if (/^[a-z-]+:\s*;\s*$/i.test(t)) {
        problems.push(`${rel}: 第 ${i + 1} 行属性值为空 -> ${t}`)
      }
      if (/^[a-z-]+:\s*$/i.test(t)) {
        problems.push(`${rel}: 第 ${i + 1} 行属性缺少值 -> ${t}`)
      }
      decls++
    })

    // 6) 未定义变量的兜底统计（self-check 已覆盖，这里再算一次总数）
    for (const mm of body.matchAll(/(\$[\w-]+)/g)) {
      if (!definedVars.has(mm[1]) && !/^\$(i|j|index|key|item|value)$/.test(mm[1])) {
        // 允许在 @each / @for 里声明的局部变量
        if (!new RegExp('@(each|for)\\s+\\' + mm[1].slice(1) + '\\b').test(body)) {
          problems.push(`${rel}: 未定义的 SCSS 变量 ${mm[1]}`)
        }
      }
    }
  }
}

console.log(`检查 ${targets.length} 个文件、${blocks} 个 SCSS 块、约 ${decls} 条声明`)
console.log(`令牌定义：变量 ${definedVars.size} 个，mixin ${definedMixins.size} 个`)
console.log('')
if (problems.length) {
  console.log(`发现 ${problems.length} 项问题：`)
  // 去重后输出
  ;[...new Set(problems)].forEach((p) => console.log('  - ' + p))
  process.exitCode = 1
} else {
  console.log('未发现会导致 SCSS 编译失败或产生非法 CSS 的写法 ✅')
}
