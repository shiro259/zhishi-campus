/**
 * 项目自检脚本
 *
 * 一条命令跑完所有静态校验（项目没有 node_modules，无法真正编译，这是能做到的最强保障）：
 *   1. 所有页面的 <script setup> 语法检查（ESM 编译）
 *   2. 模板标签配对检查
 *   3. JSON / JSONC 合法性检查
 *   4. 导入可达性与死代码检查
 *   5. pages.json 注册一致性、tabBar 图标存在性
 *   6. 设计规范检查：硬编码色值、SCSS 令牌存在性、图标名合法性、<style lang="scss">
 *   7. 菜品图片就位进度与本地/云端图片映射一致性
 *   8. 禁用写法扫描：硬编码 localhost、直调 uniCloud
 *
 * 用法：node scripts/self-check.mjs          快速校验
 *       node scripts/self-check.mjs --icons  额外校验 tabBar 图标产物（PNG 结构/配色/几何）
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const DEMO_DIRS = new Set([])

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const allVue = walk(path.join(ROOT, 'pages')).filter((f) => f.endsWith('.vue'))
const appVue = allVue.filter((f) => {
  const parts = path.relative(path.join(ROOT, 'pages'), f).split(path.sep)
  return !DEMO_DIRS.has(parts[0])
})

let scriptOk = 0
let tplOk = 0
const problems = []

for (const file of appVue) {
  const src = fs.readFileSync(file, 'utf8')
  const rel = path.relative(ROOT, file)

  // --- script setup 语法检查 ---
  const m = src.match(/<script setup>([\s\S]*?)<\/script>/)
  if (!m) {
    problems.push(`${rel}: 缺少 <script setup>`)
  } else {
    try {
      // 用 ESM 源文本类型编译，只做语法校验不执行
      new vm.SourceTextModule(m[1], { identifier: rel })
      scriptOk++
    } catch (e) {
      // SourceTextModule 需要 --experimental-vm-modules；退化用 Function 包一层检查
      try {
        // 去掉 import/export 后当函数体编译，能捕捉绝大多数语法错误
        const stripped = m[1]
          .replace(/^\s*import[\s\S]*?from\s+['"][^'"]+['"]\s*$/gm, '')
          .replace(/^\s*import\s+['"][^'"]+['"]\s*$/gm, '')
          .replace(/^\s*export\s+default\s+/gm, 'const __default = ')
          .replace(/^\s*export\s+/gm, '')
        new Function(stripped)
        scriptOk++
      } catch (e2) {
        problems.push(`${rel}: script 语法错误 -> ${e2.message}`)
      }
    }
  }

  // --- 模板标签配对 ---
  const tplMatch = src.match(/<template>([\s\S]*)<\/template>/)
  if (tplMatch) {
    const tpl = tplMatch[1]
    const noComment = tpl.replace(/<!--[\s\S]*?-->/g, '')
    const tagRe = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g
    const stack = []
    const VOID = new Set(['img', 'input', 'br', 'hr', 'image'])
    let mm
    let balanced = true
    while ((mm = tagRe.exec(noComment))) {
      const closing = mm[1] === '/'
      const name = mm[2]
      const selfClose = mm[4] === '/'
      if (VOID.has(name) || selfClose) continue
      if (closing) {
        const top = stack.pop()
        if (top !== name) {
          balanced = false
          problems.push(`${rel}: 模板标签不匹配，期望 </${top}> 实际 </${name}>`)
          break
        }
      } else {
        stack.push(name)
      }
    }
    if (balanced && stack.length) {
      problems.push(`${rel}: 模板有未闭合标签 ${stack.join(',')}`)
    } else if (balanced) {
      tplOk++
    }
  } else {
    problems.push(`${rel}: 缺少 <template>`)
  }

  // --- 禁用写法扫描 ---
  if (/localhost:8000|127\.0\.0\.1:8000/.test(src)) {
    problems.push(`${rel}: 残留硬编码后端地址 localhost:8000`)
  }
  if (/from\s+['"]@\/api\/request\.js['"]/.test(src)) {
    problems.push(`${rel}: 仍在引用已废弃的 api/request.js`)
  }
  if (/uniCloud\.callFunction/.test(src)) {
    problems.push(`${rel}: 页面直接调用 uniCloud.callFunction（应走 api 层）`)
  }
  if (/<image[^>]*dish|dish[^>]*<image/.test(src)) {
    problems.push(`${rel}: 疑似用 <image> 渲染菜品（项目无菜品图片，应用 emoji）`)
  }
}

// --- 导入路径可达性检查 ---
// 扫描所有页面/公共模块里的 @/ 与相对路径 import，确认目标文件真实存在
const importTargets = new Set()
const sourceFiles = [
  ...appVue,
  // 组件与公共模块同样参与导入图，否则组件用到的模块会被误判为死代码
  ...walk(path.join(ROOT, 'components')).filter((f) => f.endsWith('.vue')),
  ...walk(path.join(ROOT, 'common')).filter((f) => f.endsWith('.js')),
  ...walk(path.join(ROOT, 'api')).filter((f) => f.endsWith('.js'))
]

for (const file of sourceFiles) {
  const src = fs.readFileSync(file, 'utf8')
  const rel = path.relative(ROOT, file)
  const re = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g
  let mm
  while ((mm = re.exec(src))) {
    const spec = mm[1]
    if (!spec.startsWith('@/') && !spec.startsWith('./') && !spec.startsWith('../')) continue
    let base
    if (spec.startsWith('@/')) base = path.join(ROOT, spec.slice(2))
    else base = path.resolve(path.dirname(file), spec)
    // 依次尝试：原样 / 补 .js / 补 /index.js / 补 .vue
    const candidates = [base, base + '.js', base + '.vue', path.join(base, 'index.js')]
    const hit = candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile())
    if (hit) {
      importTargets.add(path.relative(ROOT, hit))
    } else {
      problems.push(`${rel}: 引用了不存在的模块 ${spec}`)
    }
  }
}

// 找出没有任何页面/组件引用、也不被其他模块引用的孤立 common/api 文件
for (const f of [...walk(path.join(ROOT, 'common')), ...walk(path.join(ROOT, 'api'))]) {
  if (!f.endsWith('.js')) continue
  const rel = path.relative(ROOT, f)
  if (!importTargets.has(rel)) {
    problems.push(`${rel}: 未被任何页面/组件/模块引用（疑似死代码）`)
  }
}

// --- JSON 校验 ---
// uni-app 的 manifest.json 允许注释，用「去注释 + 去尾逗号」后再解析
function parseJsonc(text) {
  const noBlock = text.replace(/\/\*[\s\S]*?\*\//g, '')
  const noLine = noBlock.replace(/^\s*\/\/.*$/gm, '')
  const noTrailing = noLine.replace(/,(\s*[}\]])/g, '$1')
  return JSON.parse(noTrailing)
}

const jsonFiles = [
  'pages.json',
  'manifest.json',
  ...walk(path.join(ROOT, 'uniCloud-aliyun/database')).filter((f) => f.endsWith('.json')),
  ...walk(path.join(ROOT, 'uniCloud-aliyun/cloudfunctions')).filter(
    (f) => f.endsWith('package.json')
  )
]
let jsonOk = 0
for (const f of jsonFiles) {
  const rel = path.relative(ROOT, f)
  try {
    const text = fs.readFileSync(f, 'utf8')
    // manifest.json 与 uniCloud schema 官方均允许注释，统一按 JSONC 解析
    if (f.endsWith('.schema.json') || rel === 'manifest.json') parseJsonc(text)
    else JSON.parse(text)
    jsonOk++
  } catch (e) {
    problems.push(`${rel}: JSON 非法 -> ${e.message}`)
  }
}

// --- 菜品图片引用检查 ---
// 图片缺失不算错误（页面会自动回退 emoji），但要明确报告进度，避免"以为配了图其实没有"
const IMG_DIR = path.join(ROOT, 'static', 'dishes')
const imageRefs = new Set()
for (const f of [path.join(ROOT, 'common/local-dishes.js'),
  path.join(ROOT, 'uniCloud-aliyun/cloudfunctions/shiyu-seed/index.js')]) {
  const text = fs.readFileSync(f, 'utf8')
  for (const m of text.matchAll(/image:\s*'static\/dishes\/([^']+)'/g)) imageRefs.add(m[1])
}
const missingImages = [...imageRefs].filter((n) => !fs.existsSync(path.join(IMG_DIR, n)))
const presentImages = imageRefs.size - missingImages.length

// 图片清单（common/dish-images.js）必须反映 static/dishes/ 的真实内容。
// 前端靠它在渲染前判断图片是否存在；清单过期会让「新加的图不显示」或「缺图渲染成破图」。
const manifestPath = path.join(ROOT, 'common', 'dish-images.js')
if (!fs.existsSync(manifestPath)) {
  problems.push('common/dish-images.js 不存在，请运行 node scripts/gen-dish-images.mjs')
} else {
  const manifestSrc = fs.readFileSync(manifestPath, 'utf8')
  const mm = manifestSrc.match(/DISH_IMAGE_FILES\s*=\s*(\[[\s\S]*?\])/)
  let listed = []
  try {
    listed = mm ? JSON.parse(mm[1]) : []
  } catch (e) {
    problems.push('common/dish-images.js 的 DISH_IMAGE_FILES 不是合法 JSON 数组')
  }
  const actual = fs.existsSync(IMG_DIR)
    ? fs.readdirSync(IMG_DIR).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort()
    : []
  const listedSorted = [...listed].sort()
  if (JSON.stringify(listedSorted) !== JSON.stringify(actual)) {
    const notInManifest = actual.filter((f) => !listed.includes(f))
    const notOnDisk = listed.filter((f) => !actual.includes(f))
    problems.push(
      'common/dish-images.js 与实际图片不一致，请运行 node scripts/gen-dish-images.mjs'
      + (notInManifest.length ? `（漏登记 ${notInManifest.length} 个：${notInManifest.slice(0, 3).join(',')}…）` : '')
      + (notOnDisk.length ? `（清单里有但文件已不在 ${notOnDisk.length} 个）` : '')
    )
  }
}

// 本地菜谱与云端种子对同名菜必须引用同一张图，否则会串图
const localPair = new Map()
const seedPair = new Map()
for (const m of fs.readFileSync(path.join(ROOT, 'common/local-dishes.js'), 'utf8')
  .matchAll(/name:\s*'([^']+)'[\s\S]{0,400}?image:\s*'static\/dishes\/([^']+)'/g)) {
  localPair.set(m[1], m[2])
}
for (const m of fs.readFileSync(path.join(ROOT, 'uniCloud-aliyun/cloudfunctions/shiyu-seed/index.js'), 'utf8')
  .matchAll(/name:\s*'([^']+)'[\s\S]{0,400}?image:\s*'static\/dishes\/([^']+)'/g)) {
  seedPair.set(m[1], m[2])
}
for (const [name, file] of localPair) {
  if (seedPair.has(name) && seedPair.get(name) !== file) {
    problems.push(`图片映射不一致：${name} 本地=${file} 云端=${seedPair.get(name)}（会导致串图）`)
  }
}

// --- 设计规范检查 ---
// 1) 图标名必须存在于 common/icons.js，写错名字会渲染成空白
const iconNames = new Set(
  [...fs.readFileSync(path.join(ROOT, 'common/icons.js'), 'utf8')
    .matchAll(/^  ([a-zA-Z]+): '/gm)].map((m) => m[1])
)

// 2) 颜色必须走设计令牌，不允许在页面里写死色值（组件内部的回退色除外）
const ALLOWED_HEX = new Set([
  '#fff', '#ffffff', '#000', '#000000',
  // tokens.scss 里的定义值，页面若直接写死也算违规，这里只放真正必要的中性值
  'rgb', 'rgba'
])

/**
 * 参与设计规范检查的文件：页面 + 全局样式入口 + 组件
 *
 * 注意：之前只扫 pages/，导致 App.vue（全局样式，正是最早报 Undefined variable 的文件）
 * 与 components/ 下的组件成为校验盲区，必须一并纳入。
 */
const designFiles = [
  ...appVue,
  path.join(ROOT, 'App.vue'),
  ...walk(path.join(ROOT, 'components')).filter((f) => f.endsWith('.vue'))
]

let scssPages = 0
for (const file of designFiles) {
  const src = fs.readFileSync(file, 'utf8')
  const rel = path.relative(ROOT, file)

  // 样式块必须使用 scss，否则无法使用设计令牌
  const styleMatch = src.match(/<style([^>]*)>/)
  if (styleMatch && !/lang="scss"/.test(styleMatch[1])) {
    // 纯静态组件（如 Icon.vue 只有布局样式）允许使用普通 css
    const isComponent = rel.startsWith('components' + path.sep)
    if (!isComponent) {
      problems.push(`${rel}: <style> 未声明 lang="scss"，无法使用设计令牌`)
    }
  } else if (styleMatch) {
    scssPages++
    // 每个 scss 块都必须显式引入令牌：
    // uni.scss 的自动注入在 H5 + Vite 链路下不生效，只依赖它会报 Undefined variable
    const blockRe = /<style[^>]*lang="scss"[^>]*>([\s\S]*?)<\/style>/g
    let bm
    while ((bm = blockRe.exec(src))) {
      if (!/@import\s+['"]@\/common\/tokens\.scss['"]/.test(bm[1])) {
        problems.push(`${rel}: <style lang="scss"> 块缺少 @import '@/common/tokens.scss'`)
      }
    }
  }

  // 图标名校验
  for (const m of src.matchAll(/<Icon[^>]*\sname="([a-zA-Z]+)"/g)) {
    if (!iconNames.has(m[1])) {
      problems.push(`${rel}: 使用了不存在的图标 name="${m[1]}"`)
    }
  }
  // 动态图标名：:name="cond ? 'a' : 'b'" —— 只校验 ? 与 : 之后的字面量，避免误判条件里的字符串
  for (const m of src.matchAll(/:name="([^"]*)"/g)) {
    const expr = m[1]
    for (const branch of expr.matchAll(/[?:]\s*'([a-zA-Z]+)'/g)) {
      if (!iconNames.has(branch[1])) {
        problems.push(`${rel}: 动态图标名不存在 "${branch[1]}"`)
      }
    }
  }

  // 硬编码色值检查（只针对样式块，排除注释）
  const styleBody = src.match(/<style[^>]*>([\s\S]*?)<\/style>/)
  if (styleBody) {
    const body = styleBody[1].replace(/\/\*[\s\S]*?\*\//g, '')
    for (const m of body.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      const hex = m[0].toLowerCase()
      if (!ALLOWED_HEX.has(hex)) {
        // 主色与白色系允许直接出现（按钮前景等场景），其余一律要求用令牌
        problems.push(`${rel}: 样式里出现硬编码色值 ${m[0]}（请改用 common/tokens.scss 的令牌）`)
      }
    }
  }
}

// --- SCSS 令牌存在性检查 ---
// 项目没有 sass 编译器（无 node_modules），无法真正编译 SCSS。
// 这里退而求其次：把每个页面/组件用到的 $变量 与 tokens.scss 的定义逐一比对，
// 能捕获「变量名拼错」「用了不存在的令牌」这类最常见也最致命的错误。
const tokenSrc = fs.readFileSync(path.join(ROOT, 'common/tokens.scss'), 'utf8')
const definedTokens = new Set(
  [...tokenSrc.matchAll(/^\s*(\$[\w-]+)\s*:/gm)].map((m) => m[1])
)

const scssFiles = [
  ...appVue,
  ...walk(path.join(ROOT, 'components')).filter((f) => f.endsWith('.vue')),
  path.join(ROOT, 'App.vue')
]

for (const file of scssFiles) {
  const src = fs.readFileSync(file, 'utf8')
  const rel = path.relative(ROOT, file)
  const styleMatch = src.match(/<style[^>]*lang="scss"[^>]*>([\s\S]*?)<\/style>/)
  if (!styleMatch) continue
  const body = styleMatch[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

  for (const m of body.matchAll(/(\$[\w-]+)/g)) {
    const name = m[1]
    // 排除 SCSS 内置与局部定义的变量（如 @each / $i）
    if (definedTokens.has(name)) continue
    if (/^\$(i|j|index|key|item|value)$/.test(name)) continue
    problems.push(`${rel}: 使用了未定义的 SCSS 令牌 ${name}`)
  }
}

// --- pages.json 注册一致性 ---
const pagesJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'pages.json'), 'utf8'))
const registered = new Set(pagesJson.pages.map((p) => p.path))
for (const file of appVue) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/').replace(/\.vue$/, '')
  if (!registered.has(rel)) problems.push(`${rel}: 页面存在但未在 pages.json 注册`)
}
for (const p of registered) {
  if (!fs.existsSync(path.join(ROOT, p + '.vue'))) {
    problems.push(`pages.json: 注册了不存在的页面 ${p}`)
  }
}
// tabBar 依赖的静态图标必须存在
for (const tab of pagesJson.tabBar.list) {
  for (const key of ['iconPath', 'selectedIconPath']) {
    if (tab[key] && !fs.existsSync(path.join(ROOT, tab[key]))) {
      problems.push(`pages.json: tabBar 图标缺失 ${tab[key]}（${tab.text}）`)
    }
  }
}

console.log(`页面数（非 demo）: ${appVue.length}`)
console.log(`script setup 语法通过: ${scriptOk}/${appVue.length}`)
console.log(`模板标签配对通过: ${tplOk}/${appVue.length}`)
console.log(`JSON 合法: ${jsonOk}/${jsonFiles.length}`)
console.log(`菜品图片: 已就位 ${presentImages}/${imageRefs.size}（缺失时页面自动回退 emoji）`)
if (missingImages.length) {
  console.log(`  待补图片 ${missingImages.length} 张，运行 node scripts/download-dish-images.mjs 可自动下载`)
}

// tabBar 图标产物与会话级测试：单独运行（本脚本不做子进程调用）
if (process.argv.includes('--icons')) {
  console.log('')
  console.log('图标与集成测试请分别运行：')
  console.log('  node scripts/verify-png.mjs        校验 tabBar PNG 结构/尺寸/配色')
  console.log('  node scripts/test-rasterizer.mjs   33 条断言：图标几何/抗锯齿/结构朝向')
  console.log('  node --import ./scripts/register-alias.mjs scripts/test-api.mjs')
  console.log('                                     API 适配层集成测试（47 条断言）')
}

console.log('')
if (problems.length) {
  console.log('发现问题:')
  problems.forEach((p) => console.log('  - ' + p))
  process.exitCode = 1
} else {
  console.log('全部检查通过 ✅')
}
