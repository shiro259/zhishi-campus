/**
 * 全局常量定义
 */

// 餐次类型
export const MEAL_TYPES = [
  { label: '早餐', value: 'breakfast', icon: '🌅' },
  { label: '午餐', value: 'lunch', icon: '☀️' },
  { label: '晚餐', value: 'dinner', icon: '🌙' },
  { label: '夜宵', value: 'midnight', icon: '宵' }
]

// 口味偏好选项
export const TASTE_OPTIONS = [
  { label: '辣', value: 'spicy', selected: false },
  { label: '清淡', value: 'light', selected: false },
  { label: '重油', value: 'oily', selected: false },
  { label: '咸香', value: 'salty', selected: false },
  { label: '甜', value: 'sweet', selected: false },
  { label: '酸', value: 'sour', selected: false }
]

// 忌口选项
export const ALLERGY_OPTIONS = [
  { label: '不吃香菜', value: 'coriander', selected: false },
  { label: '不吃葱', value: 'onion', selected: false },
  { label: '不吃蒜', value: 'garlic', selected: false },
  { label: '不吃辣', value: 'no_spicy', selected: false },
  { label: '不吃内脏', value: 'offal', selected: false },
  { label: '不吃海鲜', value: 'seafood', selected: false }
]

// 预算预设
export const BUDGET_PRESETS = [
  { label: '5元以内', value: 5, selected: false },
  { label: '10元以内', value: 10, selected: false },
  { label: '15元以内', value: 15, selected: false },
  { label: '20元以内', value: 20, selected: false },
  { label: '不限', value: 999, selected: true }
]

// 评价标签
export const REVIEW_TAGS = [
  '分量足', '味道好', '性价比高', '食材新鲜',
  '太咸了', '太油了', '分量少', '不新鲜',
  '上菜快', '环境干净', '服务好'
]

// 菜品分类
export const DISH_CATEGORIES = [
  { label: '全部', value: '' },
  { label: '川菜', value: '川菜' },
  { label: '家常菜', value: '家常菜' },
  { label: '面食', value: '面食' },
  { label: '快餐', value: '快餐' },
  { label: '粤菜', value: '粤菜' },
  { label: '小吃', value: '小吃' },
  { label: '地方菜', value: '地方菜' },
  { label: '烧烤', value: '烧烤' },
  { label: '饮品', value: '饮品' },
  { label: '轻食', value: '轻食' }
]

// 食堂与楼层配置
//
// 每个食堂每层都有一套 1~10 号窗口（编号窗口）。
// 除此之外还有不属于编号窗口的**自定义档口**，直接填名字即可，
// 例如「二食堂二楼滋士客汉堡」「一食堂二楼自选餐」。
export const CANTEEN_FLOORS = {
  '第一食堂': 3,
  '第二食堂': 3,
  '第三食堂': 2
}

/** 每个楼层的编号窗口数量：1号窗口 ~ 10号窗口 */
export const WINDOWS_PER_FLOOR = 10

/** 食堂名列表（顺序即 picker 顺序） */
export const CANTEENS = Object.keys(CANTEEN_FLOORS)

/** 某食堂的楼层候选：[1, 2, 3]；未配置的食堂返回空数组 */
export function floorOptions(canteen) {
  const count = CANTEEN_FLOORS[canteen] || 0
  const list = []
  for (let i = 1; i <= count; i++) list.push(i)
  return list
}

/** 编号窗口候选：['1号窗口', '2号窗口', ... '10号窗口'] */
export function windowOptions() {
  const list = []
  for (let i = 1; i <= WINDOWS_PER_FLOOR; i++) list.push(i + '号窗口')
  return list
}

/**
 * 判断是不是编号窗口
 * '3号窗口' → true；「滋士客汉堡」这类自定义档口 → false
 */
export function isNumberedWindow(win) {
  return /^\d+号窗口$/.test(String(win || '').trim())
}

// 分类 → emoji 映射（菜品无图时展示）
export const EMOJI_MAP = {
  '川菜': '🌶️',
  '家常菜': '🍚',
  '面食': '🍜',
  '快餐': '🍗',
  '粤菜': '🥘',
  '小吃': '🥟',
  '地方菜': '🍲',
  '烧烤': '🍢',
  '饮品': '🧋',
  '轻食': '🥗',
  '默认': '🍽️'
}
