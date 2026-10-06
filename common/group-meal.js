/**
 * 多人拼饭算法
 *
 * 场景：宿舍/同学几个人一起吃饭，各自有口味和忌口。
 * 真实难点不是"推荐一道菜"，而是回答三个问题：
 *   1. 哪些菜**所有人都能吃**（拼桌的安全区）
 *   2. 哪些菜**只有部分人能碰**，分别是谁（点菜时要照顾到）
 *   3. 最后该**怎么点**，才能让每个人都吃得上、又不至于全是清汤寡水
 *
 * 为什么用算法而不是大模型：
 *   忌口是安全问题，必须"判定可解释、结果可复现"。大模型在这里只会带来幻觉风险
 *   （把含花生的菜说成没关系）。集合运算 + 打分是确定性的，也能写成回归测试。
 *   大模型的价值放在"把结果讲成人话"，而不是"决定谁能吃"。
 *
 * 本模块是**纯函数**，不依赖 uni / uniCloud，可在 Node 中直接单测。
 */

/** 食材类标签（出现在 tags 里即表示"这道菜含有该食材"） */
export const FOOD_TAGS = [
  '香菜', '葱', '蒜', '花生', '海鲜', '牛肉', '羊肉', '内脏', '鸡蛋', '牛奶'
]

/** 口味类标签（正向偏好，用于算满意度） */
export const TASTE_TAGS = [
  '辣', '麻辣', '清淡', '咸香', '甜', '酸', '重油', '鲜嫩',
  '下饭', '低卡', '养胃', '汤面', '干拌面', '早餐'
]

/**
 * 判定一道菜是否属于"荤/动物性"
 *
 * 用于素食者过滤。不能只靠标签判断——像"蒜蓉粉丝娃娃菜"这种全素菜没有荤标签，
 * 而"水煮肉片"的 tags 里可能没有"肉"字。因此同时检查菜名、标签、描述里的动物性关键词。
 */
const MEAT_TAGS = ['牛肉', '羊肉', '海鲜', '内脏']
const MEAT_WORDS = /肉|鸡|鸭|鱼|虾|蟹|牛|羊|猪|排骨|培根|火腿|香肠|丸|腊|蛋|奶|海鲜|内脏|血|肚|肠/

export function isMeatDish(dish) {
  const tags = Array.isArray(dish.tags) ? dish.tags : []
  // 明确的荤食材标签
  for (let i = 0; i < MEAT_TAGS.length; i++) {
    if (tags.indexOf(MEAT_TAGS[i]) >= 0) return true
  }
  // 菜名 / 描述里的动物性关键词（"鸡蛋"属于蛋类，严格素食也要排除）
  const text = String(dish.name || '') + String(dish.description || '')
  return MEAT_WORDS.test(text)
}

/**
 * 判断某位成员能不能吃某道菜
 * @param {Object} dish 菜品（含 tags）
 * @param {Object} member 成员偏好 { allergies: [], vegetarian?: boolean, noFried?: boolean }
 * @returns {{ok: boolean, reason: string}} reason 仅在 ok=false 时有意义
 */
export function canEat(dish, member) {
  const tags = Array.isArray(dish.tags) ? dish.tags : []
  const allergies = Array.isArray(member.allergies) ? member.allergies : []

  // 1. 忌口：tags 命中即不可吃（硬过滤，第一优先级）
  for (let i = 0; i < allergies.length; i++) {
    if (tags.indexOf(allergies[i]) >= 0) {
      return { ok: false, reason: '含' + allergies[i] }
    }
  }

  // 2. 素食
  if (member.vegetarian && isMeatDish(dish)) {
    return { ok: false, reason: '不是素菜' }
  }

  // 3. 不吃重油（"我在减肥/不想吃油炸的"）
  if (member.noFried && tags.indexOf('重油') >= 0) {
    return { ok: false, reason: '偏油腻' }
  }

  return { ok: true, reason: '' }
}

/**
 * 口味满意度：这道菜在多大程度上满足这位成员的偏好（0~1）
 * 没有填口味偏好时给中性值 0.6，避免"没说偏好的人"把排序带偏。
 */
export function tasteFit(dish, member) {
  const tags = Array.isArray(dish.tags) ? dish.tags : []
  const taste = Array.isArray(member.taste) ? member.taste : []
  if (!taste.length) return 0.6

  let hit = 0
  taste.forEach((t) => { if (tags.indexOf(t) >= 0) hit++ })

  // 命中越多越满意；同时命中一半以上即视为很合适
  const ratio = hit / taste.length
  return Math.min(1, 0.3 + ratio * 0.7)
}

/**
 * 单个成员对某道菜的综合意愿（0~100）
 * = 口味满意(70 分权重) + 评分(30 分权重)
 */
function memberScore(dish, member) {
  const fit = tasteFit(dish, member)
  const rating = Number(dish.rating) || 0
  const ratingPart = Math.max(0, Math.min(1, (rating - 3.5) / 1.5)) // 3.5→0，5.0→1
  return Math.round(fit * 70 + ratingPart * 30)
}

/**
 * 主函数：给定成员列表与候选菜品，算出拼饭方案
 *
 * @param {Array} members [{name, taste:[], allergies:[], vegetarian?, noFried?}]
 * @param {Array} dishes  候选菜品（含 id/name/price/tags/rating/canteen/window）
 * @param {Object} [opt]  { budgetPerPerson, maxItems }
 * @returns {Object} 见下方注释
 */
export function planGroupMeal(members, dishes, opt = {}) {
  const list = Array.isArray(members) ? members.filter(Boolean) : []
  const all = Array.isArray(dishes) ? dishes.filter(Boolean) : []
  const budgetPerPerson = Number(opt.budgetPerPerson) || 0
  const maxItems = Number(opt.maxItems) || 5

  if (!list.length || !all.length) {
    return {
      members: list,
      shared: [],
      partial: [],
      combo: null,
      insights: [],
      summary: '信息不足，无法拼饭'
    }
  }

  /* ---------------- 第1步：逐菜计算"谁能吃" ---------------- */

  const analyzed = all.map((dish) => {
    const eaters = []
    const blockers = []
    list.forEach((m, mi) => {
      const r = canEat(dish, m)
      if (r.ok) eaters.push(mi)
      else blockers.push({ memberIndex: mi, name: m.name || ('第' + (mi + 1) + '人'), reason: r.reason })
    })

    // 口味满意度：在"能吃的人"里取平均，再按覆盖率加权
    const coverage = eaters.length / list.length
    let willingness = 0
    if (eaters.length) {
      const sum = eaters.reduce((s, mi) => s + memberScore(dish, list[mi]), 0)
      willingness = sum / eaters.length
    }
    // 综合分：覆盖率是硬门槛（能吃的人越多越优先），意愿是软排序
    const groupScore = Math.round(willingness * (0.4 + 0.6 * coverage))

    return {
      dish,
      eaters,
      blockers,
      coverage,
      willingness: Math.round(willingness),
      groupScore
    }
  })

  const shared = analyzed.filter((a) => a.coverage === 1).sort((a, b) => b.groupScore - a.groupScore)
  const partial = analyzed.filter((a) => a.coverage > 0 && a.coverage < 1)
    .sort((a, b) => b.coverage - a.coverage || b.groupScore - a.groupScore)
  const excludedCount = analyzed.filter((a) => a.coverage === 0).length

  /* ---------------- 第2步：构造点菜方案 ---------------- */

  const combo = buildCombo({ shared, partial }, list.length, maxItems, budgetPerPerson)

  /* ---------------- 第3步：生成可解释的洞察 ---------------- */

  const insights = buildInsights(list, analyzed, shared, partial, excludedCount)

  /* ---------------- 第4步：一句话总结 ---------------- */

  const summary = buildSummary(list, shared, partial, combo)

  return {
    members: list.map((m) => ({
      name: m.name || '同学',
      taste: m.taste || [],
      allergies: m.allergies || [],
      vegetarian: !!m.vegetarian,
      noFried: !!m.noFried
    })),
    shared: shared.map(toOut),
    partial: partial.map(toOut),
    combo,
    insights,
    stats: {
      dishTotal: all.length,
      sharedCount: shared.length,
      partialCount: partial.length,
      excludedCount
    },
    summary
  }
}

/** 统一对外的字段形状（前端直接用，不必了解内部结构） */
function toOut(a) {
  return {
    dish_id: a.dish.id || a.dish._id,
    name: a.dish.name,
    price: Number(a.dish.price) || 0,
    canteen: a.dish.canteen || '',
    window: a.dish.window || '',
    category: a.dish.category || '',
    tags: Array.isArray(a.dish.tags) ? a.dish.tags : [],
    emoji: a.dish.emoji || '🍽️',
    image: a.dish.image || '',
    rating: Number(a.dish.rating) || 0,
    coverage: Math.round(a.coverage * 100),
    willingness: a.willingness,
    groupScore: a.groupScore,
    // 能吃的人（1-based 序号，与界面上的成员序号一致）
    eaters: a.eaters.map((i) => i + 1),
    // 不能吃的人及原因，界面直接展示，前端不用再算一遍
    blockers: (a.blockers || []).map((b) => ({ memberIndex: b.memberIndex + 1, reason: b.reason }))
  }
}

/**
 * 构造点菜方案
 *
 * 思路（也是这个功能的核心价值）：
 *   ① 先用"所有人都能吃"的菜打底，保证人人有得吃 —— 这是拼桌安全区；
 *   ② 再从"部分人能吃的菜"里补几道，让口味多样、不至于四个人只吃青菜；
 *   ③ 每加一道都要看：会不会让某人一道菜都吃不上？会给个 warning 而不是拒绝。
 */
function buildCombo({ shared, partial }, memberCount, maxItems, budgetPerPerson) {
  if (!shared.length && !partial.length) {
    return { items: [], totalPrice: 0, perPerson: 0, coverageOk: false, warnings: ['没有任何一道菜是大家都能吃的，建议分开点或者放宽某个人的忌口'] }
  }

  const chosen = []
  const chosenIds = new Set()

  /**
   * 两道菜的"类型"是否太像
   *
   * 早先用「同一分类最多 2 道」来保证多样性，但拦不住"重庆小面 + 担担面"
   * 这种同分类、同是面食、同是辣的组合 —— 端上桌就是两碗面。
   * 这里改成按口味标签算重合度：重合超过一半就认为太像，换一道更划算。
   */
  function tooSimilar(dishA, dishB) {
    const ta = (Array.isArray(dishA.tags) ? dishA.tags : []).filter((t) => TASTE_TAGS.indexOf(t) >= 0)
    const tb = (Array.isArray(dishB.tags) ? dishB.tags : []).filter((t) => TASTE_TAGS.indexOf(t) >= 0)
    if (!ta.length || !tb.length) {
      // 没有口味标签时退回按分类判断
      return (dishA.category || '') === (dishB.category || '')
    }
    const inter = ta.filter((t) => tb.indexOf(t) >= 0).length
    return inter / Math.min(ta.length, tb.length) > 0.5
  }

  const takenDishes = []
  const sharedPool = shared.slice()

  // 第一轮：跳过与已选菜品过于相似的，保证一桌菜有层次
  for (const a of sharedPool) {
    if (chosen.length >= Math.min(3, maxItems)) break
    if (chosenIds.has(a.dish.id)) continue
    if (takenDishes.some((d) => tooSimilar(d, a.dish))) continue
    chosen.push({ kind: 'shared', entry: a })
    chosenIds.add(a.dish.id)
    takenDishes.push(a.dish)
  }
  // 第二轮：多样性约束导致凑不够时放宽，宁可重复也要让人人有得吃
  for (const a of sharedPool) {
    if (chosen.length >= Math.min(3, maxItems)) break
    if (chosenIds.has(a.dish.id)) continue
    chosen.push({ kind: 'shared', entry: a })
    chosenIds.add(a.dish.id)
    takenDishes.push(a.dish)
  }

  // ---- ② 补部分人爱吃的菜：挑"覆盖率最高"的，兼顾口味差异 ----
  const tasteSeen = new Set()
  for (const a of partial) {
    if (chosen.length >= maxItems) break
    if (chosenIds.has(a.dish.id)) continue
    // 这道菜能不能带来新的口味体验
    const tags = Array.isArray(a.dish.tags) ? a.dish.tags : []
    const newTaste = tags.some((t) => !tasteSeen.has(t))
    if (!newTaste && chosen.length >= 3) continue

    chosen.push({ kind: 'partial', entry: a })
    chosenIds.add(a.dish.id)
    tags.forEach((t) => tasteSeen.add(t))
  }

  // ---- ③ 逐人检查：方案出来后，每个人能吃上几道 ----
  const perMember = Array.from({ length: memberCount }, (_, mi) => {
    const eatable = chosen.filter((c) => c.entry.eaters.indexOf(mi) >= 0)
    return {
      memberIndex: mi + 1,
      count: eatable.length,
      dishes: eatable.map((c) => ({
        name: c.entry.dish.name,
        kind: c.kind
      }))
    }
  })

  const warnings = []
  perMember.forEach((pm) => {
    if (pm.count === 0) {
      warnings.push(`第 ${pm.memberIndex} 位同学在这套方案里**一道菜都吃不上**，请单独给他加一道`)
    } else if (pm.count === 1) {
      warnings.push(`第 ${pm.memberIndex} 位同学只能吃到「${pm.dishes[0].name}」，建议再加一道他能吃的`)
    }
  })

  const totalPrice = chosen.reduce((s, c) => s + (Number(c.entry.dish.price) || 0), 0)
  const perPerson = memberCount ? totalPrice / memberCount : 0

  if (budgetPerPerson && perPerson > budgetPerPerson) {
    warnings.push(`人均 ${perPerson.toFixed(1)} 元，超出你设的 ${budgetPerPerson} 元/人，可以去掉一道贵菜`)
  }

  return {
    items: chosen.map((c) => {
      const out = toOut(c.entry)
      out.kind = c.kind
      return out
    }),
    totalPrice: Math.round(totalPrice * 10) / 10,
    perPerson: Math.round(perPerson * 10) / 10,
    memberCount,
    perMember,
    coverageOk: perMember.every((p) => p.count > 0),
    warnings
  }
}

/** 生成"为什么这么建议"的洞察，供界面与答辩讲解使用 */
function buildInsights(members, analyzed, shared, partial, excludedCount) {
  const out = []

  // 注意措辞：excludedCount 是"**所有人都吃不了**"的菜（极少出现），
  // 而"有人忌口但别人能吃"属于 partial。写成"0 道有人忌口"会让人误以为忌口没生效。
  const blockedBySomeone = partial.length
  out.push(
    `共 ${members.length} 人，${analyzed.length} 道候选菜里：` +
    `${shared.length} 道全员可吃，${blockedBySomeone} 道有人不能吃，${excludedCount} 道谁也吃不了`
  )

  // 找出"最挑"的那个人：能吃的菜最少
  const eatableCount = members.map((m, mi) => ({
    mi,
    name: m.name || ('第' + (mi + 1) + '人'),
    count: analyzed.filter((a) => a.eaters.indexOf(mi) >= 0).length
  })).sort((a, b) => a.count - b.count)

  if (eatableCount.length && eatableCount[0].count < shared.length + partial.length) {
    const least = eatableCount[0]
    out.push(`${least.name} 的选择最少（只有 ${least.count} 道能吃），点菜时优先照顾他`)
  }

  // 哪个忌口词"杀伤力"最大
  const killCount = {}
  analyzed.forEach((a) => {
    a.blockers.forEach((b) => {
      // reason 形如"含香菜"或"不是素菜"
      const key = b.reason
      killCount[key] = (killCount[key] || 0) + 1
    })
  })
  const worst = Object.keys(killCount).sort((a, b) => killCount[b] - killCount[a])[0]
  if (worst && killCount[worst] > 0) {
    out.push(`「${worst}」的影响最大，有 ${killCount[worst]} 道菜因此没法让全员一起吃`)
  }

  // 口味是否能被满足
  const spicyLovers = members.filter((m) => (m.taste || []).indexOf('辣') >= 0)
  const lightLovers = members.filter((m) => (m.taste || []).indexOf('清淡') >= 0)
  if (spicyLovers.length && lightLovers.length) {
    out.push('有人要辣、有人要素，建议"辣的 + 清淡的各点一道"，不要强行折中成微辣')
  }

  return out
}

/** 一句话总结，直接显示在结果顶部 */
function buildSummary(members, shared, partial, combo) {
  if (!combo || !combo.items.length) {
    return '这套组合没能凑出来，试试放宽某位同学的忌口'
  }
  const parts = [`为 ${members.length} 位同学凑了 ${combo.items.length} 道菜`]
  if (shared.length) parts.push(`其中 ${combo.items.filter((i) => i.kind === 'shared').length} 道大家都能吃`)
  parts.push(`合计 ¥${combo.totalPrice}，人均 ¥${combo.perPerson}`)
  return parts.join('，')
}
