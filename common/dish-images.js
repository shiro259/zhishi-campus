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
export const DISH_IMAGES_GENERATED_AT = '2026-10-06 10:53:22'

/** 实际存在的菜品图片文件名（相对于 static/dishes/），例如 ['d001.jpg'] */
export const DISH_IMAGE_FILES = []

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
