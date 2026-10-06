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
  review: 'shiyu-review',
  wechat: 'wechat-login'
}

/** 本地储存键 */
const STORAGE = {
  userInfo: 'userInfo',
  pref: 'shiyu_pref',
  history: 'shiyu_history',
  adminToken: 'shiyu_admin_token',
  localReviews: 'shiyu_local_reviews',
  // 累计推荐次数。与 history 分开存：history 只留最近 20 条用于展示，
  // 拿它的长度当「推荐次数」会永远卡在 20。
  recommendCount: 'shiyu_recommend_count'
}

/* ------------------------------ 云函数可用性探测 ------------------------------ */

/**
 * 云空间是否可用
 *
 * null = 尚未探测；true = 可用；false = 确认不可用。
 * 只有「uniCloud 本身不存在」（未关联服务空间）才算确认不可用 —— 这是持久状况。
 * 不能把「某一次超时」或「某个云函数 fail」上升为全局不可用：
 * 首页加载会调用 shiyu-dish 等函数，只要其中一个不存在就锁死全部，
 * 会连管理员登录都报「云空间不可用」。
 */
let cloudAvailable = null

/** 已知不存在 / 未上传部署的云函数（只按函数名记，不连累其它函数） */
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
 * 云端菜品库是否已被确认是「真实菜单」
 *
 * null = 还不知道；true = 云端菜库自洽可信（菜单以云端为准）；false = 空库 / 陈旧数据。
 * 判定发生在「不带关键字的第一页」请求上（见 isCloudDishDataTrustworthy）。
 *
 * 它决定关键字搜索搜不到时**能不能**用本机种子菜谱兜底：
 * 云端菜库要是真实菜单（同学们实际吃的那份），搜不到就是真的没有，
 * 这时把本机种子菜（例如兰州拉面）塞进结果里，用户会看到一道自己食堂根本没有的菜 ——
 * 那正是「搜索到错误菜品」。只有云端菜库确实不可用时，本机菜谱才是同一份菜单的替身。
 */
let cloudMenuTrusted = null

/**
 * 构造「云端不可达」类错误
 *
 * 用 cloudDown 标记与「业务错误」区分：业务错误是云函数正常执行后返回
 * code!==0（例如口令校验失败），而 cloudDown 表示压根没问到云端
 * （未关联服务空间 / 函数未上传 / 超时 / 网络异常）。
 * 后台守卫据此决定是「踢出登录」还是「云端不可用但先放行」。
 */
function cloudError(message) {
  const err = new Error(message)
  err.cloudDown = true
  return err
}

/**
 * 把云函数调用失败的 errMsg 翻译成「原因 + 怎么办」
 *
 * 微信真机与开发者工具的差别很大，最常见的是域名白名单：
 * manifest.json 里的 setting.urlCheck=false 只对开发者工具生效，
 * 真机由微信客户端自己校验 request 合法域名，于是「工具里能通、手机上不通」。
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
  if (/口令校验失败|口令不正确|admin.?token/i.test(raw)) {
    return raw +
      '\n\n【原因】云端**已经**存着一个管理口令，你输入的不是它。' +
      '\n最容易踩的坑：在「AI 配置」页点保存时把口令留空了，' +
      '那时程序会用「本机随机生成」的一串口令去云端初始化 —— 于是云端口令变成一个你没见过的随机串。' +
      '\n【办法一】本机可能还存着那串口令：回登录页直接点「管理员登录」（口令框已回填），能登进去就说明是对的。' +
      '\n【办法二】uniCloud 控制台 → 云数据库 → shiyu-config 集合 → 删掉 admin_token 这个字段，' +
      '下次登录时你输入的口令就会成为新的初始口令。'
  }
  if (/未知的 action|未知操作|unknown action/i.test(raw)) {
    return raw +
      '\n\n【原因】云端运行的还是**旧版**云函数，不认识这次请求的动作。' +
      '\n本地代码改了不等于云端更新了：必须重新上传部署才会生效。' +
      '\n【办法】HBuilderX → 右键对应的云函数目录 → 上传部署（本次改动过 shiyu-config）。'
  }
  if (/function not found|FUNCTION_NOT_FOUND|不存在|not exist/i.test(raw)) {
    return raw + '\n\n【原因】这个云函数还没上传部署。\n【办法】HBuilderX 里右键该云函数 → 上传部署。'
  }
  if (/timeout|time out|超时/i.test(raw)) {
    return raw +
      '\n\n【原因】云函数超时。最常见的是**平台默认超时只有 5 秒**，' +
      '而大模型生成一段回答经常不止 5 秒 —— 于是被平台掐断，客户端只看到超时。' +
      '\n【办法】给云函数的 package.json 加上 cloudfunction-config.timeout（单位秒），' +
      '例如 shiyu-chat 设成 60；改完需要**重新上传该云函数**才生效。' +
      '\n（本项目已为 shiyu-chat / shiyu-config / shiyu-recommend / shiyu-seed 配好，' +
      '若仍超时请确认这些云函数已重新上传部署）'
  }
  if (/cloud space|spaceId|envId|服务空间|not bound/i.test(raw)) {
    return raw + '\n\n【原因】本项目没有关联云服务空间，或关联的空间不对。' +
      '\n【办法】HBuilderX 里右键 uniCloud-aliyun → 关联云服务空间。'
  }
  if (/^request:fail/i.test(raw)) {
    return raw + '\n\n【原因】请求没能发出去：网络异常，或域名被微信拦下。' +
      '\n【办法】先确认手机能正常上网；再检查 request 合法域名是否包含云函数请求域名。'
  }
  return raw
}

/**
 * 调用云函数
 * @param {string} name 云函数名
 * @param {Object} data 入参
 * @param {Object} [options] { timeout } 超时毫秒，默认 8000；登录等冷启动较慢的调用可调大
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
    // 未开通云空间 / 未关联服务空间时 uniCloud 不存在，直接标记不可用
    if (typeof uniCloud === 'undefined' || !uniCloud || !uniCloud.callFunction) {
      cloudAvailable = false
      reject(cloudError('uniCloud 不可用：请在 HBuilderX 中右键 uniCloud-aliyun → 关联云服务空间'))
      return
    }
    // 已知该函数不存在，不再反复发无效请求
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
          // 业务错误（例如缺少参数、口令校验失败）不算云空间故障
          cloudAvailable = true
          reject(new Error(body.message || '云函数执行失败'))
        }
      },
      fail: (err) => {
        clearTimeout(timer)
        const msg = (err && (err.errMsg || err.message)) || '云函数调用失败'
        // 只有明确「函数不存在」才记住，且只记这个函数；网络抖动等临时失败一律不记
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

/**
 * 本机菜谱查询（带「放开筛选」补救）
 *
 * 关键字搜索结果为 0 且还叠着食堂/分类筛选时，放开筛选再搜一次 ——
 * 这与 searchFallback 的 ②③ 步是同一套逻辑，之所以单独抽出来，
 * 是因为「云端数据不可信、整库退回本地」时（dishListSource === 'local'）
 * 也要享受同样的补救，否则纯本地链路依然会「明明列表里有、搜却搜不到」。
 */
function localListWithRelax(params) {
  const local = localDishList(params)
  if (local.list.length) return local
  if (params.keyword && (params.canteen || params.category)) {
    const relaxed = localDishList({ ...params, canteen: undefined, category: undefined })
    if (relaxed.list.length) return { ...relaxed, relaxedFilters: true }
  }
  return local
}

/**
 * 关键字搜索一条都没搜到时的补救
 *
 * 「明明列表里有这道菜，搜却搜不到」有两类成因，这里依次处理：
 *
 * ① **食堂/分类筛选还叠着**：用户从首页某个食堂入口点进来，筛选条上就带着
 *    「第一食堂」。此时搜「宫保鸡丁」（第二食堂的菜）必然 0 条 ——
 *    用户只看到「暂无符合条件的菜品」，根本想不到是筛选条件在作怪。
 *    → 放开筛选在**同一份数据**里重搜一次，并回传 relaxedFilters 让页面把筛选条
 *      同步清空（否则筛选条显示「第一食堂」、列表却是全部食堂的结果，更让人困惑）。
 *
 * ② **云端菜库不可用**（空库 / 未执行数据初始化 / 云函数还是旧版本）：
 *    此时列表本身就是本机菜谱在顶班，搜索也必须搜同一份数据。
 *    ⚠️ 反过来，云端菜库若是**真实菜单**，搜不到就是真的没有 ——
 *       绝不能拿本机种子菜冒充，否则会出现「搜牛肉跳出兰州拉面，
 *       可自己食堂根本没这道菜」这种更糟的错误结果。
 *
 * @param {Object} params 原始查询参数
 * @param {Object} cloudRes 云端「带筛选 + 关键字」的空结果
 * @param {boolean} knownRealMenu 云端菜库是否已确认为真实菜单
 * @returns {Promise<Object>} 结果（可能带 relaxedFilters 标记）
 */
async function searchFallback(params, cloudRes, knownRealMenu) {
  const hasFilter = !!(params.canteen || params.category)

  // ① 放开食堂/分类筛选，云端再搜一次（同一份数据，不会掺进别的菜）
  if (hasFilter) {
    try {
      const data = await callCloud(CLOUD_FN.dish, {
        action: 'list',
        ...params,
        canteen: undefined,
        category: undefined
      })
      if (data && (data.list || []).length) {
        return { engine: 'cloud', ...data, relaxedFilters: true }
      }
    } catch (e) {
      // 云端这次也不行；若云端菜库是真实菜单，就到此为止，不拿本机菜谱冒充
      if (knownRealMenu) return cloudRes
    }
  }

  // 已知云端菜库是真实菜单 → 空就是空，不用本机种子菜兜底
  if (knownRealMenu) return cloudRes

  // ② 本机菜谱（先尊重筛选，再放开筛选）
  const local = localListWithRelax(params)
  if (local.list.length) return local

  // 真的没有 → 返回云端的空结果，让页面正常显示空态
  return cloudRes
}

/* --------------------------------- 菜品接口 --------------------------------- */

/**
 * 判断一道菜是否命中搜索关键词（本地兜底用）
 *
 * ⚠️ 口径必须与云函数 shiyu-dish 的关键字查询**完全一致**：
 *   菜名 / 标签 / 窗口 / 食堂 / 分类，任一字段包含关键词即命中。
 * 不一致的后果很隐蔽：同一个关键词，走云端时命中一批、走本地兜底时命中另一批
 * （或一条都没有），用户看到的就是「有时候搜不到，有时候搜出来别的菜」。
 *
 * 刻意**不包含 description**：描述里的无关词会把不相干的菜带出来
 * （例：大盘鸡的描述提到「皮带面」，搜「面」就会命中它）。
 * 食材请靠 tags —— 那是结构化字段，比描述里的自然语言准得多。
 *
 * @param {Object} d 菜品
 * @param {string} kw 已小写化的关键词
 * @returns {boolean}
 */
function dishMatchesKeyword(d, kw) {
  if (!d || !kw) return false
  const parts = [d.name, d.window, d.canteen, d.category]
  // 标签逐个作为独立字符串参与匹配，不能拼成一个长串：
  // MongoDB 里正则作用于数组字段时是「任一元素命中即命中」，
  // 拼成长串会让「辣 牛肉」这种带空格的词在本地跨两个标签命中、在云端一条都搜不到 ——
  // 又变成「同一个词两条链路结果不同」。
  if (Array.isArray(d.tags)) parts.push(...d.tags)
  return parts.some((x) => typeof x === 'string' && x && x.toLowerCase().includes(kw))
}

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
    list = list.filter((d) => dishMatchesKeyword(d, kw))
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
    if (dishListSource === 'local') return localListWithRelax(params)

    // 本次请求开始前，是否已经确认云端菜库就是真实菜单（决定能不能用本机菜谱兜底）
    const knownRealMenu = cloudMenuTrusted === true

    try {
      const data = await callCloud(CLOUD_FN.dish, { action: 'list', ...params })
      const res = { engine: 'cloud', ...(data || {}) }
      const isFirstPage = !params.page || Number(params.page) === 1
      // 不带筛选、不带关键字的第一页 = 完整菜单 → 用它的自洽性判断云端菜库是否真实
      if (isFirstPage && !params.keyword) {
        cloudMenuTrusted = isCloudDishDataTrustworthy(res)
        if (!cloudMenuTrusted) {
          // 持久性状况（库空 / 陈旧数据）：锁定本地，保证后续翻页连续
          dishListSource = 'local'
          return localDishList(params)
        }
      }
      // 关键字搜索：一条都没搜到 → 补救（见 searchFallback 注释）
      if (params.keyword && isFirstPage && !((res.list || []).length)) {
        return await searchFallback(params, res, knownRealMenu)
      }
      return res
    } catch (e) {
      // 云端菜库已确认是真实菜单时，关键字搜索绝不拿本机种子菜冒充搜索结果
      if (params.keyword && knownRealMenu) throw e
      // 临时故障（网络抖动等）：不锁定，下次仍重试云端
      return localListWithRelax(params)
    }
  },

  /**
   * 按 id 批量取菜品（收藏页用）
   *
   * 收藏只是一串 id（存在本机），逐个调 detail 会发 N 次请求，
   * 所以云函数提供了 byIds 动作一次取回，并保持传入顺序。
   * 云端不可用时用本机菜谱兜底，保证离线也能看到收藏。
   */
  async byIds(ids) {
    const list = (Array.isArray(ids) ? ids : []).map((x) => String(x || '').trim()).filter(Boolean)
    if (!list.length) return { list: [], engine: 'local' }

    try {
      const data = await callCloud(CLOUD_FN.dish, { action: 'byIds', ids: list })
      const rows = (data && data.list) || []
      if (rows.length) return { ...fromCloud(data), list: rows }
      // 云端一条都没查到：可能是库空 / 还没初始化 → 退回本机菜谱
      throw new Error('云端没有匹配的菜品')
    } catch (e) {
      const byId = new Map()
      LOCAL_DISHES.forEach((d) => {
        if (d.status === 1) byId.set(String(d.id), d)
      })
      const local = []
      list.forEach((id) => {
        const hit = byId.get(id)
        if (hit) local.push(hit)
      })
      return { list: local, total: local.length, engine: 'local' }
    }
  },

  /** 菜品详情 */
  async detail(id) {    if (!id) throw new Error('缺少菜品 id')
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
   * 批量把菜品图片改写成云存储 fileID（管理端）
   *
   * 客户端负责逐张上传拿到 fileID，这里一次性批量写回云端；
   * 图片迁移的完整流程见 common/cloud-images.js。
   */
  async setImages(items, options = {}) {
    const list = Array.isArray(items) ? items : []
    if (!list.length) return { updated: 0, failed: [], total: 0 }
    return fromCloud(
      await callCloud(
        CLOUD_FN.dish,
        { action: 'setImages', items: list, token: getAdminToken() },
        // 批量更新比单条查询慢，给足超时（云函数侧超时 30 秒）
        { timeout: Number(options.timeout) > 0 ? Number(options.timeout) : 20000 }
      )
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

  // 累计次数单独存：history 只保留最近 20 条，不能用它的长度当总次数
  try {
    const n = Number(uni.getStorageSync(STORAGE.recommendCount)) || 0
    uni.setStorageSync(STORAGE.recommendCount, n + 1)
  } catch (e) {
    // 忽略
  }
}

/**
 * 累计推荐次数（「我的」页数据统计用）
 *
 * 口径：**每一次推荐请求**都算，包括云端大模型、云端规则引擎与本机规则引擎。
 * 不叫「大模型调用次数」是因为后两种兜底也是用户眼里的一次「AI 推荐」，
 * 真要区分调用来源需要另存计数器，目前没有必要。
 */
export function getRecommendCount() {
  try {
    return Number(uni.getStorageSync(STORAGE.recommendCount)) || 0
  } catch (e) {
    return 0
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

/** 清除本机管理口令（退出管理员 / 口令失效时调用） */
export function clearAdminToken() {
  try {
    uni.removeStorageSync(STORAGE.adminToken)
  } catch (e) {
    // 忽略
  }
}

/**
 * 管理员认证（管理端）
 *
 * 云端模型：`shiyu-config` 里存的是管理口令的 SHA-256 摘要，
 * 客户端只提交明文口令、由云函数校验（见 common/shiyu-common 的 verifyAdminToken）。
 * 因此本机存的也是这个口令本身，而不是服务端签发的凭证。
 *
 * 安全边界：本机的 role:'admin' 只能由一次认证成功写入，
 * 登录页不提供任何「自选角色」的入口，所以普通同学无法把自己变成管理员。
 */
export const adminAuthApi = {
  /**
   * 管理员登录
   * @param {string} passphrase 管理口令
   * @returns {Promise<{ok:boolean, initialized:boolean, engine:string}>}
   */
  async login(passphrase) {
    const value = String(passphrase || '').trim()
    if (!value) throw new Error('请输入管理口令')

    // 先让云端确认口令正确，再落盘 —— 避免把错口令存下来
    const data = await callCloud(
      CLOUD_FN.config,
      { action: 'verify', token: value },
      { timeout: 15000 }
    )
    saveAdminToken(value)

    const profile = userApi.getProfile() || {}
    userApi.saveProfile({
      role: 'admin',
      nickname: profile.nickname || '管理员',
      avatar: profile.avatar || '😋'
    })

    return fromCloud({
      ok: true,
      initialized: !!(data && data.initialized),
      using_default_password: false
    })
  },

  /**
   * 校验本机口令是否仍然有效（后台各页进入时调用）
   * 口令被改过 / 从未登录都会失败
   */
  async verify() {
    const token = getAdminToken()
    if (!token) return { ok: false, reason: '尚未登录管理员账号' }
    try {
      await callCloud(CLOUD_FN.config, { action: 'verify', token }, { timeout: 15000 })
      return { ok: true, username: '管理员' }
    } catch (e) {
      return {
        ok: false,
        reason: (e && e.message) || '管理口令校验失败',
        // 连不上云端 ≠ 口令错误：前者不能把管理员锁在门外
        offline: !!(e && e.cloudDown)
      }
    }
  },

  /** 退出管理员：清本机口令与管理员身份 */
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

/* ------------------------------ 偏好 → 一句话 ------------------------------ */

/** 把选项数组（可能是纯字符串，也可能是 {label,value}）转成纯中文词 */
function toPrefWords(list) {
  if (!Array.isArray(list)) return []
  return list
    .map((item) => {
      if (typeof item === 'string') return item
      if (item && typeof item === 'object') return item.label || item.value || ''
      return ''
    })
    .filter((s) => typeof s === 'string' && s)
}

/**
 * 把偏好对象转成一句可以直接跟 AI 说的话
 *
 * 用于首页「快捷口味」点一下之后，到推荐页回填输入框 ——
 * 推荐页是 tabBar 页，switchTab 不能带 query，只能靠本地暂存传偏好过来。
 * 兼容两种情况：偏好里存的是中文词（当前 constants 的形态），或历史遗留的 code。
 *
 * @param {Object} pref
 * @returns {string} 例如「想吃辣的，不要香菜，15元以内」
 */
export function buildPrefSentence(pref = {}) {
  const tastes = toPrefWords(pref.taste)
  const allergies = toPrefWords(pref.allergies)
  const parts = []
  if (tastes.length) parts.push('想吃' + tastes.join('、') + '的')
  if (allergies.length) parts.push('不要' + allergies.join('、'))
  if (pref.budget && Number(pref.budget) < 999) parts.push(pref.budget + '元以内')
  if (pref.canteen) parts.push('在' + pref.canteen)
  if (parts.length && pref.meal_type) parts.push(pref.meal_type + '吃')
  return parts.length ? parts.join('，') : ''
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
   * 微信登录（可选能力）：拿到 code 后交给云函数换 openid。
   *
   * 失败原因必须**各不相同**：以前无论什么原因，登录页都统一显示
   * 「当前环境不支持微信登录」，把「不是小程序端」「用户取消了授权」
   * 「云函数没上传」「没配 AppSecret」混成同一句话，完全没法排查。
   * 这里按原因抛出不同的错误信息，由页面原样展示。
   *
   * 注意：只有微信小程序能拿到 code；H5 / App 端直接给明确原因。
   */
  async wechatLogin() {
    // #ifndef MP-WEIXIN
    throw new Error('当前不是微信小程序环境（H5 / App 端拿不到微信授权码），请手动填写昵称后进入。')
    // #endif

    // #ifdef MP-WEIXIN
    const code = await new Promise((resolve, reject) => {
      uni.login({
        provider: 'weixin',
        success: (res) => {
          if (res && res.code) resolve(res.code)
          else reject(new Error('微信没有返回授权码，请重新点击“微信一键登录”。'))
        },
        fail: (err) => {
          const detail = (err && (err.errMsg || err.message)) || ''
          // 用户在授权弹窗里点了拒绝也是走这里，提示要能区分「取消」和「失败」
          const cancelled = /cancel|deny|拒绝/i.test(detail)
          reject(
            new Error(
              cancelled
                ? '你取消了微信授权。想用微信登录的话请重新点击并同意授权。'
                : '微信授权失败：' + (detail || '未知原因') + '（可在微信开发者工具里查看具体报错）'
            )
          )
        }
      })
    })

    // openid 换取由 wechat-login 云函数完成（返回 { code:0, data:{ openid } }）；
    // 云函数返回的业务失败信息（未配置 AppID/Secret、code 过期等）会原样抛出来
    const data = await callCloud(CLOUD_FN.wechat, { code })
    if (data && data.openid) {
      uni.setStorageSync('shiyu_uid', data.openid)
    }
    return data
    // #endif
  },

  /**
   * 微信登录配置自检
   *
   * 让云函数回答「WECHAT_APPID / WECHAT_SECRET 配了没有」，**不需要真实 code**。
   * 登录失败时前端会顺手调它一次，把「到底哪一步没配好」写进提示，
   * 省得用户拿着「微信登录失败」去猜。
   * 云函数没上传 / 云空间没关联时这里也会抛错 —— 那本身就是结论。
   */
  async checkWechatLogin() {
    return fromCloud(
      await callCloud(CLOUD_FN.wechat, { action: 'check' }, { timeout: 8000 })
    )
  },

  /** 清除本地登录态与资料 */
  clear() {    try {
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
  adminAuthApi,
  buildPrefLabel,
  buildPrefSentence,
  explainCloudError,
  getAdminToken,
  saveAdminToken,
  clearAdminToken
}
