/**
 * 个人中心高保真预览图（iPhone 尺寸，两个状态并排）
 *
 * 「我的」是 tabBar 页 + 原生导航栏（标题「我的」），所以效果图把状态栏、导航栏、
 * tabBar 一起画出来。两个状态：
 *   ① 主页：橙色渐变头部（身份标签 / 校园美食探索者进度 / 偏好标签）+ 数据统计 + AI 饮食画像
 *   ② 展开态：功能列表 + 美食足迹（按食堂聚合）+ 设置面板展开
 *
 * 数据用真实口径：画像的「推荐依据」直接调用 api 层的 buildPrefSentence，
 * 美食足迹按真实菜谱的食堂分布生成，图标与页面同一套内联 SVG。
 *
 * 用法：node _ui/preview-user.mjs
 * 产物：_ui/我的页预览.png
 */
import { writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { register } from 'node:module'
import {
  S, RPX, reader, loadTokens, loadIcons, buildCss, esc, fileUrl, makeIcon,
  loadMenu, HTML_HEAD, shoot, trimToContent, measureUnderText, diffBBox, reportContrast
} from './lib/preview-common.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PAGE = 'pages/user/user.vue'
const OUT = join(ROOT, '_ui', '我的页预览.png')
const read = reader(ROOT)

// 预览里要用 api 层的 buildPrefSentence 生成真实文案
register(pathToFileURL(join(ROOT, '_search', 'hooks.mjs')).href)
globalThis.uni = { getStorageSync: () => '', setStorageSync: () => {}, removeStorageSync: () => {} }
const { buildPrefSentence } = await import('../api/index.js')

const tokens = loadTokens(ROOT)
const icons = loadIcons(ROOT)
const { css } = buildCss(ROOT, PAGE, tokens)
const icon = makeIcon(icons)
const menu = await loadMenu(ROOT)

/* ---------------- 演示数据（口径与页面一致） ---------------- */
const USER = { nickname: '张小食', avatar: '😋', role: '普通同学', uid: 'ID: 8f3a2c' }
const COUNTS = { fav: 8, recommend: 12, review: 5 }
const SCORE = COUNTS.fav + COUNTS.recommend + COUNTS.review // 25 → 食堂活地图

const PREF = {
  meal_type: '午餐',
  taste: ['辣', '麻辣'],
  allergies: ['香菜'],
  budget: 20,
  canteen: '',
  extra: ''
}
const CHIPS = [
  PREF.meal_type,
  '爱' + PREF.taste.join('·'),
  '忌' + PREF.allergies.join('·'),
  PREF.budget + ' 元内'
]

// 美食足迹：用真实菜谱的食堂分布生成（不是编的）
const byCanteen = {}
menu.onSale.forEach((d) => {
  byCanteen[d.canteen] = byCanteen[d.canteen] || []
  byCanteen[d.canteen].push(d.name)
})
const FOOT_RAW = [
  { name: '第二食堂', count: 6 },
  { name: '第一食堂', count: 3 },
  { name: '第三食堂', count: 1 }
]
const FOOT_MAX = Math.max(...FOOT_RAW.map((f) => f.count))
const FOOT = FOOT_RAW.map((f) => ({ ...f, percent: Math.round((f.count / FOOT_MAX) * 100) }))
const FOOT_TOTAL = FOOT.reduce((s, f) => s + f.count, 0)
// 常去食堂取足迹里最多的那个
const TOP_CANTEEN = FOOT[0].name + '（' + FOOT[0].count + ' 道）'

const BASIS = buildPrefSentence(PREF) || '按口味、预算、忌口与食堂热度综合排序'

/* ---------------- 真机外壳 ---------------- */
const WIFI_SVG =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 12" fill="none" stroke="#14110f" ' +
      'stroke-width="1.6" stroke-linecap="round"><path d="M1.5 4.2a10 10 0 0113 0"/>' +
      '<path d="M4.2 7a6.2 6.2 0 017.6 0"/><circle cx="8" cy="10" r="1" fill="#14110f" stroke="none"/></svg>'
  )
const STATUS_BAR = `
      <div class="sb"><span class="sb-time">9:41</span>
        <div class="sb-right">
          <div class="sb-signal"><i></i><i></i><i></i><i></i></div>
          <img class="sb-wifi" src="${WIFI_SVG}">
          <div class="sb-battery"><b></b></div>
        </div>
      </div>`
const NAV_BAR = `
      <div class="nb"><span class="nb-title">我的</span>
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
          const active = i === 3 // 当前页是「我的」
          return `<div class="tb-item${active ? ' active' : ''}">
          <img class="tb-icon" src="${fileUrl(ROOT, `static/tabbar/${t.file}${active ? '-active' : ''}.png`)}">
          <span class="tb-text">${t.text}</span>
        </div>`
        }).join('')}
      </div>`

/* ---------------- 页面片段 ---------------- */
function hero(hideText) {
  const hide = hideText ? ' style="visibility:hidden"' : ''
  return `
      <div class="hero">
        <div class="hero-halo"></div>
        <div class="hero-row">
          <div class="avatar"><span class="avatar-emoji">${USER.avatar}</span></div>
          <div class="hero-info">
            <div class="name-row">
              <span class="nickname"${hide}>${USER.nickname}</span>
              <span class="role-tag"${hide}>${USER.role}</span>
            </div>
            <div class="explorer-row"${hide}>${icon('sparkle', 24, '#ffffff')}<span class="explorer-text">食堂活地图</span></div>
            <span class="uid"${hide}>${USER.uid}</span>
          </div>
          <div class="edit-entry"${hide}>${icon('edit', 28, '#ffffff')}<span class="edit-text">编辑资料</span></div>
        </div>
        <div class="explorer-bar"${hide}>
          <div class="explorer-track"><div class="explorer-fill" style="width:100%"></div></div>
          <span class="explorer-hint">活跃度 ${SCORE} · 已到最高等级</span>
        </div>
        <div class="taste-tags"${hide}>
          ${CHIPS.map((c) => `<span class="taste-tag">${esc(c)}</span>`).join('')}
        </div>
      </div>`
}

const STATS = `
      <div class="stats">
        <div class="stat"><span class="stat-num">${COUNTS.fav}</span><span class="stat-label">收藏菜品</span></div>
        <div class="stat-line"></div>
        <div class="stat"><span class="stat-num">${COUNTS.recommend}</span><span class="stat-label">AI 推荐</span></div>
        <div class="stat-line"></div>
        <div class="stat"><span class="stat-num">${COUNTS.review}</span><span class="stat-label">我的评价</span></div>
      </div>`

const PORTRAIT = `
      <div class="card">
        <div class="card-head">
          <div class="card-title">${icon('sparkle', 32, '#ff5a36')}<span class="card-title-text">AI 饮食画像</span></div>
          <div class="card-more"><span class="card-more-text">去推荐</span>${icon('right', 22, '#8a8580')}</div>
        </div>
        <div class="portrait">
          <div class="portrait-row">
            <div class="portrait-icon">${icon('fire', 28, '#ff5a36')}</div>
            <span class="portrait-label">喜欢口味</span>
            <span class="portrait-value">辣 · 麻辣</span>
          </div>
          <div class="portrait-row">
            <div class="portrait-icon">${icon('location', 28, '#ff5a36')}</div>
            <span class="portrait-label">常去食堂</span>
            <span class="portrait-value">${esc(TOP_CANTEEN)}</span>
          </div>
          <div class="portrait-row">
            <div class="portrait-icon">${icon('wallet', 28, '#ff5a36')}</div>
            <span class="portrait-label">消费预算</span>
            <span class="portrait-value">${PREF.budget} 元以内</span>
          </div>
          <div class="portrait-row portrait-row-note">
            <div class="portrait-icon">${icon('info', 28, '#ff5a36')}</div>
            <span class="portrait-label">推荐依据</span>
            <span class="portrait-value">${esc(BASIS)}</span>
          </div>
        </div>
        <div class="portrait-foot"><span class="clear-btn">清除口味档案</span></div>
      </div>`

function menuRow(iconName, text, ext, arrow) {
  return `
      <div class="menu-item">
        <div class="menu-icon">${icon(iconName, 32, '#ff5a36')}</div>
        <span class="menu-text">${text}</span>
        ${ext ? `<span class="menu-ext">${ext}</span>` : ''}
        ${icon(arrow, 24, '#b8b2aa')}
      </div>`
}

/** ① 主页：头部 + 统计 + 画像 + 前两项功能 */
function screenMain(hideHeroText) {
  return `
    <div class="user-page">
      ${hero(hideHeroText)}
      ${STATS}
      ${PORTRAIT}
      <div class="card menu-card">
        ${menuRow('heart', '我的收藏', COUNTS.fav + ' 道', 'right')}
        ${menuRow('clipboard', '我的评价', COUNTS.review + ' 条', 'down')}
      </div>
    </div>`
}

/** ② 展开态：功能列表 + 美食足迹 + 设置 */
function screenPanels() {
  return `
    <div class="user-page" style="padding-top:12px">
      <div class="card menu-card">
        ${menuRow('heart', '我的收藏', COUNTS.fav + ' 道', 'right')}
        ${menuRow('clipboard', '我的评价', COUNTS.review + ' 条', 'down')}
        ${menuRow('clock', 'AI 推荐历史', '最近 12 条', 'down')}
        ${menuRow('location', '美食足迹', FOOT_TOTAL + ' 道', 'up')}
        <div class="panel">
          <span class="panel-tip">统计口径：你评价过和收藏过的菜品，按所在食堂聚合</span>
          ${FOOT.map(
            (f) => `<div class="foot-row">
            <span class="foot-name">${esc(f.name)}</span>
            <div class="foot-track"><div class="foot-fill" style="width:${f.percent}%"></div></div>
            <span class="foot-count">${f.count} 道</span>
          </div>`
          ).join('')}
        </div>
        ${menuRow('settings', '设置', '', 'up')}
        <div class="panel">
          <span class="panel-tip">口味档案与推荐历史只存在本机，清空后无法恢复</span>
          <div class="menu-item menu-item-sub"><span class="menu-text">清除口味档案</span>${icon('right', 24, '#b8b2aa')}</div>
          <div class="menu-item menu-item-sub"><span class="menu-text">清空推荐历史</span>${icon('right', 24, '#b8b2aa')}</div>
          <div class="menu-item menu-item-sub"><span class="menu-text danger-text">退出登录</span>${icon('right', 24, '#b8b2aa')}</div>
        </div>
        ${menuRow('info', '关于项目', '', 'right')}
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

function buildHtml(hideHeroText) {
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

  /* 页面里靠 flex 的元素补齐浏览器下的布局 */
  .hero-row, .name-row, .explorer-row, .edit-entry, .taste-tags, .stats, .stat,
  .card-head, .card-title, .card-more, .portrait-row, .portrait-foot,
  .menu-item, .menu-icon, .panel-foot, .foot-row
    { display: flex; }
  .stat { flex-direction: column; align-items: center; }
  .hero-info, .menu-text { flex: 1; }
  .hero-row, .name-row, .explorer-row, .edit-entry, .card-head, .card-title, .card-more,
  .portrait-row, .menu-item, .foot-row { align-items: center; }
  .taste-tags { flex-wrap: wrap; }
  .portrait-foot, .menu-item { justify-content: flex-start; }
  .menu-icon, .portrait-icon { align-items: center; justify-content: center; }
  /* 预览里不需要页面滚动占位 */
  .user-page { min-height: auto; }
`
    ) +
    `<div class="stage">
    ${phone('① 个人主页 · 头部 + 统计 + AI 饮食画像', screenMain(hideHeroText))}
    ${phone('② 功能列表 · 美食足迹 + 设置', screenPanels())}
  </div>
</body></html>`
  )
}

/* ---------------- 截图 ---------------- */
const STAGE_W = 26 * 3 + PHONE_W * 2
const htmlPath = join(ROOT, '_ui', 'preview-user.html')
writeFileSync(htmlPath, buildHtml(false), 'utf8')
shoot(htmlPath, OUT, { width: STAGE_W, tall: 1000 })
const size = await trimToContent(OUT)
console.log(`截图：${size.width}×${size.height}（两个 ${PHONE_W}×${PHONE_H}pt 屏幕并排，${S} 倍图）`)

/* ---------------- 头部白字对比度实测 ---------------- */
// 头部文字是白字压在橙色渐变上，且文字块比首页 Banner 高（多了进度条与偏好标签），
// 会伸进渐变的浅色段，所以必须实测而不是估算。
const htmlNoText = join(ROOT, '_ui', 'preview-user-notext.html')
const pngWithText = join(ROOT, '_ui', 'preview-user-text.png')
const pngNoText = join(ROOT, '_ui', 'preview-user-notext.png')
writeFileSync(htmlNoText, buildHtml(true), 'utf8')
shoot(htmlPath, pngWithText, { width: STAGE_W, tall: 1000 })
shoot(htmlNoText, pngNoText, { width: STAGE_W, tall: 1000 })

const heroTop = Math.round((26 + 44 + 44 + 10) * S)
const heroBottom = heroTop + Math.round(240 * S)
const bbox = await diffBBox(pngWithText, pngNoText, heroTop, heroBottom, {
  xFrom: 26 * S,
  xTo: (26 + PHONE_W) * S
})
let ok = true
if (!bbox) {
  console.log('\n没能定位到头部文字')
  ok = false
} else {
  console.log(
    `\n头部文字范围：x ${Math.round(bbox.left / S)}–${Math.round((bbox.left + bbox.width) / S)}pt，` +
      `y ${Math.round(bbox.top / S)}–${Math.round((bbox.top + bbox.height) / S)}pt（屏幕内）`
  )
  // 只测「真的有文字」的位置，避免把头像白圈这类元素当成背景
  const bg = await measureUnderText(pngWithText, pngNoText, bbox)
  if (!bg) {
    console.log('\n没能采到文字底下的像素')
    ok = false
  } else {
    console.log(`    采样了 ${bg.n} 个文字像素底下的背景`)
    // 昵称 19pt 粗体、身份/偏好标签是小字 → 按正文标准 4.5:1 判定
    ok = reportContrast('头部白色文字（含小字标签）对比度实测', bg, { min: 4.5 }) && ok
  }
}

console.log(`\n产物：_ui/我的页预览.png（${size.width}×${size.height}，含状态栏 / 导航栏 / tabBar）`)
for (const f of ['preview-user-text.png', 'preview-user-notext.png', 'preview-user-notext.html']) {
  try {
    rmSync(join(ROOT, '_ui', f))
  } catch (e) {
    // 忽略
  }
}
if (!ok) process.exitCode = 1
