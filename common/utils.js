/**
 * 公共工具方法
 */

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
