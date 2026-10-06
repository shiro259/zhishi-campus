/**
 * AI 机器人形象（内联 SVG）自检
 *
 * 我看不到图，所以用栅格化把「它到底画出来了什么」量化验证：
 *
 *   [1] SVG 能被标准渲染器解析（sharp 底层是 librsvg / resvg）—— 解析不了就是空白
 *   [2] 图形不超出 viewBox（超了就是被裁掉一块）
 *   [3] 墨迹覆盖率合理（太低=几乎空白，太高=糊成一团）
 *   [4] 头部区域**同时存在深橙与浅橙** → 确认品牌渐变真的生效（不是退化成纯色）
 *   [5] 面屏区域够白、眼睛足够深 → 缩到 56rpx 当聊天头像时五官还看得清
 *   [6] 五官位置在中间区域（居中不跑偏）
 *
 * 用法：node _ui/check-mascot.mjs
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PAGE = 'components/AiMascot/AiMascot.vue'
const src = readFileSync(join(ROOT, PAGE), 'utf8')

let pass = 0
let fail = 0
const ok = (name, cond, extra) => {
  if (cond) {
    pass++
    console.log('  PASS  ' + name)
  } else {
    fail++
    console.log('  FAIL  ' + name + (extra ? ' → ' + extra : ''))
  }
}

/* ---------- 1. 从组件里取出 SVG 字符串 ---------- */
// 组件里 SVG 是若干段字符串拼起来的，这里把 <script> 里那段拼接当成代码执行，
// 拿到真实的 svg（而不是在检查脚本里重写一遍，避免「检查的和用的不是同一个」）
const script = src.match(/<script setup>([\s\S]*?)<\/script>/)[1]
const blockMatch = script.match(/const svg =([\s\S]*?)\n\nconst dataUri/)
if (!blockMatch) {
  console.error('没能在组件里找到 svg 定义')
  process.exit(1)
}
const svgExpr = blockMatch[1].replace(/;\s*$/, '')
// 提供组件里用到的常量
const env = {
  BRAND: '#ff5a36',
  BRAND_LIGHT: '#ff8f6b',
  FACE: '#fffaf7',
  INK: '#2f2723'
}
// eslint-disable-next-line no-new-func
// 注意：表达式是跨多行的，必须用括号包起来 ——
// `return` 后面直接换行会被自动分号插入（ASI）截断，函数会返回 undefined
const svg = new Function(...Object.keys(env), 'return (' + svgExpr + ')')(...Object.values(env))
console.log(`\n[1] SVG 解析（${svg.length} 字节）`)
ok('取到的是完整 <svg>…</svg>', svg.startsWith('<svg') && svg.trim().endsWith('</svg>'))
ok('用了品牌渐变 linearGradient', svg.includes('<linearGradient') && svg.includes('url(#aiHead)'))
ok('渐变两个色标都是品牌橙系', svg.includes('#ff8f6b') && svg.includes('#ff5a36'))

/* ---------- 2/3/4. 栅格化后量像素 ---------- */
const SIZE = 384 // 3 倍于 128pt 的展示尺寸
let png
try {
  png = await sharp(Buffer.from(svg)).resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
  ok('能被标准渲染器栅格化（否则真机上是空白）', true)
} catch (e) {
  ok('能被标准渲染器栅格化（否则真机上是空白）', false, e.message)
  console.log('\n=== 1 FAILED ===')
  process.exit(1)
}

const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const W = info.width
const H = info.height
const px = (x, y) => {
  const i = (y * W + x) * 4
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] }
}

console.log('\n[2] 图形边界')
let minX = W
let maxX = -1
let minY = H
let maxY = -1
let ink = 0
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (px(x, y).a > 12) {
      ink++
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
}
const coverage = ink / (W * H)
console.log(`    墨迹范围 x ${minX}–${maxX} / y ${minY}–${maxY}（画布 ${W}×${H}）`)
console.log(`    覆盖率 ${(coverage * 100).toFixed(1)}%`)
ok('图形没有超出画布被裁掉', minX > 0 && minY > 0 && maxX < W - 1 && maxY < H - 1)
ok('覆盖率合理（8%~70%，既不是空白也不是糊成一团）', coverage > 0.08 && coverage < 0.7, (coverage * 100).toFixed(1) + '%')

console.log('\n[3] 品牌渐变是否真的生效')
// 头部左右两侧取样：渐变从左上浅橙到右下品牌橙，两侧颜色应当明显不同
const headL = px(Math.round(W * 0.24), Math.round(H * 0.36))
const headR = px(Math.round(W * 0.76), Math.round(H * 0.74))
const diff = Math.abs(headL.r - headR.r) + Math.abs(headL.g - headR.g) + Math.abs(headL.b - headR.b)
console.log(`    头部左上 rgb(${headL.r},${headL.g},${headL.b}) / 右下 rgb(${headR.r},${headR.g},${headR.b})，通道差合计 ${diff}`)
ok('头部左右颜色不同（渐变生效，没有退化成纯色）', diff > 12)
ok('头部色相是橙色系（R 明显大于 B）', headL.r > headL.b + 60 && headR.r > headR.b + 60)

console.log('\n[4] 面屏与五官（缩到 56rpx 当头像也要看得清）')
const face = px(Math.round(W * 0.5), Math.round(H * 0.42))
console.log(`    面屏中心 rgb(${face.r},${face.g},${face.b})`)
ok('面屏足够白（与橙色头部形成对比）', face.r > 235 && face.g > 225 && face.b > 220)

// 面屏内部找最暗的像素 = 眼睛/嘴巴
let darkest = 255
let dark = 0
for (let y = Math.round(H * 0.3); y < Math.round(H * 0.75); y++) {
  for (let x = Math.round(W * 0.25); x < Math.round(W * 0.75); x++) {
    const c = px(x, y)
    if (c.a < 200) continue
    const l = (c.r + c.g + c.b) / 3
    if (l < darkest) darkest = l
    if (l < 120) dark++
  }
}
console.log(`    面屏内最暗像素亮度 ${darkest.toFixed(0)}/255，深色像素 ${dark} 个`)
ok('五官颜色足够深（最暗 < 90）', darkest < 90, darkest.toFixed(0))
ok('五官有足够面积（深色像素 > 300）', dark > 300, String(dark))

console.log('\n[5] 居中与留白')
const cx = (minX + maxX) / 2
const cy = (minY + maxY) / 2
console.log(`    图形中心 (${cx.toFixed(0)}, ${cy.toFixed(0)})，画布中心 (${W / 2}, ${H / 2})`)
ok('水平居中（偏差 < 画布 4%）', Math.abs(cx - W / 2) < W * 0.04)
ok('垂直居中（偏差 < 画布 4%）', Math.abs(cy - H / 2) < H * 0.04)

console.log('\n' + (fail === 0 ? '=== ALL PASS ===' : '=== ' + fail + ' FAILED ===') + `  (${pass} passed)`)
process.exit(fail === 0 ? 0 : 1)
