/**
 * 本地推荐规则引擎（云端 AI 不可用时的兜底方案）
 * 基于口味匹配、忌口过滤、预算筛选的加权打分推荐
 */

/**
 * 解析自然语言偏好
 * 从一句话中提取口味、忌口、预算等信息
 */
export function localParsePref(text = '') {
  if (!text) return { taste: [], allergies: [], budget: null, meal_type: '' }
  const t = text.toLowerCase()
  const result = { taste: [], allergies: [], budget: null, meal_type: '' }

  // 口味
  if (/辣|重口/.test(t)) result.taste.push('spicy')
  if (/清淡|少油|不油/.test(t)) result.taste.push('light')
  if (/甜/.test(t)) result.taste.push('sweet')
  if (/酸/.test(t)) result.taste.push('sour')
  if (/咸|咸香/.test(t)) result.taste.push('salty')
  if (/重油|油腻/.test(t)) result.taste.push('oily')

  // 忌口
  if (/不吃香菜|不要香菜|忌香菜/.test(t)) result.allergies.push('coriander')
  if (/不吃葱|不要葱|忌葱/.test(t)) result.allergies.push('onion')
  if (/不吃蒜|不要蒜|忌蒜/.test(t)) result.allergies.push('garlic')
  if (/不吃辣|不辣|忌辣/.test(t)) result.allergies.push('no_spicy')
  if (/不吃内脏|不要内脏/.test(t)) result.allergies.push('offal')
  if (/不吃海鲜|海鲜过敏|忌海鲜/.test(t)) result.allergies.push('seafood')

  // 预算
  const budgetMatch = t.match(/(\d+)\s*元|(\d+)\s*块|预算\s*(\d+)/)
  if (budgetMatch) {
    result.budget = parseInt(budgetMatch[1] || budgetMatch[2] || budgetMatch[3])
  }

  // 餐次
  if (/早|早餐|早上/.test(t)) result.meal_type = '早餐'
  if (/午|午餐|中午/.test(t)) result.meal_type = '午餐'
  if (/晚|晚餐|晚上/.test(t)) result.meal_type = '晚餐'
  if (/夜宵|宵夜|深夜/.test(t)) result.meal_type = '夜宵'

  return result
}

// 口味值 → 标签匹配映射
const TASTE_TAG_MAP = {
  spicy: ['辣'],
  light: ['清淡', '养胃'],
  sweet: ['甜'],
  sour: ['酸'],
  salty: ['咸香'],
  oily: ['重油']
}

// 忌口 → 需要排除的标签/关键词
const ALLERGY_EXCLUDE = {
  coriander: ['香菜'],
  onion: ['葱'],
  garlic: ['蒜'],
  no_spicy: ['辣'],
  offal: ['内脏'],
  seafood: ['海鲜']
}

/**
 * 本地推荐引擎
 * 根据偏好从菜品库中智能匹配并排序
 */
export function localRecommend(pref = {}, dishes = []) {
  const {
    taste = [],
    allergies = [],
    budget = null,
    canteen = '',
    meal_type = '',
    extra = ''
  } = pref

  // 合并自然语言解析的口味
  let allTastes = [...(taste || [])]
  if (extra) {
    const parsed = localParsePref(extra)
    allTastes = [...new Set([...allTastes, ...parsed.taste])]
  }

  // 合并忌口
  let allAllergies = [...(allergies || [])]
  if (extra) {
    const parsed = localParsePref(extra)
    allAllergies = [...new Set([...allAllergies, ...parsed.allergies])]
  }

  // 合并预算
  const finalBudget = budget || (extra ? localParsePref(extra).budget : null)

  let candidates = dishes.filter((d) => d.status === 1)

  // 食堂筛选
  if (canteen) {
    candidates = candidates.filter((d) => d.canteen === canteen)
  }

  // 预算筛选
  if (finalBudget && finalBudget > 0 && finalBudget < 999) {
    candidates = candidates.filter((d) => d.price <= finalBudget)
  }

  // 忌口过滤
  for (const allergy of allAllergies) {
    const excludeKeywords = ALLERGY_EXCLUDE[allergy] || []
    if (excludeKeywords.includes('辣')) {
      candidates = candidates.filter((d) => !(d.tags || []).includes('辣'))
    } else {
      for (const kw of excludeKeywords) {
        candidates = candidates.filter(
          (d) => !((d.name + d.description + (d.tags || []).join('')).includes(kw))
        )
      }
    }
  }

  // 口味匹配打分
  const scored = candidates.map((d) => {
    let score = d.rating * 10 // 基础分：评分权重
    const dishTags = d.tags || []

    // 口味匹配加分
    for (const tasteKey of allTastes) {
      const matchTags = TASTE_TAG_MAP[tasteKey] || []
      const matched = matchTags.some((tag) => dishTags.includes(tag))
      if (matched) score += 30
    }

    // 不吃辣但菜是辣的 → 减分
    if (allAllergies.includes('no_spicy') && dishTags.includes('辣')) {
      score -= 100
    }

    // 新品加分
    if (d.is_new) score += 5

    // 评价数加分（人气）
    score += Math.min(d.review_count || 0, 20)

    // 价格越接近预算上限越推荐（性价比）
    if (finalBudget && finalBudget > 0 && finalBudget < 999) {
      const ratio = d.price / finalBudget
      if (ratio > 0.5 && ratio <= 1) score += 10
    }

    return { ...d, _score: score }
  })

  // 按得分降序排列
  scored.sort((a, b) => b._score - a._score)

  // 取前3道
  const recommendations = scored.slice(0, 3).map((d) => ({
    id: d.id,
    name: d.name,
    price: d.price,
    canteen: d.canteen,
    window: d.window,
    category: d.category,
    tags: d.tags,
    image: d.image,
    description: d.description,
    rating: d.rating,
    reason: buildReason(d, allTastes, allAllergies, finalBudget)
  }))

  const summary = buildSummary(recommendations, allTastes, allAllergies, finalBudget, meal_type)

  return { recommendations, summary, engine: 'local' }
}

/** 生成推荐理由 */
function buildReason(dish, tastes, allergies, budget) {
  const reasons = []
  const dishTags = dish.tags || []

  if (tastes.includes('spicy') && dishTags.includes('辣')) {
    reasons.push('符合你爱辣的口味')
  }
  if (tastes.includes('light') && dishTags.includes('清淡')) {
    reasons.push('清淡健康，正合你意')
  }
  if (tastes.includes('sweet') && dishTags.includes('甜')) {
    reasons.push('甜度恰到好处')
  }
  if (budget && budget < 999 && dish.price <= budget) {
    reasons.push(`¥${dish.price} 在你${budget}元预算内`)
  }
  if (dish.rating >= 4.5) {
    reasons.push(`评分${dish.rating}，口碑佳作`)
  }
  if (dish.is_new) {
    reasons.push('新品尝鲜')
  }
  if (dish.review_count > 30) {
    reasons.push(`${dish.review_count}人评价，人气之选`)
  }

  return reasons.length ? reasons.join('，') + '。' : `${dish.description}`
}

/** 生成推荐总结 */
function buildSummary(dishes, tastes, allergies, budget, mealType) {
  if (!dishes.length) return '暂无完全匹配的菜品，试试调整偏好？'
  const parts = []
  if (mealType) parts.push(mealType)
  if (tastes.length) {
    const tasteLabels = { spicy: '辣', light: '清淡', sweet: '甜', sour: '酸', salty: '咸香', oily: '重油' }
    parts.push(tastes.map((t) => tasteLabels[t]).join('+'))
  }
  if (allergies.length) parts.push('忌' + allergies.map(a => ({ coriander: '香菜', onion: '葱', garlic: '蒜', no_spicy: '辣', offal: '内脏', seafood: '海鲜' }[a] || a)).join(''))
  if (budget && budget < 999) parts.push(`${budget}元内`)

  const prefStr = parts.length ? parts.join(' · ') : '无特殊偏好'
  const names = dishes.map((d) => d.name).join('、')
  return `根据「${prefStr}」为你推荐：${names}。`
}
