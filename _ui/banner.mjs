/**
 * 把「首页照片」里的校园食堂大图处理成小程序可用的 Banner 资源
 *
 * 为什么要处理三件事：
 *
 * 1. **位置**：小程序运行时只能读取包内 static/ 下的静态资源（或云存储）。
 *    放在项目根目录的「首页照片/」在小程序里根本加载不到 —— 必须复制进 static/。
 *
 * 2. **体积**：原图 1.7MB，微信小程序主包上限只有 2MB。Banner 按 750rpx 宽、
 *    400rpx 高（≈375×200pt）显示，2~3 倍图足够，转成 JPEG 后能降到 100KB 级别。
 *
 * 3. **构图**：Banner 是 750×400rpx（1.875:1）的横长条，原图多为方形，
 *    直接 aspectFill 会随机裁掉两侧。这里按 1.875:1 居中裁切（cover），
 *    保证右侧食堂场景完整、左侧留给文字。
 *
 * 同时统计左右两半的平均亮度：左侧亮就说明白字压不住，需要更强的橙色蒙版。
 * 用法：node _ui/banner.mjs
 */
import { readdirSync, mkdirSync, statSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC_DIR = join(ROOT, '首页照片')
const OUT_DIR = join(ROOT, 'static', 'banner')
const OUT = join(OUT_DIR, 'canteen.jpg')

// Banner 显示尺寸 750rpx × 400rpx（iPhone 上约 375×200pt）→ 3 倍图
const OUT_W = 1125
const OUT_H = 600

if (!statSync(SRC_DIR, { throwIfNoEntry: false })) {
  console.error('没找到「首页照片」目录：' + SRC_DIR)
  process.exit(1)
}

const candidates = readdirSync(SRC_DIR).filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
if (!candidates.length) {
  console.error('「首页照片」里没有图片文件')
  process.exit(1)
}
// 取体积最大的那张（通常是主图），并打印全部候选，方便确认选对了
const picked = candidates
  .map((f) => ({ f, size: statSync(join(SRC_DIR, f)).size }))
  .sort((a, b) => b.size - a.size)

console.log('候选图片（按体积降序）：')
picked.forEach((p, i) => console.log(`  ${i === 0 ? '→' : ' '} ${p.f}  ${(p.size / 1024 / 1024).toFixed(2)} MB`))

const src = join(SRC_DIR, picked[0].f)
const meta = await sharp(src).metadata()
console.log(`\n原图：${meta.width}×${meta.height} ${meta.format}，宽高比 ${(meta.width / meta.height).toFixed(3)}（目标 ${(OUT_W / OUT_H).toFixed(3)}）`)

mkdirSync(OUT_DIR, { recursive: true })

const base = sharp(src).rotate() // rotate() 无参 = 按 EXIF 自动纠正方向
const resized = base.resize(OUT_W, OUT_H, { fit: 'cover', position: 'attention' })

// 蒙版强度参考：左右两半的平均亮度（0~255）
const probe = async (left) => {
  const w = Math.floor(OUT_W / 2)
  const { channels } = await sharp(await resized.clone().png().toBuffer())
    .extract({ left: left ? 0 : w, top: 0, width: w, height: OUT_H })
    .greyscale()
    .stats()
  return Math.round(channels[0].mean)
}

await resized.clone().jpeg({ quality: 82, mozjpeg: true }).toFile(OUT)

const leftMean = await probe(true)
const rightMean = await probe(false)
const before = statSync(src).size
const after = statSync(OUT).size

console.log(`\n输出：static/banner/${basename(OUT)}  ${OUT_W}×${OUT_H}  ${(after / 1024).toFixed(1)} KB（原图 ${(before / 1024).toFixed(1)} KB，缩小到 ${(after / before * 100).toFixed(1)}%）`)
console.log(`左半平均亮度 ${leftMean}/255，右半平均亮度 ${rightMean}/255`)
console.log(
  leftMean > 150
    ? '  左半偏亮 → 左侧文字需要较重的橙色蒙版才能保证对比度'
    : '  左半不算亮 → 中等蒙版即可，右侧保留通透感'
)
