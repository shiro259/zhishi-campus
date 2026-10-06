'use strict';
/**
 * ============================================================================
 * 多人拼饭算法（云函数侧 CommonJS 版本）
 * ----------------------------------------------------------------------------
 * 这个文件是 common/group-meal.js 的服务端对应实现。
 *
 * 为什么要两份：云函数运行在 Node CJS 环境，不能直接 import 前端的 ES module；
 * 而前端在离线时也要能用同一个算法（不能因为没连云端就失去拼饭能力）。
 *
 * 怎么保证两份不走偏：_test/test-group-meal.mjs 会用**同一批场景**同时跑
 * 前端版本与这份服务端版本，逐字段比对结果；两边结果一旦不一致，测试立刻失败。
 * 改算法时**两个文件都要改**，测试会兜住。
 *
 * 纯函数、无第三方依赖，不访问数据库（由调用方传入菜品列表）。
 * ============================================================================
 */

/** 食材类标签（出现在 tags 里即表示"这道菜含有该食材"） */
var FOOD_TAGS = ['香菜', '葱', '蒜', '花生', '海鲜', '牛肉', '羊肉', '内脏', '鸡蛋', '牛奶'];

/** 口味类标签（正向偏好） */
var TASTE_TAGS = [
  '辣', '麻辣', '清淡', '咸香', '甜', '酸', '重油', '鲜嫩',
  '下饭', '低卡', '养胃', '汤面', '干拌面', '早餐'
];

var MEAT_TAGS = ['牛肉', '羊肉', '海鲜', '内脏'];
var MEAT_WORDS = /肉|鸡|鸭|鱼|虾|蟹|牛|羊|猪|排骨|培根|火腿|香肠|丸|腊|蛋|奶|海鲜|内脏|血|肚|肠/;

/** 是否为荤菜（素食过滤用；不能只看标签，菜名里常带动物性字样） */
function isMeatDish(dish) {
  var tags = Array.isArray(dish.tags) ? dish.tags : [];
  for (var i = 0; i < MEAT_TAGS.length; i++) {
    if (tags.indexOf(MEAT_TAGS[i]) >= 0) return true;
  }
  var text = String(dish.name || '') + String(dish.description || '');
  return MEAT_WORDS.test(text);
}

/**
 * 某人能不能吃某道菜
 * @returns {{ok: boolean, reason: string}}
 */
function canEat(dish, member) {
  var tags = Array.isArray(dish.tags) ? dish.tags : [];
  var allergies = Array.isArray(member.allergies) ? member.allergies : [];

  for (var i = 0; i < allergies.length; i++) {
    if (tags.indexOf(allergies[i]) >= 0) {
      return { ok: false, reason: '含' + allergies[i] };
    }
  }
  if (member.vegetarian && isMeatDish(dish)) {
    return { ok: false, reason: '不是素菜' };
  }
  if (member.noFried && tags.indexOf('重油') >= 0) {
    return { ok: false, reason: '偏油腻' };
  }
  return { ok: true, reason: '' };
}

/** 口味满意度的中间量（0~1），没填偏好时给中性值 */
function tasteFit(dish, member) {
  var tags = Array.isArray(dish.tags) ? dish.tags : [];
  var taste = Array.isArray(member.taste) ? member.taste : [];
  if (!taste.length) return 0.6;

  var hit = 0;
  taste.forEach(function (t) { if (tags.indexOf(t) >= 0) hit++; });
  return Math.min(1, 0.3 + (hit / taste.length) * 0.7);
}

/** 单个成员对某道菜的意愿（0~100）：口味 70% + 评分 30% */
function memberScore(dish, member) {
  var fit = tasteFit(dish, member);
  var rating = Number(dish.rating) || 0;
  var ratingPart = Math.max(0, Math.min(1, (rating - 3.5) / 1.5));
  return Math.round(fit * 70 + ratingPart * 30);
}

/** 统一对外的字段形状 */
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
    eaters: a.eaters.map(function (i) { return i + 1; }),
    blockers: (a.blockers || []).map(function (b) {
      return { memberIndex: b.memberIndex + 1, reason: b.reason };
    })
  };
}

/** 构造点菜方案 */
function buildCombo(pools, memberCount, maxItems, budgetPerPerson) {
  var shared = pools.shared;
  var partial = pools.partial;

  if (!shared.length && !partial.length) {
    return {
      items: [],
      totalPrice: 0,
      perPerson: 0,
      memberCount: memberCount,
      perMember: [],
      coverageOk: false,
      warnings: ['没有任何一道菜是大家都能吃的，建议分开点或者放宽某个人的忌口']
    };
  }

  var chosen = [];
  var chosenIds = {};
  var takenDishes = [];

  /** 两道菜是否太像（口味标签重合过半）—— 防止端上来两碗面 */
  function tooSimilar(a, b) {
    var ta = (Array.isArray(a.tags) ? a.tags : []).filter(function (t) {
      return TASTE_TAGS.indexOf(t) >= 0;
    });
    var tb = (Array.isArray(b.tags) ? b.tags : []).filter(function (t) {
      return TASTE_TAGS.indexOf(t) >= 0;
    });
    if (!ta.length || !tb.length) return String(a.category || '') === String(b.category || '');
    var inter = ta.filter(function (t) { return tb.indexOf(t) >= 0; }).length;
    return inter / Math.min(ta.length, tb.length) > 0.5;
  }

  var target = Math.min(3, maxItems);

  for (var i = 0; i < shared.length && chosen.length < target; i++) {
    var a = shared[i];
    if (chosenIds[a.dish.id]) continue;
    var tooClose = takenDishes.some(function (d) { return tooSimilar(d, a.dish); });
    if (tooClose) continue;
    chosen.push({ kind: 'shared', entry: a });
    chosenIds[a.dish.id] = 1;
    takenDishes.push(a.dish);
  }
  // 放宽一轮：宁可重复也要保证人人有得吃
  for (var j = 0; j < shared.length && chosen.length < target; j++) {
    var b = shared[j];
    if (chosenIds[b.dish.id]) continue;
    chosen.push({ kind: 'shared', entry: b });
    chosenIds[b.dish.id] = 1;
    takenDishes.push(b.dish);
  }

  // 用部分人可吃的菜补足，让口味更丰富
  var tasteSeen = {};
  for (var k = 0; k < partial.length && chosen.length < maxItems; k++) {
    var c = partial[k];
    if (chosenIds[c.dish.id]) continue;
    var tags = Array.isArray(c.dish.tags) ? c.dish.tags : [];
    var newTaste = tags.some(function (t) { return !tasteSeen[t]; });
    if (!newTaste && chosen.length >= 3) continue;

    chosen.push({ kind: 'partial', entry: c });
    chosenIds[c.dish.id] = 1;
    tags.forEach(function (t) { tasteSeen[t] = 1; });
  }

  // 逐人统计：方案出来后每人能吃上几道
  var perMember = [];
  for (var mi = 0; mi < memberCount; mi++) {
    var eatable = chosen.filter(function (cc) {
      return cc.entry.eaters.indexOf(mi) >= 0;
    });
    perMember.push({
      memberIndex: mi + 1,
      count: eatable.length,
      dishes: eatable.map(function (cc) {
        return { name: cc.entry.dish.name, kind: cc.kind };
      })
    });
  }

  var warnings = [];
  perMember.forEach(function (pm) {
    if (pm.count === 0) {
      warnings.push('第 ' + pm.memberIndex + ' 位同学在这套方案里**一道菜都吃不上**，请单独给他加一道');
    } else if (pm.count === 1) {
      warnings.push('第 ' + pm.memberIndex + ' 位同学只能吃到「' + pm.dishes[0].name + '」，建议再加一道他能吃的');
    }
  });

  var totalPrice = chosen.reduce(function (s, cc) {
    return s + (Number(cc.entry.dish.price) || 0);
  }, 0);
  var perPerson = memberCount ? totalPrice / memberCount : 0;

  if (budgetPerPerson && perPerson > budgetPerPerson) {
    warnings.push('人均 ' + perPerson.toFixed(1) + ' 元，超出你设的 ' + budgetPerPerson + ' 元/人，可以去掉一道贵菜');
  }

  return {
    items: chosen.map(function (cc) {
      var out = toOut(cc.entry);
      out.kind = cc.kind;
      return out;
    }),
    totalPrice: Math.round(totalPrice * 10) / 10,
    perPerson: Math.round(perPerson * 10) / 10,
    memberCount: memberCount,
    perMember: perMember,
    coverageOk: perMember.every(function (p) { return p.count > 0; }),
    warnings: warnings
  };
}

/** 生成可解释的洞察 */
function buildInsights(members, analyzed, shared, partial, excludedCount) {
  var out = [];
  out.push(
    '共 ' + members.length + ' 人，' + analyzed.length + ' 道候选菜里：' +
    shared.length + ' 道全员可吃，' + partial.length + ' 道有人不能吃，' +
    excludedCount + ' 道谁也吃不了'
  );

  var eatableCount = members.map(function (m, mi) {
    return {
      mi: mi,
      name: m.name || ('第' + (mi + 1) + '人'),
      count: analyzed.filter(function (a) { return a.eaters.indexOf(mi) >= 0; }).length
    };
  }).sort(function (a, b) { return a.count - b.count; });

  if (eatableCount.length && eatableCount[0].count < shared.length + partial.length) {
    out.push(eatableCount[0].name + ' 的选择最少（只有 ' + eatableCount[0].count + ' 道能吃），点菜时优先照顾他');
  }

  var killCount = {};
  analyzed.forEach(function (a) {
    a.blockers.forEach(function (b) {
      killCount[b.reason] = (killCount[b.reason] || 0) + 1;
    });
  });
  var worst = Object.keys(killCount).sort(function (a, b) { return killCount[b] - killCount[a]; })[0];
  if (worst && killCount[worst] > 0) {
    out.push('「' + worst + '」的影响最大，有 ' + killCount[worst] + ' 道菜因此没法让全员一起吃');
  }

  var spicy = members.filter(function (m) { return (m.taste || []).indexOf('辣') >= 0; });
  var light = members.filter(function (m) { return (m.taste || []).indexOf('清淡') >= 0; });
  if (spicy.length && light.length) {
    out.push('有人要辣、有人要素，建议"辣的 + 清淡的各点一道"，不要强行折中成微辣');
  }

  return out;
}

function buildSummary(members, shared, partial, combo) {
  if (!combo || !combo.items.length) {
    return '这套组合没能凑出来，试试放宽某位同学的忌口';
  }
  var sharedPicked = combo.items.filter(function (i) { return i.kind === 'shared'; }).length;
  var parts = ['为 ' + members.length + ' 位同学凑了 ' + combo.items.length + ' 道菜'];
  if (shared.length) parts.push('其中 ' + sharedPicked + ' 道大家都能吃');
  parts.push('合计 ¥' + combo.totalPrice + '，人均 ¥' + combo.perPerson);
  return parts.join('，');
}

/**
 * 主入口：算出拼饭方案
 * @param {Array} members [{name, taste:[], allergies:[], vegetarian?, noFried?}]
 * @param {Array} dishes  候选菜品
 * @param {Object} [opt]  { budgetPerPerson, maxItems }
 */
function planGroupMeal(members, dishes, opt) {
  opt = opt || {};
  var list = (Array.isArray(members) ? members : []).filter(Boolean);
  var all = (Array.isArray(dishes) ? dishes : []).filter(Boolean);
  var budgetPerPerson = Number(opt.budgetPerPerson) || 0;
  var maxItems = Number(opt.maxItems) || 5;

  if (!list.length || !all.length) {
    return {
      members: list,
      shared: [],
      partial: [],
      combo: null,
      insights: [],
      stats: { dishTotal: all.length, sharedCount: 0, partialCount: 0, excludedCount: 0 },
      summary: '信息不足，无法拼饭'
    };
  }

  var analyzed = all.map(function (dish) {
    var eaters = [];
    var blockers = [];
    list.forEach(function (m, mi) {
      var r = canEat(dish, m);
      if (r.ok) eaters.push(mi);
      else blockers.push({ memberIndex: mi, name: m.name || ('第' + (mi + 1) + '人'), reason: r.reason });
    });

    var coverage = eaters.length / list.length;
    var willingness = 0;
    if (eaters.length) {
      var sum = eaters.reduce(function (s, mi) { return s + memberScore(dish, list[mi]); }, 0);
      willingness = sum / eaters.length;
    }
    return {
      dish: dish,
      eaters: eaters,
      blockers: blockers,
      coverage: coverage,
      willingness: Math.round(willingness),
      groupScore: Math.round(willingness * (0.4 + 0.6 * coverage))
    };
  });

  var shared = analyzed.filter(function (a) { return a.coverage === 1; })
    .sort(function (a, b) { return b.groupScore - a.groupScore; });
  var partial = analyzed.filter(function (a) { return a.coverage > 0 && a.coverage < 1; })
    .sort(function (a, b) { return b.coverage - a.coverage || b.groupScore - a.groupScore; });
  var excludedCount = analyzed.filter(function (a) { return a.coverage === 0; }).length;

  var combo = buildCombo({ shared: shared, partial: partial }, list.length, maxItems, budgetPerPerson);
  var insights = buildInsights(list, analyzed, shared, partial, excludedCount);

  return {
    members: list.map(function (m) {
      return {
        name: m.name || '同学',
        taste: m.taste || [],
        allergies: m.allergies || [],
        vegetarian: !!m.vegetarian,
        noFried: !!m.noFried
      };
    }),
    shared: shared.map(toOut),
    partial: partial.map(toOut),
    combo: combo,
    insights: insights,
    stats: {
      dishTotal: all.length,
      sharedCount: shared.length,
      partialCount: partial.length,
      excludedCount: excludedCount
    },
    summary: buildSummary(list, shared, partial, combo)
  };
}

module.exports = {
  FOOD_TAGS: FOOD_TAGS,
  TASTE_TAGS: TASTE_TAGS,
  isMeatDish: isMeatDish,
  canEat: canEat,
  planGroupMeal: planGroupMeal
};
