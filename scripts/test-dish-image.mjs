/**
 * 回归测试：菜品图片解析正确性
 *
 * 背景 bug：图片地址按 id 拼出来后直接交给 <image>，但文件并不存在时，
 * <image> 会先渲染一个"加载失败"的占位，H5 下满屏破图，看起来像内容全没了。
 * 修复后 dishImageSrc 必须依据构建期清单判断文件是否真实存在，不存在就返回空串，
 * 让组件走 emoji 回退。
 *
 * 用法：node --import ./scripts/register-alias.mjs scripts/test-dish-image.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')

/** Windows 下动态 import 必须用 file:// URL */
const load = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href)

// 让 common/utils.js 里的 uni 调用（若有）有兜底
globalThis.uni = globalThis.uni || {
  getStorageSync: () => '',
  setStorageSync: () => {},
  removeStorageSync: () => {},
  showToast: () => {}
}

const { dishImageSrc, dishEmoji, dishUsesEmojiFallback } = await load('common/utils.js')
const { DISH_IMAGE_FILES, hasDishImageFile } = await load('common/dish-images.js')

let pass = 0
const fails = []
const check = (name, cond, extra) => {
  if (cond) pass++
  else fails.push(name + (extra ? ' -> ' + extra : ''))
}

const IMG_DIR = path.join(ROOT, 'static', 'dishes')
const actualFiles = fs.existsSync(IMG_DIR)
  ? fs.readdirSync(IMG_DIR).filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
  : []

console.log(`static/dishes/ 实际有 ${actualFiles.length} 张图片`)
console.log(`清单登记 ${DISH_IMAGE_FILES.length} 张`)
console.log('')

/* ---------- 1. 清单与实际文件一致 ---------- */
check(
  '清单与实际文件完全一致',
  JSON.stringify([...DISH_IMAGE_FILES].sort()) === JSON.stringify([...actualFiles].sort()),
  `清单 ${DISH_IMAGE_FILES.length} vs 实际 ${actualFiles.length}`
)

/* ---------- 2. 核心回归：本地约定路径必须核验文件存在 ---------- */
// 找一个本地图片槽位（按 id 约定），分别测试"文件存在"与"文件不存在"两种情形
const existingId = actualFiles
  .map((f) => f.match(/^(d\d{3})\.jpg$/i))
  .find(Boolean)?.[1]

if (existingId) {
  const src = dishImageSrc({ id: existingId, image: `static/dishes/${existingId}.jpg` })
  check('文件存在时返回真实路径', src === `static/dishes/${existingId}.jpg`, src)
  check('文件存在时 not 回退', dishUsesEmojiFallback({ id: existingId, image: `static/dishes/${existingId}.jpg` }) === false)
} else {
  // 当前目录为空：所有按约定拼出的路径都必须被判为"无图"
  const src = dishImageSrc({ id: 'd001', image: 'static/dishes/d001.jpg' })
  check('文件不存在时返回空串（不渲染破图）', src === '', JSON.stringify(src))
}

// 无论目录是否为空，都要测一个"确定不存在"的编号
const ghost = 'd999'
check(`不存在的 ${ghost}.jpg 必须判为无图`, dishImageSrc({ id: ghost, image: `static/dishes/${ghost}.jpg` }) === '')
check(`不存在的 ${ghost}（仅 id）必须判为无图`, dishImageSrc({ id: ghost }) === '')
check(`不存在的 ${ghost} 应走 emoji 回退`, dishUsesEmojiFallback({ id: ghost }) === true)

/* ---------- 3. 外链 / 云存储地址不应被清单拦掉 ---------- */
const cloud = 'https://xxx.bspapp.com/dish/a.jpg'
check('云存储地址直接信任', dishImageSrc({ id: 'd001', image: cloud }) === cloud, dishImageSrc({ id: 'd001', image: cloud }))
check('非约定的本地路径（如上传目录）直接信任',
  dishImageSrc({ id: 'd001', image: 'static/uploads/a.jpg' }) === 'static/uploads/a.jpg')

/* ---------- 4. emoji 回退值正确 ---------- */
check('有 emoji 字段时用它', dishEmoji({ emoji: '🍲', category: '川菜' }) === '🍲')
check('无 emoji 时按分类取', dishEmoji({ category: '面食' }) === '🍜', dishEmoji({ category: '面食' }))
check('都缺时兜底', dishEmoji({}) === '🍽️', dishEmoji({}))
check('空对象不报错', dishImageSrc(null) === '' && dishImageSrc(undefined) === '' && dishImageSrc({}) === '')

/* ---------- 5. 与真实菜谱数据联调 ---------- */
const { LOCAL_DISHES } = await load('common/local-dishes.js')
const withSrc = LOCAL_DISHES.filter((d) => dishImageSrc(d))
if (actualFiles.length === 0) {
  check('目录为空时 40 道菜全部走 emoji 回退（不出现破图）',
    withSrc.length === 0,
    `仍有 ${withSrc.length} 道解析出图片地址`)
} else {
  check('解析出图片地址的菜品，其文件都真实存在',
    withSrc.every((d) => fs.existsSync(path.join(ROOT, dishImageSrc(d)))),
    withSrc.map((d) => dishImageSrc(d)).join(','))
}

/* ---------- 6. 组件层：showImage 的结果应与 dishImageSrc 一致 ---------- */
const component = fs.readFileSync(path.join(ROOT, 'components', 'DishImage', 'DishImage.vue'), 'utf8')
check('组件用 dishImageSrc 作为显示判据',
  /showImage\s*=\s*computed\(\(\)\s*=>\s*!!src\.value/.test(component),
  '组件里未找到 showImage 依赖 src 的逻辑')

console.log('')
console.log(`断言通过: ${pass}`)
if (fails.length) {
  console.log(`断言失败: ${fails.length}`)
  fails.forEach((f) => console.log('  ✗ ' + f))
  process.exitCode = 1
} else {
  console.log('全部通过 ✅（缺图不会再渲染成破图）')
}
