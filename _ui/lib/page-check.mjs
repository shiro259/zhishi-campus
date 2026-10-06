/**
 * 页面改造自检的公共部分
 *
 * 首页和对话页的改版检查有大量重复逻辑（编译、逻辑没丢、图标、设计令牌），
 * 抽到这里共用一份 —— 复制粘贴两份检查脚本的话，第三页改版时必然开始走样。
 *
 * 用法：
 *   import { createChecker, loadPage, checkCompile, checkStyle, checkLogic,
 *            checkIcons, checkTokens, extractIcons } from './lib/page-check.mjs'
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { parse, compileTemplate, compileScript } from '@vue/compiler-sfc'
import * as sass from 'sass'

/* ------------------------------ 断言收集 ------------------------------ */

export function createChecker() {
  const state = { pass: 0, fail: 0 }
  const ok = (name, cond, extra) => {
    if (cond) {
      state.pass++
      console.log('  PASS  ' + name)
    } else {
      state.fail++
      console.log('  FAIL  ' + name + (extra !== undefined ? ' → ' + extra : ''))
    }
    return !!cond
  }
  const check = (name, got, want) => {
    const same = JSON.stringify(got) === JSON.stringify(want)
    return ok(name, same, same ? undefined : `got ${JSON.stringify(got)} / want ${JSON.stringify(want)}`)
  }
  const summary = () => {
    console.log(
      '\n' + (state.fail === 0 ? '=== ALL PASS ===' : `=== ${state.fail} FAILED ===`) +
        `  (${state.pass} passed)`
    )
    return state.fail
  }
  return { ok, check, summary }
}

/* ------------------------------ 读取页面 ------------------------------ */

export function loadPage(root, rel) {
  const src = readFileSync(join(root, rel), 'utf8')
  let head = ''
  try {
    // 新页面（还没提交过）会让 git 报 fatal，这里静默忽略 —— 与 HEAD 的对比
    // 对全新文件本来就没有意义，不该在输出里刷一行吓人的报错
    head = execFileSync('git', ['show', 'HEAD:' + rel], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
  } catch (e) {
    head = ''
  }
  const { descriptor, errors } = parse(src, { filename: rel })
  return {
    rel,
    src,
    head,
    descriptor,
    parseErrors: errors || [],
    tplSrc: (descriptor.template && descriptor.template.content) || '',
    script: (src.match(/<script setup>([\s\S]*?)<\/script>/) || [])[1] || '',
    styleBlock: (descriptor.styles || []).find((s) => s.scss || s.lang === 'scss') || null,
    scriptOf: (text) => (text.match(/<script setup>([\s\S]*?)<\/script>/) || [])[1] || ''
  }
}

/* ------------------------------ 编译 ------------------------------ */

export function checkCompile(root, page, c) {
  console.log('\n[编译] 模板 / 脚本 / 样式')
  c.check('SFC 解析无错误', page.parseErrors.map((e) => e.message), [])
  const tpl = compileTemplate({
    source: page.tplSrc,
    filename: page.rel,
    id: page.rel,
    compilerOptions: { mode: 'module' }
  })
  c.check('模板编译无错误', (tpl.errors || []).map((e) => String(e.message || e)), [])
  let scriptOk = true
  let scriptErr = ''
  try {
    compileScript(page.descriptor, { id: page.rel })
  } catch (e) {
    scriptOk = false
    scriptErr = e.message
  }
  c.ok('script setup 编译通过', scriptOk, scriptErr)
}

export function checkStyle(root, page, c) {
  console.log('\n[样式] scss 编译（模拟 uni.scss 注入 tokens.scss）')
  if (!page.styleBlock) {
    c.ok('样式块是 scss（这样才能用设计令牌）', false, '当前不是 lang="scss"')
    return ''
  }
  const tokens = readFileSync(join(root, 'common/tokens.scss'), 'utf8')
  try {
    const out = sass.compileString(tokens + '\n' + page.styleBlock.content, { style: 'expanded' })
    c.ok('scss 编译通过（令牌名都真实存在）', out.css.length > 0)
    c.ok('scss 里 $brand 已解析', out.css.includes('#ff5a36'))
    c.ok('scss 里 $canvas 已解析', out.css.includes('#f7f6f3'))
  } catch (e) {
    c.ok('scss 编译通过（令牌名都真实存在）', false, e.message)
  }
  return page.styleBlock.content
}

/* ------------------------------ 逻辑没丢 ------------------------------ */

const namesIn = (code) => {
  const set = new Set()
  for (const m of code.matchAll(/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) set.add(m[1])
  for (const m of code.matchAll(/^\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/gm)) set.add(m[1])
  return set
}

/**
 * 与 git HEAD 对比，确认重构没有弄丢原有函数 / 变量
 *
 * @param {Object} intentional 有意删除的标识符 → 删除原因。
 *   必须逐条写明原因：不能因为「检查太严」就整体放宽，否则真正的丢失会被一起放过。
 */
export function checkLogic(page, intentional, c) {
  console.log('\n[逻辑] 与 git HEAD 对比脚本（重构不能弄丢功能）')
  const oldNames = namesIn(page.scriptOf(page.head))
  const newNames = namesIn(page.script)
  const lost = [...oldNames].filter((n) => !newNames.has(n))
  const unexplained = lost.filter((n) => !intentional[n])
  console.log(`    HEAD 标识符 ${oldNames.size} 个，现在 ${newNames.size} 个`)
  if (lost.length) {
    console.log(
      '    有意删除：' + lost.map((n) => `${n}（${intentional[n] || '★未说明原因'}）`).join('、')
    )
  }
  c.check('原有函数 / 变量一个都没少（有意删除的除外）', unexplained, [])
  c.check('没有「说不清原因」的删除', unexplained, [])
  const added = [...newNames].filter((n) => !oldNames.has(n))
  console.log('    新增：' + (added.join('、') || '无'))

  // 模板里引用的标识符必须有定义（脚本里定义的，或 import 进来的）
  const imported = new Set()
  for (const m of page.script.matchAll(
    /import\s+(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]*)\})?\s*from/g
  )) {
    if (m[1]) imported.add(m[1])
    ;(m[2] || '').split(',').forEach((p) => {
      const name = p.trim().split(/\s+as\s+/).pop().trim()
      if (name) imported.add(name)
    })
  }
  // 模板里 v-for 的循环变量属于模板局部作用域，自动收集，
  // 而不是手写一份名单 —— 手写的话每加一个 v-for 就要回来补一次
  const localVars = new Set(['true', 'false', 'null', 'undefined'])
  for (const m of page.tplSrc.matchAll(/v-for="\(?([^)"]+?)\)?\s+in\s/g)) {
    m[1].split(',').forEach((v) => {
      const name = v.trim()
      if (name) localVars.add(name)
    })
  }

  // 收集模板里用到的标识符。
  //
  // ⚠️ 必须同时扫描「插值」和「指令/绑定」两处：
  //   曾经只扫了 {{ }}，结果 v-if="某个没定义的变量" 完全查不出来 ——
  //   页面编译通过、但那一块永远不渲染（迁移入口就是这么消失的）。
  //   指令值里常有字符串字面量（:class="{ 'is-fav': ... }"），
  //   所以先把字符串抠掉再取标识符，否则会把 is / fav 当成变量。
  const KEYWORDS = new Set([
    'in', 'of', 'true', 'false', 'null', 'undefined', 'typeof', 'instanceof',
    'new', 'void', 'this', 'return', 'if', 'else', 'await'
  ])
  const used = new Set()
  const collectIds = (expr) => {
    const cleaned = String(expr)
      .replace(/'[^']*'/g, "''")
      .replace(/"[^"]*"/g, '""')
      .replace(/`[^`]*`/g, '``')
      // 去掉对象字面量的键：:class="{ disabled: migrating }" 里的 disabled 不是变量
      .replace(/([{,]\s*)[A-Za-z_$][\w$]*\s*:/g, '$1')
    for (const id of cleaned.matchAll(/([A-Za-z_$][\w$]*)/g)) {
      const name = id[1]
      if (!KEYWORDS.has(name)) used.add(name)
    }
  }
  for (const m of page.tplSrc.matchAll(/\{\{\s*([\s\S]*?)\s*\}\}/g)) collectIds(m[1])
  for (const m of page.tplSrc.matchAll(/(?:^|\s)([:@]|v-)[\w:.-]*="([^"]*)"/gm)) collectIds(m[2])

  const missing = [...used].filter((id) => {
    if (localVars.has(id) || newNames.has(id) || imported.has(id)) return false
    return !new RegExp('\\.' + id + '\\b').test(page.tplSrc)
  })
  c.check('模板里引用的数据都有定义或 import（含 v-if / :prop / @事件 里的）', missing, [])
  return { oldNames, newNames }
}

/* ------------------------------ 图标 / emoji ------------------------------ */

export function extractIconNames(root) {
  const src = readFileSync(join(root, 'common/icons.js'), 'utf8')
  return new Set([...src.matchAll(/^\s{2}([a-zA-Z]+):/gm)].map((m) => m[1]))
}

/**
 * @param {string[]} allowedEmoji 允许出现在文案/插画里的 emoji（不是界面图标）
 */
export function checkIcons(root, page, allowedEmoji, c) {
  console.log('\n[图标] Icon 组件')
  const names = extractIconNames(root)

  // 只取**静态**图标名：<Icon name="xxx">。
  // 必须排除两种干扰：
  //   · :name="e.icon" 这种动态绑定（值是数据，不是图标名）
  //   · uni.showToast({ icon: 'none' }) 里的 icon（那是 toast 的选项，跟图标库无关）
  const used = []
  for (const tag of page.tplSrc.matchAll(/<Icon\b[^>]*>/g)) {
    const m = tag[0].match(/\sname="([^"]+)"/)
    if (m) used.push(m[1])
  }
  const dynBlock = (page.script.match(/const QUICK_ENTRY_META = \{[\s\S]*?\n\}/) || [''])[0]
  const dyn = [...dynBlock.matchAll(/icon:\s*'([^']+)'/g)].map((m) => m[1])
  const all = [...new Set([...used, ...dyn])]
  console.log('    静态：' + (used.join('、') || '无'))
  console.log('    入口卡片映射：' + (dyn.join('、') || '无'))
  c.check('用到的图标名都在 ICONS 里', all.filter((n) => !names.has(n)), [])

  const ICON_EMOJI = ['🤖', '😊', '⭐', '🍜', '🔍', '›', '🏪', '🔥', '🏆', '✨']
  c.check('不再用 emoji 当界面图标', ICON_EMOJI.filter((x) => page.tplSrc.includes(x)), [])
  const left = [...new Set([...page.tplSrc.matchAll(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu)].map((m) => m[0]))]
  console.log('    模板里剩余 emoji：' + (left.join(' ') || '无'))
  c.check('剩余 emoji 都在允许清单里', left.filter((x) => !allowedEmoji.includes(x)), [])
}

/* ------------------------------ 样式文本处理 ------------------------------ */

/**
 * 去掉 CSS 注释
 *
 * 做「规则里有没有某个声明」这类正则检查前必须先去掉注释：
 * 页面里的说明性注释往往很长，会把 { 和声明之间的距离撑开，
 * 让定长窗口的正则莫名其妙匹配不到（这坑踩过一次）。
 */
export function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/* ------------------------------ 设计令牌 ------------------------------ */

export function checkTokens(style, c, opts = {}) {
  console.log('\n[设计令牌]')
  // 注释里提到旧颜色不算「写死颜色」
  const clean = style.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const hardcoded = opts.forbidden || ['#FF6B35', '#FF8C5A', '#f0f0f0', '#333', '#999', '#bbb']
  c.check('样式里不再写死颜色（注释不计）', hardcoded.filter((x) => clean.includes(x)), [])
  const radii = [...new Set([...clean.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => m[1].trim()))].sort()
  console.log('    圆角取值：' + radii.join(' | '))
  const allowedRaw = opts.allowedRaw || []
  c.check(
    '除特殊造型外，圆角全部走令牌',
    radii.filter((r) => !r.startsWith('$') && !allowedRaw.includes(r)),
    []
  )
}
