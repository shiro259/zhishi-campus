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

/** 云函数名 */
const CLOUD_FN = {
  dish: 'shiyu-dish',
  recommend: 'shiyu-recommend',
  config: 'shiyu-config',
  seed: 'shiyu-seed',
  review: 'shiyu-review'
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

// null 表示尚未探测；true 表示云空间可用；false 表示不可用（本次运行内不再重试）
let cloudAvailable = null

/**
 * 菜品列表数据源是否锁定为本地
 *
 * 仅当「云端菜品库确实为空 / 数据陈旧」这类持久性状况成立时才锁定为本地，
 * 保证后续翻页连续（不会第一页 10 道本地菜、第二页突然空白）。
 * 网络抖动之类的临时故障不锁定，下次请求仍会重试云端。
 */
let dishListSource = 'cloud'

/**
 * 调用云函数
 * @param {string} name 云函数名
 * @param {Object} data 入参
 * @returns {Promise<*>} 成功返回 data 字段，失败抛出 Error
 */
function callCloud(name, data = {}) {
  return new Promise((resolve, reject) => {
    // 未开通云空间 / 未关联服务空间时 uniCloud 不存在，直接标记不可用
    if (typeof uniCloud === 'undefined' || !uniCloud || !uniCloud.callFunction) {
      cloudAvailable = false
      reject(new Error('uniCloud 不可用'))
      return
    }
    uniCloud.callFunction({
      name,
      data,
      success: (res) => {
        const body = res && res.result
        if (!body) {
          reject(new Error('云函数无返回'))
          return
        }
        if (body.code === 0) {
          cloudAvailable = true
          resolve(body.data)
        } else {
          // 业务错误（例如缺少参数、未配置 Key）不算云空间故障
          cloudAvailable = true
          reject(new Error(body.message || '云函数执行失败'))
        }
      },
      fail: (err) => {
        cloudAvailable = false
        reject(new Error((err && err.errMsg) || '云函数调用失败'))
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
 * 本地种子菜谱的菜名集合：云端种子库与本地同源（由 shiyu-seed 初始化），
 * 用来辨认云端是否已经正确播种，避免把一两条手工测试菜当成完整菜单。
 */
const LOCAL_DISH_NAMES = new Set(
  LOCAL_DISHES.filter((d) => d.status === 1 && d.name).map((d) => d.name)
)

/** 统计云端返回行里与本地种子菜同名的条数 */
function countKnownDishNames(rows) {
  return (rows || []).filter(
    (d) => d && typeof d.name === 'string' && LOCAL_DISH_NAMES.has(d.name.trim())
  ).length
}

/**
 * 云函数数据是否可信
 *
 * 背景：老版本的菜品集合里可能残留没有 `status` 字段的数据。云函数的列表查询带
 * `where({status: 1})`，这类数据查不出来；而食堂/分类枚举不带该条件，于是会出现
 * 「食堂列表里有一食堂、点进去一道菜都没有」的矛盾。除此之外，云端只手工加过
 * 一两条测试菜（从未执行种子初始化）时，云函数同样会「成功」返回，
 * 让前端误以为云端已初始化而跳过本地兜底。这里通过三类校验识别：
 *
 * 1. 字段完整性：菜名/食堂缺失（undefined）或菜名为空白字符串 → 脏数据；
 * 2. 食堂名自洽：返回的食堂名必须是本地菜谱里真实存在的食堂；
 * 3. 种子辨识度：云端总量不足 10 道且没有任何一道与本地种子菜同名
 *    → 视为「云端菜品库尚未初始化」，整库退回本地 40 道；
 *    正常初始化过的云端有 40 道同名菜，绝不会误判。
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

  // 云端返回的菜品缺少 canteen / name 等关键字段，或菜名为空白 → 旧结构/脏数据
  const broken = list.filter(
    (d) => d && (d.canteen === undefined || d.name === undefined || !String(d.name).trim())
  )
  if (broken.length) return false

  // 返回的食堂名必须是本地菜谱认识的食堂
  const localNames = getLocalCanteens()
  const unknown = list.filter((d) => d.canteen && localNames.indexOf(d.canteen) < 0)
  if (unknown.length) return false

  // 云端总量明显少于种子库（不足 10 道），且当前页里没有任何一道与本地种子菜同名
  // → 几乎可以肯定只是手工测试数据（云空间一旦用种子初始化，至少会有 40 道同名菜）
  if (total < 10 && countKnownDishNames(list) === 0) return false

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
      // 云端榜单为空，或榜单里没有任何一道种子菜（库里只有零散测试菜）时
      // 退回本地，避免首页被一两条测试菜占满
      if (!rows.length) throw new Error('云端榜单为空')
      if (countKnownDishNames(rows) === 0) throw new Error('云端榜单未包含种子菜品')
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
   * 重置菜品列表的数据源锁定
   *
   * list 在判定云端菜品库为空/陈旧后会锁定本地以保证翻页连续；
   * 执行完「数据初始化」或下拉刷新后调用本方法，即可重新尝试云端数据。
   */
  resetSource() {
    dishListSource = 'cloud'
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

/** 把偏好对象转成一句话标签，用于历史列表展示 */
export function buildPrefLabel(pref = {}) {
  const parts = []
  if (pref.meal_type) parts.push(pref.meal_type)
  if (pref.taste && pref.taste.length) parts.push(pref.taste.join('+'))
  if (pref.allergies && pref.allergies.length) parts.push('忌' + pref.allergies.join(''))
  if (pref.budget) parts.push(pref.budget + '元内')
  if (pref.canteen) parts.push(pref.canteen)
  return parts.length ? parts.join(' · ') : '无特殊偏好'
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

export const recommendApi = {
  /**
   * AI 智能推荐
   * @param {Object} pref { meal_type, taste:[], allergies:[], budget, canteen, extra }
   * @param {string} text 一句话自然语言描述（可选）
   * @returns {Promise<{recommendations:Array, summary:string, engine:string, model?:string}>}
   */
  async recommend(pref = {}, text = '') {
    // 客户端先解析一次自然语言：即使云端不支持该能力也能用
    const merged = { ...pref }
    if (text) {
      const parsed = localParsePref(text)
      merged.taste = merged.taste && merged.taste.length ? merged.taste : parsed.taste
      merged.allergies =
        merged.allergies && merged.allergies.length ? merged.allergies : parsed.allergies
      merged.budget = merged.budget || parsed.budget
      merged.meal_type = merged.meal_type || parsed.meal_type
    }

    /** 用本地 40 道菜跑规则引擎的兜底结果 */
    const useLocalEngine = (notice) => {
      const local = localRecommend(merged, LOCAL_DISHES)
      return { ...local, engine: 'local', notice: notice || '已使用本地智能规则' }
    }

    let result
    try {
      // 注意：云函数会自带 engine 字段（ai 表示真·大模型，local 表示云端规则兜底），
      // 因此这里直接透传，不能再用 fromCloud 覆盖成 'cloud'
      result = await callCloud(CLOUD_FN.recommend, { pref: merged, text: text || '' })
      result = { engine: 'cloud', ...(result || {}) }

      // 云端菜品库若未正确初始化（只有一两条手工测试菜），大模型也只能在脏数据里挑，
      // 会把测试菜当成高匹配结果返回。与榜单/列表同口径校验：
      // 推荐为空、或推荐菜里没有任何一道本地种子菜 → 整单改用本地 40 道菜重新推荐。
      const rows = (result && result.recommendations) || []
      if (!rows.length || countKnownDishNames(rows) === 0) {
        result = useLocalEngine('云端菜品库尚未初始化，已改用本地 40 道食堂菜品为你推荐')
      }
    } catch (e) {
      // 云端不可用 → 用本地全量菜品跑规则引擎
      result = useLocalEngine(
        e.message ? `云端推荐不可用（${e.message}），已使用本地智能规则` : '已使用本地智能规则'
      )
    }

    pushHistory(merged, result.summary)

    // 落盘「口味档案」：只保存用户在页面上明确选择的偏好（不含从 text 解析出来的部分），
    // 「我的」页与下次进入推荐页都读这份数据。放在 API 层可保证任何调用方都不会漏存。
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
  /** 评价列表（只返回已通过审核的） */
  async list(params = {}) {
    try {
      return fromCloud(await callCloud(CLOUD_FN.review, { action: 'list', ...params }))
    } catch (e) {
      const { dish_id, page = 1, pageSize = 10 } = params
      let list = readLocalReviews().filter((r) => r.status === 1)
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
      // 口令错误必须明示：否则页面会用本地空数据伪装成「暂无待审核」
      if (isAdminAuthError(e)) throw e
      const list = readLocalReviews().filter((r) => r.status === 0)
      return { list, total: list.length, hasMore: false, engine: 'local' }
    }
  },

  /** 全部评价（管理端）：含待审核 / 已通过 / 已拒绝 */
  async all(params = {}) {
    try {
      return fromCloud(
        await callCloud(CLOUD_FN.review, {
          action: 'all',
          token: getAdminToken(),
          ...params
        })
      )
    } catch (e) {
      if (isAdminAuthError(e)) throw e
      // 云端不可用时退本地全量（含各种状态），管理页至少能看本机数据
      const list = readLocalReviews()
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
      // 口令错误必须抛给页面：绝不能只改本地存储还弹「已通过」，否则云端状态永远不变
      if (isAdminAuthError(e)) throw e
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

/* ------------------------------ AI 配置（管理端） ------------------------------ */

/** 读取/生成管理口令：首次使用时生成并保存在本机 */
export function getAdminToken() {
  try {
    let token = uni.getStorageSync(STORAGE.adminToken)
    if (!token) {
      token =
        'adm_' +
        Date.now().toString(36) +
        Math.random().toString(36).slice(2, 10)
      uni.setStorageSync(STORAGE.adminToken, token)
    }
    return token
  } catch (e) {
    return ''
  }
}

/** 持久化管理员手动填写的口令（在「AI 配置」页填对一次后，审核/菜品管理共用） */
export function saveAdminToken(token) {
  const value = String(token || '').trim()
  if (!value) return
  try {
    uni.setStorageSync(STORAGE.adminToken, value)
  } catch (e) {
    // 存储失败不阻塞主流程
  }
}

/** 云函数返回的是否为管理口令相关错误（这类错误不能静默走本地兜底，否则页面会假装成功） */
function isAdminAuthError(e) {
  return ((e && e.message) || '').indexOf('口令') >= 0
}

export const configApi = {
  /** 获取 AI 配置状态（云函数不会返回 api_key 明文） */
  async get() {
    try {
      return fromCloud(await callCloud(CLOUD_FN.config, { action: 'get' }))
    } catch (e) {
      return {
        configured: false,
        provider: '',
        base_url: '',
        model: '',
        has_key: false,
        engine: 'local',
        notice: '云端配置不可用，请先在 HBuilderX 中关联 uniCloud 服务空间并上传云函数'
      }
    }
  },

  /**
   * 保存 AI 配置（仅管理员，需要管理口令）
   * 口令优先级：本次页面填写的口令 > 本机自动生成并保存的管理口令
   */
  async save(cfg = {}) {
    const token = cfg.token || cfg.admin_token || getAdminToken()
    const payload = { action: 'save', ...cfg, token, admin_token: token }
    return fromCloud(await callCloud(CLOUD_FN.config, payload))
  },

  /** 测试大模型连通性 */
  async test() {
    return fromCloud(await callCloud(CLOUD_FN.config, { action: 'test' }))
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
    const data = await callCloud(CLOUD_FN.config, { action: 'wx-login', code })
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
    const { list } = await dishApi.list({ pageSize: 999 })
    const total = list.length
    const avgRating = total
      ? (list.reduce((s, d) => s + (d.rating || 0), 0) / total).toFixed(2)
      : 0
    const avgPrice = total
      ? (list.reduce((s, d) => s + (d.price || 0), 0) / total).toFixed(1)
      : 0
    return {
      dish_total: total,
      canteen_total: getLocalCanteens().length,
      avg_rating: Number(avgRating),
      avg_price: Number(avgPrice),
      engine: 'local'
    }
  }
}

export default {
  dishApi,
  recommendApi,
  reviewApi,
  configApi,
  userApi,
  authApi,
  adminApi,
  statsApi,
  buildPrefLabel,
  getAdminToken
}
