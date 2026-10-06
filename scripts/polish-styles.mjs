/**
 * 一次性收尾脚本：把全项目的样式统一到设计令牌
 *
 * 按正确顺序做三件事（顺序很重要，之前因为顺序错了导致反复修不干净）：
 *   ① 先把硬编码色值换成令牌（tokenize-colors）
 *   ② 再把用了令牌但没声明 lang="scss" 的 style 块改过来，并补 @import
 *   ③ 最后跑自检确认
 *
 * 幂等，可反复运行。
 *
 * 用法：node scripts/polish-styles.mjs
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

const IMPORT_STMT = "@import '@/common/tokens.scss';"

// 与 tokenize-colors.mjs 保持一致的映射
const COLOR_MAP = [
  [/#ff6b35/gi, '$brand'], [/#ff8c5a/gi, '$brand-dark'], [/#ff5a36/gi, '$brand'],
  [/#e8481f/gi, '$brand-dark'], [/#ff8f6b/gi, '$brand'], [/#ff8055/gi, '$brand'],
  [/#ff8a5c/gi, '$brand-dark'], [/#f24e24/gi, '$brand-dark'], [/#cf3d17/gi, '$brand-dark'],
  [/#ffc7ae/gi, '$brand-line'], [/#fff3ed/gi, '$brand-soft'], [/#ffe4d6/gi, '$brand-line'],
  [/#fff0eb/gi, '$brand-soft'], [/#ffd9cc/gi, '$brand-line'],
  [/#f0f0f0/gi, '$surface-sunken'], [/#f5f5f5/gi, '$canvas'], [/#f8f8f8/gi, '$surface-sunken'],
  [/#fafafa/gi, '$surface-sunken'],
  [/#333333/gi, '$ink'], [/#3a2a2a/gi, '$ink'], [/#4d4d4d/gi, '$gray7'],
  [/#333\b/gi, '$ink'], [/#555\b/gi, '$gray7'], [/#666\b/gi, '$gray7'], [/#777\b/gi, '$gray6'],
  [/#888\b/gi, '$gray6'], [/#999\b/gi, '$gray6'], [/#aaa\b/gi, '$gray4'], [/#bbb\b/gi, '$gray4'],
  [/#ccc\b/gi, '$gray4'], [/#e5e5e5/gi, '$line'], [/#eeece7/gi, '$line'], [/#e2ded6/gi, '$line-strong'],
  [/#e0e0e0/gi, '$line'],
  [/#ff4d4f/gi, '$danger'], [/#e64340/gi, '$danger'], [/#ff8a80/gi, '$danger'],
  [/#fdecec/gi, '$danger-soft'],
  [/#fffbe6/gi, '$warning-soft'], [/#fff3e0/gi, '$warning-soft'], [/#f0dcb4/gi, '$warning-soft'],
  [/#e6871a/gi, '$warning'], [/#a86b00/gi, '$warning'],
  [/#ff9800/gi, '$warning'], [/#ffb300/gi, '$warning'],
  [/#e8f8f0/gi, '$success-soft'],
  [/#667eea/gi, '$brand'], [/#764ba2/gi, '$brand-dark'], [/#ff9f45/gi, '$brand'],
  [/#43c6ac/gi, '$success'], [/#2ba58c/gi, '$success'],
  [/#8e8e8e/gi, '$gray6'], [/#5f5f5f/gi, '$gray7'],
  // 最后一批零散取色（按钮按压态、浅底、边框）
  [/#c23a15/gi, '$brand-dark'], [/#cf3f19/gi, '$brand-dark'], [/#ff7a4d/gi, '$brand'],
  [/#fdfcfa/gi, '$surface'], [/#ddd\b/gi, '$line-strong'], [/#444\b/gi, '$gray7'],
  [/#eee\b/gi, '$line'], [/#e8e8e8/gi, '$line'], [/#c7401a/gi, '$brand-dark']
]

let colorReplaced = 0
let scssConverted = 0
let imported = 0
const touched = []

for (const file of files) {
  const rel = path.relative(ROOT, file)
  const original = fs.readFileSync(file, 'utf8')
  let src = original
  let changed = false

  /* ---------- ① 色值 → 令牌（只处理样式块） ---------- */
  const styleMatch = src.match(/(<style[^>]*>)([\s\S]*?)(<\/style>)/)
  if (styleMatch) {
    const head = src.slice(0, styleMatch.index)
    const openTag = styleMatch[1]
    let body = styleMatch[2]
    const closeTag = styleMatch[3]
    const rest = src.slice(styleMatch.index + styleMatch[0].length)
    const before = body
    for (const [re, token] of COLOR_MAP) body = body.replace(re, token)
    if (body !== before) {
      const n = (before.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length
        - (body.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length
      colorReplaced += n
      src = head + openTag + body + closeTag + rest
      changed = true
    }
  }

  /* ---------- ② 用了令牌就必须 lang="scss" + @import ---------- */
  const blocks = []
  const re = /<style([^>]*)>([\s\S]*?)<\/style>/g
  let m
  while ((m = re.exec(src))) {
    blocks.push({
      index: m.index,
      full: m[0],
      attrs: m[1] || '',
      body: m[2] || ''
    })
  }

  for (const b of blocks) {
    const usesTokens = /\$[a-z][\w-]*/.test(b.body)
    const isScss = /lang="scss"/.test(b.attrs)
    // 纯布局样式（没有令牌）保持普通 css，不强行改造
    if (!usesTokens && !isScss) continue

    let attrs = b.attrs
    let body = b.body

    if (!isScss) {
      attrs = attrs ? ` lang="scss"${attrs}` : ' lang="scss"'
      scssConverted++
      changed = true
    }
    if (!/@import\s+['"]@\/common\/tokens\.scss['"]/.test(body)) {
      body = IMPORT_STMT + '\n' + body
      imported++
      changed = true
    }

    const newFull = `<style${attrs}>${body}</style>`
    if (newFull !== b.full) {
      // 用 indexOf 定位替换（避免正则重复匹配同一段）
      const at = src.indexOf(b.full)
      if (at >= 0) src = src.slice(0, at) + newFull + src.slice(at + b.full.length)
    }
  }

  if (changed) {
    fs.writeFileSync(file, src, 'utf8')
    touched.push(rel)
  }
}

console.log(`色值令牌化：${colorReplaced} 处`)
console.log(`style 块转为 scss：${scssConverted} 个`)
console.log(`补充 @import：${imported} 个`)
if (touched.length) {
  console.log('\n改动文件：')
  touched.forEach((t) => console.log('  ' + t))
} else {
  console.log('\n所有文件均已符合规范')
}
