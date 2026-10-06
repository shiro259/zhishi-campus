/**
 * 首页 UI 改造自检
 *
 * 改 UI 最大的风险不是「不好看」，而是**悄悄弄丢功能**：
 * 少了一个 @click、漏了一个 {{ }} 字段、图标名写错导致整块不渲染。
 * 所以这里逐项核对，而不是只看编译过不过：
 *
 *   [1] 模板 / 脚本能否编译（@vue/compiler-sfc）
 *   [2] 样式能否编译（sass，模拟 uni.scss 注入 tokens.scss）
 *   [3] 页面逻辑没丢：与 git HEAD 版本对比，脚本里的函数 / 变量一个都不能少
 *   [4] 模板里用到的标识符、调用的函数都还在，且参数没变
 *   [5] 需求里点名的文案 / 结构都在
 *   [6] Icon 组件用的图标名真实存在（写错就是个空白洞）
 *   [7] 设计令牌真的用上了（样式里不再写死颜色 / 圆角）
 *   [8] Banner 资源确实存在，且路径是小程序能读到的
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { parse, compileTemplate, compileScript } from '@vue/compiler-sfc'
import * as sass from 'sass'
import { loadPage, checkLogic } from './lib/page-check.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PAGE = 'pages/index/index.vue'
const read = (p) => readFileSync(join(ROOT, p), 'utf8')

let pass = 0
let fail = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) {
    pass++
    console.log('  PASS  ' + name)
  } else {
    fail++
    console.log('  FAIL  ' + name)
    console.log('        got:  ' + JSON.stringify(got))
    console.log('        want: ' + JSON.stringify(want))
  }
}
const ok = (name, cond, extra) => check(name + (cond ? '' : (extra ? ' → ' + extra : '')), !!cond, true)

const src = read(PAGE)
const head = execFileSync('git', ['show', 'HEAD:' + PAGE], { cwd: ROOT, encoding: 'utf8' })

/* ---------------- [1] 编译 ---------------- */
console.log('\n[1] 模板 / 脚本编译')
const { descriptor, errors } = parse(src, { filename: PAGE })
check('SFC 解析无错误', (errors || []).map((e) => e.message), [])
const tpl = compileTemplate({
  source: descriptor.template.content,
  filename: PAGE,
  id: PAGE,
  compilerOptions: { mode: 'module' }
})
check('模板编译无错误', (tpl.errors || []).map((e) => String(e.message || e)), [])
try {
  compileScript(descriptor, { id: PAGE })
  ok('script setup 编译通过', true)
} catch (e) {
  ok('script setup 编译通过', false, e.message)
}

/* ---------------- [2] 样式编译（含 tokens） ---------------- */
console.log('\n[2] 样式编译（模拟 uni.scss 注入 tokens.scss）')
const styleBlock = (descriptor.styles || []).find((s) => s.scss || s.lang === 'scss')
ok('样式块是 scss（这样才能用设计令牌）', !!styleBlock, '当前不是 lang="scss"')
if (styleBlock) {
  const tokens = read('common/tokens.scss')
  try {
    const out = sass.compileString(tokens + '\n' + styleBlock.content, { style: 'expanded' })
    ok('scss 编译通过（令牌名都真实存在）', out.css.length > 0)
    // 编译结果里应该出现品牌色，说明变量真的被替换进去了
    ok('scss 里 $brand 已解析为 #ff5a36', out.css.includes('#ff5a36'))
    ok('scss 里 $canvas 已解析为 #f7f6f3', out.css.includes('#f7f6f3'))
  } catch (e) {
    ok('scss 编译通过（令牌名都真实存在）', false, e.message)
  }
}

/* ---------------- [3] 逻辑没丢 ---------------- */
console.log('\n[3] 页面逻辑没丢（与 git HEAD 对比脚本）')
const scriptOf = (s) => (s.match(/<script setup>([\s\S]*?)<\/script>/) || [])[1] || ''
const namesIn = (code) => {
  const set = new Set()
  // function xxx / const xxx =  / let xxx =
  for (const m of code.matchAll(/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) set.add(m[1])
  for (const m of code.matchAll(/^\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/gm)) set.add(m[1])
  return set
}
const oldNames = namesIn(scriptOf(head))
const newNames = namesIn(scriptOf(src))

/**
 * 有意删除的标识符（需求明确要求删掉的功能）
 *
 * 不能因为「检查太严」就把删除当成通过：这里必须逐条写清为什么可以删，
 * 其余任何丢失仍然算失败。
 */
const INTENTIONAL_REMOVAL = {
  canteens: '需求：首页删掉「食堂直达」，不再需要食堂列表',
  goCanteen: '需求同上：入口删除后，跳转函数不再被引用'
}
const lost = [...oldNames].filter((n) => !newNames.has(n))
const unexpected = lost.filter((n) => !INTENTIONAL_REMOVAL[n])
console.log(`    HEAD 版本标识符 ${oldNames.size} 个，新版本 ${newNames.size} 个`)
check('原有函数 / 变量一个都没少（有意删除的除外）', unexpected, [])
if (lost.length) {
  console.log('    有意删除：' + lost.map((n) => `${n}（${INTENTIONAL_REMOVAL[n] || '★未说明原因'}）`).join('、'))
}
check('没有「说不清原因」的删除', lost.filter((n) => !INTENTIONAL_REMOVAL[n]), [])
const added = [...newNames].filter((n) => !oldNames.has(n))
console.log('    新增（仅 UI 需要）：' + (added.join('、') || '无'))

/* ---------------- [4] 模板绑定都在 ---------------- */
console.log('\n[4] 模板绑定与调用')
const tplSrc = descriptor.template.content
const handlerCalls = [
  'goSearch', 'goRecommend', 'goDetail(d)', 'pickTaste(t.value)',
  'loadData', 'dishKey(d)', 'formatPrice(d.price)', 'formatRating(d.rating)',
  'formatLocation(d)'
]
handlerCalls.forEach((h) => ok('模板里仍有 ' + h, tplSrc.includes(h)))
ok('食堂直达入口已删除（模板里不再有 goCanteen）', !tplSrc.includes('goCanteen'))

// 模板里用到的标识符（含 v-if / :prop / @事件）必须有定义。
// 这里改用共享实现：自己那份只扫 {{ }}，v-if 里写错变量查不出来 ——
// 迁移入口就因为这个漏检而整块不渲染。
const homePage = loadPage(ROOT, PAGE)
const homeNewNames = new Set()
for (const m of scriptOf(src).matchAll(/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) homeNewNames.add(m[1])
for (const m of scriptOf(src).matchAll(/^\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/gm)) homeNewNames.add(m[1])
checkLogic(homePage, INTENTIONAL_REMOVAL, { ok, check, summary: () => 0 })
const homeImported = []
for (const m of scriptOf(src).matchAll(/import\s+(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]*)\})?\s*from/g)) {
  if (m[1]) homeImported.push(m[1])
  ;(m[2] || '').split(',').forEach((p) => {
    const name = p.trim().split(/\s+as\s+/).pop().trim()
    if (name) homeImported.push(name)
  })
}
console.log('    import 进来的：' + homeImported.join('、'))

/* ---------------- [5] 需求点名的内容 ---------------- */
console.log('\n[5] 需求点名的文案与结构')
const must = [
  ['主标题「食遇校园」', '食遇校园'],
  ['副标题「AI 食堂推荐」', 'AI 食堂推荐'],
  ['小字「不知道吃什么？让 AI 帮你决定」', '不知道吃什么？让 AI 帮你决定'],
  ['搜索 placeholder「搜索菜品、食堂……」', '搜索菜品、食堂……'],
  ['AI 模块标题「不知道吃啥？交给 AI」', '不知道吃啥？交给 AI'],
  ['按钮「立即推荐」', '立即推荐'],
  ['今日热门', '今日热门'],
  ['高分红榜', '高分红榜'],
  ['新品尝鲜', '新品尝鲜']
]
must.forEach(([name, text]) => ok('包含' + name, tplSrc.includes(text)))
ok('「食堂直达」已按需求删除', !tplSrc.includes('食堂直达'))

// 结构顺序：Banner → 搜索 → AI → 今日热门 → 高分红榜 → 新品尝鲜
const order = ['banner-body', 'search-wrap', 'ai-card', 'hot-card', 'rank-list', 'new-grid']
const idx = order.map((c) => tplSrc.indexOf(c))
ok('区块顺序与需求一致（Banner→搜索→AI→热门→红榜→新品）',
  idx.every((v, i) => v > -1 && (i === 0 || v > idx[i - 1])), JSON.stringify(idx))

// 预览图是另外手写的 HTML（不是从模板编译的），必须和页面区块保持一致，
// 否则改了页面忘了改预览，效果图就会骗人
{
  const previewSrc = read('_ui/preview.mjs')
  const titlesIn = (text) => [...text.matchAll(/sec-title-text">([^<]+)</g)].map((m) => m[1])
  const pageSections = titlesIn(tplSrc)
  const previewSections = titlesIn(previewSrc)
  console.log('    页面区块：' + pageSections.join(' / '))
  console.log('    预览区块：' + previewSections.join(' / '))
  check('预览图与页面的区块列表一致（改了页面要同步改预览）', previewSections, pageSections)
}

/* ---------------- [6] 图标名存在 ---------------- */
console.log('\n[6] Icon 图标名')
const iconNames = new Set(
  [...read('common/icons.js').matchAll(/^\s{2}([a-zA-Z]+):/gm)].map((m) => m[1])
)
const usedIcons = [...tplSrc.matchAll(/<Icon[^>]*name="([^"]+)"/g)].map((m) => m[1])
console.log('    用到：' + usedIcons.join('、'))
check('用到的图标名都在 ICONS 里', usedIcons.filter((n) => !iconNames.has(n)), [])
// 原来这些 emoji 是当图标用的（标题前缀、箭头、评分星），全部换成 Icon 组件了
const ICON_EMOJI = ['🏪', '🔥', '🏆', '✨', '🤖', '🔍', '⭐', '›']
check('标题 / 按钮 / 评分里不再用 emoji 当图标', ICON_EMOJI.filter((e) => tplSrc.includes(e)), [])
// 剩下允许的只有两处：问候语里的 👋 与空态插画 🍚（它们是文案/插画，不是图标）
const leftEmoji = [...new Set([...tplSrc.matchAll(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu)].map((m) => m[0]))]
console.log('    模板里剩余 emoji：' + (leftEmoji.join(' ') || '无'))
check('剩余 emoji 只有问候语 👋 与空态插画 🍚', leftEmoji.sort(), ['👋', '🍚'].sort())

/* ---------------- [7] 设计令牌 ---------------- */
console.log('\n[7] 设计令牌')
// 先去掉注释再查 —— 注释里提到旧颜色不算「写死颜色」
const style = (styleBlock ? styleBlock.content : '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
const hardcoded = ['#FF6B35', '#FF8C5A', '#f5f5f5', '#333333', 'color: #333', 'color: #999', 'color: #bbb']
check('样式里不再写死颜色（注释不计）', hardcoded.filter((c) => style.includes(c)), [])
// 「统一卡片圆角」：所有卡片类都必须用同一个令牌，而不是各写各的 rpx
;['.ai-card', '.section', '.state-box'].forEach((cls) => {
  const re = new RegExp(cls.replace('.', '\\.') + '\\s*\\{[\\s\\S]{0,240}?border-radius:\\s*\\$radius-lg')
  ok(`卡片 ${cls} 用 $radius-lg 统一圆角`, re.test(style))
})
// 整张样式表的圆角应当基本走令牌；只允许三类裸值：需求指定的 48rpx（Banner/搜索栏）、
// 不对称角标（NEW 标）、正圆 50%
const radii = [...new Set([...style.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => m[1].trim()))].sort()
console.log('    全部圆角取值：' + radii.join(' | '))
const allowedRaw = ['48rpx', '20rpx 0 20rpx 0', '50%']
check('除 48rpx / 不对称角标 / 正圆外，圆角全部走令牌',
  radii.filter((r) => !r.startsWith('$') && !allowedRaw.includes(r)), [])
ok('Banner / 搜索栏用 48rpx（24px）圆角', style.includes('border-radius: 48rpx'))
ok('Banner 高度 400rpx（≈200px）', /height:\s*400rpx/.test(style))
ok('Banner 上有橙色渐变覆盖层', /\.banner-tint[\s\S]{0,400}?linear-gradient/.test(style))
ok('左侧有压暗层保证白字对比度', /\.banner-scrim[\s\S]{0,400}?linear-gradient/.test(style))

/* ---------------- [8] Banner 资源 ---------------- */
console.log('\n[8] Banner 图片资源')
ok('static/banner/canteen.jpg 存在', existsSync(join(ROOT, 'static/banner/canteen.jpg')))
ok('页面用 localAssetUrl 取图（各端路径都对）', src.includes("localAssetUrl('static/banner/canteen.jpg')"))
const size = existsSync(join(ROOT, 'static/banner/canteen.jpg'))
  ? readFileSync(join(ROOT, 'static/banner/canteen.jpg')).length
  : 0
console.log(`    体积 ${(size / 1024).toFixed(1)} KB`)
ok('Banner 体积 < 150KB（主包只有 2MB）', size > 0 && size < 150 * 1024)
ok('自定义导航栏下留了状态栏内边距', src.includes('statusBarHeight') && /paddingTop/.test(src))

console.log('\n' + (fail === 0 ? '=== ALL PASS ===' : '=== ' + fail + ' FAILED ===') + `  (${pass} passed)`)
process.exit(fail === 0 ? 0 : 1)
