/**
 * 首页高保真预览图（iPhone 尺寸）
 *
 * 做的是「把页面按真实数据画出来」，不是画一张示意图：
 *   · 结构与 class 直接照抄 pages/index/index.vue 的模板
 *   · 样式直接读该页面的 <style> 块，把 $令牌 换成 tokens.scss 的真实值、rpx 换算成 px
 *   · 数据用 common/local-dishes.js 的真实菜品（榜单口径与 api/index.js 的 rank 一致）
 *   · 图片用 static/dishes 下真实的菜品照片、以及 static/banner 的 Banner 图
 *   · 图标按 components/Icon/Icon.vue 的方式内联成 SVG data URI
 *
 * 然后用 Edge 无头模式截图（375×812 视口 = iPhone X 逻辑尺寸，3 倍图）。
 *
 * 用法：node _ui/preview.mjs
 * 产物：_ui/首页预览.png
 */
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const OUT_PNG = join(ROOT, '_ui', '首页预览.png')
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

const VIEW_W = 375 // iPhone X 逻辑宽度（= 750rpx）
const RPX = VIEW_W / 750 // 1rpx 等于多少 px
const S = 3 // 截图倍率（devicePixelRatio）

/* ---------------- 1. 设计令牌 ---------------- */
const tokenSrc = read('common/tokens.scss')
const tokens = {}
for (const m of tokenSrc.matchAll(/^\$([\w-]+):\s*([^;]+);/gm)) {
  tokens['$' + m[1]] = m[2].trim()
}
console.log(`读到 ${Object.keys(tokens).length} 个设计令牌`)

/* ---------------- 2. 页面样式 → 浏览器可用的 CSS ---------------- */
const pageSrc = read('pages/index/index.vue')
let css = pageSrc.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1]
// $令牌 → 真实值（先长后短，避免 $radius 吃掉 $radius-card）
Object.keys(tokens)
  .sort((a, b) => b.length - a.length)
  .forEach((k) => {
    css = css.split(k).join(tokens[k])
  })
// rpx → px
css = css.replace(/([\d.]+)rpx/g, (_, n) => +(Number(n) * RPX).toFixed(3) + 'px')
if (/\$[\w-]+/.test(css.replace(/\$[^ ]*?=/g, ''))) {
  const left = [...new Set(css.match(/\$[\w-]+/g) || [])]
  if (left.length) {
    console.error('有没解析到的令牌：' + left.join('、'))
    process.exit(1)
  }
}

/* ---------------- 3. 图标（与 Icon.vue 一致的内联 SVG） ---------------- */
const ICONS = {}
for (const m of read('common/icons.js').matchAll(/^\s{2}([a-zA-Z]+):\s*'([^']+)'/gm)) {
  ICONS[m[1]] = m[2]
}
const icon = (name, sizeRpx, color, weight = 1.8) => {
  const size = +(sizeRpx * RPX).toFixed(2)
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="' + color +
    '" stroke-width="' + weight + '" stroke-linecap="round" stroke-linejoin="round"><path d="' +
    ICONS[name] + '"/></svg>'
  return `<img class="icon" style="width:${size}px;height:${size}px" src="data:image/svg+xml,${encodeURIComponent(svg)}">`
}

/* ---------------- 4. 真实数据 ---------------- */
const localSrc = read('common/local-dishes.js').replace(/^export /gm, '')
const { LOCAL_DISHES } = await import(
  'data:text/javascript,' + encodeURIComponent(localSrc + '\nexport { LOCAL_DISHES };')
)
const onSale = LOCAL_DISHES.filter((d) => d.status === 1)
// 与 api/index.js 的 rank() 本地兜底口径保持一致
const hotList = [...onSale].sort((a, b) => b.recommend_count - a.recommend_count).slice(0, 8)
const goodList = [...onSale].sort((a, b) => b.rating - a.rating).slice(0, 6)
const newList = onSale.filter((d) => d.is_new).slice(0, 6)
console.log(`真实数据：今日热门 ${hotList.length} 道，高分红榜 ${goodList.length} 道，新品尝鲜 ${newList.length} 道`)

const fileUrl = (rel) => pathToFileURL(join(ROOT, rel)).href
const dishImg = (d, w, h, radius) => {
  const style = `width:${w * RPX}px;height:${h * RPX}px;border-radius:${radius * RPX}px;`
  const img = d.image && existsSync(join(ROOT, d.image))
    ? `<img src="${fileUrl(d.image)}" style="width:100%;height:100%;object-fit:cover;display:block">`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:${Math.min(w, h) * RPX * 0.52}px">${d.emoji || '🍽️'}</div>`
  return `<div class="dish-image" style="${style}">${img}</div>`
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
const price = (v) => '¥' + (Number(v) % 1 === 0 ? Number(v) : Number(v).toFixed(1))
const rating = (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(1) : '—')
const loc = (d) => [d.canteen, d.floor ? d.floor + '楼' : '', d.window].filter(Boolean).join(' · ')
const mealType = (() => {
  const h = new Date().getHours()
  return h < 10 ? '早餐' : h < 14 ? '午餐' : h < 21 ? '晚餐' : '夜宵'
})()
const greeting = (() => {
  const h = new Date().getHours()
  return h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好'
})()
const TASTES = ['辣', '麻辣', '清淡', '咸香', '甜', '酸']

/* ---------------- 5. 拼 HTML（结构照抄模板） ---------------- */
/**
 * @param {boolean} withText 是否绘制 Banner 上的白色文字
 *   渲染两次：一次正常出图，一次不画文字，用来测量文字底下**真实合成像素**的亮度，
 *   据此算白字对比度（照片平均亮度 192/255 很亮，这一步不能靠估算）。
 */
function buildHtml(withText) {
  const bannerText = withText
    ? `<div class="banner-body">
      <div class="banner-hello"><span class="banner-hello-text">${greeting}，同学 👋</span></div>
      <span class="banner-title">食遇校园</span>
      <span class="banner-sub">AI 食堂推荐</span>
      <span class="banner-slogan">不知道吃什么？让 AI 帮你决定</span>
    </div>`
    : ''
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>食遇校园 · 首页预览</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${VIEW_W}px; background: #f7f6f3; }
  body { -webkit-font-smoothing: antialiased;
         font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
  .icon { display: block; flex-shrink: 0; }
  /* 预览用：模拟 uni-app 的 <text>（行内元素） */
  span { display: inline; }
  ${css}
</style></head>
<body>
<div class="home" style="padding-top:${44}px">

  <!-- 模拟 iOS 状态栏（真机上由系统绘制） -->
  <div style="position:absolute;top:0;left:0;right:0;height:44px;display:flex;align-items:center;
              justify-content:space-between;padding:0 22px;font-size:14px;font-weight:600;color:#14110f">
    <span>9:41</span><span>●●● ▮</span>
  </div>

  <!-- ==================== 顶部视觉 Banner ==================== -->
  <div class="banner">
    <img class="banner-img" src="${fileUrl('static/banner/canteen.jpg')}">
    <div class="banner-scrim"></div>
    <div class="banner-tint"></div>
    ${bannerText}
  </div>

  <!-- ==================== 搜索栏 ==================== -->
  <div class="search-wrap">
    <div class="search-box">
      ${icon('search', 34, '#ff5a36')}
      <span class="search-placeholder">搜索菜品、食堂……</span>
    </div>
  </div>

  <!-- ==================== AI 推荐主入口 ==================== -->
  <div class="ai-card">
    <div class="ai-head">
      <div class="ai-mark">${icon('sparkle', 38, '#ffffff')}</div>
      <div class="ai-headtext">
        <span class="ai-title">不知道吃啥？交给 AI</span>
        <span class="ai-desc">说口味 · 报预算 · 忌口自动规避</span>
      </div>
    </div>
    <div class="ai-facts">
      <span class="ai-fact">现在是${mealType}时间</span>
      <span class="ai-fact">今日口味</span>
      <span class="ai-fact">预算</span>
      <span class="ai-fact">忌口</span>
      <span class="ai-fact">热门排行</span>
    </div>
    <div class="ai-btn">
      <span class="ai-btn-text">立即推荐</span>${icon('right', 34, '#ffffff')}
    </div>
    <div class="quick-area">
      <span class="quick-tip">快捷口味（点一下直接推荐）</span>
      <div class="quick-tags">
        ${TASTES.map((t) => `<span class="quick-tag">${t}</span>`).join('\n        ')}
      </div>
    </div>
  </div>

  <!-- ==================== 今日热门 ==================== -->
  <div class="section">
    <div class="sec-head">
      <div class="sec-title">${icon('fire', 34, '#ff5a36')}<span class="sec-title-text">今日热门</span></div>
      <div class="sec-more"><span class="sec-more-text">查看更多</span>${icon('right', 24, '#8a8580')}</div>
    </div>
    <div class="rail">
      ${hotList.map((d) => `<div class="hot-card">
        ${dishImg(d, 256, 192, 20)}
        <span class="hot-name">${esc(d.name)}</span>
        <div class="hot-meta">
          <span class="hot-price">${price(d.price)}</span>
          <div class="score">${icon('star', 22, '#ff5a36')}<span class="score-text">${rating(d.rating)}</span></div>
        </div>
      </div>`).join('\n      ')}
    </div>
  </div>

  <!-- ==================== 高分红榜 ==================== -->
  <div class="section">
    <div class="sec-head">
      <div class="sec-title">${icon('star', 34, '#ff5a36')}<span class="sec-title-text">高分红榜</span></div>
    </div>
    <div class="rank-list">
      ${goodList.map((d, i) => `<div class="rank-item">
        <span class="rank-num${i < 3 ? ' rank-top' : ''}">${i + 1}</span>
        ${dishImg(d, 112, 112, 16)}
        <div class="rank-info">
          <span class="rank-name">${esc(d.name)}</span>
          <div class="rank-loc">${icon('location', 20, '#b8b2aa')}<span class="rank-loc-text">${esc(loc(d))}</span></div>
          <div class="rank-tags">${(d.tags || []).slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
        </div>
        <div class="rank-right">
          <span class="rank-price">${price(d.price)}</span>
          <div class="score score-right">${icon('star', 22, '#ff5a36')}<span class="score-text">${rating(d.rating)}</span></div>
        </div>
      </div>`).join('\n      ')}
    </div>
  </div>

  <!-- ==================== 新品尝鲜 ==================== -->
  <div class="section">
    <div class="sec-head">
      <div class="sec-title">${icon('bowl', 34, '#ff5a36')}<span class="sec-title-text">新品尝鲜</span></div>
    </div>
    <div class="new-grid">
      ${newList.map((d) => `<div class="new-item">
        <div class="new-thumb">${dishImg(d, 200, 150, 20)}<span class="new-badge">NEW</span></div>
        <span class="new-name">${esc(d.name)}</span>
        <span class="new-price">${price(d.price)}</span>
      </div>`).join('\n      ')}
    </div>
  </div>

  <div style="height:24px"></div>
</div>
</body></html>`
}
const html = buildHtml(true)

const htmlPath = join(ROOT, '_ui', 'preview.html')
writeFileSync(htmlPath, html, 'utf8')
console.log('生成 preview.html（' + (html.length / 1024).toFixed(1) + ' KB）')

/* ---------------- 6. 截图 ---------------- */
if (!existsSync(EDGE)) {
  console.error('没找到 Edge，跳过截图：' + EDGE)
  process.exit(0)
}
const TALL = 3200 // 先按很高的窗口截图，再裁掉多余底色
const shoot = (htmlFile, outFile) =>
  execFileSync(
    EDGE,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      `--force-device-scale-factor=3`,
      `--window-size=${VIEW_W},${TALL}`,
      `--screenshot=${outFile}`,
      pathToFileURL(htmlFile).href
    ],
    { stdio: 'pipe' }
  )

shoot(htmlPath, OUT_PNG)
const meta = await sharp(OUT_PNG).metadata()

// 用 trim 找到内容高度（trimOffsetTop + 高度），但保留完整宽度
const probe = await sharp(readFileSync(OUT_PNG)).trim({ threshold: 2 }).png()
  .toBuffer({ resolveWithObject: true })
const contentH = (probe.info.trimOffsetTop || 0) + probe.info.height
const finalBuf = await sharp(readFileSync(OUT_PNG))
  .extract({ left: 0, top: 0, width: meta.width, height: contentH })
  .png()
  .toBuffer()
writeFileSync(OUT_PNG, finalBuf)
const finalMeta = await sharp(finalBuf).metadata()
console.log(`截图：${meta.width}×${meta.height} → 整页 ${finalMeta.width}×${finalMeta.height}`)
console.log(`  逻辑尺寸 ${Math.round(finalMeta.width / 3)}×${Math.round(finalMeta.height / 3)} pt（iPhone 宽度 375pt，3 倍图）`)

/* ---------------- 7. Banner 白字对比度实测 ---------------- */
// 再渲染一遍「不画文字」的版本，然后用两张图的差异**定位出文字的真实像素范围**，
// 再回到「无文字」图里量那块区域的亮度 —— 比按 padding 估算区域准确得多。
const htmlNoText = join(ROOT, '_ui', 'preview-notext.html')
const pngNoText = join(ROOT, '_ui', 'preview-notext.png')
writeFileSync(htmlNoText, buildHtml(false), 'utf8')
shoot(htmlNoText, pngNoText)
shoot(htmlPath, join(ROOT, '_ui', 'preview-text.png'))

/** 相对亮度（WCAG） */
const relLum = (r, g, b) => {
  const f = (c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const contrastWithWhite = (lum) => 1.05 / (lum + 0.05)

const rawOpt = { resolveWithObject: true }
const A = await sharp(readFileSync(join(ROOT, '_ui', 'preview-text.png'))).raw().toBuffer(rawOpt)
const B = await sharp(readFileSync(pngNoText)).raw().toBuffer(rawOpt)
const W = A.info.width
const bannerTop = Math.round((44 + 8) * S) // 状态栏内边距 + Banner 上外边距
const bannerBottom = bannerTop + Math.round(200 * S)

// 文字 bbox：两张图差异像素的范围（只统计 Banner 区域内的差异）
let minX = W
let maxX = -1
let minY = bannerBottom
let maxY = -1
for (let y = bannerTop; y < bannerBottom; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3
    if (
      Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) +
        Math.abs(A.data[i + 2] - B.data[i + 2]) > 24
    ) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
}
if (maxX < 0) {
  console.error('没能定位到 Banner 文字（两张渲染没有差异？）')
  process.exit(1)
}
console.log(
  `\nBanner 文字实测范围：x ${Math.round(minX / S)}–${Math.round(maxX / S)}pt，` +
    `y ${Math.round(minY / S)}–${Math.round(maxY / S)}pt（Banner 为 y ${Math.round(bannerTop / S)}–${Math.round(bannerBottom / S)}pt）`
)

// 在这块区域里量「无文字」图的背景亮度
const bw = maxX - minX + 1
const bh = maxY - minY + 1
const { data: bg } = await sharp(readFileSync(pngNoText))
  .extract({ left: minX, top: minY, width: bw, height: bh })
  .raw()
  .toBuffer(rawOpt)

const lums = []
for (let i = 0; i + 2 < bg.length; i += 3) lums.push(relLum(bg[i], bg[i + 1], bg[i + 2]))
lums.sort((a, b) => a - b)
const mean = lums.reduce((s, v) => s + v, 0) / lums.length
const p99 = lums[Math.floor(lums.length * 0.99)]
const p999 = lums[Math.floor(lums.length * 0.999)]
const worst = lums[lums.length - 1]

console.log('  背景亮度（文字底下真实像素）：')
console.log(`    平均 ${(mean * 255).toFixed(0)}/255 → 对比度 ${contrastWithWhite(mean).toFixed(2)}:1`)
console.log(`    99% 分位 ${(p99 * 255).toFixed(0)}/255 → ${contrastWithWhite(p99).toFixed(2)}:1`)
console.log(`    99.9% 分位 ${(p999 * 255).toFixed(0)}/255 → ${contrastWithWhite(p999).toFixed(2)}:1`)
console.log(`    最亮像素 ${(worst * 255).toFixed(0)}/255 → ${contrastWithWhite(worst).toFixed(2)}:1`)

// 判定用 99.9% 分位：单个像素的极值受照片高光影响太大，
// 99.9% 分位代表「实际会被大字压住的最亮区域」
const c = contrastWithWhite(p999)
const verdict = c >= 4.5 ? 'AA 正文标准（4.5:1）' : c >= 3 ? 'AA 大字号标准（3:1）' : '不达标'
console.log(`  判定（99.9% 分位）：${verdict}`)
if (c < 3) {
  console.error('  ✗ 白字压在照片最亮处对比度不足，需要进一步加强左侧蒙版')
  process.exitCode = 1
}

console.log(
  `\n产物：_ui/首页预览.png（整页，${Math.round(finalMeta.width / S)}×${Math.round(finalMeta.height / S)}pt 逻辑尺寸的 ${S} 倍图）`
)

// 只留最终产物：中间用的对照图体积很大（每张 2.5MB），预览 html 留着方便排查
for (const f of ['preview-text.png', 'preview-notext.png', 'preview-notext.html']) {
  try {
    rmSync(join(ROOT, '_ui', f))
  } catch (e) {
    // 忽略：文件可能已不存在
  }
}
