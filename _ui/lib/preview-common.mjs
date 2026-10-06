/**
 * 高保真预览图的公共部分
 *
 * 做法：把页面真实渲染成图，而不是画一张示意图 ——
 *   · 样式直接读页面的 <style> 块，把 $令牌 换成 tokens.scss 的真实值、rpx 换算成 px
 *   · 图标按 components/Icon/Icon.vue 的方式内联成 SVG data URI
 *   · 数据用 common/local-dishes.js 的真实菜单，图片用 static/ 下真实照片
 *   · Edge 无头模式截图（3 倍图），再裁掉多余底色
 *
 * 首页、对话页的预览脚本共用这一份，避免两套渲染逻辑各写一遍。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import sharp from 'sharp'

export const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
export const VIEW_W = 375 // iPhone X 逻辑宽度（= 750rpx）
export const RPX = VIEW_W / 750 // 1rpx 等于多少 px
export const S = 3 // 截图倍率

/* ------------------------------ 基础读取 ------------------------------ */

export const reader = (root) => (p) => readFileSync(join(root, p), 'utf8')

/** tokens.scss → { $name: value } */
export function loadTokens(root) {
  const src = reader(root)('common/tokens.scss')
  const tokens = {}
  for (const m of src.matchAll(/^\$([\w-]+):\s*([^;]+);/gm)) tokens['$' + m[1]] = m[2].trim()
  return tokens
}

/** ICONS：图标名 → path d */
export function loadIcons(root) {
  const src = reader(root)('common/icons.js')
  const icons = {}
  for (const m of src.matchAll(/^\s{2}([a-zA-Z]+):\s*'([^']+)'/gm)) icons[m[1]] = m[2]
  return icons
}

/**
 * 页面样式 → 浏览器可直接用的 CSS
 * @returns {{ css: string, raw: string }} raw 是未替换令牌的原始样式（做断言时用）
 */
export function buildCss(root, pageRel, tokens) {
  const src = reader(root)(pageRel)
  const raw = (src.match(/<style[^>]*>([\s\S]*?)<\/style>/) || [])[1] || ''
  let css = raw
  // 先长后短，避免 $radius 吃掉 $radius-card
  Object.keys(tokens)
    .sort((a, b) => b.length - a.length)
    .forEach((k) => {
      css = css.split(k).join(tokens[k])
    })
  css = css.replace(/([\d.]+)rpx/g, (_, n) => +(Number(n) * RPX).toFixed(3) + 'px')
  const left = [...new Set(css.match(/\$[\w-]+/g) || [])]
  if (left.length) throw new Error('有没解析到的令牌：' + left.join('、'))
  return { css, raw }
}

/* ------------------------------ 小工具 ------------------------------ */

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
export const priceText = (v) => '¥' + (Number(v) % 1 === 0 ? Number(v) : Number(v).toFixed(1))
export const ratingText = (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(1) : '—')
export const dishLoc = (d) =>
  [d.canteen, d.floor ? d.floor + '楼' : '', d.window].filter(Boolean).join(' · ')
export const fileUrl = (root, rel) => pathToFileURL(join(root, rel)).href

/** 与 Icon.vue 完全一致的内联 SVG（含 currentColor 替换逻辑） */
export function makeIcon(icons) {
  return (name, sizeRpx, color, weight = 1.8) => {
    const size = +(sizeRpx * RPX).toFixed(2)
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="' + color +
      '" stroke-width="' + weight + '" stroke-linecap="round" stroke-linejoin="round"><path d="' +
      icons[name] + '"/></svg>'
    return `<img class="icon" style="width:${size}px;height:${size}px" src="data:image/svg+xml,${encodeURIComponent(svg)}">`
  }
}

/** 菜品图（与 DishImage 的行为一致：有图用图，无图回退 emoji） */
export function makeDishImg(root) {
  return (d, w, h, radius) => {
    const style = `width:${w * RPX}px;height:${h * RPX}px;border-radius:${radius * RPX}px;`
    const img =
      d.image && existsSync(join(root, d.image))
        ? `<img src="${fileUrl(root, d.image)}" style="width:100%;height:100%;object-fit:cover;display:block">`
        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:${Math.min(w, h) * RPX * 0.52}px">${d.emoji || '🍽️'}</div>`
    return `<div class="dish-image" style="${style}">${img}</div>`
  }
}

/** 真实菜单数据 + 与 api/index.js 的 rank() 一致的榜单口径 */
export async function loadMenu(root) {
  const src = reader(root)('common/local-dishes.js').replace(/^export /gm, '')
  const mod = await import('data:text/javascript,' + encodeURIComponent(src + '\nexport { LOCAL_DISHES };'))
  const onSale = mod.LOCAL_DISHES.filter((d) => d.status === 1)
  return {
    all: mod.LOCAL_DISHES,
    onSale,
    hot: (n) => [...onSale].sort((a, b) => b.recommend_count - a.recommend_count).slice(0, n),
    good: (n) => [...onSale].sort((a, b) => b.rating - a.rating).slice(0, n),
    fresh: (n) => onSale.filter((d) => d.is_new).slice(0, n)
  }
}

/* ------------------------------ 截图 ------------------------------ */

export const HTML_HEAD = (css, extra = '') => `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${VIEW_W}px; background: #f7f6f3; }
  body { -webkit-font-smoothing: antialiased;
         font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
  .icon { display: block; flex-shrink: 0; }
  /* 预览用：模拟 uni-app 的 <text>（行内元素） */
  span { display: inline; }
  ${css}
  ${extra}
</style></head>
<body>`

export function shoot(htmlFile, outFile, { width = VIEW_W, tall = 3200 } = {}) {
  execFileSync(
    EDGE,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      `--force-device-scale-factor=${S}`,
      `--window-size=${width},${tall}`,
      `--screenshot=${outFile}`,
      pathToFileURL(htmlFile).href
    ],
    { stdio: 'pipe' }
  )
}

/** 裁掉底部多余底色，保留完整宽度 */
export async function trimToContent(pngPath) {
  const shot = readFileSync(pngPath)
  const meta = await sharp(shot).metadata()
  const probe = await sharp(shot).trim({ threshold: 2 }).png().toBuffer({ resolveWithObject: true })
  const height = (probe.info.trimOffsetTop || 0) + probe.info.height
  const buf = await sharp(shot).extract({ left: 0, top: 0, width: meta.width, height }).png().toBuffer()
  writeFileSync(pngPath, buf)
  const final = await sharp(buf).metadata()
  return { width: final.width, height: final.height, before: meta }
}

/* ------------------------------ 对比度测量 ------------------------------ */

/** WCAG 相对亮度 */
export const relLum = (r, g, b) => {
  const f = (v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

export const contrastWithWhite = (lum) => 1.05 / (lum + 0.05)

/** 区域内背景亮度分布（用于判断白字压在什么底上） */
export async function measureRegion(pngBuf, region) {
  const { data, info } = await sharp(pngBuf)
    .extract(region)
    .raw()
    .toBuffer({ resolveWithObject: true })
  const lums = []
  let brightest = { lum: -1, x: 0, y: 0, rgb: [0, 0, 0] }
  for (let i = 0; i + 2 < data.length; i += 3) {
    const l = relLum(data[i], data[i + 1], data[i + 2])
    lums.push(l)
    if (l > brightest.lum) {
      const px = (i / 3) % info.width
      brightest = { lum: l, x: px, y: Math.floor(i / 3 / info.width), rgb: [data[i], data[i + 1], data[i + 2]] }
    }
  }
  lums.sort((a, b) => a - b)
  const at = (q) => lums[Math.min(lums.length - 1, Math.floor(lums.length * q))]
  return {
    n: lums.length,
    min: lums[0],
    mean: lums.reduce((s, v) => s + v, 0) / lums.length,
    p99: at(0.99),
    p999: at(0.999),
    max: lums[lums.length - 1],
    /** 最亮像素在区域内的相对位置（0~1）与颜色，便于定位「到底亮在哪里」 */
    brightest: {
      atX: brightest.x / info.width,
      atY: brightest.y / info.height,
      rgb: brightest.rgb
    }
  }
}

/**
 * 用两张渲染结果（有/无文字）的差异定位文字的真实像素范围
 * 比按 padding 估算区域准确得多。
 *
 * @param {Object} [opts] xFrom/xTo：只在某个横向区间内找差异。
 *   并排多个屏幕时必须限定区间，否则手机之间的间隙（浅色底）会被当成「文字底下的背景」，
 *   量出来的对比度全是假的。
 */
export async function diffBBox(pngWithText, pngNoText, yFrom, yTo, opts = {}) {
  const xFrom = opts.xFrom === undefined ? 0 : Math.round(opts.xFrom)
  const xTo = opts.xTo === undefined ? Infinity : Math.round(opts.xTo)
  const opt = { resolveWithObject: true }
  const A = await sharp(readFileSync(pngWithText)).raw().toBuffer(opt)
  const B = await sharp(readFileSync(pngNoText)).raw().toBuffer(opt)
  const W = A.info.width
  let minX = W
  let maxX = -1
  let minY = yTo
  let maxY = -1
  const xEnd = Math.min(xTo, W)
  for (let y = yFrom; y < Math.min(yTo, A.info.height); y++) {
    for (let x = xFrom; x < xEnd; x++) {
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
  return maxX < 0 ? null : { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

/**
 * 只测「文字底下」的背景亮度（最精确的一种）
 *
 * 用两张图逐像素对比：只在**有差异**的位置（也就是真的有文字的位置）去取
 * 「无文字」图上的像素。比按包围盒测量干净得多 ——
 * 包围盒会把头像白圈、白色胶囊这类「设计上本来就白」的元素一起圈进来，
 * 量出来永远是 1:1，完全是假警报（这个坑踩过一次）。
 *
 * @returns 与 measureRegion 同构的统计结果
 */
export async function measureUnderText(pngWithText, pngNoText, region, opts = {}) {
  const threshold = opts.threshold === undefined ? 24 : opts.threshold
  const opt = { resolveWithObject: true }
  const A = await sharp(readFileSync(pngWithText)).raw().toBuffer(opt)
  const B = await sharp(readFileSync(pngNoText)).raw().toBuffer(opt)
  const W = A.info.width
  const lums = []
  const x0 = Math.max(0, region.left)
  const y0 = Math.max(0, region.top)
  const x1 = Math.min(W, region.left + region.width)
  const y1 = Math.min(A.info.height, region.top + region.height)

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 3
      const diff =
        Math.abs(A.data[i] - B.data[i]) +
        Math.abs(A.data[i + 1] - B.data[i + 1]) +
        Math.abs(A.data[i + 2] - B.data[i + 2])
      if (diff > threshold) {
        lums.push(relLum(B.data[i], B.data[i + 1], B.data[i + 2]))
      }
    }
  }
  if (!lums.length) return null
  lums.sort((a, b) => a - b)
  const at = (q) => lums[Math.min(lums.length - 1, Math.floor(lums.length * q))]
  return {
    n: lums.length,
    min: lums[0],
    mean: lums.reduce((s, v) => s + v, 0) / lums.length,
    p99: at(0.99),
    p999: at(0.999),
    max: lums[lums.length - 1]
  }
}

/**
 * 统一打印一组对比度结论
 * @param {{min?: number}} opts min：达标线（正文 4.5，大字号/粗体 3）。返回是否达标。
 */
export function reportContrast(label, stats, opts = {}) {
  const min = opts.min === undefined ? 4.5 : opts.min
  console.log(`\n${label}`)
  console.log(`  平均 ${(stats.mean * 255).toFixed(0)}/255 → ${contrastWithWhite(stats.mean).toFixed(2)}:1`)
  console.log(`  99% 分位 → ${contrastWithWhite(stats.p99).toFixed(2)}:1`)
  console.log(`  99.9% 分位 → ${contrastWithWhite(stats.p999).toFixed(2)}:1`)
  console.log(`  最亮像素 → ${contrastWithWhite(stats.max).toFixed(2)}:1`)
  const c = contrastWithWhite(stats.p999)
  const verdict = c >= 4.5 ? 'AA 正文标准（4.5:1）' : c >= 3 ? 'AA 大字号标准（3:1）' : '不达标'
  console.log(`  判定（99.9% 分位，达标线 ${min}:1）：${verdict} ${c >= min ? '✓' : '✗'}`)
  return c >= min
}
