/**
 * 全局常量定义
 * 说明：纯前端本地可用，不依赖任何第三方库，也不调用 uni.* API。
 * 供偏好设置页、AI 配置页、推荐引擎等处统一引用，保证前后端字段一致。
 */

/** 餐次类型 */
export const MEAL_TYPES = ['早餐', '午餐', '晚餐', '夜宵']

/** 口味偏好选项 */
export const TASTE_OPTIONS = ['辣', '麻辣', '清淡', '咸香', '甜', '酸', '重油', '鲜嫩']

/** 忌口（过敏/不吃）选项，推荐时命中即硬过滤 */
export const ALLERGY_OPTIONS = ['香菜', '葱', '蒜', '花生', '海鲜', '牛肉', '羊肉', '内脏', '鸡蛋', '牛奶']

/** 预算快捷选项，value 为 0 表示不限 */
export const BUDGET_PRESETS = [
  { label: '10元内', value: 10 },
  { label: '15元内', value: 15 },
  { label: '20元内', value: 20 },
  { label: '30元内', value: 30 },
  { label: '不限', value: 0 }
]

/** 菜品分类 -> emoji，用于没有图片时的占位展示 */
export const EMOJI_MAP = {
  川菜: '🍲',
  家常菜: '🍳',
  面食: '🍜',
  快餐: '🍱',
  小吃: '🥟',
  粤菜: '🍚',
  地方菜: '🌶️',
  汤羹: '🍲',
  烧烤: '🍢',
  轻食: '🥗',
  饮品: '🥤',
  其他: '🍽️'
}

/** 支持的 AI 服务商（均为 OpenAI 兼容协议，便于前端直连或云函数转发） */
export const AI_PROVIDERS = [
  { value: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { value: 'qwen', label: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { value: 'kimi', label: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { value: 'zhipu', label: '智谱GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { value: 'custom', label: '自定义(OpenAI兼容)', baseUrl: '', model: '' }
]

/** 默认 AI 配置（apiKey 由用户在设置页填写，本地存储） */
export const DEFAULT_AI_CONFIG = {
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  apiKey: ''
}

/* ==========================================================================
 * 食堂 / 楼层 / 窗口
 *
 * 位置模型：食堂 → 楼层 → 窗口。
 *   · 每个食堂每层都有一套「1号窗口」~「10号窗口」（编号窗口）
 *   · 不属于编号窗口的**自定义档口**直接填名字，例如「滋士客汉堡」「自选餐」
 *
 * 窗口在数据里统一存人类可读的字符串（'3号窗口' 或 '滋士客汉堡'），
 * 便于各处直接展示；是否编号窗口用 isNumberedWindow() 判断。
 * ========================================================================== */

/** 食堂 → 楼层数。改这里即可调整某个食堂有几层 */
export const CANTEEN_FLOORS = {
  第一食堂: 3,
  第二食堂: 3,
  第三食堂: 2
}

/** 每层的编号窗口数量：1号窗口 ~ 10号窗口 */
export const WINDOWS_PER_FLOOR = 10

/** 食堂名列表（顺序即 picker 顺序） */
export const CANTEENS = Object.keys(CANTEEN_FLOORS)

/**
 * 某食堂的楼层候选
 * @param {string} canteen
 * @returns {number[]} 例如 [1, 2, 3]；未配置的食堂返回空数组
 */
export function floorOptions(canteen) {
  const count = CANTEEN_FLOORS[canteen] || 0
  const list = []
  for (let i = 1; i <= count; i++) list.push(i)
  return list
}

/**
 * 编号窗口候选
 * @returns {string[]} ['1号窗口', '2号窗口', ... '10号窗口']
 */
export function windowOptions() {
  const list = []
  for (let i = 1; i <= WINDOWS_PER_FLOOR; i++) list.push(i + '号窗口')
  return list
}

/**
 * 判断是不是编号窗口
 * '3号窗口' → true；「滋士客汉堡」「自选餐」这类自定义档口 → false
 * @param {string} win
 * @returns {boolean}
 */
export function isNumberedWindow(win) {
  return /^\d+号窗口$/.test(String(win || '').trim())
}
