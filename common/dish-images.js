/**
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
export const DISH_IMAGES_GENERATED_AT = '2026-10-06 02:18:16'

/** 实际存在的菜品图片文件名（相对于 static/dishes/），例如 ['d001.jpg'] */
export const DISH_IMAGE_FILES = [
  "d001.jpg",
  "d002.jpg",
  "d003.jpg",
  "d004.jpg",
  "d005.jpg",
  "d006.jpg",
  "d007.jpg",
  "d008.jpg",
  "d009.jpg",
  "d010.jpg",
  "d011.jpg",
  "d012.jpg",
  "d013.jpg",
  "d014.jpg",
  "d015.jpg",
  "d016.jpg",
  "d017.jpg",
  "d018.jpg",
  "d019.jpg",
  "d020.jpg",
  "d021.jpg",
  "d022.jpg",
  "d023.jpg",
  "d024.jpg",
  "d025.jpg",
  "d026.jpg",
  "d027.jpg",
  "d028.jpg",
  "d029.jpg",
  "d030.jpg",
  "d031.jpg",
  "d032.jpg",
  "d033.jpg",
  "d034.jpg",
  "d035.jpg",
  "d036.jpg",
  "d037.jpg",
  "d038.jpg",
  "d039.jpg",
  "d040.jpg",
  "d041.jpg"
]

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
