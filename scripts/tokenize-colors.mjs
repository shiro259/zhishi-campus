/**
 * 一次性脚本：把 recommend.vue 样式块里遗留的硬编码色值换成设计令牌
 *
 * 这个文件被外部覆盖过多次，恢复后仍残留旧配色。
 * 这里只做「色值 → 令牌」的机械替换，不动任何结构。幂等，可反复运行。
 *
 * 用法：node scripts/tokenize-colors.mjs [相对路径...]
 *       不带参数时处理默认的一组页面
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')

const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['pages/recommend/recommend.vue']

// 旧品牌橙一系列 → 统一到新令牌
const COLOR_MAP = [
  [/#ff6b35/gi, '$brand'],
  [/#ff8c5a/gi, '$brand-dark'],
  [/#ff5a36/gi, '$brand'],
  [/#e8481f/gi, '$brand-dark'],
  // 旧实现里的橙色深浅变体，统一收敛到令牌
  [/#ff8f6b/gi, '$brand'],
  [/#ff8055/gi, '$brand'],
  [/#ff8a5c/gi, '$brand-dark'],
  [/#f24e24/gi, '$brand-dark'],
  [/#cf3d17/gi, '$brand-dark'],
  [/#ffc7ae/gi, '$brand-line'],
  [/#fff3ed/gi, '$brand-soft'],
  [/#ffe4d6/gi, '$brand-line'],
  [/#fff0eb/gi, '$brand-soft'],
  [/#ffd9cc/gi, '$brand-line'],
  // 中性色
  [/#f0f0f0/gi, '$surface-sunken'],
  [/#f5f5f5/gi, '$canvas'],
  [/#f8f8f8/gi, '$surface-sunken'],
  [/#fafafa/gi, '$surface-sunken'],
  [/#333333/gi, '$ink'],
  [/#3a2a2a/gi, '$ink'],
  [/#4d4d4d/gi, '$gray7'],
  [/#333\b/gi, '$ink'],
  [/#555\b/gi, '$gray7'],
  [/#666\b/gi, '$gray7'],
  [/#777\b/gi, '$gray6'],
  [/#888\b/gi, '$gray6'],
  [/#999\b/gi, '$gray6'],
  [/#aaa\b/gi, '$gray4'],
  [/#bbb\b/gi, '$gray4'],
  [/#ccc\b/gi, '$gray4'],
  [/#e5e5e5/gi, '$line'],
  [/#eeece7/gi, '$line'],
  [/#e2ded6/gi, '$line-strong'],
  // 语义色
  [/#ff4d4f/gi, '$danger'],
  [/#e64340/gi, '$danger'],
  [/#ff8a80/gi, '$danger'],
  [/#fdecec/gi, '$danger-soft'],
  [/#fffbe6/gi, '$warning-soft'],
  [/#fff3e0/gi, '$warning-soft'],
  [/#e6871a/gi, '$warning'],
  [/#a86b00/gi, '$warning'],
  [/#f0dcb4/gi, '$warning-soft'],
  [/#e8f8f0/gi, '$success-soft'],
  [/#ff9800/gi, '$warning'],
  [/#ffb300/gi, '$warning'],
  [/#e0e0e0/gi, '$line'],
  // 统计卡曾用的紫/青渐变，统一收敛到中性或品牌色（避免残留"插件市场风"）
  [/#667eea/gi, '$brand'],
  [/#764ba2/gi, '$brand-dark'],
  [/#ff9f45/gi, '$brand'],
  [/#43c6ac/gi, '$success'],
  [/#2ba58c/gi, '$success'],
  [/#8e8e8e/gi, '$gray6'],
  [/#5f5f5f/gi, '$gray7']
]

let total = 0
for (const rel of targets) {
  const full = path.join(ROOT, rel)
  if (!fs.existsSync(full)) {
    console.log(`  跳过（不存在）：${rel}`)
    continue
  }

  const src = fs.readFileSync(full, 'utf8')
  const styleStart = src.indexOf('<style')
  if (styleStart < 0) {
    console.log(`  跳过（无样式块）：${rel}`)
    continue
  }

  const head = src.slice(0, styleStart)
  let style = src.slice(styleStart)
  const before = style

  for (const [re, token] of COLOR_MAP) style = style.replace(re, token)

  if (style === before) {
    console.log(`  无需修改：${rel}`)
    continue
  }

  fs.writeFileSync(full, head + style, 'utf8')
  const replaced = (before.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length
    - (style.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length
  total += replaced
  console.log(`  已替换 ${replaced} 处色值：${rel}`)
}

console.log('')
console.log(`合计替换 ${total} 处`)
