/**
 * 菜品图片清单生成脚本
 *
 * 产出 common/dish-images.js —— 一份「实际存在哪些菜品图片」的清单。
 *
 * 为什么需要它：
 *   <image> 的加载失败回退是"异步 + 事后方知"的，图片不存在时仍会先渲染一个
 *   空白/破图占位，H5 下满屏都是加载失败的图标，看起来像"界面内容全没了"。
 *   有了这份构建期清单，组件在渲染前就能判断图片是否存在，不存在就直接走 emoji 回退，
 *   既不发起必然失败的请求，也不会出现破图。
 *
 * 用法：
 *   node scripts/gen-dish-images.mjs      # 扫描 static/dishes/ 并写入清单
 *   node scripts/download-dish-images.mjs # 下载完图片后会自动调用本脚本
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const DISH_DIR = path.join(ROOT, 'static', 'dishes')
const OUT_FILE = path.join(ROOT, 'common', 'dish-images.js')

const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp']

/** 扫描目录，返回所有菜品图片文件名 */
function scan() {
  if (!fs.existsSync(DISH_DIR)) return []
  return fs
    .readdirSync(DISH_DIR)
    .filter((f) => IMAGE_EXT.includes(path.extname(f).toLowerCase()))
    .sort()
}

const files = scan()

const content = `/**
 * 菜品图片清单（由 scripts/gen-dish-images.mjs 自动生成，请勿手改）
 *
 * 记录 static/dishes/ 下实际存在哪些图片。组件据此在渲染前判断图片是否存在，
 * 不存在时直接使用 emoji 回退，避免出现"加载失败的破图"。
 *
 * 新增图片后请重新运行：
 *   node scripts/gen-dish-images.mjs
 * 或直接用下载脚本（它会在结束时自动重新生成本清单）：
 *   node scripts/download-dish-images.mjs
 */

/** 生成时间 */
export const DISH_IMAGES_GENERATED_AT = '${new Date().toISOString().slice(0, 19).replace('T', ' ')}'

/** 实际存在的菜品图片文件名（相对于 static/dishes/），例如 ['d001.jpg'] */
export const DISH_IMAGE_FILES = ${JSON.stringify(files, null, 2)}

/** 快速查表用的集合 */
const FILE_SET = new Set(DISH_IMAGE_FILES)

/**
 * 判断某个菜品图片文件名是否真实存在
 * @param {string} fileName 例如 'd001.jpg'
 * @returns {boolean}
 */
export function hasDishImageFile(fileName) {
  if (!fileName) return false
  return FILE_SET.has(String(fileName))
}
`

fs.writeFileSync(OUT_FILE, content, 'utf8')

console.log(`扫描 ${path.relative(ROOT, DISH_DIR)}：发现 ${files.length} 张图片`)
if (files.length) {
  console.log('  ' + files.slice(0, 8).join(', ') + (files.length > 8 ? ` …共 ${files.length} 张` : ''))
} else {
  console.log('  （目录为空：所有菜品将使用 emoji 回退展示，不会出现破图）')
}
console.log(`清单已写入 -> ${path.relative(ROOT, OUT_FILE)}`)
