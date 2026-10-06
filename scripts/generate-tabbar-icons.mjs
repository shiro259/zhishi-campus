/**
 * tabBar 图标生成脚本（用同一套线性图标光栅化成 PNG）
 *
 * 背景：tabBar 只接受本地图片路径，而项目里原来的四个图标是 hello uniCloud 模板自带的
 * 旧风格 PNdG，与新设计语言不一致。这里把 common/icons.js 的 SVG path 光栅化成 PNG，
 * 保证 tabBar 与页面内图标完全同源。
 *
 * 实现：自己写 PNG 编码（zlib 是 Node 内置的），并用 4× 超采样做抗锯齿，
 * 因此不需要任何第三方依赖，也不需要 sass/图片库。
 *
 * 用法：node scripts/generate-tabbar-icons.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { ICONS } from '../common/icons.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const OUT_DIR = path.join(ROOT, 'static', 'tabbar')

/** 与设计令牌保持一致：未选中 $gray4，选中 $brand */
const COLOR_NORMAL = [0xb8, 0xb2, 0xaa]
const COLOR_ACTIVE = [0xff, 0x5a, 0x36]

const SIZE = 81 // 微信推荐 81×81
const SS = 4 // 超采样倍数
const STROKE = 1.9 // 描边宽度（相对 24 视口）
const PAD = 2.2 // 四周留白（相对 24 视口）

/* ============================ PNG 编码 ============================ */

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

/** 把 RGBA 像素数组编码为 PNG Buffer */
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  // 每行前面加一个 filter byte（0 = None）
  const raw = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/* ======================== SVG path 解析与光栅化 ======================== */

/**
 * 椭圆弧（A 命令）转三次贝塞尔，遵循 SVG 规范的端点参数化换算。
 * 这样 icloud 里的圆弧类路径（时钟圆环、用户肩膀、定位水滴）都能被精确光栅化。
 */
function arcToCubics(x1, y1, rx, ry, phiDeg, largeArc, sweep, x2, y2) {
  if (rx === 0 || ry === 0) return [[[x2, y2], [x2, y2], [x2, y2]]]
  const phi = (phiDeg * Math.PI) / 180
  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)

  const dx2 = (x1 - x2) / 2
  const dy2 = (y1 - y2) / 2
  const x1p = cosPhi * dx2 + sinPhi * dy2
  const y1p = -sinPhi * dx2 + cosPhi * dy2

  let rxAbs = Math.abs(rx)
  let ryAbs = Math.abs(ry)
  const lambda = (x1p * x1p) / (rxAbs * rxAbs) + (y1p * y1p) / (ryAbs * ryAbs)
  if (lambda > 1) {
    const s = Math.sqrt(lambda)
    rxAbs *= s
    ryAbs *= s
  }

  const sign = largeArc !== sweep ? 1 : -1
  const numerator = rxAbs * rxAbs * ryAbs * ryAbs - rxAbs * rxAbs * y1p * y1p - ryAbs * ryAbs * x1p * x1p
  const denominator = rxAbs * rxAbs * y1p * y1p + ryAbs * ryAbs * x1p * x1p
  const coef = sign * Math.sqrt(Math.max(0, numerator / denominator))
  const cxp = (coef * rxAbs * y1p) / ryAbs
  const cyp = (-coef * ryAbs * x1p) / rxAbs
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2

  const angle = (ux, uy, vx, vy) => {
    const dot = ux * vx + uy * vy
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy)
    let a = Math.acos(Math.max(-1, Math.min(1, dot / (len || 1))))
    if (ux * vy - uy * vx < 0) a = -a
    return a
  }

  const theta1 = angle(1, 0, (x1p - cxp) / rxAbs, (y1p - cyp) / ryAbs)
  let delta = angle(
    (x1p - cxp) / rxAbs,
    (y1p - cyp) / ryAbs,
    (-x1p - cxp) / rxAbs,
    (-y1p - cyp) / ryAbs
  )
  if (!sweep && delta > 0) delta -= 2 * Math.PI
  if (sweep && delta < 0) delta += 2 * Math.PI

  const segCount = Math.ceil(Math.abs(delta / (Math.PI / 2)))
  const step = delta / segCount
  const alpha = (4 / 3) * Math.tan(step / 4)

  const out = []
  let t = theta1
  let px = x1
  let py = y1
  for (let i = 0; i < segCount; i++) {
    const t2 = t + step
    const cosT = Math.cos(t)
    const sinT = Math.sin(t)
    const cosT2 = Math.cos(t2)
    const sinT2 = Math.sin(t2)

    const ex = cosPhi * rxAbs * cosT2 - sinPhi * ryAbs * sinT2 + cx
    const ey = sinPhi * rxAbs * cosT2 + cosPhi * ryAbs * sinT2 + cy

    const d1x = -rxAbs * sinT
    const d1y = ryAbs * cosT
    const d2x = -rxAbs * sinT2
    const d2y = ryAbs * cosT2

    const c1x = px + alpha * (cosPhi * d1x - sinPhi * d1y)
    const c1y = py + alpha * (sinPhi * d1x + cosPhi * d1y)
    const c2x = ex - alpha * (cosPhi * d2x - sinPhi * d2y)
    const c2y = ey - alpha * (sinPhi * d2x + cosPhi * d2y)

    out.push([[c1x, c1y], [c2x, c2y], [ex, ey]])
    px = ex
    py = ey
    t = t2
  }
  return out
}

/**
 * 把 path 的 d 字符串解析为折线段落。
 *
 * 注意：不能用简单的正则切分数字。SVG 规范里 A 命令的 large-arc-flag 与 sweep-flag
 * 是**不带分隔符的单字符**，所以 "a9 9 0 100 18" 必须读成 rx=9 ry=9 rot=0 large=1 sweep=0 x=0 y=18；
 * 用正则切会把 "100" 当成数字 100 从而整体错位（圆就会被解析成乱七八糟的曲线）。
 * 因此这里实现一个字符扫描器，按命令语义决定每个参数是「数字」还是「flag」。
 */
function parsePath(d) {
  const src = String(d)
  let i = 0
  const segments = []

  let cx = 0
  let cy = 0
  let startX = 0
  let startY = 0
  let prevCtrl = null // 上一段三次曲线的第二控制点（S 命令镜像用）
  let prevQCtrl = null // 上一段二次曲线的控制点（T 命令镜像用）

  const isCmd = (ch) => /[MmLlHhVvCcSsQqTtAaZz]/.test(ch)
  const isNumStart = (ch) => ch === '-' || ch === '+' || ch === '.' || (ch >= '0' && ch <= '9')

  /** 读一个普通数字（允许 1e-3 这类科学计数） */
  function readNumber() {
    while (i < src.length && /[\s,]/.test(src[i])) i++
    const start = i
    if (src[i] === '-' || src[i] === '+') i++
    while (i < src.length && src[i] >= '0' && src[i] <= '9') i++
    if (src[i] === '.') {
      i++
      while (i < src.length && src[i] >= '0' && src[i] <= '9') i++
    }
    if (src[i] === 'e' || src[i] === 'E') {
      const save = i
      i++
      if (src[i] === '-' || src[i] === '+') i++
      if (src[i] >= '0' && src[i] <= '9') {
        while (i < src.length && src[i] >= '0' && src[i] <= '9') i++
      } else {
        i = save
      }
    }
    if (i === start) return NaN
    return parseFloat(src.slice(start, i))
  }

  /** 读一个 flag：单个字符 0 或 1 */
  function readFlag() {
    while (i < src.length && /[\s,]/.test(src[i])) i++
    const ch = src[i]
    if (ch === '0' || ch === '1') {
      i++
      return Number(ch)
    }
    return NaN
  }

  /** 跳到下一个参数（数字或命令）之前 */
  function skipSep() {
    while (i < src.length && /[\s,]/.test(src[i])) i++
  }

  while (i < src.length) {
    skipSep()
    if (i >= src.length) break
    if (!isCmd(src[i])) {
      i++
      continue
    }

    const cmd = src[i++]
    const rel = cmd === cmd.toLowerCase()
    const up = cmd.toUpperCase()

    if (up === 'Z') {
      if (cx !== startX || cy !== startY) {
        segments.push({ from: [cx, cy], to: [startX, startY], curves: [] })
      }
      cx = startX
      cy = startY
      prevCtrl = null
      prevQCtrl = null
      continue
    }

    // 一个命令可能带多组参数（如 "l2 3 4 5" 表示两段线）
    let guard = 0
    while (i < src.length && guard++ < 10000) {
      skipSep()
      if (i >= src.length || isCmd(src[i])) break
      if (!isNumStart(src[i])) break

      if (up === 'M' || up === 'L' || up === 'T') {
        const x = readNumber()
        const y = readNumber()
        if (!Number.isFinite(x) || !Number.isFinite(y)) break
        const nx = rel ? cx + x : x
        const ny = rel ? cy + y : y
        if (up === 'M') {
          cx = nx; cy = ny
          startX = nx; startY = ny
          prevCtrl = null; prevQCtrl = null
          // M 之后的后续坐标对按 L 处理（规范行为）
          continue
        }
        if (up === 'T') {
          const qx = prevQCtrl ? 2 * cx - prevQCtrl[0] : cx
          const qy = prevQCtrl ? 2 * cy - prevQCtrl[1] : cy
          const c1x = cx + (2 / 3) * (qx - cx)
          const c1y = cy + (2 / 3) * (qy - cy)
          const c2x = nx + (2 / 3) * (qx - nx)
          const c2y = ny + (2 / 3) * (qy - ny)
          segments.push({ from: [cx, cy], to: [nx, ny], curves: [[c1x, c1y], [c2x, c2y], [nx, ny]] })
          prevQCtrl = [qx, qy]
          prevCtrl = [c2x, c2y]
        } else {
          segments.push({ from: [cx, cy], to: [nx, ny], curves: [] })
          prevCtrl = null
          prevQCtrl = null
        }
        cx = nx; cy = ny
      } else if (up === 'H') {
        const x = readNumber()
        if (!Number.isFinite(x)) break
        const nx = rel ? cx + x : x
        segments.push({ from: [cx, cy], to: [nx, cy], curves: [] })
        cx = nx
        prevCtrl = null; prevQCtrl = null
      } else if (up === 'V') {
        const y = readNumber()
        if (!Number.isFinite(y)) break
        const ny = rel ? cy + y : y
        segments.push({ from: [cx, cy], to: [cx, ny], curves: [] })
        cy = ny
        prevCtrl = null; prevQCtrl = null
      } else if (up === 'C' || up === 'S') {
        let x1, y1, x2, y2, x, y
        if (up === 'C') {
          x1 = readNumber(); y1 = readNumber()
          x2 = readNumber(); y2 = readNumber()
          x = readNumber(); y = readNumber()
          if (![x1, y1, x2, y2, x, y].every(Number.isFinite)) break
          if (rel) { x1 += cx; y1 += cy; x2 += cx; y2 += cy; x += cx; y += cy }
        } else {
          x2 = readNumber(); y2 = readNumber()
          x = readNumber(); y = readNumber()
          if (![x2, y2, x, y].every(Number.isFinite)) break
          if (rel) { x2 += cx; y2 += cy; x += cx; y += cy }
          x1 = prevCtrl ? 2 * cx - prevCtrl[0] : cx
          y1 = prevCtrl ? 2 * cy - prevCtrl[1] : cy
        }
        segments.push({ from: [cx, cy], to: [x, y], curves: [[x1, y1], [x2, y2], [x, y]] })
        prevCtrl = [x2, y2]
        prevQCtrl = null
        cx = x; cy = y
      } else if (up === 'Q') {
        const x1 = readNumber(); const y1 = readNumber()
        const x = readNumber(); const y = readNumber()
        if (![x1, y1, x, y].every(Number.isFinite)) break
        const ax1 = rel ? x1 + cx : x1
        const ay1 = rel ? y1 + cy : y1
        const nx = rel ? x + cx : x
        const ny = rel ? y + cy : y
        const c1x = cx + (2 / 3) * (ax1 - cx)
        const c1y = cy + (2 / 3) * (ay1 - cy)
        const c2x = nx + (2 / 3) * (ax1 - nx)
        const c2y = ny + (2 / 3) * (ay1 - ny)
        segments.push({ from: [cx, cy], to: [nx, ny], curves: [[c1x, c1y], [c2x, c2y], [nx, ny]] })
        prevQCtrl = [ax1, ay1]
        prevCtrl = [c2x, c2y]
        cx = nx; cy = ny
      } else if (up === 'A') {
        const rx = readNumber()
        const ry = readNumber()
        const rot = readNumber()
        const largeArc = readFlag()
        const sweep = readFlag()
        const x = readNumber()
        const y = readNumber()
        if (![rx, ry, rot, largeArc, sweep, x, y].every(Number.isFinite)) break
        const nx = rel ? cx + x : x
        const ny = rel ? cy + y : y
        for (const cub of arcToCubics(cx, cy, rx, ry, rot, largeArc, sweep, nx, ny)) {
          segments.push({ from: [cx, cy], to: [cub[2][0], cub[2][1]], curves: cub })
          cx = cub[2][0]
          cy = cub[2][1]
        }
        cx = nx
        cy = ny
        prevCtrl = null
        prevQCtrl = null
      } else {
        break
      }
    }
  }

  return segments
}

/** 采样一条线段/贝塞尔，返回点序列 */
function sampleSegment(seg, steps = 24) {
  const pts = []
  const [x0, y0] = seg.from
  if (seg.curves && seg.curves.length) {
    const [c1, c2, p3] = seg.curves
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      const mt = 1 - t
      const x = mt * mt * mt * x0 + 3 * mt * mt * t * c1[0] + 3 * mt * t * t * c2[0] + t * t * t * p3[0]
      const y = mt * mt * mt * y0 + 3 * mt * mt * t * c1[1] + 3 * mt * t * t * c2[1] + t * t * t * p3[1]
      pts.push([x, y])
    }
  } else {
    pts.push([x0, y0], [seg.to[0], seg.to[1]])
  }
  return pts
}

/** 点到线段距离 */
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const cx = x1 + t * dx
  const cy = y1 + t * dy
  return Math.hypot(px - cx, py - cy)
}

/** 把一段 path 光栅化到 alpha 覆盖率数组（超采样后降采样） */
function rasterize(segments, size) {
  const hi = size * SS
  const cover = new Float32Array(size * size)
  const scale = (24 - PAD * 2) / 24 // 视口 24 映射到可用区域
  const offset = PAD
  const half = STROKE / 2

  // 预先把所有折线点转换到高分辨率设备坐标
  const polylines = segments.map((seg) =>
    sampleSegment(seg).map(([x, y]) => [
      (offset + x * scale) * (hi / 24),
      (offset + y * scale) * (hi / 24)
    ])
  )

  for (let y = 0; y < hi; y++) {
    for (let x = 0; x < hi; x++) {
      const px = x + 0.5
      const py = y + 0.5
      let hit = false
      for (const line of polylines) {
        for (let k = 0; k < line.length - 1; k++) {
          const d = distToSegment(px, py, line[k][0], line[k][1], line[k + 1][0], line[k + 1][1])
          if (d <= half * (hi / 24)) {
            hit = true
            break
          }
        }
        if (hit) break
      }
      if (hit) {
        // 累加到对应的低分辨率像素
        cover[Math.floor(y / SS) * size + Math.floor(x / SS)] += 1
      }
    }
  }

  const per = SS * SS
  for (let i = 0; i < cover.length; i++) cover[i] = cover[i] / per
  return cover
}

/** 生成一张图标 PNG */
function renderIcon(name, color) {
  const d = ICONS[name]
  if (!d) throw new Error('图标不存在: ' + name)

  const segments = parsePath(d)
  const cover = rasterize(segments, SIZE)
  const rgba = Buffer.alloc(SIZE * SIZE * 4)

  for (let i = 0; i < SIZE * SIZE; i++) {
    const a = Math.max(0, Math.min(1, cover[i]))
    rgba[i * 4] = color[0]
    rgba[i * 4 + 1] = color[1]
    rgba[i * 4 + 2] = color[2]
    rgba[i * 4 + 3] = Math.round(a * 255)
  }

  return encodePng(SIZE, SIZE, rgba)
}

/* ================================ 主流程 ================================ */

const TABS = [
  { key: 'home', icon: 'home' },
  { key: 'ai', icon: 'sparkle' },
  { key: 'dish', icon: 'bowl' },
  { key: 'user', icon: 'user' }
]

// home 不在原始图标集里，这里补一个房子路径（与线性风格一致）
ICONS.home = 'M4 11l8-7 8 7v9a1 1 0 01-1 1h-4v-6H9v6H5a1 1 0 01-1-1v-9z'

fs.mkdirSync(OUT_DIR, { recursive: true })

let count = 0
for (const tab of TABS) {
  const normal = renderIcon(tab.icon, COLOR_NORMAL)
  const active = renderIcon(tab.icon, COLOR_ACTIVE)
  fs.writeFileSync(path.join(OUT_DIR, `${tab.key}.png`), normal)
  fs.writeFileSync(path.join(OUT_DIR, `${tab.key}-active.png`), active)
  console.log(`${tab.key}.png ${normal.length}B / ${tab.key}-active.png ${active.length}B  (${tab.icon})`)
  count += 2
}

console.log(`\n共生成 ${count} 个图标 -> static/tabbar/`)
console.log('提示：pages.json 的 tabBar.iconPath 需指向 home.png / ai.png / dish.png / user.png')
