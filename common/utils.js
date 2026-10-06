/**
 * 公共工具方法
 */
import { EMOJI_MAP } from './constants.js'
import { hasDishImageFile } from './dish-images.js'

/** 本地图片目录约定：static/dishes/<菜品id>.jpg */
const DISH_IMAGE_DIR = 'static/dishes/'

/**
 * 把 static/ 开头的本地资源路径转成各端可直接访问的地址
 *
 * 为什么需要它：H5 下直接把 'static/dishes/d001.jpg' 交给 <image>，
 * 浏览器会按「当前页面路由」做相对解析（如 /h5/pages/index/static/dishes/d001.jpg）→ 404，
 * 因此必须拼上 vite 的 base 前缀（部署在 /h5/ 子目录时得到 /h5/static/dishes/d001.jpg）；
 * 小程序 / App 端则使用应用包根的绝对路径 /static/...。
 * @param {string} relPath 形如 static/dishes/d001.jpg
 * @returns {string}
 */
function localAssetUrl(relPath) {
  // #ifdef H5
  const base =
    (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/'
  return base.replace(/\/+$/, '') + '/' + relPath
  // #endif
  // #ifndef H5
  return '/' + relPath
  // #endif
}

/**
 * 解析菜品图片地址
 *
 * 优先级：
 *   1. 后台为这道菜上传/填写的图片（云存储地址或自定义路径）
 *   2. 本地静态图 static/dishes/<id>.jpg —— **必须是清单里真实存在的文件**
 *   3. 都没有 → 返回空串，由调用方回退到 emoji 展示
 *
 * 第 2 步为什么要查清单：
 *   若只是按 id 拼出路径就交给 <image>，图片不存在时会先渲染一个"加载失败"的占位，
 *   H5 下满屏都是破图，看起来像"界面内容全没了"。查过清单后，缺图直接走 emoji，
 *   既不发起必然失败的请求，也不会出现破图。
 *
 * @param {Object} dish 菜品对象，需含 id / image
 * @returns {string} 可直接用于 <image src> 的地址，无图时返回空串
 */
export function dishImageSrc(dish) {
  if (!dish) return ''
  const img = dish.image
  if (img && typeof img === 'string' && img.trim()) {
    const value = img.trim()
    // 本地约定路径要核验文件是否存在；外链 / 云存储地址直接信任
    if (value.indexOf(DISH_IMAGE_DIR) === 0) {
      const fileName = value.slice(DISH_IMAGE_DIR.length)
      return hasDishImageFile(fileName) ? localAssetUrl(value) : ''
    }
    return value
  }

  const id = dish.id || dish._id
  // 只有符合 d001 这类约定的 id 才推导本地路径，且必须真实存在
  if (id && /^d\d{3}$/.test(String(id))) {
    const fileName = id + '.jpg'
    return hasDishImageFile(fileName) ? localAssetUrl(DISH_IMAGE_DIR + fileName) : ''
  }
  return ''
}

/** 该菜品将使用 emoji 回退展示（供页面做布局判断） */
export function dishUsesEmojiFallback(dish) {
  return !dishImageSrc(dish)
}

/**
 * 解析菜品占位 emoji
 *
 * 菜品图缺失时用它渲染成渐变方块：优先菜品自带 emoji，其次按分类查表，最后兜底。
 * @param {Object} dish
 * @returns {string} 单个 emoji 字符
 */
export function dishEmoji(dish) {
  if (!dish) return '🍽️'
  if (dish.emoji) return dish.emoji
  return (EMOJI_MAP && EMOJI_MAP[dish.category]) || '🍽️'
}

/**
 * 菜品是否配置了图片
 * @param {Object} dish
 * @returns {boolean}
 */
export function hasDishImage(dish) {
  return !!dishImageSrc(dish)
}

/**
 * 格式化价格
 */
export function formatPrice(price) {
  return `¥${Number(price).toFixed(1)}`
}

/**
 * 格式化时间
 */
export function formatTime(date) {
  if (!date) return ''
  const d = new Date(date)
  const now = Date.now()
  const diff = now - d.getTime()
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  if (diff < 2592000000) return `${Math.floor(diff / 86400000)}天前`
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 星级评分渲染
 */
export function renderStars(rating) {
  const full = Math.floor(rating)
  const half = rating - full >= 0.5
  let stars = ''
  for (let i = 0; i < full; i++) stars += '★'
  if (half) stars += '☆'
  return stars
}

/**
 * 获取用户信息
 */
export function getUserInfo() {
  return uni.getStorageSync('userInfo') || null
}

/**
 * 保存用户信息
 */
export function saveUserInfo(user) {
  uni.setStorageSync('userInfo', user)
}

/**
 * 检查是否已登录
 */
export function isLoggedIn() {
  return !!uni.getStorageSync('token')
}

/**
 * 清除登录信息
 */
export function clearAuth() {
  uni.removeStorageSync('token')
  uni.removeStorageSync('userInfo')
}

/**
 * 检查是否管理员
 */
export function isAdmin() {
  const user = getUserInfo()
  return user && user.role === 'admin'
}

/**
 * 跳转登录
 */
export function needLogin() {
  if (!isLoggedIn()) {
    uni.navigateTo({ url: '/pages/login/login' })
    return false
  }
  return true
}
