/**
 * 光栅化器几何自测：用可解析验证的图形检查「画出来的像素分布」是否正确
 *
 * 项目没有图片库也没有截图能力，这是唯一能证明图标"画对了"的办法：
 * 用已知形状的覆盖率与包围盒与理论值比对。
 *
 * 用法：node scripts/test-rasterizer.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DIR = path.resolve(HERE, '..', 'static', 'tabbar')

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

/** 解析 PNG 为 { width, height, alpha(x,y) } */
function decodePng(buf) {
  // 结构：8 字节签名 + 4 字节长度 + 4 字节类型 "IHDR" + IHDR 数据
  // 因此 IHDR 数据从偏移 16 开始：宽@16、高@20、位深@24、颜色类型@25
  const width = buf.readUInt32BE(16)
  const height = buf.readUInt32BE(20)
  const bitDepth = buf[24]
  const colorType = buf[25]
  if (bitDepth !== 8) throw new Error('只支持 8 位深，实际 ' + bitDepth)
  if (colorType !== 6 && colorType !== 2) throw new Error('不支持的颜色类型 ' + colorType)
  const bpp = colorType === 6 ? 4 : 3

  let off = 8
  const idat = []
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    if (type === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len))
    off += 12 + len
  }

  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = width * bpp

  // PNG 逐行滤波还原：每行开头有 1 字节 filter type，必须先反滤波才能得到真实像素，
  // 否则读到的是压缩后的差分数据（会表现为"整图全透明/全覆盖"）。
  const img = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const ft = raw[y * (stride + 1)]
    const src = y * (stride + 1) + 1
    const dst = y * stride
    const prev = dst - stride
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? img[dst + x - bpp] : 0
      const b = y > 0 ? img[prev + x] : 0
      const c = x >= bpp && y > 0 ? img[prev + x - bpp] : 0
      const v = raw[src + x]
      let out
      switch (ft) {
        case 0: out = v; break
        case 1: out = v + a; break
        case 2: out = v + b; break
        case 3: out = v + ((a + b) >> 1); break
        case 4: {
          const p = a + b - c
          const pa = Math.abs(p - a)
          const pb = Math.abs(p - b)
          const pc = Math.abs(p - c)
          out = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)
          break
        }
        default: throw new Error('未知的 PNG filter: ' + ft)
      }
      img[dst + x] = out & 0xff
    }
  }

  const alpha = new Float32Array(width * height)
  const rgb = new Uint8Array(width * height * 3)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * stride + x * bpp
      rgb[(y * width + x) * 3] = img[p]
      rgb[(y * width + x) * 3 + 1] = img[p + 1]
      rgb[(y * width + x) * 3 + 2] = img[p + 2]
      alpha[y * width + x] = (bpp === 4 ? img[p + 3] : 255) / 255
    }
  }
  return { width, height, alpha, rgb }
}

/** 计算可见像素的包围盒与覆盖率 */
function analyze(img) {
  return analyzeRegion(img, 0, 0, 1, 1)
}

/**
 * 只统计图像某个相对矩形区域内的可见像素
 * @param {*} img 解码后的图像
 * @param {number} x0 左边界（0~1 相对值）
 * @param {number} y0 上边界
 * @param {number} x1 右边界
 * @param {number} y1 下边界
 */
function analyzeRegion(img, x0, y0, x1, y1) {
  const xa = Math.floor(img.width * x0)
  const xb = Math.ceil(img.width * x1)
  const ya = Math.floor(img.height * y0)
  const yb = Math.ceil(img.height * y1)

  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1, sum = 0
  for (let y = ya; y < yb; y++) {
    for (let x = xa; x < xb; x++) {
      const a = img.alpha[y * img.width + x]
      if (a > 0.35) {
        sum += a
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  return {
    coverage: sum / ((xb - xa) * (yb - ya)),
    box: { minX, minY, maxX, maxY },
    w: maxX - minX + 1,
    h: maxY - minY + 1
  }
}

/** 9×9 网格的覆盖率分布，用于判断图形整体朝向/结构 */
function gridProfile(img, n = 3) {
  const cells = new Array(n * n).fill(0)
  const cellW = img.width / n
  const cellH = img.height / n
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const gx = Math.min(n - 1, Math.floor(x / cellW))
      const gy = Math.min(n - 1, Math.floor(y / cellH))
      cells[gy * n + gx] += img.alpha[y * img.width + x]
    }
  }
  const total = cells.reduce((a, b) => a + b, 0) || 1
  return cells.map((c) => c / total)
}

/* ------------------------------- 断言工具 ------------------------------- */

let pass = 0
const fails = []

function check(label, cond, extra) {
  if (cond) pass++
  else fails.push(label + (extra ? ' -> ' + extra : ''))
}

function load(name) {
  return decodePng(fs.readFileSync(path.join(DIR, name)))
}

/* --------------------------------- 测试 --------------------------------- */

const SIZE = 81
// 生成参数（与 generate-tabbar-icons.mjs 保持一致）：PAD=2.2/24，STROKE=1.9/24
const PAD = 2.2
const STROKE = 1.9
const scale = (24 - PAD * 2) / 24
const toPx = (v) => (PAD + v * scale) * (SIZE / 24)

console.log('=== 1. 基本几何：所有图标都应落在留白之内、且图形居中 ===')
for (const f of ['home.png', 'ai.png', 'dish.png', 'user.png']) {
  const r = analyze(load(f))
  const padPx = toPx(0)

  check(`${f} 未画出边界`, r.box.minX >= 0 && r.box.maxX < SIZE, JSON.stringify(r.box))
  check(`${f} 四周应留白（≥ ${padPx.toFixed(1)}px）`,
    r.box.minX >= padPx - 2 && r.box.minY >= padPx - 2 &&
    r.box.maxX <= SIZE - padPx + 2 && r.box.maxY <= SIZE - padPx + 2,
    `box=${r.box.minX},${r.box.minY},${r.box.maxX},${r.box.maxY}`)

  // 图形重心应接近画布中心（线性图标本身偏心，容差放到 6px）
  const cx = (r.box.minX + r.box.maxX) / 2
  const cy = (r.box.minY + r.box.maxY) / 2
  check(`${f} 图形大致居中`, Math.abs(cx - SIZE / 2) <= 6 && Math.abs(cy - SIZE / 2) <= 6,
    `center=(${cx},${cy})`)
}

console.log('\n=== 2. 覆盖率应在合理区间（线性图标约 5%~25%）===')
for (const f of ['home.png', 'ai.png', 'dish.png', 'user.png', 'home-active.png']) {
  const r = analyze(load(f))
  const pct = r.coverage * 100
  check(`${f} 覆盖率合理`, pct > 4 && pct < 26, pct.toFixed(1) + '%')
}

console.log('\n=== 3. 颜色：未选中为中性灰，选中为品牌橙 ===')
const gray = load('dish.png')
const brand = load('dish-active.png')
const px = (img, x, y) => {
  const i = (y * img.width + x) * 3
  return [img.rgb[i], img.rgb[i + 1], img.rgb[i + 2]]
}
// 找一个可见像素取色
function firstVisible(img) {
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.alpha[y * img.width + x] > 0.9) return px(img, x, y)
    }
  }
  return null
}
const gc = firstVisible(gray)
const bc = firstVisible(brand)
check('未选中色为 #B8B2AA', gc && gc[0] === 0xb8 && gc[1] === 0xb2 && gc[2] === 0xaa, JSON.stringify(gc))
check('选中色为 #FF5A36', bc && bc[0] === 0xff && bc[1] === 0x5a && bc[2] === 0x36, JSON.stringify(bc))

console.log('\n=== 4. 抗锯齿：边缘应存在半透明像素（证明做了超采样）===')
for (const f of ['home.png', 'ai.png', 'dish.png', 'user.png']) {
  const img = load(f)
  let partial = 0
  for (let i = 0; i < img.alpha.length; i++) {
    if (img.alpha[i] > 0.05 && img.alpha[i] < 0.95) partial++
  }
  check(`${f} 存在抗锯齿边缘`, partial > 100, `半透明像素=${partial}`)
}

console.log('\n=== 5. 结构：用 3×3 网格分布验证图形朝向（这是"画对了"的关键证据）===')
// user 图标：上方一个头（圆），下方一道「向上鼓」的肩膀弧。
// 注意：肩弧两端低、中间高，所以底部行的左右两格有内容、中间格基本为空——
// 这正是"画成了弧"而不是"画成了直线/实心块"的判据。
const u = load('user.png')
const ug = gridProfile(u, 3)
const cell = (g, x, y) => g[y * 3 + x]

check('user：顶部中列有内容（头部圆）', cell(ug, 1, 0) > 0.02, cell(ug, 1, 0).toFixed(3))
check('user：底部左右两格有内容（肩弧两端）',
  cell(ug, 0, 2) > 0.04 && cell(ug, 2, 2) > 0.04,
  `${cell(ug, 0, 2).toFixed(3)}, ${cell(ug, 2, 2).toFixed(3)}`)
check('user：底部中间为空（肩弧向上鼓，不是实心块）',
  cell(ug, 1, 2) < 0.02,
  cell(ug, 1, 2).toFixed(3))
check('user：左右下角对称',
  Math.abs(cell(ug, 0, 2) - cell(ug, 2, 2)) < 0.02,
  `${cell(ug, 0, 2).toFixed(3)} vs ${cell(ug, 2, 2).toFixed(3)}`)
check('user：左上/右上角为空（不是方块）',
  cell(ug, 0, 0) < 0.01 && cell(ug, 2, 0) < 0.01,
  `${cell(ug, 0, 0).toFixed(3)},${cell(ug, 2, 0).toFixed(3)}`)

// 圆度验证：头部应接近正圆。取头部所在上半区的包围盒，宽高比接近 1
const head = analyzeRegion(u, 0.25, 0.05, 0.75, 0.5)
check('user：头部轮廓接近正圆（宽高比 0.8~1.25）',
  head.w / head.h > 0.8 && head.w / head.h < 1.25,
  `w=${head.w} h=${head.h} ratio=${(head.w / head.h).toFixed(2)}`)

// dish（碗）：底部一道弧 + 上方三条竖线 → 底部行内容明显多于顶部行
const d = load('dish.png')
const dg = gridProfile(d, 3)
const topRow = cell(dg, 0, 0) + cell(dg, 1, 0) + cell(dg, 2, 0)
const botRow = cell(dg, 0, 2) + cell(dg, 1, 2) + cell(dg, 2, 2)
check('dish：下半部内容多于上半部（碗形）', botRow > topRow, `top=${topRow.toFixed(3)} bottom=${botRow.toFixed(3)}`)

// home（房子）：屋顶在上半部、左右对称
const h = load('home.png')
const hg = gridProfile(h, 3)
check('home：左右对称',
  Math.abs(cell(hg, 0, 1) - cell(hg, 2, 1)) < 0.04,
  `${cell(hg, 0, 1).toFixed(3)} vs ${cell(hg, 2, 1).toFixed(3)}`)
check('home：顶部中列有内容（屋脊）', cell(hg, 1, 0) > 0.05, cell(hg, 1, 0).toFixed(3))

// ai（星芒）：中心区域内容应多于四角
const a = load('ai.png')
const ag = gridProfile(a, 3)
const center = cell(ag, 1, 1)
const corners = cell(ag, 0, 0) + cell(ag, 2, 0) + cell(ag, 0, 2) + cell(ag, 2, 2)
check('ai：中心内容多于四角（星芒）', center > corners, `center=${center.toFixed(3)} corners=${corners.toFixed(3)}`)

/* --------------------------------- 结果 --------------------------------- */

// ASCII 预览：把图标按覆盖率打印成字符画。
// 本项目没有图片库、也无法截图渲染，这是唯一能"看见"图标的途径，
// 用于人工确认形状确实是房子 / 星芒 / 碗 / 人像，而不是一堆错乱曲线。
if (process.argv.includes('--show') || process.argv.includes('-s')) {
  const CHARS = ' .:-=+*#%@'
  const N = 27
  console.log('\n=== ASCII 预览（字符越靠右表示覆盖率越高）===')
  for (const [file, label] of [
    ['home.png', '首页 home'],
    ['ai.png', 'AI sparkle'],
    ['dish.png', '菜单 bowl'],
    ['user.png', '我的 user']
  ]) {
    const img = load(file)
    console.log(`\n${label}  (${file})`)
    for (let gy = 0; gy < N; gy++) {
      let line = ''
      for (let gx = 0; gx < N; gx++) {
        const x0 = Math.floor((gx / N) * img.width)
        const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) / N) * img.width))
        const y0 = Math.floor((gy / N) * img.height)
        const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) / N) * img.height))
        let sum = 0
        let n = 0
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            sum += img.alpha[y * img.width + x]
            n++
          }
        }
        const v = n ? sum / n : 0
        line += CHARS[Math.min(CHARS.length - 1, Math.round(v * (CHARS.length - 1)))]
      }
      console.log('  ' + line)
    }
  }
}

console.log('')
console.log(`断言通过: ${pass}`)
if (fails.length) {
  console.log(`断言失败: ${fails.length}`)
  fails.forEach((f) => console.log('  ✗ ' + f))
  process.exitCode = 1
} else {
  console.log('全部通过 ✅（图标几何、配色、抗锯齿、结构朝向均已验证）')
}
