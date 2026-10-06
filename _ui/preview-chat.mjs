/**
 * AI 对话页高保真预览图（iPhone 尺寸，两个状态并排）
 *
 * 对话页是「一屏固定布局」（height:100vh + 内部滚动），而且
 *   · pages.json 里它有**原生导航栏**（标题「AI 推荐」）
 *   · 它是 tabBar 页（首页 / AI 推荐 / 菜单 / 我的）
 * 所以效果图必须把状态栏、导航栏、tabBar 一起画出来，否则和真机对不上。
 *
 * 画两个状态，正好对应页面真实的两种形态：
 *   ① 欢迎态：AI 助手欢迎区 + 快捷入口卡片 + 今日推荐（对话开始前）
 *   ② 对话态：欢迎区收起，圆角气泡 + 菜品卡片 + 悬浮输入框
 *
 * 机器人形象取 components/AiMascot 里同一份 SVG，tabBar 图标用 static/tabbar 下真实 PNG，
 * 今日推荐与菜品卡片用真实菜单数据。
 *
 * 用法：node _ui/preview-chat.mjs
 * 产物：_ui/对话页预览.png
 */
import { writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  S, RPX, reader, loadTokens, loadIcons, buildCss, esc, priceText, ratingText,
  dishLoc, fileUrl, makeIcon, makeDishImg, loadMenu, HTML_HEAD, shoot, trimToContent,
  measureRegion, diffBBox, reportContrast
} from './lib/preview-common.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PAGE = 'pages/recommend/recommend.vue'
const OUT = join(ROOT, '_ui', '对话页预览.png')
const read = reader(ROOT)
const readFile = (p) => readFileSync(join(ROOT, p), 'utf8')

/* ---------------- 令牌 / 样式 / 图标 ---------------- */
const tokens = loadTokens(ROOT)
const icons = loadIcons(ROOT)
const { css } = buildCss(ROOT, PAGE, tokens)
const icon = makeIcon(icons)
const dishImg = makeDishImg(ROOT)

/* ---------------- 机器人形象（与组件同一份 SVG） ---------------- */
const mascotExpr = readFile('components/AiMascot/AiMascot.vue')
  .match(/<script setup>([\s\S]*?)<\/script>/)[1]
  .match(/const svg =([\s\S]*?)\n\nconst dataUri/)[1]
  .replace(/;\s*$/, '')
const mascotEnv = { BRAND: '#ff5a36', BRAND_LIGHT: '#ff8f6b', FACE: '#fffaf7', INK: '#2f2723' }
// 表达式跨行，必须用括号包住（return 后换行会被 ASI 截断）
const mascotSvg = new Function(...Object.keys(mascotEnv), 'return (' + mascotExpr + ')')(...Object.values(mascotEnv))
const mascotUri = 'data:image/svg+xml,' + encodeURIComponent(mascotSvg)
const mascot = (sizeRpx, { glow = false } = {}) => {
  const size = sizeRpx * RPX
  const d = size * 1.9
  return `<div class="mascot" style="width:${size}px;height:${size}px">
    ${glow ? `<div class="mascot-glow" style="width:${d}px;height:${d}px;margin-left:${-((d - size) / 2)}px;margin-top:${-((d - size) / 2)}px"></div>` : ''}
    <img class="mascot-img" src="${mascotUri}">
  </div>`
}

/* ---------------- 真实数据 ---------------- */
const menu = await loadMenu(ROOT)
const todayPicks = menu.hot(3)
console.log(`真实数据：今日推荐 ${todayPicks.length} 道（${todayPicks.map((d) => d.name).join('、')}）`)

const asked = '想吃辣的，10块以内'
const reply = '来，给你推荐两道又辣又实惠的！都在第一食堂，下课顺路就能吃上。'
const replyDishes = [
  { ...menu.all.find((d) => d.name === '酸辣土豆丝'), reason: '6 块钱一份，酸辣脆爽，配饭配馒头都香' },
  { ...menu.all.find((d) => d.name === '麻婆豆腐'), reason: '麻辣鲜香、豆腐嫩滑，拌米饭特别下饭' }
].filter((d) => d && d.name)

const QUICK = [
  { text: '想吃辣的，10块以内', icon: 'fire', hint: '按口味 + 预算挑' },
  { text: '推荐个清淡的早餐', icon: 'bowl', hint: '清爽好消化' },
  { text: '不吃香菜，有什么好吃的？', icon: 'heart', hint: '按忌口自动规避' },
  { text: '高分菜品有哪些？', icon: 'star', hint: '同学评分最高' }
]

/* ---------------- 真机外壳：状态栏 / 导航栏 / tabBar ---------------- */
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
        <span class="nb-title">AI 推荐</span>
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
          const active = i === 1 // 当前页是 AI 推荐
          return `<div class="tb-item${active ? ' active' : ''}">
          <img class="tb-icon" src="${fileUrl(ROOT, `static/tabbar/${t.file}${active ? '-active' : ''}.png`)}">
          <span class="tb-text">${t.text}</span>
        </div>`
        }).join('')}
      </div>`

/* ---------------- 两个状态的页面内容 ---------------- */
/** ① 欢迎态：欢迎区 + 快捷入口 + 今日推荐 */
function welcomeScreen(hideText) {
  const hide = hideText ? ' style="visibility:hidden"' : ''
  return `
    <div class="msg-list" style="padding:12px">
      <div class="welcome">
        <div class="hero">
          <div class="hero-halo"></div>
          ${mascot(136, { glow: true })}
          <span class="hero-title"${hide}>你好，我是食遇 AI</span>
          <div class="hero-pill"${hide}>${icon('sparkle', 24, '#ff5a36')}<span class="hero-pill-text">AI 食堂推荐 · 我知道食堂的每道菜</span></div>
        </div>

        <div class="block">
          <span class="block-title">想吃点什么？点一下直接问</span>
          <div class="entry-grid">
            ${QUICK.map(
              (e) => `<div class="entry-card">
              <div class="entry-icon">${icon(e.icon, 32, '#ff5a36')}</div>
              <span class="entry-text">${esc(e.text)}</span>
              <span class="entry-hint">${esc(e.hint)}</span>
            </div>`
            ).join('')}
          </div>
        </div>

        <div class="block">
          <div class="block-head">
            <span class="block-title">今日推荐</span>
            <div class="block-more"><span class="block-more-text">看全部</span>${icon('right', 22, '#8a8580')}</div>
          </div>
          <div class="pick-row">
            ${todayPicks
              .map(
                (d) => `<div class="pick-card">
              ${dishImg(d, 196, 136, 20)}
              <span class="pick-name">${esc(d.name)}</span>
              <div class="pick-meta">
                <span class="pick-price">${priceText(d.price)}</span>
                <div class="pick-score">${icon('star', 20, '#ff5a36')}<span class="pick-score-text">${ratingText(d.rating)}</span></div>
              </div>
            </div>`
              )
              .join('')}
          </div>
        </div>
      </div>
    </div>`
}

/** ② 对话态：欢迎区已收起，只剩气泡 + 输入栏 */
function chatScreen() {
  return `
    <div class="msg-list" style="padding:12px">
      <div class="msg-item msg-user">
        <div class="avatar-wrap">
          <div class="user-avatar" style="width:${68 * RPX}px;height:${68 * RPX}px;border-radius:50%">${icon('user', 34, '#8a8580')}</div>
        </div>
        <div class="bubble user-bubble"><span class="bubble-text">${esc(asked)}</span></div>
      </div>

      <div class="msg-item msg-bot">
        <div class="avatar-wrap">${mascot(68)}</div>
        <div class="bubble bot-bubble">
          <div class="dish-cards">
            ${replyDishes
              .map(
                (d) => `<div class="dish-card">
              <div class="dish-card-head">
                <span class="dish-card-name">${esc(d.name)}</span>
                <span class="dish-card-price">¥${d.price}</span>
              </div>
              <div class="dish-card-loc">${icon('location', 20, '#b8b2aa')}<span class="dish-card-loc-text">${esc(dishLoc(d))}</span></div>
              <div class="dish-card-tags">
                ${(d.tags || []).slice(0, 3).map((t) => `<span class="dish-tag">${esc(t)}</span>`).join('')}
                <div class="dish-tag dish-tag-rate">${icon('star', 18, '#ff5a36')}<span class="dish-tag-rate-text">${d.rating}</span></div>
              </div>
              <span class="dish-card-reason">${esc(d.reason)}</span>
            </div>`
              )
              .join('')}
          </div>
          <span class="bubble-text">${esc(reply)}</span>
        </div>
      </div>

      <div class="msg-item msg-user">
        <div class="avatar-wrap">
          <div class="user-avatar" style="width:${68 * RPX}px;height:${68 * RPX}px;border-radius:50%">${icon('user', 34, '#8a8580')}</div>
        </div>
        <div class="bubble user-bubble"><span class="bubble-text">有没有不加香菜的？</span></div>
      </div>

      <div class="msg-item msg-bot">
        <div class="avatar-wrap">${mascot(68)}</div>
        <div class="bubble bot-bubble"><div class="typing"><span class="typing-dot"></span><span class="typing-dot" style="animation-delay:.2s"></span><span class="typing-dot" style="animation-delay:.4s"></span></div></div>
      </div>
      <div class="msg-bottom"></div>
    </div>
    <div class="input-bar">
      <div class="input-pill"><span class="input-ph">说说你想吃什么…</span></div>
      <div class="send-btn">${icon('right', 36, '#ffffff')}</div>
    </div>`
}

/* ---------------- 拼整张设计稿 ---------------- */
const PHONE_W = 375
const PHONE_H = 812
const CHROME_H = 44 /* 状态栏 */ + 44 /* 导航栏 */ + 83 /* tabBar */

function phone(caption, body) {
  return `
    <div class="col">
      <div class="phone">
        ${STATUS_BAR}
        ${NAV_BAR}
        <div class="screen" style="height:${PHONE_H - CHROME_H}px">${body}</div>
        ${TAB_BAR}
      </div>
      <div class="cap">${caption}</div>
    </div>`
}

function buildHtml(hideHeroText) {
  return (
    HTML_HEAD(
      css,
      `
  /* ---- 预览外壳：状态栏 / 导航栏 / tabBar / 手机边框 ---- */
  * { box-sizing: border-box; }
  .stage { display: flex; gap: 26px; padding: 26px; background: #e9e6e0; align-items: flex-start; }
  .col { width: ${PHONE_W}px; }
  .phone { width: ${PHONE_W}px; height: ${PHONE_H}px; background: #f7f6f3; border-radius: 30px;
           overflow: hidden; box-shadow: 0 18px 50px rgba(20,17,15,.22); display: flex; flex-direction: column; }
  .cap { text-align: center; font-size: 13px; color: #6b6560; margin-top: 14px; font-weight: 500; }
  .screen { display: flex; flex-direction: column; overflow: hidden; }
  .screen > .msg-list { flex: 1; }

  .sb { height: 44px; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
        padding: 0 22px; font-size: 14px; font-weight: 600; color: #14110f; }
  .sb-time { letter-spacing: .3px; }
  .sb-right { display: flex; align-items: center; gap: 6px; }
  .sb-signal { display: flex; align-items: flex-end; gap: 2px; }
  .sb-signal i { width: 3px; background: #14110f; border-radius: 1px; display: block; }
  .sb-signal i:nth-child(1) { height: 4px; } .sb-signal i:nth-child(2) { height: 6px; }
  .sb-signal i:nth-child(3) { height: 8px; } .sb-signal i:nth-child(4) { height: 10px; }
  .sb-wifi { width: 15px; height: 11px; }
  .sb-battery { width: 24px; height: 12px; border: 1.5px solid rgba(20,17,15,.45); border-radius: 3.5px;
                padding: 1.5px; }
  .sb-battery b { display: block; height: 100%; width: 72%; background: #14110f; border-radius: 1.5px; }

  .nb { height: 44px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; position: relative; }
  .nb-title { font-size: 16px; font-weight: 600; color: #14110f; }
  .nb-capsule { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); width: 78px; height: 30px;
                border: 1px solid rgba(20,17,15,.1); border-radius: 15px; background: rgba(255,255,255,.72);
                display: flex; align-items: center; justify-content: space-around; }
  .nb-dots { font-size: 11px; color: #14110f; letter-spacing: .5px; }
  .nb-sep { width: 1px; height: 16px; background: rgba(20,17,15,.1); }
  .nb-ring { font-size: 13px; color: #14110f; }

  .tb { height: 83px; flex-shrink: 0; padding-top: 9px; display: flex; background: #fff;
        border-top: 1px solid #eeece7; }
  .tb-item { flex: 1; display: flex; flex-direction: column; align-items: center; }
  .tb-icon { width: 26px; height: 26px; }
  .tb-text { font-size: 10px; color: #8a8580; margin-top: 3px; }
  .tb-item.active .tb-text { color: #ff5a36; }

  /* ---- 页面里靠 JS 加的内联尺寸，这里补齐布局 ---- */
  .mascot { position: relative; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
  .mascot-glow { position: absolute; border-radius: 50%;
    background: radial-gradient(circle, rgba(255,90,54,.22) 0%, rgba(255,90,54,0) 70%); }
  .mascot-img { position: relative; width: 100%; height: 100%; }
  .user-avatar, .entry-icon, .dish-card-loc, .dish-tag-rate, .pick-score, .send-btn, .input-pill, .typing
    { display: flex; align-items: center; }
  .typing-dot { display: block; }
`
    ) +
    `<div class="stage">
    ${phone('① 欢迎态 · 对话开始前', welcomeScreen(hideHeroText))}
    ${phone('② 对话态 · 聊起来之后', chatScreen())}
  </div>
</body></html>`
  )
}

/* ---------------- 截图 ---------------- */
const STAGE_W = 26 * 3 + PHONE_W * 2 // 左右内边距 + 两个手机 + 中间间距
const htmlPath = join(ROOT, '_ui', 'preview-chat.html')
writeFileSync(htmlPath, buildHtml(false), 'utf8')
shoot(htmlPath, OUT, { width: STAGE_W, tall: 1100 })
const size = await trimToContent(OUT)
console.log(`截图：${size.width}×${size.height}（两个 ${PHONE_W}×${PHONE_H}pt 屏幕并排，${S} 倍图）`)

/* ---------------- 英雄区白字对比度实测 ---------------- */
// 再渲染一遍「文字不可见」的版本：用 visibility:hidden 保留占位，
// 否则英雄区变矮、下面内容整体上移，两张图的差异就到处都是，没法定位文字范围。
const htmlNoText = join(ROOT, '_ui', 'preview-chat-notext.html')
const pngWithText = join(ROOT, '_ui', 'preview-chat-text.png')
const pngNoText = join(ROOT, '_ui', 'preview-chat-notext.png')
writeFileSync(htmlNoText, buildHtml(true), 'utf8')
shoot(htmlPath, pngWithText, { width: STAGE_W, tall: 1100 })
shoot(htmlNoText, pngNoText, { width: STAGE_W, tall: 1100 })

// 英雄区位置 = 舞台内边距 26 + 状态栏 44 + 导航栏 44 + 列表内边距 12
const heroTop = Math.round((26 + 44 + 44 + 12 + 4) * S)
const heroBottom = heroTop + Math.round(320 * S)
const bbox = await diffBBox(pngWithText, pngNoText, heroTop, heroBottom)
let ok = true
if (!bbox) {
  console.log('\n没能定位到英雄区文字（两张渲染没有差异？）')
  ok = false
} else {
  console.log(
    `\n英雄区文字范围：x ${Math.round(bbox.left / S)}–${Math.round((bbox.left + bbox.width) / S)}pt，` +
      `y ${Math.round(bbox.top / S)}–${Math.round((bbox.top + bbox.height) / S)}pt（屏幕内）`
  )
  // 只量标题那一条：白色胶囊是纯白，混进来会得到假的 1:1
  const titleBox = { ...bbox, height: Math.round(bbox.height * 0.42) }
  const titleBg = await measureRegion(readFileSync(pngNoText), titleBox)
  ok = reportContrast('英雄区白色标题（40rpx 粗体）对比度实测', titleBg, { min: 3 }) && ok

  // 白色胶囊里的标签文字：该区域同时含白底与深色文字，
  // 用最亮（白底）与最暗（文字核心）算对比度
  const pillBox = {
    left: bbox.left,
    top: bbox.top + Math.round(bbox.height * 0.55),
    width: bbox.width,
    height: Math.round(bbox.height * 0.45)
  }
  const pill = await measureRegion(readFileSync(pngWithText), pillBox)
  const pillContrast = (pill.max + 0.05) / (pill.min + 0.05)
  console.log(
    `\n白色胶囊里的标签文字 vs 白底：${pillContrast.toFixed(2)}:1` +
      `（最亮 ${(pill.max * 255).toFixed(0)} / 最暗 ${(pill.min * 255).toFixed(0)}，小字达标线 4.5:1）`
  )
  if (pillContrast < 4.5) ok = false
}

/* ---------------- 收尾 ---------------- */
console.log(`\n产物：_ui/对话页预览.png（${size.width}×${size.height}，含状态栏 / 导航栏 / tabBar）`)
for (const f of ['preview-chat-text.png', 'preview-chat-notext.png', 'preview-chat-notext.html']) {
  try {
    rmSync(join(ROOT, '_ui', f))
  } catch (e) {
    // 忽略
  }
}
if (!ok) process.exitCode = 1
