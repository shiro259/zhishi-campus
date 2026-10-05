/**
 * 统一 API 适配层（食遇校园）
 *
 * 架构：uniCloud 云函数为主链路，本地数据为兜底链路。
 *
 *   页面 → api/index.js → ① 云函数（shiyu-*）  → ② 本地数据集 + 客户端规则引擎
 *
 * 设计要点：
 * 1. 页面永远不直接调用 uniCloud，也不直接读本地数据集，只依赖本文件导出的方法；
 * 2. 任何一次云函数调用失败（未开通云空间 / 函数未上传 / 网络异常 / 集合为空）
 *    都会自动降级到本地链路，保证「没有后端也能完整演示」；
 * 3. 每个返回值都带 engine 字段（'cloud' | 'local'），页面可据此提示用户当前数据来源；
 * 4. 大模型 API Key 只在云函数侧读取，客户端拿不到明文（见 uniCloud-aliyun/database/shiyu-config.schema.json）。
 */
import {
  LOCAL_DISHES,
  getLocalCanteens,
  getLocalCategories
} from '@/common/local-dishes.js'
import { localRecommend, localParsePref } from '@/common/recommend-engine.js'
import { TASTE_OPTIONS, ALLERGY_OPTIONS } from '@/common/constants.js'

/** 云函数名 */
const CLOUD_FN = {
  dish: 'shiyu-dish',
  recommend: 'shiyu-recommend',
  config: 'shiyu-config',
  seed: 'shiyu-seed',
  review: 'shiyu-review',
  wechat: 'wechat-login'
}

/** 本地储存键 */
const STORAGE = {
  userInfo: 'userInfo',
  pref: 'shiyu_pref',
  history: 'shiyu_history',
  adminToken: 'shiyu_admin_token',
  localReviews: 'shiyu_local_reviews'
}

/* ------------------------------ 云函数可用性探测 ------------------------------ */

/**
 * 云空间是否可用
 *
 * null = 尚未探测；true = 可用；false = 确认不可用。
 * 只有「uniCloud 本身不存在」（未关联服务空间）才算确认不可用 —— 这是持久状况。
 * 早期版本把「某一次超时」和「某个云函数 fail」也当成全局不可用并永久锁定，
 * 后果非常严重：首页加载时调用的 shiyu-dish 还没创建，一次 fail 就把整个会话的
 * 云端调用全部掐死，连管理员登录都直接报「云空间不可用」。
 * （推荐页因为是直接调 uniCloud.callFunction，绕过了这里，所以不受影响 —— 这也是
 *   为什么「聊天能用、后台登录不能用」这种看似矛盾的现象会出现。）
 */
let cloudAvailable = null

/**
 * 已知不存在 / 未上传部署的云函数
 *
 * 只按「函数名」记住，不上升为全局不可用：某个函数缺失不能连累其它函数。
 */
const missingFunctions = new Set()

/**
 * 菜品列表数据源是否锁定为本地
 *
 * 仅当「云端菜品库确实为空 / 数据陈旧」这类持久性状况成立时才锁定为本地，
 * 保证后续翻页连续（不会第一页 10 道本地菜、第二页突然空白）。
 * 网络抖动之类的临时故障不锁定，下次请求仍会重试云端。
 */
let dishListSource = 'cloud'

/**
 * 把云函数调用失败的 errMsg 翻译成「原因 + 怎么办」
 *
 * 微信真机和开发者工具的差别很大，最常见的是域名白名单：
 * manifest.json 里的 setting.urlCheck=false 只对开发者工具生效，
 * 真机由微信客户端自己校验 request 合法域名，于是「工具里能通、手机上不通」。
 * 这里按 errMsg 关键词给出针对性提示，免得用户只看到一句无从下手的 request:fail。
 *
 * @param {string} errMsg 云函数 fail 回调里的 errMsg
 * @returns {string} 含原始信息与修复建议的可读文本
 */
export function explainCloudError(errMsg) {
  const raw = String(errMsg || '未知错误')

  if (/url not in domain list|合法域名|domain list|not in domain/i.test(raw)) {
    return raw +
      '\n\n【原因】这台设备的微信拦下了请求：云函数域名不在 request 合法域名列表里。' +
      '\n开发者工具里的「不校验合法域名」（manifest 的 urlCheck）只对工具本身生效，真机不适用。' +
      '\n【办法】微信公众平台 → 开发管理 → 开发设置 → 服务器域名 → request 合法域名，' +
      '把开发者工具 Network 面板里那个云函数请求的域名加进去，再重新预览。'
  }

  if (/function not found|FUNCTION_NOT_FOUND|不存在|not exist/i.test(raw)) {
    return raw +
      '\n\n【原因】这个云函数还没上传部署。' +
      '\n【办法】HBuilderX 里右键该云函数 → 上传部署。'
  }

  if (/timeout|time out|超时/i.test(raw)) {
    return raw +
      '\n\n【原因】请求超时。' +
      '\n【办法】先确认手机网络正常；大模型回复较慢时，把云函数的超时时间调大' +
      '（云函数平台的超时会先于大模型返回触发）。'
  }

  if (/cloud space|spaceId|envId|服务空间|not bound/i.test(raw)) {
    return raw +
      '\n\n【原因】本项目没有关联云服务空间，或关联的空间不对。' +
      '\n【办法】HBuilderX 里右键 uniCloud-aliyun → 关联云服务空间。'
  }

  if (/^request:fail/i.test(raw)) {
    return raw +
      '\n\n【原因】请求没能发出去：网络异常，或域名被微信拦下。' +
      '\n【办法】先确认手机能正常上网；再检查微信公众平台的 request 合法域名是否包含云函数请求域名。'
  }

  return raw
}

/**
 * 构造「云端不可达」类错误
 *
 * 用 cloudDown 标记和「业务错误」区分开：业务错误是云函数正常执行后返回
 * code!==0（例如管理员凭证无效），而 cloudDown 表示压根没问到云端
 * （未关联服务空间 / 函数未上传 / 超时 / 网络异常）。管理后台守卫据此决定
 * 是「踢出登录」还是「云端不可用但先放行」——不能因为网络抖动把管理员锁在门外。
 */
function cloudError(message) {
  const err = new Error(message)
  err.cloudDown = true
  return err
}

/**
 * 调用云函数
 * @param {string} name 云函数名
 * @param {Object} data 入参
 * @param {Object} [options] { timeout } 超时毫秒数，默认 8000；登录等冷启动较慢的调用可调大
 * @returns {Promise<*>} 成功返回 data 字段，失败抛出 Error
 */
function callCloud(name, data = {}, options = {}) {
  const timeoutMs = Number(options.timeout) > 0 ? Number(options.timeout) : 8000
  return new Promise((resolve, reject) => {
    // 仅当确认「云空间不可用」（uniCloud 不存在）时才直接拒绝
    if (cloudAvailable === false) {
      reject(cloudError('云空间不可用：请在 HBuilderX 中右键 uniCloud-aliyun → 关联云服务空间'))
      return
    }
    if (typeof uniCloud === 'undefined' || !uniCloud || !uniCloud.callFunction) {
      cloudAvailable = false
      reject(cloudError('uniCloud 不可用：请在 HBuilderX 中右键 uniCloud-aliyun → 关联云服务空间'))
      return
    }
    // 之前已经确认这个函数不存在，不再反复发无效请求
    if (missingFunctions.has(name)) {
      reject(new Error('云函数 ' + name + ' 不存在，请先在 HBuilderX 中右键该函数 → 上传部署'))
      return
    }
    const timer = setTimeout(() => {
      // 超时只让本次调用失败，不锁定云空间：冷启动和网络抖动都会超时，下次仍要重试
      reject(cloudError('云函数 ' + name + ' 调用超时（' + timeoutMs + 'ms）'))
    }, timeoutMs)
    uniCloud.callFunction({
      name,
      data,
      success: (res) => {
        clearTimeout(timer)
        const body = res && res.result
        if (!body) {
          reject(cloudError('云函数 ' + name + ' 没有返回内容'))
          return
        }
        if (body.code === 0) {
          cloudAvailable = true
          resolve(body.data)
        } else {
          cloudAvailable = true
          // 业务错误：云函数确实跑通了，只是拒绝了这次操作
          reject(new Error(body.message || '云函数执行失败'))
        }
      },
      fail: (err) => {
        clearTimeout(timer)
        const msg = (err && (err.errMsg || err.message)) || '云函数调用失败'
        // 只有明确「函数不存在」才记住（避免反复无效请求），且只记这个函数；
        // 网络抖动等临时失败一律不记，下次仍然重试
        if (/not\s*found|不存在|未找到|FUNCTION_NOT_FOUND/i.test(msg)) {
          missingFunctions.add(name)
          reject(new Error('云函数 ' + name + ' 不存在，请先在 HBuilderX 中右键该函数 → 上传部署'))
        } else {
          reject(cloudError('云函数 ' + name + ' 调用失败：' + explainCloudError(msg)))
        }
      }
    })
  })
}

/** 数据来源标记：云函数若已自带 engine（例如推荐返回 ai/local），保留它，不覆盖 */
const fromCloud = (data) => ({ engine: 'cloud', ...(data || {}) })

/* --------------------------------- 菜品接口 --------------------------------- */

/** 本地菜品列表（支持与云函数一致的筛选/分页语义） */
function localDishList(params = {}) {
  const {
    keyword = '',
    canteen = '',
    category = '',
    sortByRating = false,
    sortByPrice = false,
    page = 1,
    pageSize = 20
  } = params

  let list = LOCAL_DISHES.filter((d) => d.status === 1)
  if (keyword) {
    const kw = String(keyword).trim().toLowerCase()
    list = list.filter(
      (d) =>
        d.name.toLowerCase().includes(kw) ||
        (d.description || '').toLowerCase().includes(kw)
    )
  }
  if (canteen) list = list.filter((d) => d.canteen === canteen)
  if (category) list = list.filter((d) => d.category === category)

  if (sortByRating) list = [...list].sort((a, b) => b.rating - a.rating)
  else if (sortByPrice) list = [...list].sort((a, b) => a.price - b.price)

  const total = list.length
  const start = (page - 1) * pageSize
  const paged = list.slice(start, start + pageSize)
  return {
    list: paged,
    total,
    hasMore: start + paged.length < total,
    engine: 'local'
  }
}

/**
 * 云函数数据是否可信
 *
 * 背景：老版本的菜品集合里可能残留没有 `status` 字段的数据。云函数的列表查询带
 * `where({status: 1})`，这类数据查不出来；而食堂/分类枚举不带该条件，于是会出现
 * 「食堂列表里有一食堂、点进去一道菜都没有」的矛盾。这里通过一次零成本校验
 * （用本地菜谱比对云端返回的食堂枚举）识别这种陈旧数据，识别到就整体退回本地数据源。
 *
 * @param {Object} res 云函数返回的菜品列表结果
 * @returns {boolean} true 表示云端数据自洽可用
 */
function isCloudDishDataTrustworthy(res) {
  if (!res) return false
  const list = res.list || []
  const total = Number(res.total || 0)

  // 云端本来就没有数据（还没执行「数据初始化」）→ 交给本地菜谱兜底
  if (!list.length || !total) return false

  // 云端返回的菜品缺少 status / canteen 等关键字段 → 说明是旧结构数据
  const broken = list.filter((d) => d && (d.canteen === undefined || d.name === undefined))
  if (broken.length) return false

  // 返回的食堂名必须是本地菜谱认识的食堂
  const localNames = getLocalCanteens()
  const unknown = list.filter((d) => d.canteen && localNames.indexOf(d.canteen) < 0)
  if (unknown.length) return false

  return true
}

export const dishApi = {
  /**
   * 菜品列表
   *
   * 云端数据不可信时（未初始化 / 残留旧结构数据）自动退回本地菜谱，
   * 保证「点进某个食堂一定看得到菜」。
   * @returns {Promise<{list:Array,total:number,hasMore:boolean,engine:string}>}
   */
  async list(params = {}) {
    // 上一页已经判定云端不可用，本次一致沿用本地，保证分页连续
    if (dishListSource === 'local') return localDishList(params)

    try {
      const data = await callCloud(CLOUD_FN.dish, { action: 'list', ...params })
      const res = { engine: 'cloud', ...(data || {}) }
      const isFirstPage = !params.page || Number(params.page) === 1
      // 用户主动搜索时，空结果是真实结果，不做兜底掩盖
      if (isFirstPage && !params.keyword && !isCloudDishDataTrustworthy(res)) {
        // 持久性状况（库空 / 陈旧数据）：锁定本地，保证后续翻页连续
        dishListSource = 'local'
        return localDishList(params)
      }
      return res
    } catch (e) {
      // 临时故障（网络抖动等）：不锁定，下次仍重试云端
      return localDishList(params)
    }
  },

  /** 菜品详情 */
  async detail(id) {
    if (!id) throw new Error('缺少菜品 id')
    try {
      return fromCloud(await callCloud(CLOUD_FN.dish, { action: 'detail', id }))
    } catch (e) {
      const dish = LOCAL_DISHES.find((d) => d.id === id || d._id === id)
      if (!dish) throw new Error('菜品不存在')
      return { ...dish, engine: 'local' }
    }
  },

  /**
   * 榜单
   * @param {'hot'|'good'|'new'} type
   */
  async rank(type = 'hot', limit = 10) {
    try {
      const data = await callCloud(CLOUD_FN.dish, { action: 'rank', type, limit })
      const rows = Array.isArray(data) ? data : (data && data.list) || []
      // 云端榜单为空（未初始化菜品库）时退回本地，避免首页整片空白
      if (!rows.length) throw new Error('云端榜单为空')
      return { list: rows, engine: 'cloud' }
    } catch (e) {
      let list = LOCAL_DISHES.filter((d) => d.status === 1)
      if (type === 'good') list = list.sort((a, b) => b.rating - a.rating)
      else if (type === 'new') list = list.filter((d) => d.is_new)
      else list = list.sort((a, b) => b.recommend_count - a.recommend_count)
      return { list: list.slice(0, limit), engine: 'local' }
    }
  },

  /**
   * 食堂列表
   *
   * 只返回本地菜谱里存在的食堂，避免云端残留的旧食堂名被点进去却是空的。
   */
  async canteens() {
    try {
      const data = await callCloud(CLOUD_FN.dish, { action: 'canteens' })
      const names = (Array.isArray(data) ? data : []).filter(
        (n) => typeof n === 'string' && n
      )
      if (!names.length) throw new Error('云端食堂列表为空')
      return { list: names, engine: 'cloud' }
    } catch (e) {
      return { list: getLocalCanteens(), engine: 'local' }
    }
  },

  /** 分类列表 */
  async categories() {
    try {
      const data = await callCloud(CLOUD_FN.dish, { action: 'categories' })
      const names = (Array.isArray(data) ? data : []).filter(
        (n) => typeof n === 'string' && n
      )
      if (!names.length) throw new Error('云端分类列表为空')
      return { list: names, engine: 'cloud' }
    } catch (e) {
      return { list: getLocalCategories(), engine: 'local' }
    }
  },

  /** 新增/编辑菜品（管理端） */
  async save(data) {
    return fromCloud(
      await callCloud(CLOUD_FN.dish, {
        action: 'save',
        id: data.id,
        dish: data,
        token: getAdminToken()
      })
    )
  },

  /** 删除菜品（管理端） */
  async remove(id) {
    return fromCloud(
      await callCloud(CLOUD_FN.dish, { action: 'remove', id, token: getAdminToken() })
    )
  },

  /**
   * 重置云端数据源与可用性记忆
   *
   * 用途一：list 在判定云端菜品库为空/陈旧后会锁定本地以保证翻页连续，
   * 执行完「数据初始化」或下拉刷新后调用本方法，即可重新尝试云端数据。
   * 用途二：清掉 missingFunctions，让「刚在 HBuilderX 里上传部署好」的云函数
   * 不必重启小程序就能被再次调用。
   */
  resetSource() {
    dishListSource = 'cloud'
    cloudAvailable = null
    missingFunctions.clear()
  }
}

/* --------------------------------- 推荐接口 --------------------------------- */

/** 记录一次推荐历史（用于「最近推荐」与个性化） */
function pushHistory(pref, summary) {
  try {
    const list = uni.getStorageSync(STORAGE.history) || []
    list.unshift({
      time: Date.now(),
      pref,
      summary: summary || '',
      label: buildPrefLabel(pref)
    })
    uni.setStorageSync(STORAGE.history, list.slice(0, 20))
  } catch (e) {
    // 存储失败不影响主流程
  }
}

/**
 * 把偏好里存的选项 code 翻成中文，用于展示
 *
 * 储存的是常量里的 value（'spicy' / 'coriander'），必须查表转成 label（'辣' / '香菜'）
 * 再拼给人看，否则「我的 → 口味档案」会显示成「午餐 · spicy · 忌coriander」。
 *
 * @param {Array} options constants 里的 { label, value } 选项数组
 * @param {Array} codes 用户选中的 code 列表
 * @param {boolean} stripNotEat 是否去掉 label 的「不吃」前缀（忌口项用）
 * @returns {string} 逗号分隔的中文标签，无有效项时返回空串
 */
function optionsToLabels(options, codes, stripNotEat) {
  if (!Array.isArray(codes) || !codes.length) return ''
  const map = {}
  for (const o of Array.isArray(options) ? options : []) {
    if (!o || typeof o !== 'object' || !o.value) continue
    const label = String(o.label || o.value)
    map[o.value] = stripNotEat ? label.replace(/^不吃/, '') : label
  }
  return codes
    .map((c) => map[c] || c)
    .filter(Boolean)
    .join(',')
}

/** 把偏好对象转成一句话标签，用于历史列表展示 */
export function buildPrefLabel(pref = {}) {
  const tasteText = optionsToLabels(TASTE_OPTIONS, pref.taste)
  const allergyText = optionsToLabels(ALLERGY_OPTIONS, pref.allergies, true)
  const parts = []
  if (pref.meal_type) parts.push(pref.meal_type)
  if (tasteText) parts.push(tasteText.split(',').join('+'))
  if (allergyText) parts.push('忌' + allergyText.split(',').join(''))
  if (pref.budget) parts.push(pref.budget + '元内')
  if (pref.canteen) parts.push(pref.canteen)
  return parts.length ? parts.join(' · ') : '无特殊偏好'
}

/**
 * 把偏好对象转成一句可以直接跟 AI 说的话
 *
 * 用于首页「快捷口味」点一下之后，到推荐页回填输入框 ——
 * 推荐页是 tabBar 页，switchTab 不能带 query，只能靠本地暂存传偏好过来。
 * 注意这里必须查表把 code（'spicy'）翻成中文（'辣'），否则回填出来的是
 * 「想吃spicy的」，大模型读不懂。
 *
 * @param {Object} pref
 * @returns {string} 自然语言描述，例如「想吃辣的，不要香菜，15元以内」
 */
export function buildPrefSentence(pref = {}) {
  const tasteText = optionsToLabels(TASTE_OPTIONS, pref.taste)
  const allergyText = optionsToLabels(ALLERGY_OPTIONS, pref.allergies, true)
  const parts = []
  if (tasteText) parts.push('想吃' + tasteText.split(',').join('、') + '的')
  if (allergyText) parts.push('不要' + allergyText.split(',').join('、'))
  if (pref.budget && Number(pref.budget) < 999) parts.push(pref.budget + '元以内')
  if (pref.canteen) parts.push('在' + pref.canteen)
  if (parts.length && pref.meal_type) parts.push(pref.meal_type + '吃')
  return parts.length ? parts.join('，') : ''
}

/** 判断偏好对象里是否有用户真实选择过的内容（全空则不算，避免把空白档案写进缓存） */
function hasExplicitPref(pref = {}) {
  if (!pref) return false
  return !!(
    (pref.meal_type && String(pref.meal_type).trim()) ||
    (Array.isArray(pref.taste) && pref.taste.length) ||
    (Array.isArray(pref.allergies) && pref.allergies.length) ||
    (pref.budget && Number(pref.budget) > 0) ||
    (pref.canteen && String(pref.canteen).trim()) ||
    (pref.extra && String(pref.extra).trim())
  )
}

/** 保存偏好档案到本地（内部与推荐接口共用） */
function savePref(pref) {
  try {
    if (!pref || !hasExplicitPref(pref)) {
      uni.removeStorageSync(STORAGE.pref)
      return
    }
    uni.setStorageSync(STORAGE.pref, {
      meal_type: pref.meal_type || '午餐',
      taste: Array.isArray(pref.taste) ? pref.taste.slice(0) : [],
      allergies: Array.isArray(pref.allergies) ? pref.allergies.slice(0) : [],
      budget: pref.budget || null,
      canteen: pref.canteen || '',
      extra: pref.extra || '',
      updated_at: Date.now()
    })
  } catch (e) {
    // 存储失败不影响推荐主流程
  }
}

// AI 聊天已迁移到 uniCloud 云函数 shiyu-chat
// 以下为结构化推荐接口（本地规则兜底）

export const recommendApi = {
  /**
   * AI 智能推荐
   * 直接调用通义千问大模型，用本地菜品库做上下文
   * @param {Object} pref { meal_type, taste:[], allergies:[], budget, canteen, extra }
   * @param {string} text 一句话自然语言描述（可选）
   * @returns {Promise<{recommendations:Array, summary:string, engine:string, model?:string}>}
   */
  async recommend(pref = {}, text = '') {
    // 客户端先解析一次自然语言
    const merged = { ...pref }
    if (text) {
      const parsed = localParsePref(text)
      merged.taste = merged.taste && merged.taste.length ? merged.taste : parsed.taste
      merged.allergies =
        merged.allergies && merged.allergies.length ? merged.allergies : parsed.allergies
      merged.budget = merged.budget || parsed.budget
      merged.meal_type = merged.meal_type || parsed.meal_type
    }

    let result
    try {
      // 云函数 shiyu-recommend 内部完成「大模型调用 → 严格校验 → 本地规则兜底」，
      // 并自带 engine 字段（ai = 真·大模型，local = 云端规则兜底），
      // 因此这里直接透传，不能再覆盖成 'cloud'。
      result = await callCloud(CLOUD_FN.recommend, { pref: merged, text: text || '' })
      result = { engine: 'cloud', ...(result || {}) }
    } catch (e) {
      // 云端不可用 → 用本地全量菜品跑规则引擎
      const local = localRecommend(merged, LOCAL_DISHES)
      result = {
        ...local,
        engine: 'local',
        notice: e.message
          ? `云端推荐不可用（${e.message}），已使用本地智能规则`
          : '已使用本地智能规则'
      }
    }

    pushHistory(merged, result.summary)

    if (hasExplicitPref(pref)) savePref(pref)

    return result
  },

  /** 从本地储存读取上次使用的偏好 */
  getSavedPref() {
    try {
      return uni.getStorageSync(STORAGE.pref) || null
    } catch (e) {
      return null
    }
  },

  /** 保存偏好，下次进入推荐页自动回填 */
  savePref(pref) {
    savePref(pref)
  },

  /** 推荐历史 */
  getHistory() {
    try {
      return uni.getStorageSync(STORAGE.history) || []
    } catch (e) {
      return []
    }
  },

  /** 清空推荐历史 */
  clearHistory() {
    try {
      uni.removeStorageSync(STORAGE.history)
    } catch (e) {
      // 忽略
    }
  },

  /** 一句话解析（页面做实时预览用，纯本地零延迟） */
  parseText(text) {
    return localParsePref(text)
  }
}

/* -------------------------------- 评价接口 -------------------------------- */

/** 本地评价库：云端不可用时降级存放，仅本机可见 */
function readLocalReviews() {
  try {
    return uni.getStorageSync(STORAGE.localReviews) || []
  } catch (e) {
    return []
  }
}

function writeLocalReviews(list) {
  try {
    uni.setStorageSync(STORAGE.localReviews, list.slice(0, 200))
  } catch (e) {
    // 忽略
  }
}

export const reviewApi = {
  /**
   * 评价列表
   *
   * 默认只返回已通过审核的（学生端展示用）；
   * 管理端需要看到待审核与已拒绝，传 `all: true` 拿全部状态 ——
   * 否则「已拒绝」在任何界面都查不到、统计恒为 0。
   */
  async list(params = {}) {
    try {
      return fromCloud(await callCloud(CLOUD_FN.review, { action: 'list', ...params }))
    } catch (e) {
      const { dish_id, page = 1, pageSize = 10, all = false } = params
      let list = readLocalReviews()
      if (!all) list = list.filter((r) => r.status === 1)
      if (dish_id) list = list.filter((r) => r.dish_id === dish_id)
      const total = list.length
      const start = (page - 1) * pageSize
      return {
        list: list.slice(start, start + pageSize),
        total,
        hasMore: start + pageSize < total,
        engine: 'local'
      }
    }
  },

  /** 发布评价 */
  async create(data) {
    const profile = userApi.getProfile() || {}
    const payload = {
      ...data,
      // user_id 是 reviews.schema.json 的必填字段，也是「我的评价」的归属依据：
      // 缺了它云函数会拒绝、写入后也无法在「我的」里查到自己的评价
      user_id: userApi.getUid(),
      nickname: profile.nickname || '匿名同学',
      avatar: profile.avatar || ''
    }
    try {
      return fromCloud(await callCloud(CLOUD_FN.review, { action: 'create', ...payload }))
    } catch (e) {
      // 降级：存本地，状态置为待审核，并给出明确提示
      const list = readLocalReviews()
      list.unshift({
        _id: 'local_' + Date.now(),
        ...payload,
        like_count: 0,
        status: 0,
        create_date: Date.now(),
        _local: true
      })
      writeLocalReviews(list)
      return { engine: 'local', offline: true }
    }
  },

  /** 我的评价 */
  async mine(params = {}) {
    try {
      return fromCloud(
        await callCloud(CLOUD_FN.review, {
          action: 'mine',
          uid: userApi.getUid(),
          ...params
        })
      )
    } catch (e) {
      const list = readLocalReviews()
      return { list, total: list.length, hasMore: false, engine: 'local' }
    }
  },

  /** 待审核评价（管理端） */
  async pending(params = {}) {
    try {
      return fromCloud(
        await callCloud(CLOUD_FN.review, {
          action: 'pending',
          token: getAdminToken(),
          ...params
        })
      )
    } catch (e) {
      const list = readLocalReviews().filter((r) => r.status === 0)
      return { list, total: list.length, hasMore: false, engine: 'local' }
    }
  },

  /** 审核（管理端）：status 1 通过 / 2 拒绝 */
  async audit({ id, status }) {
    try {
      return fromCloud(
        await callCloud(CLOUD_FN.review, { action: 'audit', id, status, token: getAdminToken() })
      )
    } catch (e) {
      const list = readLocalReviews()
      const target = list.find((r) => r._id === id)
      if (target) {
        target.status = status
        writeLocalReviews(list)
      }
      return { engine: 'local' }
    }
  }
}

/* ------------------------------ 管理员认证（管理端） ------------------------------ */

/**
 * 读取本机保存的管理员凭证
 *
 * 注意：这里**不再自己生成 token**。凭证只能由云函数 admin-login 用管理员
 * 账号口令校验通过后签发（HMAC 签名 + 过期时间），客户端无法伪造。
 * 老实现是客户端随机拼一个字符串就当凭证用，而云函数只判断「token 非空」，
 * 于是任何人都能改 AI 配置、把 API Key 转发到自己的服务器。
 */
export function getAdminToken() {
  try {
    return uni.getStorageSync(STORAGE.adminToken) || ''
  } catch (e) {
    return ''
  }
}

/** 保存云函数签发的凭证 */
export function setAdminToken(token) {
  try {
    if (token) uni.setStorageSync(STORAGE.adminToken, token)
  } catch (e) {
    // 存储失败时后续请求会因缺少凭证被拒，由页面提示重新登录
  }
}

/** 清除本机凭证（退出管理员 / 凭证过期时调用） */
export function clearAdminToken() {
  try {
    uni.removeStorageSync(STORAGE.adminToken)
  } catch (e) {
    // 忽略
  }
}

export const adminAuthApi = {
  /**
   * 管理员账号口令登录
   * @returns {Promise<{token:string, username:string, using_default_password:boolean, engine:string}>}
   */
  async login(username, password) {
    // 登录走较长的超时：云函数可能正在冷启动，8 秒默认值容易误判为超时
    const data = await callCloud(CLOUD_FN.config, {
      action: 'admin-login',
      username,
      password
    }, { timeout: 15000 })
    if (!data || !data.token) throw new Error('云函数未返回管理员凭证')
    setAdminToken(data.token)
    // 只提升角色，不覆盖同学自己起的昵称 / 头像。
    // 管理员同样要用普通功能（浏览菜品、AI 推荐、发评价），
    // 一登录就把昵称改成 "admin" 会让这些功能显示出来的身份不对。
    const existing = userApi.getProfile() || {}
    userApi.saveProfile({
      role: 'admin',
      nickname: existing.nickname || data.username || '管理员',
      avatar: existing.avatar || '😋'
    })
    return fromCloud(data)
  },

  /** 校验本机凭证是否仍然有效（页面进入后台时调用；过期/被改口令都会失败） */
  async verify() {
    const token = getAdminToken()
    if (!token) return { ok: false, reason: '尚未登录管理员账号' }
    try {
      const data = await callCloud(
        CLOUD_FN.config,
        { action: 'verify-admin', token },
        { timeout: 15000 }
      )
      return {
        ok: true,
        username: (data && data.username) || '',
        using_default_password: !!(data && data.using_default_password)
      }
    } catch (e) {
      return {
        ok: false,
        reason: (e && e.message) || '管理员凭证无效',
        // 连不上云端 ≠ 凭证无效：前者不能把管理员锁在门外
        offline: !!(e && e.cloudDown)
      }
    }
  },

  /** 修改管理员口令；成功后旧凭证立即失效，需要重新登录 */
  async changePassword(oldPassword, newPassword) {
    return fromCloud(
      await callCloud(CLOUD_FN.config, {
        action: 'change-password',
        token: getAdminToken(),
        old_password: oldPassword,
        new_password: newPassword
      }, { timeout: 15000 })
    )
  },

  /** 退出管理员：清本机凭证与管理员身份 */
  logout() {
    clearAdminToken()
    try {
      const profile = userApi.getProfile()
      if (profile && profile.role === 'admin') {
        userApi.saveProfile({ role: 'user' })
      }
    } catch (e) {
      // 忽略
    }
  }
}

export const configApi = {
  /** 获取 AI 配置状态（需管理员凭证；云函数不会返回 api_key 明文） */
  async get() {
    try {
      return fromCloud(
        await callCloud(CLOUD_FN.config, { action: 'get', token: getAdminToken() })
      )
    } catch (e) {
      return {
        configured: false,
        provider: '',
        base_url: '',
        model: '',
        has_key: false,
        engine: 'local',
        notice: e.message || '云端配置不可用，请先在 HBuilderX 中关联 uniCloud 服务空间并上传云函数'
      }
    }
  },

  /** 保存 AI 配置（仅管理员） */
  async save(cfg = {}) {
    const token = cfg.token || getAdminToken()
    return fromCloud(await callCloud(CLOUD_FN.config, { ...cfg, action: 'save', token }))
  },

  /** 测试大模型连通性（仅管理员） */
  async test() {
    return fromCloud(
      await callCloud(CLOUD_FN.config, { action: 'test', token: getAdminToken() })
    )
  },

  /** 菜品库初始化：sync 补齐缺失 / reset 全量重置 */
  async seed(action = 'sync') {
    return fromCloud(await callCloud(CLOUD_FN.seed, { action, token: getAdminToken() }))
  }
}

/* --------------------------------- 用户接口 --------------------------------- */

/**
 * 本地身份（uniCloud 主链路下不依赖后端登录）：
 * 用微信登录能力换取 openid 作为稳定 uid，失败则退化为本机随机 uid。
 */
export const userApi = {
  /** 获取本机 uid */
  getUid() {
    try {
      let uid = uni.getStorageSync('shiyu_uid')
      if (!uid) {
        uid = 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
        uni.setStorageSync('shiyu_uid', uid)
      }
      return uid
    } catch (e) {
      return ''
    }
  },

  /** 读取本地用户资料 */
  getProfile() {
    try {
      return uni.getStorageSync(STORAGE.userInfo) || null
    } catch (e) {
      return null
    }
  },

  /** 保存用户资料 */
  saveProfile(profile) {
    try {
      const merged = { ...(this.getProfile() || {}), ...profile, uid: this.getUid() }
      uni.setStorageSync(STORAGE.userInfo, merged)
      return merged
    } catch (e) {
      return null
    }
  },

  /**
   * 微信登录（可选）：拿到 code 后交给云函数换 openid。
   * 未关联云空间或非微信端会直接失败，此时由调用方展示「本机体验」。
   */
  async wechatLogin() {
    const code = await new Promise((resolve, reject) => {
      uni.login({
        provider: 'weixin',
        success: (res) => resolve(res.code),
        fail: (err) => reject(new Error((err && err.errMsg) || '微信登录失败'))
      })
    })
    // openid 换取由 wechat-login 云函数完成（返回 { code:0, data:{ openid } }）；
    // 之前误发给 shiyu-config 的 'wx-login' action，那边只支持 get/save/test，
    // 会返回「未知操作」，导致微信一键登录必然失败。
    const data = await callCloud(CLOUD_FN.wechat, { code })
    if (data && data.openid) {
      uni.setStorageSync('shiyu_uid', data.openid)
    }
    return data
  },

  /** 清除本地登录态与资料 */
  clear() {
    try {
      uni.removeStorageSync(STORAGE.userInfo)
    } catch (e) {
      // 忽略
    }
  }
}

/* --------------------------------- 兼容导出 --------------------------------- */

// 历史页面里可能还引用 authApi / adminApi / statsApi，这里给出降级实现，
// 避免旧代码 import 报错（新页面不应再使用）。
export const authApi = {
  getMyInfo: async () => userApi.getProfile(),
  updateMyInfo: async (data) => userApi.saveProfile(data)
}

export const adminApi = {
  allDishes: (params) => dishApi.list(params),
  allReviews: (params) => reviewApi.pending(params)
}

export const statsApi = {
  overview: async () => {
    // 必须把 dishApi.list 的 engine 透出去：数据看板靠它判断「云端 / 离线」。
    // 之前这里写死 engine:'local'，导致即使全部数据都来自云端，看板也一直挂着
    // 「当前使用本地离线数据」的黄条，管理员无法判断云函数到底通没通。
    const res = await dishApi.list({ pageSize: 999 })
    const list = (res && res.list) || []
    const total = list.length
    const avgRating = total
      ? (list.reduce((s, d) => s + (d.rating || 0), 0) / total).toFixed(2)
      : 0
    const avgPrice = total
      ? (list.reduce((s, d) => s + (d.price || 0), 0) / total).toFixed(1)
      : 0
    // 食堂数量按真实菜品的 canteen 去重统计，跟下方「食堂菜品分布」保持一致；
    // 菜品为空时退回本地菜谱的食堂数，避免显示 0 个食堂
    const liveCanteens = [...new Set(list.map((d) => d && d.canteen).filter(Boolean))]
    return {
      dish_total: total,
      canteen_total: liveCanteens.length || getLocalCanteens().length,
      avg_rating: Number(avgRating),
      avg_price: Number(avgPrice),
      engine: (res && res.engine) || 'local'
    }
  }
}

export default {
  dishApi,
  adminAuthApi,
  recommendApi,
  reviewApi,
  configApi,
  userApi,
  authApi,
  adminApi,
  statsApi,
  buildPrefLabel,
  buildPrefSentence,
  getAdminToken,
  setAdminToken,
  clearAdminToken
}
