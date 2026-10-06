/**
 * 菜单页高保真预览图（iPhone 尺寸，两个状态并排）
 *
 * 菜单页是「原生导航栏 + tabBar + 下拉刷新」的普通页面（pages.json 里 nav 标题「食堂菜单」），
 * 所以效果图把状态栏、导航栏、tabBar 一起画出来，否则和真机对不上。
 *
 * 两个状态：
 *   ① 列表态：Banner + 悬浮搜索 + 胶囊筛选 + 大圆角菜品卡（含推荐标签/评分/评价数/收藏）
 *   ② 筛选态：选中「第一食堂 + 川菜」并切换排序、部分卡片已收藏、顶部出现放开筛选提示
 *
 * 数据用真实菜单（含收藏状态、标签推导与页面同一套规则）。
 *
 * 用法：node _ui/preview-dish-list.mjs
 * 产物：_ui/菜单页预览.png
 */
import { writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  S, RPX, reader, loadTokens, loadIcons, buildCss, esc, fileUrl, makeIcon, makeDishImg,
  loadMenu, HTML_HEAD, shoot, trimToContent, measureRegion, diffBBox, reportContrast
} from './lib/preview-common.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PAGE = 'pages/dish-list/dish-list.vue'
const OUT = join(ROOT, '_ui', '菜单页预览.png')
const read = reader(ROOT)

const tokens = loadTokens(ROOT)
const icons = loadIcons(ROOT)
const { css } = buildCss(ROOT, PAGE, tokens)
const icon = makeIcon(icons)
const dishImg = makeDishImg(ROOT)

const menu = await loadMenu(ROOT)
const all = menu.onSale

/* ---------------- 与页面同一套展示规则 ---------------- */
const money = (v) => {
  const n = Number(v)
  if (!isFinite(n)) return '¥--'
  return `¥${n % 1 === 0 ? n : n.toFixed(1)}`
}
const ratingText = (v) => (Number(v) > 0 ? Number(v).toFixed(1) : '暂无')
const reviewText = (d) => {
  const n = Number(d.review_count)
  if (!Number.isFinite(n) || n <= 0) return ''
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k 评价` : `${n} 评价`
}
const dishBadges = (d) => {
  const out = []
  if (d.is_new) out.push({ text: '新品', tone: 'new' })
  if (Number(d.recommend_count) >= 150) out.push({ text: 'AI 热门', tone: 'hot' })
  if (Number(d.rating) >= 4.7) out.push({ text: '高口碑', tone: 'top' })
  return out.slice(0, 2)
}
const loc = (d) => [d.canteen, d.floor ? d.floor + '楼' : '', d.window].filter(Boolean).join(' · ')

const CATEGORIES = []
all.forEach((d) => {
  if (CATEGORIES.indexOf(d.category) < 0) CATEGORIES.push(d.category)
})

/* ---------------- 真机外壳 ---------------- */
const WIFI_SVG =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 12" fill="none" stroke="#14110f" ' +
      'stroke-width="1.6" stroke-linecap="round"><path d="M1.5 4.2a10 10 0 0113 0"/>' +
      '<path d="M4.2 7a6.2 6.2 0 017.6 0"/><circle cx="8" cy="10" r="1" fill="#14110f" stroke="none"/></svg>'
  )
const STATUS_BAR = `
      <div class="sb">
        <span class="sb-time">9:41</span>
        <div class="sb-right">
          <div class="sb-signal"><i></i><i></i><i></i><i></i></div>
          <img class="sb-wifi" src="${WIFI_SVG}">
          <div class="sb-battery"><b></b></div>
        </div>
      </div>`
const NAV_BAR = `
      <div class="nb">
        <span class="nb-title">食堂菜单</span>
        <div class="nb-capsule"><span class="nb-dots">•••</span><span class="nb-sep"></span><span class="nb-ring">◎</span></div>
      </div>`
const TABS = [
  { text: '首页', file: 'home' },
  { text: 'AI 推荐', file: 'ai' },
  { text: '菜单', file: 'dish' },
  { text: '我的', file: 'user' }
]
const TAB_BAR = `
      <div class="tb">
        ${TABS.map((t, i) => {
          const active = i === 2 // 当前页是「菜单」
          return `<div class="tb-item${active ? ' active' : ''}">
          <img class="tb-icon" src="${fileUrl(ROOT, `static/tabbar/${t.file}${active ? '-active' : ''}.png`)}">
          <span class="tb-text">${t.text}</span>
        </div>`
        }).join('')}
      </div>`

/* ---------------- 卡片 ---------------- */
function card(d, fav) {
  return `
        <div class="dish-card">
          <div class="dish-img-wrap">
            ${dishImg(d, 220, 165, 20)}
            <div class="fav-btn${fav ? ' is-fav' : ''}">${icon('heart', 30, fav ? '#ffffff' : '#8a8580')}</div>
          </div>
          <div class="dish-main">
            <div class="dish-title-row"><span class="dish-name">${esc(d.name)}</span></div>
            ${
              dishBadges(d).length
                ? `<div class="dish-badges">${dishBadges(d)
                    .map((b) => `<span class="badge badge-${b.tone}">${b.text}</span>`)
                    .join('')}</div>`
                : ''
            }
            <div class="dish-loc">${icon('location', 20, '#b8b2aa')}<span class="dish-loc-text">${esc(loc(d))}</span></div>
            <div class="dish-tags">${(d.tags || []).slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
            <div class="dish-bottom">
              <span class="dish-price">${money(d.price)}</span>
              <div class="dish-metrics">
                <div class="metric">${icon('star', 22, '#ff5a36')}<span class="metric-strong">${ratingText(d.rating)}</span></div>
                ${reviewText(d) ? `<span class="metric-text">${reviewText(d)}</span>` : ''}
              </div>
            </div>
          </div>
        </div>`
}

function chip(text, iconName, active, extraClass = '') {
  return `<div class="chip${active ? ' active' : ''} ${extraClass}">
    ${iconName ? icon(iconName, 26, active ? '#ff5a36' : '#8a8580') : ''}
    <span class="chip-text">${esc(text)}</span>
    ${iconName ? icon('down', 22, active ? '#ff5a36' : '#b8b2aa') : ''}
  </div>`
}

function sortChip(text, on) {
  return `<div class="chip chip-sort${on ? ' chip-on' : ''}"><span class="chip-text">${esc(text)}</span></div>`
}

/* ---------------- 页面内容 ---------------- */
/** @param {boolean} filterState 是否是「已筛选」的第二个状态 */
function pageBody(filterState, hideBannerText) {
  const hide = hideBannerText ? ' style="visibility:hidden"' : ''
  const rows = filterState ? all.filter((d) => d.canteen === '第一食堂').slice(0, 4) : all.slice(0, 4)
  const favs = filterState ? [0, 2] : [] // 第二个状态里让部分卡片显示已收藏

  return `
    <div class="dish-list-page">
      <div class="banner">
        <div class="banner-body">
          <span class="banner-kicker"${hide}>校园美食探索</span>
          <span class="banner-title"${hide}>今天想吃点什么？</span>
          <span class="banner-sub"${hide}>三个食堂 · 每天都有新发现</span>
          <div class="ai-entry"${hide}>
            <div class="ai-entry-mark">${icon('sparkle', 30, '#ffffff')}</div>
            <div class="ai-entry-text">
              <span class="ai-entry-title">AI 智能推荐</span>
              <span class="ai-entry-sub">说口味 · 报预算 · 忌口自动规避</span>
            </div>
            ${icon('right', 28, '#ffffff')}
          </div>
        </div>
      </div>

      <div class="search-wrap">
        <div class="search-box">
          ${icon('search', 32, '#ff5a36')}
          <span class="search-ph">${filterState ? '麻婆豆腐' : '搜菜名、口味、窗口'}</span>
          ${filterState ? `<div class="search-clear">${icon('close', 26, '#b8b2aa')}</div>` : ''}
        </div>
        <div class="search-btn"><span class="search-btn-text">搜索</span></div>
      </div>

      <div class="filter-row">
        <div class="filter-picker">${chip(filterState ? '第一食堂' : '全部食堂', 'location', filterState)}</div>
        <div class="filter-picker">${chip(filterState ? '川菜' : '全部分类', 'filter', filterState)}</div>
      </div>

      <div class="sort-row">
        ${sortChip('默认', !filterState)}
        ${sortChip('评分优先', filterState)}
        ${sortChip('价格从低到高', false)}
      </div>

      <div class="dish-list">
        ${filterState ? `<div class="relax-tip"><span class="relax-tip-text">搜索已自动放开食堂 / 分类筛选</span></div>` : ''}
        <div class="list-count"><span>共 ${filterState ? 12 : 40} 道菜品</span></div>
        ${rows.map((d, i) => card(d, favs.indexOf(i) >= 0)).join('')}
        <div class="list-footer"><span>上拉加载更多</span></div>
      </div>
    </div>`
}

/* ---------------- 拼设计稿 ---------------- */
const PHONE_W = 375
const PHONE_H = 812
const CHROME_H = 44 + 44 + 83

const phone = (caption, body) => `
    <div class="col">
      <div class="phone">
        ${STATUS_BAR}
        ${NAV_BAR}
        <div class="screen" style="height:${PHONE_H - CHROME_H}px">${body}</div>
        ${TAB_BAR}
      </div>
      <div class="cap">${caption}</div>
    </div>`

function buildHtml(hideBannerText) {
  return (
    HTML_HEAD(
      css,
      `
  * { box-sizing: border-box; }
  .stage { display: flex; gap: 26px; padding: 26px; background: #e9e6e0; align-items: flex-start; }
  .col { width: ${PHONE_W}px; }
  .phone { width: ${PHONE_W}px; height: ${PHONE_H}px; background: #f7f6f3; border-radius: 30px;
           overflow: hidden; box-shadow: 0 18px 50px rgba(20,17,15,.22); display: flex; flex-direction: column; }
  .cap { text-align: center; font-size: 13px; color: #6b6560; margin-top: 14px; font-weight: 500; }
  .screen { overflow: hidden; }

  .sb { height: 44px; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
        padding: 0 22px; font-size: 14px; font-weight: 600; color: #14110f; background: #f7f6f3; }
  .sb-time { letter-spacing: .3px; }
  .sb-right { display: flex; align-items: center; gap: 6px; }
  .sb-signal { display: flex; align-items: flex-end; gap: 2px; }
  .sb-signal i { width: 3px; background: #14110f; border-radius: 1px; display: block; }
  .sb-signal i:nth-child(1) { height: 4px; } .sb-signal i:nth-child(2) { height: 6px; }
  .sb-signal i:nth-child(3) { height: 8px; } .sb-signal i:nth-child(4) { height: 10px; }
  .sb-wifi { width: 15px; height: 11px; }
  .sb-battery { width: 24px; height: 12px; border: 1.5px solid rgba(20,17,15,.45); border-radius: 3.5px; padding: 1.5px; }
  .sb-battery b { display: block; height: 100%; width: 72%; background: #14110f; border-radius: 1.5px; }

  .nb { height: 44px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
        position: relative; background: #f7f6f3; }
  .nb-title { font-size: 16px; font-weight: 600; color: #14110f; }
  .nb-capsule { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); width: 78px; height: 30px;
                border: 1px solid rgba(20,17,15,.1); border-radius: 15px; background: rgba(255,255,255,.72);
                display: flex; align-items: center; justify-content: space-around; }
  .nb-dots { font-size: 11px; color: #14110f; letter-spacing: .5px; }
  .nb-sep { width: 1px; height: 16px; background: rgba(20,17,15,.1); }
  .nb-ring { font-size: 13px; color: #14110f; }

  .tb { height: 83px; flex-shrink: 0; padding-top: 9px; display: flex; background: #fff; border-top: 1px solid #eeece7; }
  .tb-item { flex: 1; display: flex; flex-direction: column; align-items: center; }
  .tb-icon { width: 26px; height: 26px; }
  .tb-text { font-size: 10px; color: #8a8580; margin-top: 3px; }
  .tb-item.active .tb-text { color: #ff5a36; }

  /* 页面里用 flex 的元素补齐浏览器下的布局 */
  .search-wrap, .search-box, .filter-row, .sort-row, .chip, .ai-entry, .ai-entry-mark,
  .dish-card, .dish-img-wrap, .dish-main, .dish-title-row, .dish-badges, .dish-loc,
  .dish-tags, .dish-bottom, .dish-metrics, .metric, .fav-btn, .state-box, .state-mark
    { display: flex; }
  .dish-main { flex-direction: column; }
  .fav-btn { align-items: center; justify-content: center; }
  .dish-metrics, .metric, .dish-loc { align-items: center; }
  .chip { align-items: center; justify-content: center; }
  .dish-tags, .dish-badges { flex-wrap: wrap; }
  .ai-entry { align-items: center; }
  .ai-entry-mark { align-items: center; justify-content: center; }
  .search-wrap, .search-box, .filter-row, .sort-row, .ai-entry, .fav-btn, .dish-title-row, .dish-bottom { align-items: center; }
  /* 预览里不需要下拉刷新动画占位 */
  .dish-list-page { min-height: auto; }
`
    ) +
    `<div class="stage">
    ${phone('① 美食探索 · 默认列表', pageBody(false, hideBannerText))}
    ${phone('② 筛选 + 排序 + 收藏', pageBody(true, hideBannerText))}
  </div>
</body></html>`
  )
}

/* ---------------- 截图 ---------------- */
const STAGE_W = 26 * 3 + PHONE_W * 2
const htmlPath = join(ROOT, '_ui', 'preview-dish-list.html')
writeFileSync(htmlPath, buildHtml(false), 'utf8')
shoot(htmlPath, OUT, { width: STAGE_W, tall: 1000 })
const size = await trimToContent(OUT)
console.log(`截图：${size.width}×${size.height}（两个 ${PHONE_W}×${PHONE_H}pt 屏幕并排，${S} 倍图）`)

/* ---------------- Banner 文字对比度实测 ---------------- */
const htmlNoText = join(ROOT, '_ui', 'preview-dish-notext.html')
const pngWithText = join(ROOT, '_ui', 'preview-dish-text.png')
const pngNoText = join(ROOT, '_ui', 'preview-dish-notext.png')
writeFileSync(htmlNoText, buildHtml(true), 'utf8')
shoot(htmlPath, pngWithText, { width: STAGE_W, tall: 1000 })
shoot(htmlNoText, pngNoText, { width: STAGE_W, tall: 1000 })

// Banner 位置 = 舞台内边距 26 + 状态栏 44 + 导航栏 44 + 页面内边距 10
const bannerTop = Math.round((26 + 44 + 44 + 10) * S)
const bannerBottom = bannerTop + Math.round(280 * S)
// 只量第一块屏幕（x 区间限定在它内部）：手机之间的间隙是浅色底，
// 混进来会把「文字底下的背景亮度」量成接近纯白，结论就全错了
const bbox = await diffBBox(pngWithText, pngNoText, bannerTop, bannerBottom, {
  xFrom: 26 * S,
  xTo: (26 + PHONE_W) * S
})
let ok = true
if (!bbox) {
  console.log('\n没能定位到 Banner 文字')
  ok = false
} else {
  console.log(
    `\nBanner 文字范围：x ${Math.round(bbox.left / S)}–${Math.round((bbox.left + bbox.width) / S)}pt，` +
      `y ${Math.round(bbox.top / S)}–${Math.round((bbox.top + bbox.height) / S)}pt（屏幕内）`
  )
  // 文字块（kicker + 标题 + 副标题）在 Banner 上半部分，取顶部 40%。
  // 这三行里有两行是小字（22/24rpx），所以按正文标准 4.5:1 判定。
  const titleBox = { ...bbox, height: Math.round(bbox.height * 0.4) }
  const bg = await measureRegion(readFileSync(pngNoText), titleBox)
  const b = bg.brightest
  console.log(
    `    最亮像素在区域内的相对位置 (${b.atX.toFixed(2)}, ${b.atY.toFixed(2)})，rgb(${b.rgb.join(',')})`
  )
  ok = reportContrast('Banner 白色文字（含两行小字）对比度实测', bg, { min: 4.5 }) && ok
}

console.log(`\n产物：_ui/菜单页预览.png（${size.width}×${size.height}，含状态栏 / 导航栏 / tabBar）`)
for (const f of ['preview-dish-text.png', 'preview-dish-notext.png', 'preview-dish-notext.html']) {
  try {
    rmSync(join(ROOT, '_ui', f))
  } catch (e) {
    // 忽略
  }
}
if (!ok) process.exitCode = 1
