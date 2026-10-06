/**
 * 一次性修复脚本：为所有 SCSS 块补上设计令牌的 @import
 *
 * 背景：uni.scss 的「自动注入」在 HBuilderX 的某些编译链（尤其 H5 + Vite）下不生效，
 * 直接使用 $canvas / $brand 会报 "Undefined variable"。因此每个 <style lang="scss">
 * 块都必须显式 @import 一次令牌文件。
 *
 * 顺带修掉 review.vue 里 calc(#{$gap} + env(...)) 的问题：
 * SCSS 插值 #{$gap} 输出的是 20（不带 rpx 单位），算出来是 calc(20 + env(...))，
 * 是非法 CSS。这里直接改为静态内边距，小程序端兼容性也更好。
 *
 * 用法：node scripts/fix-scss-import.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')

const IMPORT_STMT = "@import '@/common/tokens.scss';\n"

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

let added = 0
let already = 0
let fixedCalc = 0

for (const file of targets) {
  let src = fs.readFileSync(file, 'utf8')
  const rel = path.relative(ROOT, file)
  let changed = false

  // 1) 给每个 <style lang="scss"> 块补 @import（只补还没有的）
  src = src.replace(/<style([^>]*lang="scss"[^>]*)>/g, (whole, attrs) => {
    return whole
  })

  const styleRe = /<style([^>]*lang="scss"[^>]*)>\r?\n/g
  const parts = []
  let lastIndex = 0
  let m
  while ((m = styleRe.exec(src))) {
    const blockStart = m.index + m[0].length
    // 找到该 style 块的结束位置
    const endIdx = src.indexOf('</style>', blockStart)
    if (endIdx === -1) continue
    const body = src.slice(blockStart, endIdx)

    if (/@import\s+['"]@\/common\/tokens\.scss['"]/.test(body)) {
      already++
    } else {
      // 插到块首，保证变量在使用前已定义
      parts.push({ start: blockStart, text: IMPORT_STMT })
      added++
      changed = true
    }
  }

  // 从后往前插入，避免偏移错乱
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]
    src = src.slice(0, p.start) + p.text + src.slice(p.start)
  }

  // 2) 修掉 calc() 里的 SCSS 插值（输出缺单位，属于非法 CSS）
  const calcRe = /calc\(#\{\s*\$[\w-]+\s*\}\s*\+\s*env\(safe-area-inset-bottom\)\)/g
  if (calcRe.test(src)) {
    src = src.replace(
      /padding:\s*\$gap\s+\$gap-page\s+calc\(#\{\s*\$gap\s*\}\s*\+\s*env\(safe-area-inset-bottom\)\);/g,
      'padding: $gap $gap-page 160rpx;'
    )
    fixedCalc++
    changed = true
  }

  if (changed) fs.writeFileSync(file, src, 'utf8')
}

console.log(`补 @import：${added} 个 style 块（已有 ${already} 个）`)
console.log(`修复 calc 插值：${fixedCalc} 处`)
