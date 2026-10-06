/**
 * 客户端兜底推荐引擎
 * 说明：云函数（uniCloud recommend）不可用时，页面直接调用本文件在本地完成推荐计算。
 * 纯 JS 实现：不依赖第三方库、不调用 uni.* / window / uniCloud 等 API，可在纯 Node 环境直接测试。
 * 主要能力：
 *   1. localRecommend(pref, dishes) 按「忌口硬过滤 + 加权打分」产出前 5 条推荐与一句话总结
 *   2. localParsePref(text)         从一句自然语言里解析偏好（口味 / 忌口 / 预算 / 餐次）
 */
import { ALLERGY_OPTIONS } from './constants.js'
import { LOCAL_DISHES } from './local-dishes.js'

/** 最多返回的推荐条数 */
const MAX_RESULTS = 5

/** 匹配分数下限 / 上限 */
const SCORE_MIN = 40
const SCORE_MAX = 99

/** 口味词（含口感词）-> 推荐语短语，用于生成有区分度、不模板化的推荐理由 */
const TASTE_PHRASES = {
  麻辣: '麻辣够劲',
  辣: '辣得过瘾',
  清淡: '清淡不腻',
  咸香: '咸香入味',
  甜: '甜口讨喜',
  酸: '酸香开胃',
  重油: '重油解馋',
  鲜嫩: '鲜嫩多汁',
  下饭: '特别下饭',
  汤面: '汤头舒服',
  干拌面: '干拌筋道',
  养胃: '暖胃养人',
  早餐: '适合当早餐',
  低卡: '低卡不胖人'
}

/** 忌口表达：前缀式（不吃香菜 / 不要葱蒜 / 忌牛肉 / 不含花生） */
const AVOID_PREFIX = '(不吃|不要|别放|不加|不含|没有|忌|少放|免|去)'
/** 忌口表达：后缀式（香菜别放 / 花生过敏 / 牛肉不要） */
const AVOID_SUFFIX = '(不要|别放|不吃|过敏|拿掉|去掉|不耐受)'
/** 前缀与忌口词之间允许的间隔字符（例如「不要葱蒜」中的「葱」） */
const AVOID_GAP = '[^，。；、,.!?！？]{0,2}'

/** 中文数字预算映射（仅覆盖食堂场景常见值） */
const CN_BUDGETS = [
  { text: '十五', value: 15 },
  { text: '二十', value: 20 },
  { text: '二十五', value: 25 },
  { text: '三十', value: 30 },
  { text: '四十', value: 40 },
  { text: '五十', value: 50 },
  { text: '十', value: 10 }
]

/** 安全转数字 */
function toNumber(value) {
  const n = Number(value)
  return isNaN(n) ? 0 : n
}

/** 价格 / 金额格式化：整数不带小数，否则保留一位 */
function formatMoney(value) {
  const v = Math.round(toNumber(value) * 10) / 10
  if (Number.isInteger(v)) return String(v)
  return v.toFixed(1)
}

/** 字符串哈希，用于让不同菜品落到不同的推荐语模板上，避免千篇一律 */
function hashOf(text) {
  const str = String(text)
  let hash = 7
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) % 1000003
  }
  return hash
}

/** 取出菜品的口味描述短语，优先使用与用户偏好命中的、更具体的口味词（麻辣 > 辣） */
function pickTastePhrase(dish, ctx) {
  const tags = Array.isArray(dish.tags) ? dish.tags : []
  const matched = []
  tags.forEach(function (tag) {
    if (ctx.taste.indexOf(tag) >= 0 && matched.indexOf(tag) < 0) matched.push(tag)
  })
  // 更长的口味词更具体（如「麻辣」优于「辣」）
  matched.sort(function (a, b) { return b.length - a.length })

  const candidates = matched.concat(tags)
  for (let i = 0; i < candidates.length; i++) {
    const phrase = TASTE_PHRASES[candidates[i]]
    if (phrase) return phrase
  }
  return '用料实在'
}

/** 生成推荐理由：结合口味、价格、评分，按菜品 id 挑选不同的句式，长度控制在 30 字内 */
function buildReason(dish, ctx) {
  const taste = pickTastePhrase(dish, ctx)
  const price = formatMoney(dish.price)
  const rating = toNumber(dish.rating).toFixed(1)
  const where = `${dish.canteen}${dish.window}`
  const meal = ctx.mealType ? ctx.mealType : ''

  const list = []
  if (dish.is_new) list.push(`新上架的${dish.name}，${taste}，${price}元，评分${rating}`)
  list.push(`${taste}，${price}元管饱，评分${rating}`)
  list.push(`${where}招牌，${taste}，才${price}元，评分${rating}`)
  list.push(`${meal}${dish.name}，${taste}，${price}元一份，评分${rating}`)
  list.push(`评分${rating}的老客回头款，${taste}，${price}元`)
  list.push(`${dish.name}${taste}，${price}元就能吃到，评分${rating}`)
  list.push(`${where}现做，${taste}，${price}元，评分${rating}`)
  list.push(`人均${price}元，${taste}，评分${rating}值得一试`)

  const start = hashOf(dish.id) % list.length
  for (let i = 0; i < list.length; i++) {
    const reason = list[(start + i) % list.length]
    if (reason.length <= 30) return reason
  }
  return list[0].slice(0, 30)
}

/**
 * 加权打分（标度已校准，保证展示分有梯度而不是全部顶到 99）
 *
 * 基础 42 + 口味命中(每项 8，最多 18) + 评分贡献(最多 22) + 预算合理 +4 + 新菜 +1 + 好评度(最多 4)
 * 理论峰值 91：口味全中也拿不到满分，把「完全匹配」的余量留给真实大模型输出的结果。
 */
function scoreDish(dish, ctx, maxRecommend) {
  let score = 42
  const tags = Array.isArray(dish.tags) ? dish.tags : []

  let hit = 0
  ctx.taste.forEach(function (taste) {
    if (tags.indexOf(taste) >= 0) hit++
  })
  score += Math.min(hit * 8, 18)

  // 评分贡献：按 3.0 分起步折算，4.0 分约 22 分，避免所有高分菜被顶到同分
  score += Math.min(Math.max(toNumber(dish.rating) - 3.0, 0) * 22, 22)

  // 预算只用掉八成以内，说明还有加个菜的余地
  if (ctx.budget !== null && toNumber(dish.price) <= ctx.budget * 0.8) score += 4
  if (dish.is_new) score += 1
  if (maxRecommend > 0) {
    score += Math.min((toNumber(dish.recommend_count) / maxRecommend) * 4, 4)
  }
  return score
}

/** 生成整体总结句，末尾附人均价格 */
function buildSummary(picked, ctx) {
  let label = '好评菜'
  if (ctx.taste.indexOf('清淡') >= 0) label = '清淡爽口的菜'
  else if (ctx.taste.indexOf('麻辣') >= 0 || ctx.taste.indexOf('辣') >= 0) label = '够辣够香的菜'
  else if (ctx.taste.indexOf('甜') >= 0) label = '甜口小菜'
  else if (ctx.taste.indexOf('酸') >= 0) label = '酸香开胃的菜'

  let total = 0
  picked.forEach(function (item) { total += toNumber(item.price) })
  const avg = picked.length ? formatMoney(total / picked.length) : '0'

  const parts = [`为你挑了 ${picked.length} 道${label}`]
  if (ctx.canteen) parts.push(`都来自${ctx.canteen}`)
  if (ctx.budget !== null) parts.push(`都在 ${ctx.budget} 元以内`)
  if (ctx.mealType) parts.push(`${ctx.mealType}吃正合适`)
  if (parts.length === 1) parts.push('性价比都很高')

  return `${parts.join('，')}，人均 ${avg} 元`
}

/**
 * 本地推荐
 * @param {Object} pref 偏好 { meal_type, taste:[], allergies:[], budget:number|null, canteen:'', extra:'' }
 * @param {Array}  dishes 菜品列表，不传则使用本地内置的 40 道菜
 * @returns {{recommendations:Array, summary:string, engine:string}}
 */
export function localRecommend(pref, dishes) {
  const p = pref || {}
  const source = Array.isArray(dishes) ? dishes : LOCAL_DISHES

  const ctx = {
    taste: Array.isArray(p.taste) ? p.taste : [],
    allergies: Array.isArray(p.allergies) ? p.allergies : [],
    budget: (typeof p.budget === 'number' && p.budget > 0) ? p.budget : null,
    canteen: p.canteen ? String(p.canteen) : '',
    mealType: p.meal_type ? String(p.meal_type) : ''
  }

  // 1. 硬过滤：忌口绝不出现、超预算剔除、指定食堂才保留
  const filtered = []
  source.forEach(function (dish) {
    if (!dish || !dish.name) return
    if (dish.status !== undefined && toNumber(dish.status) === 0) return
    const tags = Array.isArray(dish.tags) ? dish.tags : []
    for (let i = 0; i < ctx.allergies.length; i++) {
      if (tags.indexOf(ctx.allergies[i]) >= 0) return
    }
    if (ctx.budget !== null && toNumber(dish.price) > ctx.budget) return
    if (ctx.canteen && dish.canteen !== ctx.canteen) return
    filtered.push(dish)
  })

  if (!filtered.length) {
    return {
      recommendations: [],
      summary: '没有完全符合的菜品，试试放宽预算或换个食堂~',
      engine: 'local'
    }
  }

  // 2. 加权打分
  let maxRecommend = 0
  filtered.forEach(function (dish) {
    const c = toNumber(dish.recommend_count)
    if (c > maxRecommend) maxRecommend = c
  })

  const scored = filtered.map(function (dish) {
    const raw = scoreDish(dish, ctx, maxRecommend)
    let match = Math.round(raw)
    if (match < SCORE_MIN) match = SCORE_MIN
    if (match > SCORE_MAX) match = SCORE_MAX
    return { dish: dish, raw: raw, match: match }
  })

  // 3. 排序：展示分降序 -> 原始分降序 -> 评分降序 -> 好评数降序 -> id 升序
  scored.sort(function (a, b) {
    if (b.match !== a.match) return b.match - a.match
    if (b.raw !== a.raw) return b.raw - a.raw
    const ra = toNumber(a.dish.rating)
    const rb = toNumber(b.dish.rating)
    if (rb !== ra) return rb - ra
    const ca = toNumber(a.dish.recommend_count)
    const cb = toNumber(b.dish.recommend_count)
    if (cb !== ca) return cb - ca
    return String(a.dish.id) < String(b.dish.id) ? -1 : 1
  })

  const picked = scored.slice(0, MAX_RESULTS)

  const recommendations = picked.map(function (item) {
    const dish = item.dish
    return {
      dish_id: dish.id,
      // id / image 一并透出：推荐页的 DishImage 组件靠它们解析实拍图，
      // 缺了就只能退回 emoji 占位
      id: dish.id,
      image: dish.image || '',
      name: dish.name,
      canteen: dish.canteen,
      window: dish.window,
      price: dish.price,
      rating: dish.rating,
      emoji: dish.emoji,
      tags: Array.isArray(dish.tags) ? dish.tags.slice(0) : [],
      reason: buildReason(dish, ctx),
      match_score: item.match
    }
  })

  return {
    recommendations: recommendations,
    summary: buildSummary(recommendations, ctx),
    engine: 'local'
  }
}

/**
 * 从自然语言中解析偏好
 * @param {string} text 例如「午餐想吃辣的，20元以内，不要香菜和葱」
 * @returns {{taste:Array, allergies:Array, budget:number|null, meal_type:string}}
 */
export function localParsePref(text) {
  const result = { taste: [], allergies: [], budget: null, meal_type: '' }
  if (text === null || text === undefined) return result

  const raw = String(text)
  if (!raw.replace(/\s/g, '')) return result
  // 去掉空白，避免「不 吃 香 菜」之类的分词干扰
  const t = raw.replace(/\s/g, '')

  function pushTaste(word) {
    if (result.taste.indexOf(word) < 0) result.taste.push(word)
  }
  function pushAllergy(word) {
    if (result.allergies.indexOf(word) < 0) result.allergies.push(word)
  }

  // ===== 口味 =====
  // 「不辣 / 免辣 / 微辣 / 少辣」属于不要辣的表达，按清淡处理
  if (/不辣|免辣|不吃辣|不要辣|别放辣|微辣|少辣/.test(t)) {
    pushTaste('清淡')
  } else if (/辣/.test(t)) {
    // 辣 / 麻辣 / 重辣：同时补上「辣」与「麻辣」，交给打分环节按命中数量加权
    pushTaste('辣')
    pushTaste('麻辣')
  }
  if (/清淡|少油|养生|养胃|不油腻|低卡|减脂|减重/.test(t)) pushTaste('清淡')
  if (/甜/.test(t)) pushTaste('甜')
  if (/酸/.test(t)) pushTaste('酸')
  if (/咸/.test(t)) pushTaste('咸香')
  if (/重油|多油|油大|油炸/.test(t)) pushTaste('重油')
  if (/嫩|爽滑|爽口/.test(t)) pushTaste('鲜嫩')

  // ===== 忌口 =====
  // 连锁忌口：处理「不吃牛肉和葱」「不要葱、蒜、花生」这类一次否定多个食材的表达。
  // 做法是在命中的忌口词之后，继续向后吞掉「和/跟/与/、/,/及/还有」连接的后续食材词。
  const chained = new Set(collectChainedAllergies(t))
  ALLERGY_OPTIONS.forEach(function (word) {
    if (chained.has(word)) {
      pushAllergy(word)
      return
    }
    const prefix = new RegExp(AVOID_PREFIX + AVOID_GAP + word)
    const suffix = new RegExp(word + AVOID_SUFFIX)
    if (prefix.test(t) || suffix.test(t)) pushAllergy(word)
  })

  // ===== 预算 =====
  // 数字 + 元/块/以内/以下/左右，例如 20元以内、15块、10元左右
  const numMatch = t.match(/(\d+(?:\.\d+)?)(?:元|块钱|块|以内|以下|左右)/)
  if (numMatch) {
    const value = Math.round(toNumber(numMatch[1]))
    if (value > 0 && value <= 500) result.budget = value
  } else {
    const presetMatch = t.match(/预算(\d+(?:\.\d+)?)/)
    if (presetMatch) {
      const value = Math.round(toNumber(presetMatch[1]))
      if (value > 0 && value <= 500) result.budget = value
    } else {
      for (let i = 0; i < CN_BUDGETS.length; i++) {
        const item = CN_BUDGETS[i]
        if (t.indexOf(item.text + '元') >= 0 || t.indexOf(item.text + '块') >= 0 ||
          t.indexOf(item.text + '以内') >= 0 || t.indexOf(item.text + '以下') >= 0) {
          result.budget = item.value
          break
        }
      }
    }
  }

  // ===== 餐次 =====
  if (/夜宵|宵夜/.test(t)) result.meal_type = '夜宵'
  else if (/早餐|早饭|早上/.test(t)) result.meal_type = '早餐'
  else if (/午餐|午饭|中午|中饭/.test(t)) result.meal_type = '午餐'
  else if (/晚餐|晚饭|晚上/.test(t)) result.meal_type = '晚餐'

  return result
}

/** 连接词：把「不吃牛肉和葱」「不要葱、蒜、花生」里的并列食材串起来 */
const CHAIN_CONJ = /^(?:和|跟|与|及|、|,|，|还有|以及|外加)/
/** 否定前缀：出现即表示「后面的食材不要」。注意不加 g 标志，避免共享 lastIndex 带来的状态问题 */
const AVOID_PREFIX_SRC = '不吃|不要|别放|不加|不含|没有|忌|少放|免|去'

/** 从 pos 开始匹配一个食材词，返回词长（无命中返回 0） */
function matchAllergyWord(text, pos) {
  for (let i = 0; i < ALLERGY_OPTIONS.length; i++) {
    const word = ALLERGY_OPTIONS[i]
    if (text.startsWith(word, pos)) return word.length
  }
  return 0
}

/** 从 pos 开始匹配一个连接词，返回词长（无命中返回 0） */
function matchConjunction(text, pos) {
  const m = text.slice(pos).match(CHAIN_CONJ)
  return m ? m[0].length : 0
}

/** 从 pos 开始是否出现否定前缀（限制在 3 字内，避免误判句尾的「去」等单字） */
function matchAvoidPrefix(text, pos) {
  const m = text.slice(pos, pos + 4).match(AVOID_PREFIX_SRC)
  return m && m.index === 0 ? m[0].length : 0
}

/**
 * 收集「否定 + 并列清单」形式表达的所有食材
 *
 * 覆盖这些自然语言写法：
 *   不吃牛肉和葱 / 不要葱、蒜、花生 / 不要葱姜蒜 / 不吃香菜和花生和海鲜 /
 *   少放辣，不吃海鲜和内脏 / 不吃点香菜
 *
 * 思路：定位每个否定前缀 → 往后按「食材词 + 连接词」的交替结构扫描，
 * 遇到标点、下一个否定前缀或无关字符就结束。这样既能识别并列清单，
 * 又不会把「牛肉面配葱」这类正述句误判成忌口。
 *
 * @param {string} text 已去掉空白的目标文本
 * @returns {Array<string>} 命中的食材词（按出现顺序，可能为空）
 */
function collectChainedAllergies(text) {
  const found = []
  const len = text.length
  let pos = 0

  while (pos < len) {
    const prefixLen = matchAvoidPrefix(text, pos)
    if (!prefixLen) {
      pos++
      continue
    }

    // 跳过前缀后最多 2 个字的语气/量词间隙（如「不吃 点 香菜」）
    let cursor = pos + prefixLen
    for (let gap = 0; gap < 2 && cursor < len; gap++) {
      if (matchAllergyWord(text, cursor)) break
      if (/[，。；、,.!?！？]/.test(text[cursor])) break
      cursor++
    }

    // 按「食材 [+ 连接词 + 食材]*」交替扫描
    let expectWord = true
    let advanced = false
    let guard = 0
    while (cursor < len && guard++ < 24) {
      if (expectWord) {
        const wordLen = matchAllergyWord(text, cursor)
        if (!wordLen) break
        const word = text.substr(cursor, wordLen)
        if (found.indexOf(word) < 0) found.push(word)
        cursor += wordLen
        expectWord = false
        advanced = true
      } else {
        const conjLen = matchConjunction(text, cursor)
        if (!conjLen) break
        cursor += conjLen
        expectWord = true
      }
    }

    // 已处理到 cursor，从那里继续找下一个否定前缀
    pos = advanced ? cursor : pos + prefixLen
  }

  return found
}
