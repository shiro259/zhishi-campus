/**
 * 菜品收藏（本机存储）
 *
 * 登录页的文案里早就写着「推荐 · 收藏 · 评价」「评价与收藏都以此 uid 作为归属依据」，
 * 但收藏一直没实现。这里补上，先做本机存储版本：
 *   · 不需要登录、不产生云请求，点一下就生效
 *   · 只存菜品 id 数组，体积可以忽略
 *
 * 为什么不直接存云端：收藏要跟用户绑定，而本项目是「本机 uid + 无服务端会话」的轻量方案，
 * 做云端收藏需要新增集合与读写权限，属于另一件事。等真正需要多端同步时再迁移，
 * 迁移时只要保持 getFavorites/addFavorite/removeFavorite 这三个方法的行为即可。
 */

/** 存储键：一个字符串数组（菜品 id） */
const STORAGE_KEY = 'shiyu_favorites'

/** 读取收藏的菜品 id 列表（去重、过滤坏数据） */
export function getFavorites() {
  try {
    const raw = uni.getStorageSync(STORAGE_KEY)
    if (!raw) return []
    const list = Array.isArray(raw) ? raw : []
    const clean = []
    for (const id of list) {
      const key = String(id === undefined || id === null ? '' : id).trim()
      if (key && clean.indexOf(key) < 0) clean.push(key)
    }
    return clean
  } catch (e) {
    return []
  }
}

/** 是否已收藏 */
export function isFavorite(dishId) {
  const id = String(dishId || '').trim()
  if (!id) return false
  return getFavorites().indexOf(id) >= 0
}

function save(list) {
  try {
    uni.setStorageSync(STORAGE_KEY, list)
    return true
  } catch (e) {
    // 存储不可用（隐私模式 / 配额满）时不抛错，界面照常能用
    return false
  }
}

/** 加收藏（幂等） */
export function addFavorite(dishId) {
  const id = String(dishId || '').trim()
  if (!id) return false
  const list = getFavorites()
  if (list.indexOf(id) < 0) {
    list.push(id)
    save(list)
  }
  return true
}

/** 取消收藏 */
export function removeFavorite(dishId) {
  const id = String(dishId || '').trim()
  if (!id) return false
  const list = getFavorites()
  const next = list.filter((x) => x !== id)
  if (next.length !== list.length) save(next)
  return true
}

/**
 * 切换收藏状态
 * @returns {boolean} 切换后是否已收藏（true=刚收藏，false=刚取消）
 */
export function toggleFavorite(dishId) {
  if (isFavorite(dishId)) {
    removeFavorite(dishId)
    return false
  }
  addFavorite(dishId)
  return true
}

/** 收藏数量（「我的」页或角标可用） */
export function countFavorites() {
  return getFavorites().length
}
