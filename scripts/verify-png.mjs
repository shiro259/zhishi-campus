/**
 * PNG 校验脚本：自己解析 PNG 结构，验证生成的 tabBar 图标是否合法
 * （项目没有图片库，也无法截图，这是能做到的最强校验）
 *
 * 用法：node scripts/verify-png.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const DIR = path.join(ROOT, 'static', 'tabbar')

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

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

/** 解析 PNG，返回结构信息；任何不合法都抛错 */
function parsePng(buf, name) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('PNG 签名不正确')

  const chunks = []
  let off = 8
  let ihdr = null
  let idat = []
  let sawIend = false

  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    const crcStored = buf.readUInt32BE(off + 8 + len)
    const crcCalc = crc32(buf.subarray(off + 4, off + 8 + len))

    if (crcStored !== crcCalc) {
      throw new Error(`chunk ${type} 的 CRC 校验失败（存储 ${crcStored} / 计算 ${crcCalc}）`)
    }
    chunks.push(type)

    if (type === 'IHDR') {
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9]
      }
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      sawIend = true
    }

    off += 12 + len
  }

  if (!ihdr) throw new Error('缺少 IHDR')
  if (!sawIend) throw new Error('缺少 IEND')

  // 解压像素数据并统计透明/可见像素，确认确实"画了东西"
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const bpp = ihdr.colorType === 6 ? 4 : 3
  const stride = ihdr.width * bpp
  if (raw.length !== ihdr.height * (stride + 1)) {
    throw new Error(`IDAT 解压后长度异常：期望 ${ihdr.height * (stride + 1)}，实际 ${raw.length}`)
  }
  let opaque = 0
  let partial = 0
  let colored = 0
  let sampleColor = null
  const filterTypes = new Set()

  for (let y = 0; y < ihdr.height; y++) {
    const rowStart = y * (stride + 1)
    const filter = raw[rowStart]
    filterTypes.add(filter)
    for (let x = 0; x < ihdr.width; x++) {
      const p = rowStart + 1 + x * bpp
      const a = bpp === 4 ? raw[p + 3] : 255
      if (a > 250) {
        opaque++
        if (!sampleColor) sampleColor = [raw[p], raw[p + 1], raw[p + 2]]
        if (raw[p] || raw[p + 1] || raw[p + 2]) colored++
      } else if (a > 5) {
        partial++
      }
    }
  }

  return {
    name,
    size: buf.length,
    ...ihdr,
    chunks,
    opaque,
    partial,
    colored,
    sampleColor,
    filterTypes: [...filterTypes],
    totalPixels: ihdr.width * ihdr.height
  }
}

let failed = 0
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.png')).sort()

console.log(`校验 ${files.length} 个 PNG（${path.relative(ROOT, DIR)}）\n`)

for (const f of files) {
  const buf = fs.readFileSync(path.join(DIR, f))
  try {
    const r = parsePng(buf, f)
    const ratio = ((r.opaque + r.partial) / r.totalPixels * 100).toFixed(1)
    const issues = []
    if (r.width !== 81 || r.height !== 81) issues.push(`尺寸应为 81×81，实际 ${r.width}×${r.height}`)
    if (r.colorType !== 6) issues.push(`应为 RGBA(colorType 6)，实际 ${r.colorType}`)
    if (r.colored === 0) issues.push('所有像素都是黑色，未着色')
    if (r.opaque + r.partial === 0) issues.push('图像全透明，没有画出图形')
    if (r.opaque + r.partial > r.totalPixels * 0.6) issues.push('覆盖面积过大，可能不是线性图标')

    const color = r.sampleColor ? '#' + r.sampleColor.map((v) => v.toString(16).padStart(2, '0')).join('') : '—'
    console.log(
      `${f.padEnd(18)} ${String(r.size).padStart(5)}B  ${r.width}×${r.height}  RGBA  ` +
      `覆盖 ${ratio}%  主色 ${color}  ${issues.length ? '❌ ' + issues.join('; ') : '✅'}`
    )
    if (issues.length) failed++
  } catch (e) {
    console.log(`${f.padEnd(18)} ❌ ${e.message}`)
    failed++
  }
}

console.log(`\n${failed ? `失败 ${failed} 个` : '全部合法 ✅'}`)
if (failed) process.exitCode = 1
