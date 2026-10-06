'use strict';
/**
 * ============================================================================
 * 云函数：shiyu-agent —— 可对话的推荐 Agent（多轮修正 + 矛盾澄清）
 * ----------------------------------------------------------------------------
 * 项目：食遇校园 - AI智能食堂推荐
 *
 * 与 shiyu-recommend 的区别：
 *   shiyu-recommend 是**单轮**推荐：给一份偏好，返回一批菜，不满意只能"换一批"重抽。
 *   shiyu-agent 是**多轮**推荐：把用户每一句话理解为对当前条件的"修正"，
 *   累积成会话状态，并在此基础上重新推荐。它解决的是两个真实痛点：
 *
 *   【痛点一】推荐不合意只能重来
 *     用户：想吃辣的，20 以内        → 推荐 A B C
 *     用户：第一个太油了              → 排除 A，换 D
 *     用户：还是太贵，再便宜点        → 预算降到 12，重新召回
 *     这里必须"记住"上一轮选了什么、"第一个"指的是谁、以及已经否掉了哪些菜，
 *     否则同一个"太油了"就没法精准作用到具体那道菜上。
 *
 *   【痛点二】需求本身自相矛盾
 *     学生真实表达经常冲突：「又辣又清淡」「想吃饱但不能超 10 块」「想吃牛肉但忌牛肉」。
 *     模板系统会硬选一边（体验很差），这里改成**主动澄清 + 给出可选项**，
 *     让用户一句话就能定夺，而不是逼他重新描述一遍。
 *
 * 设计取舍：
 *   1. 指代解析（"第一个""第三个""不要它"）与冲突检测放在**服务端**做规则兜底，
 *      因为这两件事一旦判断错，用户会觉得"它根本没听懂我"；纯靠大模型不可靠。
 *   2. 语义层面的偏好抽取（"今天想吃点开胃的"）仍然交给大模型，
 *      规则解析不到时才回落，兼顾准确与灵活。
 *   3. 会话状态存云数据库，并按 session_id 串起来；过期自动清理。
 *
 * 统一响应格式：成功 { code: 0, message: 'success', data } ；失败 { code: -1, message }
 * 无第三方依赖，所有 await 均有 try/catch 保护，任何异常都不会让云函数 500。
 * ============================================================================
 */

const db = uniCloud.database();
const dbCmd = db.command;

const DISH_COLLECTION = 'dishes';
const CONFIG_COLLECTION = 'shiyu-config';
const SESSION_COLLECTION = 'shiyu-sessions';

// 会话有效期（毫秒）：2 小时。超过后重新开始一段对话，避免状态串味
const SESSION_TTL = 2 * 60 * 60 * 1000;
// 候选召回上限
const MAX_CANDIDATES = 120;
// 塞进 Prompt 的候选上限（控制 token）
const MAX_PROMPT_CANDIDATES = 50;
// 返回给前端的推荐条数
const MAX_RECOMMEND = 5;
// 大模型超时
const AI_TIMEOUT = 30000;

// 候选菜品字段
const CANDIDATE_FIELD = {
  _id: true,
  name: true,
  price: true,
  canteen: true,
  window: true,
  category: true,
  tags: true,
  emoji: true,
  image: true,
  description: true,
  rating: true,
  review_count: true,
  recommend_count: true,
  is_new: true
};

// ---------------------------------------------------------------------------
// 词典：与 dishes.tags 的取值保持一致
// ---------------------------------------------------------------------------

// 口味标签 → 用户可能说的词
const TASTE_DICT = [
  { tag: '麻辣', words: ['麻辣', '麻椒', '花椒', '麻的'] },
  { tag: '辣', words: ['辣', '辣椒', '香辣'] },
  { tag: '清淡', words: ['清淡', '清爽', '不油腻', '少油', '清汤', '解腻'] },
  { tag: '咸香', words: ['咸香', '咸口', '有味道'] },
  { tag: '甜', words: ['甜', '甜口'] },
  { tag: '酸', words: ['酸', '酸味', '开胃'] },
  { tag: '重油', words: ['重油', '油腻', '重口', '油大', '太油'] },
  { tag: '鲜嫩', words: ['鲜嫩', '嫩', '滑嫩'] },
  { tag: '下饭', words: ['下饭', '配饭', '干饭'] },
  { tag: '低卡', words: ['低卡', '减脂', '热量低'] },
  { tag: '养胃', words: ['养胃', '暖胃', '舒服'] }
];

// 食材 / 忌口词
const ALLERGY_WORDS = ['香菜', '葱', '蒜', '花生', '海鲜', '牛肉', '羊肉', '内脏', '鸡蛋', '牛奶'];

// 用餐时段
const MEAL_WORDS = [
  { value: '早餐', words: ['早餐', '早饭', '早上'] },
  { value: '午餐', words: ['午餐', '午饭', '中午', '中饭'] },
  { value: '晚餐', words: ['晚餐', '晚饭', '晚上'] },
  { value: '夜宵', words: ['夜宵', '宵夜'] }
];

// 中文数字 → 序号
const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

function toNumber(v, dflt) {
  const n = Number(v);
  return Number.isFinite(n) ? n : (dflt === undefined ? 0 : dflt);
}

function uniqStrings(arr) {
  const seen = {};
  const out = [];
  (Array.isArray(arr) ? arr : []).forEach(function (v) {
    const s = String(v === undefined || v === null ? '' : v).trim();
    if (s && !seen[s]) {
      seen[s] = 1;
      out.push(s);
    }
  });
  return out;
}

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

// ---------------------------------------------------------------------------
// 第1步：会话读取 / 创建
// ---------------------------------------------------------------------------

function emptyPref() {
  return {
    meal_type: '',
    taste: [],
    allergies: [],
    budget: null,
    canteen: '',
    extra: ''
  };
}

function emptySession(sessionId) {
  return {
    session_id: sessionId,
    pref: emptyPref(),
    excluded_ids: [],
    asked_keys: [],
    turn: 0,
    last_dish_ids: [],
    history: []
  };
}

/** 读取会话；不存在或已过期则返回全新会话 */
async function loadSession(sessionId) {
  if (!sessionId) return null;
  try {
    const res = await db.collection(SESSION_COLLECTION)
      .where({ session_id: sessionId })
      .limit(1)
      .get();
    const doc = res && res.data && res.data[0];
    if (!doc) return null;

    // 过期则丢弃（顺手删掉，避免集合膨胀）
    if (doc.expire_at && toNumber(doc.expire_at) < Date.now()) {
      try {
        await db.collection(SESSION_COLLECTION).doc(doc._id).remove();
      } catch (e) {
        // 清理失败不影响主流程
      }
      return null;
    }
    return doc;
  } catch (e) {
    console.warn('[shiyu-agent] 读取会话失败，按新会话处理:', e && (e.message || e));
    return null;
  }
}

/** 写回会话（不存在则新建）。失败不影响本次推荐结果。 */
async function saveSession(session) {
  const now = Date.now();
  const data = {
    session_id: session.session_id,
    pref: session.pref,
    excluded_ids: uniqStrings(session.excluded_ids).slice(-60),
    asked_keys: uniqStrings(session.asked_keys).slice(-20),
    turn: toNumber(session.turn, 0),
    last_dish_ids: uniqStrings(session.last_dish_ids).slice(-10),
    // 只留最近 12 条，够生成连贯回复即可
    history: (session.history || []).slice(-12),
    expire_at: now + SESSION_TTL,
    update_date: now
  };

  try {
    const existing = await db.collection(SESSION_COLLECTION)
      .where({ session_id: session.session_id })
      .limit(1)
      .get();
    const doc = existing && existing.data && existing.data[0];
    if (doc) {
      await db.collection(SESSION_COLLECTION).doc(doc._id).update(data);
    } else {
      await db.collection(SESSION_COLLECTION).add(Object.assign({ create_date: now }, data));
    }
    return true;
  } catch (e) {
    console.warn('[shiyu-agent] 保存会话失败（不影响本次推荐）:', e && (e.message || e));
    return false;
  }
}

// ---------------------------------------------------------------------------
// 第2步：把用户这句话解析成「修正指令」
//
// 修正指令（delta）结构：
//   { excludeIds: [], excludeTags: [], addTaste: [], removeTaste: [], setBudget: null,
//     addAllergies: [], setMealType: '', setCanteen: '', freeText: '' }
// ---------------------------------------------------------------------------

/** 从文本里抽取序号（支持"第一个""第3个""1""前面那个"） */
function parseOrdinals(text) {
  const out = [];
  // 「第一个 / 第 1 个 / 第一道」
  const re1 = /第\s*([0-9一二三四五六七八九])\s*[个道条]?/g;
  let m;
  while ((m = re1.exec(text))) {
    const raw = m[1];
    const n = /[0-9]/.test(raw) ? Number(raw) : CN_NUM[raw];
    if (n >= 1 && n <= 9 && out.indexOf(n) < 0) out.push(n);
  }
  // 「1」「2」这种裸数字（仅在出现"第"或明显指着某个时才算，避免把价格当序号）
  const re2 = /(?:^|[^0-9元块折])([1-9])(?:[个道条]|$)/g;
  while ((m = re2.exec(text))) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 9 && out.indexOf(n) < 0) out.push(n);
  }
  return out;
}

/** 提取预算（元） */
function parseBudget(text) {
  // "20 以内 / 15 元 / 10 块 / 预算 12"
  const m = text.match(/(?:预算|不超过|最多|控制在)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:元|块钱|块|以内|以下|左右)?/);
  if (!m) return null;
  const n = toNumber(m[1], 0);
  // 2~200 之间才当预算，避免把"第一个"里的数字误判
  if (n >= 2 && n <= 200) return n;
  return null;
}

/** 判断是否是"减少/降低"方向的表达 */
function isReducePhrase(text) {
  return /便宜|省钱|降低|低一点|再低|少花|贵了|太贵|超出|超预算|压缩/.test(text);
}

/** 判断是否是"提高/放宽"方向的表达 */
function isIncreasePhrase(text) {
  return /放宽|高一点|贵点也行|加钱|提高|多花|不够吃|吃饱/.test(text);
}

/**
 * 把自然语言解析为修正指令
 * @param {string} text 用户原话
 * @param {Object} session 当前会话（用于解析"第一个"这类指代）
 */
function parseDelta(text, session) {
  const t = String(text || '').replace(/\s/g, '');
  const delta = {
    excludeIds: [],
    excludeTags: [],
    addTaste: [],
    removeTaste: [],
    setBudget: null,
    budgetDelta: null,
    addAllergies: [],
    setMealType: '',
    setCanteen: '',
    freeText: text || ''
  };
  if (!t) return delta;

  // ---- 指代排除：第一个太油了 / 不要第二个 / 第3个换成别的 ----
  const negativeCtx = /太油|油腻|太贵|不喜欢|不要|不想要|换掉|换成|去掉|排除|吃腻|不行|不好|太咸|太辣|太少|太多/.test(t);
  const ordinals = parseOrdinals(t);
  if (ordinals.length && negativeCtx) {
    const lastIds = (session && session.last_dish_ids) || [];
    ordinals.forEach(function (n) {
      const id = lastIds[n - 1];
      if (id) delta.excludeIds.push(id);
    });
  }

  // ---- "太油/太辣/太贵" 这类对整体的否定，落到标签或预算上 ----
  if (/太油|油腻|别太油|少油|不油|清淡点|解腻/.test(t)) {
    delta.excludeTags.push('重油');
  }
  if (/太辣|别太辣|不辣|少辣|微辣|降辣/.test(t)) {
    delta.removeTaste.push('麻辣');
    delta.excludeTags.push('麻辣');
  }
  if (/太咸|别太咸|淡一点/.test(t)) {
    delta.removeTaste.push('咸香');
  }
  if (/太甜|别太甜/.test(t)) {
    delta.removeTaste.push('甜');
  }

  // ---- 预算 ----
  const budget = parseBudget(t);
  if (budget !== null && /元|块|预算|以内|以下|不超过|最多|左右/.test(t)) {
    delta.setBudget = budget;
  } else if (isReducePhrase(t) && session && session.pref && session.pref.budget) {
    // "再便宜点" → 在当前预算基础上打八折，至少降 2 元
    delta.budgetDelta = -Math.max(2, Math.round(session.pref.budget * 0.2));
  } else if (isIncreasePhrase(t)) {
    if (session && session.pref && session.pref.budget) {
      delta.budgetDelta = Math.max(2, Math.round(session.pref.budget * 0.25));
    } else {
      // 本来没设预算，放宽就是把限额提到 30
      delta.setBudget = 30;
    }
  }

  // ---- 忌口（"不吃香菜" / "忘了说，别放葱"）----
  ALLERGY_WORDS.forEach(function (word) {
    const re = new RegExp('(不吃|不要|别放|不加|不含|忌|对[^，。]{0,4})' + word);
    if (re.test(t)) delta.addAllergies.push(word);
  });

  // ---- 口味（正向追加）----
  // 两种写法都要认：
  //   ① 带意图前缀：「想再辣一点」「来点酸的」「爱吃甜」
  //   ② 光秃秃的口味词：「清淡的」「来碗麻辣的」——真实用户经常就这么说
  TASTE_DICT.forEach(function (item) {
    if (item.tag === '重油') return; // 重油属于负面表达，上面已单独处理
    const w = item.words[0];
    const withIntent = new RegExp('(来点|来碗|想|要|多|喜欢|爱|吃点)[^，。]{0,3}' + w);
    const bare = new RegExp('(^|[，。、,])' + w + '(的|点|一些|一点|口|味)?');
    const degree = new RegExp(w + '(一点|一些|点)');
    if (withIntent.test(t) || bare.test(t) || degree.test(t)) {
      delta.addTaste.push(item.tag);
    }
  });

  // ---- 时段 / 食堂 ----
  MEAL_WORDS.forEach(function (item) {
    item.words.forEach(function (w) {
      if (t.indexOf(w) >= 0) delta.setMealType = item.value;
    });
  });
  // 食堂：第X食堂 / X食堂
  const cm = t.match(/(第[一二三四五六七八九]食堂)/);
  if (cm) delta.setCanteen = cm[1];

  return delta;
}

/** 把修正指令合并进累计偏好 */
function mergeDelta(pref, delta, session) {
  const next = {
    meal_type: pref.meal_type || '',
    taste: Array.isArray(pref.taste) ? pref.taste.slice(0) : [],
    allergies: Array.isArray(pref.allergies) ? pref.allergies.slice(0) : [],
    budget: pref.budget === undefined ? null : pref.budget,
    canteen: pref.canteen || '',
    extra: pref.extra || '',
    excludeTags: Array.isArray(pref.excludeTags) ? pref.excludeTags.slice(0) : []
  };

  // 口味：先移除被否掉的，再追加新的
  (delta.removeTaste || []).forEach(function (tag) {
    const i = next.taste.indexOf(tag);
    if (i >= 0) next.taste.splice(i, 1);
  });
  (delta.addTaste || []).forEach(function (tag) {
    if (next.taste.indexOf(tag) < 0) next.taste.push(tag);
  });

  // 忌口：只增不减（安全优先）
  (delta.addAllergies || []).forEach(function (w) {
    if (next.allergies.indexOf(w) < 0) next.allergies.push(w);
  });

  // 预算
  if (delta.setBudget !== null && delta.setBudget !== undefined) {
    next.budget = delta.setBudget;
  } else if (delta.budgetDelta && next.budget) {
    next.budget = Math.max(2, Math.round(next.budget + delta.budgetDelta));
  }

  if (delta.setMealType) next.meal_type = delta.setMealType;
  if (delta.setCanteen) next.canteen = delta.setCanteen;

  // 这句原话进 extra，供大模型理解语气（截断避免过长）
  if (delta.freeText) {
    next.extra = String(delta.freeText).slice(0, 60);
  }

  // 被否掉的属性标签（"太油了"→排除重油）：必须**累积**而不是覆盖，
  // 否则用户第 2 轮说的"太油"会在第 3 轮被清掉，油腻的菜又会冒出来。
  next.excludeTags = uniqStrings(
    (pref.excludeTags || []).map(String).concat((delta.excludeTags || []).map(String))
  );

  return next;
}

// ---------------------------------------------------------------------------
// 第3步：矛盾检测（F2 的核心）
//
// 只挑「用户明确说了、且确实冲突」的组合报出来，并给出可单击的选项。
// 宁可少报也不要瞎报——问错问题比不问更劝退。
// ---------------------------------------------------------------------------

function detectConflicts(pref, askedKeys) {
  const conflicts = [];
  const taste = pref.taste || [];
  const has = function (t) { return taste.indexOf(t) >= 0; };

  // 1) 既要素食性质又要素食的反面：又要素的又要素的……
  //    实际冲突：爱吃辣 + 要素清淡
  if (has('辣') && (has('清淡') || has('低卡'))) {
    conflicts.push({
      key: 'spicy_vs_light',
      question: '你说了爱吃辣，又提到清淡，这两个方向有点冲突',
      detail: '食堂里有「微辣但少油」的做法，也有完全不辣但味道足的，你想要哪种？',
      options: [
        { label: '微辣但少油', apply: { taste: ['辣'], excludeTags: ['重油'] } },
        { label: '完全不辣但够味', apply: { taste: ['咸香', '鲜嫩'], removeTaste: ['辣', '麻辣'] } },
        { label: '两个都不管，随便推荐', apply: {} }
      ]
    });
  }

  // 2) 忌口与口味直接对撞：想吃牛肉 / 海鲜 / 羊肉，却又把它们列为忌口
  const dangerous = ['牛肉', '羊肉', '海鲜', '内脏'];
  dangerous.forEach(function (w) {
    if ((pref.allergies || []).indexOf(w) >= 0 && String(pref.extra || '').indexOf(w) >= 0) {
      conflicts.push({
        key: 'allergy_vs_wish_' + w,
        question: '你提到想吃' + w + '，但' + w + '又在你的忌口里',
        detail: '为避免过敏风险，默认不会给你推荐含' + w + '的菜',
        options: [
          { label: '保持忌口（安全优先）', apply: {} },
          { label: '取消' + w + '忌口', apply: { removeAllergy: w } }
        ]
      });
    }
  });

  // 3) 预算与"要吃饱/分量大"的拉扯：预算很低时给出加钱选项
  const budget = toNumber(pref.budget, 0);
  if (budget > 0 && budget <= 8 && /吃饱|分量|不够|大份/.test(String(pref.extra || ''))) {
    conflicts.push({
      key: 'budget_vs_full',
      question: budget + ' 元以内想吃饱，选择会比较少',
      detail: '这个价位主要是面食、小吃和素菜；加一点预算能吃到带肉的套餐',
      options: [
        { label: '就按 ' + budget + ' 元来', apply: {} },
        { label: '放宽到 ' + (budget + 6) + ' 元', apply: { setBudget: budget + 6 } }
      ]
    });
  }

  // 过滤掉已经问过的，避免反复追问
  const asked = Array.isArray(askedKeys) ? askedKeys : [];
  return conflicts.filter(function (c) { return asked.indexOf(c.key) < 0; });
}

// ---------------------------------------------------------------------------
// 第4步：候选召回（含忌口硬过滤、排除已否掉的菜）
// ---------------------------------------------------------------------------

async function queryCandidates(pref, excludedIds) {
  const where = { status: 1 };

  if (pref.budget) {
    where.price = dbCmd.lte(toNumber(pref.budget));
  }
  if (pref.canteen) {
    where.canteen = String(pref.canteen);
  }

  let list = [];
  try {
    const res = await db.collection(DISH_COLLECTION)
      .where(where)
      .field(CANDIDATE_FIELD)
      .limit(MAX_CANDIDATES)
      .get();
    list = (res && res.data) || [];
  } catch (e) {
    console.error('[shiyu-agent] 候选查询失败:', e && (e.message || e));
    return [];
  }

  const excluded = uniqStrings(excludedIds);
  const allergies = (pref.allergies || []).map(String);
  const excludeTags = (pref.excludeTags || []).map(String);

  return list.filter(function (d) {
    const id = d._id;
    if (excluded.indexOf(id) >= 0) return false;

    const tags = Array.isArray(d.tags) ? d.tags.map(String) : [];

    // 忌口硬过滤（第一道）：绝不推荐含忌口食材的菜
    for (let i = 0; i < allergies.length; i++) {
      if (tags.indexOf(allergies[i]) >= 0) return false;
    }
    // 用户明确否掉的属性（如"太油了"→ 排除重油）
    for (let i = 0; i < excludeTags.length; i++) {
      if (tags.indexOf(excludeTags[i]) >= 0) return false;
    }
    return true;
  });
}

// 本地规则打分（与大模型失败时的兜底，也用于预排序控制 Prompt 体积）
function scoreDish(dish, pref, maxRecommend) {
  let score = 42;
  const tags = Array.isArray(dish.tags) ? dish.tags : [];
  const taste = pref.taste || [];

  let hit = 0;
  taste.forEach(function (t) { if (tags.indexOf(t) >= 0) hit++; });
  score += Math.min(hit * 8, 18);

  score += Math.min(Math.max(toNumber(dish.rating) - 3.0, 0) * 22, 22);

  if (pref.budget && toNumber(dish.price) <= toNumber(pref.budget) * 0.8) score += 4;
  if (dish.is_new) score += 1;
  if (maxRecommend > 0) {
    score += Math.min((toNumber(dish.recommend_count) / maxRecommend) * 4, 4);
  }
  return Math.round(Math.max(40, Math.min(score, 99)));
}

function localRecommend(pref, candidates) {
  if (!candidates.length) return { recommendations: [], summary: '没有符合条件的菜品，试试放宽预算或换个食堂' };

  let maxRecommend = 0;
  candidates.forEach(function (d) {
    const c = toNumber(d.recommend_count, 0);
    if (c > maxRecommend) maxRecommend = c;
  });

  const scored = candidates.map(function (d) {
    return { dish: d, score: scoreDish(d, pref, maxRecommend) };
  }).sort(function (a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return toNumber(b.dish.rating) - toNumber(a.dish.rating);
  }).slice(0, MAX_RECOMMEND);

  const recommendations = scored.map(function (item, idx) {
    const d = item.dish;
    const tags = Array.isArray(d.tags) ? d.tags : [];
    const hitTaste = (pref.taste || []).filter(function (t) { return tags.indexOf(t) >= 0; });
    const reason = hitTaste.length
      ? '符合你想要的' + hitTaste.join('、') + '口味，' + toNumber(d.price).toFixed(0) + ' 元，评分 ' + toNumber(d.rating).toFixed(1)
      : toNumber(d.price).toFixed(0) + ' 元一份，评分 ' + toNumber(d.rating).toFixed(1) + '，' + (d.canteen || '') + '招牌';
    return {
      dish_id: d._id,
      name: d.name,
      canteen: d.canteen,
      window: d.window,
      price: toNumber(d.price),
      rating: toNumber(d.rating),
      emoji: d.emoji || '🍽️',
      image: d.image || '',
      tags: tags,
      reason: reason.slice(0, 40),
      match_score: item.score,
      rank: idx + 1
    };
  });

  const avg = recommendations.length
    ? recommendations.reduce(function (s, r) { return s + r.price; }, 0) / recommendations.length
    : 0;
  const tasteText = (pref.taste && pref.taste.length) ? pref.taste.join('、') : '不限口味';
  const budgetText = pref.budget ? '都在 ' + pref.budget + ' 元以内' : '';

  return {
    recommendations: recommendations,
    summary: '按' + tasteText + budgetText + '挑了这一批，人均约 ' + avg.toFixed(1) + ' 元'
  };
}

// ---------------------------------------------------------------------------
// 第5步：大模型（可选增强）
// ---------------------------------------------------------------------------

async function loadAiConfig() {
  try {
    const res = await db.collection(CONFIG_COLLECTION).limit(1).get();
    const cfg = (res && res.data && res.data[0]) || {};
    return {
      apiKey: cfg.api_key || process.env.AI_API_KEY || '',
      baseUrl: cfg.base_url || process.env.AI_BASE_URL || 'https://api.deepseek.com/v1',
      model: cfg.model || process.env.AI_MODEL || 'deepseek-chat'
    };
  } catch (e) {
    return {
      apiKey: process.env.AI_API_KEY || '',
      baseUrl: process.env.AI_BASE_URL || 'https://api.deepseek.com/v1',
      model: process.env.AI_MODEL || 'deepseek-chat'
    };
  }
}

function buildPrompt(pref, candidates, history) {
  const taste = (pref.taste && pref.taste.length) ? pref.taste.join('、') : '无特殊偏好';
  const allergy = (pref.allergies && pref.allergies.length) ? pref.allergies.join('、') : '无';
  const budget = pref.budget ? pref.budget + ' 元以内' : '不限';
  const meal = pref.meal_type || '未指定';

  const histText = (history || []).slice(-4).map(function (h) {
    return (h.role === 'user' ? '用户：' : '助手：') + String(h.text || '').slice(0, 60);
  }).join('\n');

  const list = candidates.map(function (d) {
    return {
      id: d._id,
      name: d.name,
      price: toNumber(d.price),
      canteen: d.canteen,
      window: d.window,
      tags: d.tags || [],
      rating: toNumber(d.rating)
    };
  });

  return [
    '你是「食遇校园」食堂推荐助手。用户可能在连续对话中逐步调整需求，请只做最后一批推荐。',
    '',
    '【当前累计需求】',
    '- 用餐时段：' + meal,
    '- 口味偏好：' + taste,
    '- 忌口（绝对不能出现）：' + allergy,
    '- 预算：' + budget,
    '- 用户刚刚说：' + (pref.extra || '（无）'),
    histText ? '\n【对话上下文】\n' + histText : '',
    '',
    '【候选菜品】',
    JSON.stringify(list),
    '',
    '【输出要求】只输出 JSON，不要任何多余文字：',
    '{"recommendations":[{"dish_id":"候选里的id","reason":"25字以内、说清为什么适合他这次的要求","match_score":90}],"summary":"一句话说明这批推荐怎么满足了他的调整"}',
    '',
    '硬性约束：',
    '1. dish_id 必须来自候选列表，不得编造；',
    '2. 严禁推荐含忌口食材的菜品；',
    '3. 价格不得超过预算；',
    '4. reason 要体现"针对他这次的修正"（例如他刚说了太油，就要说明这道不清淡油腻）。'
  ].join('\n');
}

async function callLLM(prompt, cfg) {
  if (!cfg.apiKey) return null;
  const url = String(cfg.baseUrl).replace(/\/+$/, '') + '/chat/completions';
  try {
    const res = await uniCloud.httpclient.request(url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + cfg.apiKey,
        'Content-Type': 'application/json'
      },
      data: {
        model: cfg.model,
        messages: [
          { role: 'system', content: '你是校园食堂美食推荐专家，回答务实、简短。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1200
      },
      dataType: 'json',
      timeout: AI_TIMEOUT
    });
    const body = res && res.data;
    return (body && body.choices && body.choices[0] && body.choices[0].message)
      ? body.choices[0].message.content
      : null;
  } catch (e) {
    console.error('[shiyu-agent] 大模型调用失败:', e && (e.message || e));
    return null;
  }
}

function parseJsonLoose(text) {
  if (!text) return null;
  let t = String(text).trim();
  if (t.indexOf('```') >= 0) {
    const parts = t.split('```');
    t = parts[1] || parts[0];
    t = t.replace(/^json/i, '').trim();
  }
  try {
    return JSON.parse(t);
  } catch (e) {
    const s = t.indexOf('{');
    const e2 = t.lastIndexOf('}');
    if (s >= 0 && e2 > s) {
      try { return JSON.parse(t.slice(s, e2 + 1)); } catch (e3) { return null; }
    }
    return null;
  }
}

/** 严格校验模型输出：防幻觉（id 不存在 / 含忌口 / 超预算一律丢弃） */
function validateModelOutput(result, candidates, pref) {
  if (!result || !Array.isArray(result.recommendations)) return null;

  const byId = {};
  candidates.forEach(function (d) { byId[d._id] = d; });

  const allergies = (pref.allergies || []).map(String);
  const budget = toNumber(pref.budget, 0);

  const items = [];
  for (let i = 0; i < result.recommendations.length && items.length < MAX_RECOMMEND; i++) {
    const rec = result.recommendations[i] || {};
    const dish = byId[rec.dish_id];
    if (!dish) continue;

    const tags = Array.isArray(dish.tags) ? dish.tags.map(String) : [];
    let bad = false;
    allergies.forEach(function (a) { if (tags.indexOf(a) >= 0) bad = true; });
    if (bad) continue;
    if (budget && toNumber(dish.price) > budget) continue;

    items.push({
      dish_id: dish._id,
      name: dish.name,
      canteen: dish.canteen,
      window: dish.window,
      price: toNumber(dish.price),
      rating: toNumber(dish.rating),
      emoji: dish.emoji || '🍽️',
      image: dish.image || '',
      tags: tags,
      reason: String(rec.reason || '').slice(0, 40),
      match_score: Math.round(Math.max(0, Math.min(100, toNumber(rec.match_score, 80)))),
      rank: items.length + 1
    });
  }

  if (!items.length) return null;
  return { recommendations: items, summary: String(result.summary || '').slice(0, 120) };
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

exports.main = async (event, context) => {
  const startedAt = Date.now();
  const payload = event || {};

  try {
    const sessionId = String(payload.sessionId || payload.session_id || '').trim();
    const text = String(payload.text || '').trim();
    const explicitPref = payload.pref || null;

    // ---------- 第1步：读取会话（没有 sessionId 就是一次性推荐） ----------
    let session = sessionId ? await loadSession(sessionId) : null;
    const isNewSession = !session;
    if (!session) session = emptySession(sessionId || ('once-' + Date.now()));

    // ---------- 第2步：解析修正指令并合并 ----------
    const delta = parseDelta(text, session);
    let pref = mergeDelta(session.pref || emptyPref(), delta, session);

    // 首次调用（或前端显式传了偏好）时，用显式偏好覆盖
    if (isNewSession && explicitPref) {
      pref = {
        meal_type: explicitPref.meal_type || pref.meal_type,
        taste: uniqStrings(explicitPref.taste || pref.taste),
        allergies: uniqStrings((explicitPref.allergies || []).concat(pref.allergies || [])),
        budget: explicitPref.budget === undefined ? pref.budget : explicitPref.budget,
        canteen: explicitPref.canteen || pref.canteen,
        extra: explicitPref.extra || pref.extra
      };
    }

    // 累计排除项：上一轮已否掉的 + 本轮新否掉的
    const excludedIds = uniqStrings((session.excluded_ids || []).concat(delta.excludeIds || []));

    console.log('[shiyu-agent] session=' + sessionId + ' turn=' + toNumber(session.turn, 0)
      + ' 修正=' + JSON.stringify(delta) + ' 累计偏好=' + JSON.stringify(pref));

    // ---------- 第3步：矛盾检测（F2 的核心） ----------
    // 只要存在"用户没说清、且确实冲突"的点，就先澄清再推荐。
    // 前端可以传 skipClarify: true 跳过（例如用户点"直接推荐"）。
    const conflicts = detectConflicts(pref, session.asked_keys);

    if (conflicts.length > 0 && payload.skipClarify !== true) {
      const conflict = conflicts[0];

      // 记录已问过，避免下一轮重复追问
      session.asked_keys = uniqStrings((session.asked_keys || []).concat([conflict.key]));
      session.turn = toNumber(session.turn, 0) + 1;
      session.pref = pref;
      session.excluded_ids = excludedIds;
      session.history = (session.history || []).concat([
        { role: 'user', text: text },
        { role: 'assistant', text: conflict.question }
      ]);
      await saveSession(session);

      return {
        code: 0,
        message: 'success',
        data: {
          type: 'clarify',
          sessionId: session.session_id,
          turn: session.turn,
          question: conflict.question,
          detail: conflict.detail,
          options: conflict.options,
          prefSnapshot: pref,
          engine: 'rule',
          elapsed: Date.now() - startedAt
        }
      };
    }

    // ---------- 第4步：应用澄清选项（如果用户点了选项） ----------
    if (payload.applyOption && typeof payload.applyOption === 'object') {
      const apply = payload.applyOption;
      if (apply.removeAllergy) {
        const i = pref.allergies.indexOf(apply.removeAllergy);
        if (i >= 0) pref.allergies.splice(i, 1);
        session.asked_keys = (session.asked_keys || []).filter(function (k) {
          return k.indexOf(apply.removeAllergy) < 0;
        });
      }
      if (apply.setBudget) pref.budget = toNumber(apply.setBudget);
      if (Array.isArray(apply.taste)) pref.taste = uniqStrings(apply.taste);
      if (Array.isArray(apply.removeTaste)) {
        apply.removeTaste.forEach(function (t) {
          const i = pref.taste.indexOf(t);
          if (i >= 0) pref.taste.splice(i, 1);
        });
      }
      if (Array.isArray(apply.excludeTags)) pref.excludeTags = uniqStrings(apply.excludeTags);
    }

    // ---------- 第5步：候选召回 + 忌口硬过滤 ----------
    const candidates = await queryCandidates(pref, excludedIds);

    if (!candidates.length) {
      session.turn = toNumber(session.turn, 0) + 1;
      session.pref = pref;
      session.excluded_ids = excludedIds;
      session.last_dish_ids = [];
      await saveSession(session);

      return {
        code: 0,
        message: 'success',
        data: {
          type: 'recommend',
          sessionId: session.session_id,
          turn: session.turn,
          recommendations: [],
          summary: excludedIds.length
            ? '把之前否掉的都排除后就没剩多少了，要不要放宽某个条件？'
            : '没有符合当前条件的菜品，试试放宽预算或换个食堂',
          prefSnapshot: pref,
          excludedCount: excludedIds.length,
          engine: 'rule',
          elapsed: Date.now() - startedAt
        }
      };
    }

    // 预排序 + 截断，控制 Prompt 体积
    let maxRecommend = 0;
    candidates.forEach(function (d) {
      const c = toNumber(d.recommend_count, 0);
      if (c > maxRecommend) maxRecommend = c;
    });
    const shortlist = candidates.slice().sort(function (a, b) {
      return scoreDish(b, pref, maxRecommend) - scoreDish(a, pref, maxRecommend);
    }).slice(0, MAX_PROMPT_CANDIDATES);

    // ---------- 第6步：大模型推荐（失败则本地规则） ----------
    const cfg = await loadAiConfig();
    let result = null;
    let engine = 'rule';

    if (cfg.apiKey) {
      const prompt = buildPrompt(pref, shortlist, session.history);
      const raw = await callLLM(prompt, cfg);
      const parsed = parseJsonLoose(raw);
      result = validateModelOutput(parsed, shortlist, pref);
      if (result) {
        engine = 'ai';
        result.model = cfg.model;
      } else {
        console.warn('[shiyu-agent] 模型输出未通过校验，改用本地规则');
      }
    }

    if (!result) {
      result = localRecommend(pref, shortlist);
    }

    // ---------- 第7步：写回会话 + 热度累加 ----------
    session.turn = toNumber(session.turn, 0) + 1;
    session.pref = pref;
    session.excluded_ids = excludedIds;
    session.last_dish_ids = result.recommendations.map(function (r) { return r.dish_id; });
    session.history = (session.history || []).concat([
      { role: 'user', text: text || '（继续）' },
      {
        role: 'assistant',
        text: '推荐：' + result.recommendations.map(function (r) { return r.name; }).join('、')
      }
    ]);
    await saveSession(session);

    // 热度累加（失败不影响主流程）
    Promise.all(result.recommendations.map(function (r) {
      return db.collection(DISH_COLLECTION).doc(r.dish_id)
        .update({ recommend_count: dbCmd.inc(1) })
        .catch(function () { return null; });
    })).catch(function () { return null; });

    return {
      code: 0,
      message: 'success',
      data: {
        type: 'recommend',
        sessionId: session.session_id,
        turn: session.turn,
        recommendations: result.recommendations,
        summary: result.summary,
        prefSnapshot: pref,
        excludedCount: excludedIds.length,
        candidateCount: candidates.length,
        engine: engine,
        model: result.model || '',
        // 前端据此提示"上次问过的问题不再重复"
        askedKeys: session.asked_keys || [],
        elapsed: Date.now() - startedAt
      }
    };
  } catch (e) {
    console.error('[shiyu-agent] 执行异常:', e && (e.message || e));
    // 兜底：返回本地规则结果，保证前端一定有东西可渲染
    try {
      const fallback = await queryCandidates(emptyPref(), []);
      const local = localRecommend(emptyPref(), fallback);
      return {
        code: 0,
        message: 'success',
        data: {
          type: 'recommend',
          sessionId: String(payload.sessionId || ''),
          recommendations: local.recommendations,
          summary: local.summary,
          engine: 'rule',
          notice: '本次推荐异常已降级：' + (e && e.message ? e.message : '未知错误')
        }
      };
    } catch (e2) {
      return { code: -1, message: '推荐失败：' + (e && e.message ? e.message : '未知错误') };
    }
  }
};
