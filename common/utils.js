/**
 * 公共工具方法
 */
import { EMOJI_MAP } from './constants.js'
// 静态引入 adminAuthApi：api/index.js 只依赖 common 下的
// constants / local-dishes / recommend-engine，都不回头依赖本文件，
// 因此这里不会形成循环依赖。不用动态 import() —— 微信小程序运行时对它支持不可靠。
import { adminAuthApi } from '@/api/index.js'

/** 本地图片目录约定：static/dishes/<菜品id>.jpg */
const DISH_IMAGE_DIR = 'static/dishes/'

/**
 * 解析菜品图片地址
 *
 * 优先级：
 *   1. 后台为这道菜上传/填写的图片（uniCloud 云存储地址，小程序可直接访问）
 *   2. 本地静态图 static/dishes/<id>.jpg（把图片放进该目录即可自动生效）
 *   3. 都没有 → 返回空串，由调用方回退到 emoji 展示
 *
 * @param {Object} dish 菜品对象，需含 id / image
 * @returns {string} 可直接用于 <image src> 的地址，无图时返回空串
 */
export function dishImageSrc(dish) {
  if (!dish) return ''
  const img = dish.image
  if (img && typeof img === 'string' && img.trim()) return img.trim()
  const id = dish.id || dish._id
  // 只有符合 d001 这类约定的 id 才推导本地路径，避免拼出不存在的地址
  if (id && /^d\d{3}$/.test(String(id))) return DISH_IMAGE_DIR + id + '.jpg'
  return ''
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
 * 菜品位置文案：「第二食堂 · 2楼 · 3号窗口」
 *
 * 楼层和窗口都可能缺（例如刚同步进来还没重填位置的菜），
 * 缺哪段就跳过哪段，全缺时返回空串，由调用方决定兜底文案。
 *
 * @param {Object} dish 需含 canteen / floor / window
 * @returns {string}
 */
export function formatLocation(dish) {
  if (!dish) return ''
  const parts = []
  if (dish.canteen) parts.push(String(dish.canteen))
  if (dish.floor) parts.push(dish.floor + '楼')
  if (dish.window) parts.push(String(dish.window))
  return parts.join(' · ')
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
  // 同时清掉管理员凭证，避免退出后仍留着可用的后台通行证
  uni.removeStorageSync('shiyu_admin_token')
}

/**
 * 检查是否管理员（只反映本机标记，不代表凭证此刻仍然有效）
 */
export function isAdmin() {
  const user = getUserInfo()
  return user && user.role === 'admin'
}

/** 无权限时提示并离开当前管理页 */
function denyAdmin() {
  uni.showToast({ title: '需要管理员权限', icon: 'none' })
  setTimeout(() => {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    if (pages && pages.length > 1) {
      uni.navigateBack()
    } else {
      uni.reLaunch({ url: '/pages/login/login' })
    }
  }, 1200)
}

/**
 * 管理后台页面守卫（pages/admin/* 进入时都应调用）
 *
 * 为什么不能只看本地 role：
 * 本机标记可能已过期，或者管理员刚改过口令 —— 云函数签发的凭证签名里掺了口令摘要，
 * 改口令后旧凭证立即失效，只看本地标记会误以为还有权限。
 * 而本机的 role:'admin' 现在只能由一次「账号口令认证成功」写入（登录页已不再让用户自选），
 * 所以当云端根本不可达时允许先放行，而不是把人锁在门外。
 *
 * @returns {Promise<boolean>} true 表示确认管理员身份，可以继续渲染
 */
export async function ensureAdmin() {
  const user = getUserInfo()
  if (!user || user.role !== 'admin') {
    denyAdmin()
    return false
  }

  // 静态引入的 adminAuthApi：本次校验会真的问一次云端
  const res = await adminAuthApi.verify()

  if (res.ok) return true

  if (res.offline) {
    // 云端连不上：本地 role 只可能来自一次成功登录，先放行但明确告知未校验
    uni.showToast({ title: '云端不可用，本次未校验管理员凭证', icon: 'none' })
    return true
  }

  // 云端明确拒绝了凭证（过期 / 口令已改 / 伪造）→ 清掉管理员身份并退回登录页
  adminAuthApi.logout()
  uni.showToast({ title: res.reason || '管理员凭证无效，请重新登录', icon: 'none' })
  setTimeout(() => uni.reLaunch({ url: '/pages/login/login' }), 1200)
  return false
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
