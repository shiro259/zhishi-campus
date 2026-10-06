'use strict';
/**
 * ============================================================================
 * 云函数：shiyu-recommend —— AI 智能推荐（项目核心）
 * ----------------------------------------------------------------------------
 * 项目：食遇校园 - AI智能食堂推荐
 *
 * 整体流程（工程思路）：
 *   第1步 入参归一化：接收结构化偏好 event.pref，以及可选的自然语言 event.text；
 *   第2步 服务端二次解析：parsePrefFromText() 从一句话里抽取口味/忌口/预算/餐段，
 *         与 pref 合并（显式传入的 pref 优先，忌口取并集更安全）；
 *   第3步 候选召回 + 忌口硬过滤：先按 status=1、预算、食堂在数据库层过滤，
 *         再在 JS 层剔除 tags 与忌口词有交集的菜品（不依赖模型自觉，硬性保证）；
 *   第4步 读取大模型配置：优先读 shiyu-config 集合（仅云函数可读），
 *         读不到则回退 process.env，两者都没有则直接使用本地规则引擎兜底；
 *   第5步 构建中文 Prompt：交代校园食堂场景、列出同学需求与候选菜品 JSON，
 *         明确要求「只输出 JSON」，并严禁推荐含忌口食材、超预算的菜；
 *   第6步 调用大模型：uniCloud.httpclient.request 直连 OpenAI 兼容接口；
 *   第7步 严格校验模型输出：这是防止「模型幻觉」的关键一步——
 *         dish_id 必须来自候选列表、tags 不得含忌口词、价格不得超预算、
 *         match_score 归一化到 0~100 整数、reason 截断到 40 字，不合法直接丢弃；
 *   第8步 校验后为空则降级本地规则；通过则把推荐菜品的 recommend_count 累加 1
 *         （并行更新，单条失败不影响主流程）；
 *   第9步 统一返回 { code, message, data }，任何异常都不会让云函数 500。
 *
 * 统一响应格式：成功 { code: 0, message: 'success', data } ；失败 { code: -1, message }
 * 无第三方依赖，全部 await 均有 try/catch 保护。
 * ============================================================================
 */

const db = uniCloud.database();
const dbCmd = db.command;

const COLLECTION = 'dishes';
const CONFIG_COLLECTION = 'shiyu-config';

// 单次候选召回上限
const MAX_CANDIDATES = 100;
// 真正塞进 Prompt 的候选数量上限（控制 token 消耗，按评分+热度预排序后截取）
const MAX_PROMPT_CANDIDATES = 60;
// 最终返回给前端的推荐条数上限
const MAX_RECOMMEND = 5;
// 大模型接口超时（毫秒）
const AI_TIMEOUT = 30000;

// 候选菜品查询返回的字段（精简返回，够推荐用即可）
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
// 词典：口味词 与 食材/忌口词
// 这两份词典是「文本解析」和「忌口硬过滤」共用的数据基础，
// 与 dishes 集合 tags 字段的取值保持一致。
// ---------------------------------------------------------------------------

// 口味类标签（正向偏好）
const TASTE_DICT = [
  { tag: '麻辣', words: ['麻辣', '麻椒', '花椒'] },
  { tag: '辣', words: ['辣', '辣椒', '香辣', '辣的'] },
  { tag: '清淡', words: ['清淡', '清爽', '不油腻', '少油', '清汤'] },
  { tag: '咸香', words: ['咸香', '咸口', '有味道'] },
  { tag: '甜', words: ['甜', '甜口'] },
  { tag: '酸', words: ['酸', '酸味', '开胃'] },
  { tag: '重油', words: ['重油', '油腻', '重口', '油大'] },
  { tag: '鲜嫩', words: ['鲜嫩', '嫩', '滑嫩'] },
  { tag: '下饭', words: ['下饭', '配饭', '干饭'] },
  { tag: '汤面', words: ['汤面', '带汤', '喝汤', '热汤', '汤的'] },
  { tag: '干拌面', words: ['干拌', '拌面', '不带汤', '干面'] },
  { tag: '养胃', words: ['养胃', '暖胃', '胃不', '好消化'] },
  { tag: '早餐', words: ['早餐', '早饭', '早上吃'] },
  { tag: '低卡', words: ['低卡', '低脂', '减脂', '减肥', '轻食', '热量低', '健康餐'] }
];

// 食材类标签（同时是忌口词）
const INGREDIENT_DICT = [
  { tag: '香菜', words: ['香菜', '芫荽'] },
  { tag: '葱', words: ['葱', '葱花', '洋葱'] },
  { tag: '蒜', words: ['蒜', '蒜蓉', '大蒜'] },
  { tag: '花生', words: ['花生', '花生米', '花生碎', '坚果'] },
  { tag: '海鲜', words: ['海鲜', '虾', '鱼', '蟹', '贝', '鱿鱼'] },
  { tag: '牛肉', words: ['牛肉', '牛腩', '肥牛', '牛排'] },
  { tag: '羊肉', words: ['羊肉', '羊汤', '羊杂'] },
  { tag: '内脏', words: ['内脏', '猪肝', '鸡肝', '鸭血', '毛肚', '黄喉', '肥肠', '腰花'] },
  { tag: '鸡蛋', words: ['鸡蛋', '蛋', '蛋花', '水煮蛋'] },
  { tag: '牛奶', words: ['牛奶', '奶', '芝士', '奶酪'] }
];

// 全部可作为忌口过滤的标签（口味 + 食材）
const ALLERGY_TAGS = TASTE_DICT.map(function (item) { return item.tag; })
  .concat(INGREDIENT_DICT.map(function (item) { return item.tag; }));

// 「不吃辣」这类否定表达：识别到就把对应口味标签加入忌口
const NEGATIVE_TASTE_MAP = {
  '辣': ['辣', '麻辣'],
  '麻辣': ['麻辣', '辣'],
  '甜': ['甜'],
  '酸': ['酸'],
  '清淡': ['清淡'],
  '重油': ['重油'],
  '下饭': ['下饭'],
  '鲜嫩': ['鲜嫩'],
  '咸香': ['咸香']
};

// ---------------------------------------------------------------------------
// 通用工具
// ---------------------------------------------------------------------------

/**
 * 去重 + 去掉空值，得到干净的字符串数组
 */
function uniqStrings(list) {
  const seen = new Set();
  const out = [];
  (list || []).forEach(function (item) {
    const value = String(item == null ? '' : item).trim();
    if (value && !seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  });
  return out;
}

/**
 * 把数据库文档映射成前端结构（补 id 字段，前端统一用 id）
 */
function withId(doc) {
  if (!doc) {
    return doc;
  }
  return Object.assign({}, doc, { id: doc._id });
}

/**
 * 安全取数字
 */
function toNumber(value, defaultValue) {
  const n = Number(value);
  return isFinite(n) ? n : defaultValue;
}

/**
 * 判断菜品标签与忌口是否冲突（有任何交集即视为冲突）
 */
function hasAllergyConflict(tags, allergySet) {
  if (!allergySet || allergySet.size === 0) {
    return false;
  }
  return (tags || []).some(function (tag) {
    return allergySet.has(tag);
  });
}

// ---------------------------------------------------------------------------
// 第2步：自然语言解析
// ---------------------------------------------------------------------------

/**
 * 从中文自然语言里抽取用餐偏好
 * @param {string} text 例如「今天想吃辣的，20块以内，不要香菜」
 * @returns {{taste:string[], allergies:string[], budget:number|null, meal_type:string, extra:string}}
 */
function parsePrefFromText(text) {
  const result = { taste: [], allergies: [], budget: null, meal_type: '', extra: '' };
  const raw = String(text == null ? '' : text).trim();
  if (!raw) {
    return result;
  }

  const taste = [];
  const allergies = [];

  // ---- 1) 先处理否定表达：不吃X / 不要X / 忌X / 别放X / 对X过敏 ----
  const negativePattern = /(不吃|不要|不想吃|不能吃|别放|不加|忌口?|过敏|讨厌|拒绝|去掉|少放)([^，。,.；;！!？?\s]{1,6})/g;
  let match = negativePattern.exec(raw);
  while (match) {
    const phrase = match[2];
    // 否定的是口味词
    Object.keys(NEGATIVE_TASTE_MAP).forEach(function (tasteWord) {
      if (phrase.indexOf(tasteWord) !== -1) {
        allergies.push.apply(allergies, NEGATIVE_TASTE_MAP[tasteWord]);
      }
    });
    // 否定的是食材词
    INGREDIENT_DICT.forEach(function (entry) {
      const hit = entry.words.some(function (word) {
        return phrase.indexOf(word) !== -1;
      });
      if (hit) {
        allergies.push(entry.tag);
      }
    });
    match = negativePattern.exec(raw);
  }

  // ---- 2) 正向口味偏好（麻辣优先，避免「麻辣」被拆成「辣」） ----
  TASTE_DICT.forEach(function (entry) {
    const hit = entry.words.some(function (word) {
      return raw.indexOf(word) !== -1;
    });
    if (hit) {
      taste.push(entry.tag);
    }
  });

  // ---- 3) 忌口食材（只在出现「忌口类上下文」时才算忌口，避免把「我要吃牛肉面」误判成忌口） ----
  const allergyKeywordHit = /(忌口|过敏|不要|不吃|不能吃|别放|不加|讨厌|拒绝)/.test(raw);
  if (allergyKeywordHit) {
    INGREDIENT_DICT.forEach(function (entry) {
      const hit = entry.words.some(function (word) {
        return raw.indexOf(word) !== -1;
      });
      if (hit) {
        allergies.push(entry.tag);
      }
    });
  }

  // ---- 4) 预算：依次尝试「X元以内」「预算X」「X块」「不超过X」 ----
  const budgetPatterns = [
    /(\d+(?:\.\d+)?)\s*(?:元|块钱|块)\s*(?:以内|以下|内|左右)?/,
    /预算\s*(?:是|在)?\s*(\d+(?:\.\d+)?)/,
    /(?:不超过|最多|顶多|控制在)\s*(\d+(?:\.\d+)?)/
  ];
  for (let i = 0; i < budgetPatterns.length; i++) {
    const budgetMatch = raw.match(budgetPatterns[i]);
    if (budgetMatch) {
      const value = Number(budgetMatch[1]);
      // 只接受 1~200 之间的合理预算，防止把「6个菜」之类的数字当预算
      if (isFinite(value) && value >= 1 && value <= 200) {
        result.budget = value;
        break;
      }
    }
  }

  // ---- 5) 用餐时段 ----
  if (/早餐|早饭|早上/.test(raw)) {
    result.meal_type = '早餐';
  } else if (/午餐|午饭|中午|中饭/.test(raw)) {
    result.meal_type = '午餐';
  } else if (/晚餐|晚饭|晚上/.test(raw)) {
    result.meal_type = '晚餐';
  } else if (/夜宵|宵夜|加餐/.test(raw)) {
    result.meal_type = '夜宵';
  }

  result.taste = uniqStrings(taste);
  result.allergies = uniqStrings(allergies);
  result.extra = raw;
  return result;
}

/**
 * 归一化偏好对象：显式 pref 优先，text 解析结果补位
 * - 口味：pref 明确传了就尊重 pref，否则用文本解析结果
 * - 忌口：两者取并集（忌口宁多勿少，安全第一）
 * - 预算/餐段/食堂：pref 有值优先
 */
function normalizePref(pref, textPref) {
  const p = pref || {};
  const t = textPref || {};

  const prefTaste = uniqStrings(p.taste);
  const prefAllergies = uniqStrings(p.allergies);

  const taste = prefTaste.length > 0 ? prefTaste : uniqStrings(t.taste);
  const allergies = uniqStrings(prefAllergies.concat(uniqStrings(t.allergies)));

  const prefBudget = toNumber(p.budget, 0);
  const budget = prefBudget > 0 ? prefBudget : (t.budget != null ? t.budget : null);

  return {
    meal_type: (p.meal_type && String(p.meal_type).trim()) || t.meal_type || '午餐',
    taste: taste,
    allergies: allergies,
    budget: budget,
    canteen: p.canteen ? String(p.canteen).trim() : '',
    extra: (p.extra && String(p.extra).trim()) || t.extra || ''
  };
}

// ---------------------------------------------------------------------------
// 第3步：候选召回 + 忌口硬过滤
// ---------------------------------------------------------------------------

/**
 * 从数据库召回候选菜品，并在 JS 层做忌口硬过滤
 * 数据库层只做 status / 预算 / 食堂 这种「可索引」的过滤，
 * 忌口交集判断放在 JS 层做，语义更可控（也方便日志统计）。
 */
async function queryCandidates(pref) {
  const where = { status: 1 };

  if (pref.budget && pref.budget > 0) {
    where.price = dbCmd.lte(pref.budget);
  }
  if (pref.canteen) {
    where.canteen = pref.canteen;
  }

  const res = await db
    .collection(COLLECTION)
    .where(where)
    .field(CANDIDATE_FIELD)
    .orderBy('rating', 'desc')
    .limit(MAX_CANDIDATES)
    .get();

  let list = (res.data || []).map(withId);
  const beforeFilter = list.length;

  // ---- 忌口硬过滤：tags 与忌口词有任何交集就整条剔除 ----
  const allergySet = new Set(pref.allergies || []);
  if (allergySet.size > 0) {
    list = list.filter(function (dish) {
      return !hasAllergyConflict(dish.tags, allergySet);
    });
  }

  console.log('[shiyu-recommend] 候选召回 =', beforeFilter, ', 忌口过滤后 =', list.length,
    ', 忌口 =', JSON.stringify(pref.allergies || []));

  return list;
}

/**
 * 按「评分 + 热度」预排序后截取，控制 Prompt 长度
 */
function pickPromptCandidates(dishes) {
  const sorted = dishes.slice().sort(function (a, b) {
    const scoreA = toNumber(a.rating, 0) * 10 + toNumber(a.recommend_count, 0) / 100;
    const scoreB = toNumber(b.rating, 0) * 10 + toNumber(b.recommend_count, 0) / 100;
    return scoreB - scoreA;
  });
  return sorted.slice(0, MAX_PROMPT_CANDIDATES);
}

// ---------------------------------------------------------------------------
// 第4步：读取大模型配置
// ---------------------------------------------------------------------------

/**
 * 读取 AI 配置：优先数据库 shiyu-config（仅云函数可读），其次环境变量
 * 说明：api_key 存放在权限全 false 的集合里，客户端无法读取，只有云函数（admin）能取
 */
async function loadAIConfig() {
  const config = { provider: '', baseUrl: '', model: '', apiKey: '' };

  try {
    const res = await db.collection(CONFIG_COLLECTION).limit(1).get();
    const doc = res.data && res.data[0];
    if (doc) {
      config.provider = doc.provider || '';
      config.baseUrl = doc.base_url || '';
      config.model = doc.model || '';
      config.apiKey = doc.api_key || '';
    }
  } catch (e) {
    console.warn('[shiyu-recommend] 读取 shiyu-config 失败，改用环境变量:', e && (e.message || e));
  }

  // 环境变量兜底
  config.provider = config.provider || 'env';
  config.baseUrl = String(config.baseUrl || process.env.AI_BASE_URL || '').trim();
  config.model = String(config.model || process.env.AI_MODEL || 'deepseek-chat').trim();
  config.apiKey = String(config.apiKey || process.env.AI_API_KEY || '').trim();

  // 去掉末尾斜杠，后面统一拼 /chat/completions
  config.baseUrl = config.baseUrl.replace(/\/+$/, '');

  return config;
}

// ---------------------------------------------------------------------------
// 第5步：构建 Prompt
// ---------------------------------------------------------------------------

/**
 * 构建中文 Prompt：场景 + 需求 + 候选菜品 + 严格输出约束
 */
function buildPrompt(pref, promptDishes) {
  const tasteText = (pref.taste && pref.taste.length) ? pref.taste.join('、') : '无特殊偏好';
  const allergyText = (pref.allergies && pref.allergies.length) ? pref.allergies.join('、') : '无';
  const budgetText = pref.budget ? pref.budget + ' 元以内' : '不限';
  const canteenText = pref.canteen || '不限食堂';
  const extraText = pref.extra ? pref.extra : '无';

  // 只给模型它真正需要的字段，降低 token 消耗也降低幻觉概率
  const briefDishes = promptDishes.map(function (dish) {
    return {
      dish_id: dish._id,
      name: dish.name,
      price: dish.price,
      canteen: dish.canteen,
      window: dish.window,
      tags: dish.tags || [],
      rating: dish.rating,
      description: dish.description
    };
  });

  return [
    '你是「食遇校园」校园食堂的美食推荐助手，服务对象是大学生，推荐结果要贴合校园食堂的真实情况。',
    '',
    '【同学需求】',
    '用餐时段：' + pref.meal_type,
    '口味偏好：' + tasteText,
    '忌口食材：' + allergyText,
    '人均预算：' + budgetText,
    '指定食堂：' + canteenText,
    '补充说明：' + extraText,
    '',
    '【可选菜品列表（只能从这里挑，dish_id 必须原样取自下面的列表）】',
    JSON.stringify(briefDishes),
    '',
    '【推荐要求】',
    '1. 从上面的列表中挑选 3 到 5 道最适合这位同学的菜品；',
    '2. 严禁推荐标签中含有忌口食材的菜品（例如忌口"香菜"，就不要推荐 tags 里含"香菜"的菜）；',
    '3. 推荐菜品的价格不得超过人均预算' + (pref.budget ? '（' + pref.budget + ' 元）' : '（本次不限预算）') + '；',
    '4. 口味偏好是硬性筛选条件：用户表达了具体口味（如“辣、清淡、甜”等）时，推荐的每一道菜其 tags 中都必须包含对应的口味标签，严禁为了评分或性价比用不符合口味的菜凑数；仅当符合口味的菜不足 3 道时，才可用其他高评分菜补足，并在对应 reason 中说明；',
    '5. reason 是推荐理由，必须用中文，30 字以内，说清楚为什么适合这位同学；',
    '6. match_score 是 0 到 100 的整数匹配度，越高越推荐；',
    '7. dish_id 必须与候选列表中的 dish_id 完全一致，不允许自己编造。',
    '',
    '【输出格式】必须只输出一个 JSON 对象，不要输出任何解释文字、不要使用 Markdown 代码块：',
    '{"recommendations":[{"dish_id":"候选列表中的id","reason":"30字以内的中文推荐理由","match_score":90}],"summary":"一句话总结本次推荐（40字以内）"}'
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 第6步：调用大模型
// ---------------------------------------------------------------------------

/**
 * 请求 OpenAI 兼容的 /chat/completions 接口
 * @returns {Promise<string>} 模型返回的文本内容
 */
async function callAI(config, prompt) {
  const url = config.baseUrl + '/chat/completions';

  const res = await uniCloud.httpclient.request(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + config.apiKey,
      'Content-Type': 'application/json'
    },
    data: {
      model: config.model,
      messages: [
        {
          role: 'system',
          content: '你是校园食堂美食推荐专家，只输出合法的 JSON，不输出任何多余文字。'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 1500
    },
    dataType: 'json',
    timeout: AI_TIMEOUT
  });

  if (res.status && res.status !== 200) {
    throw new Error('大模型接口返回状态码 ' + res.status);
  }

  const content = res.data && res.data.choices && res.data.choices[0]
    && res.data.choices[0].message && res.data.choices[0].message.content;

  if (!content) {
    throw new Error('大模型返回内容为空');
  }
  return content;
}

// ---------------------------------------------------------------------------
// 第7步：输出解析 + 严格校验
// ---------------------------------------------------------------------------

/**
 * 尽最大努力从模型输出里抽出 JSON
 * 兼容：```json 代码块包裹、前后有多余解释文字、直接是对象或数组
 */
function extractJSON(text) {
  if (!text) {
    return null;
  }
  // 去掉 Markdown 代码块围栏
  let raw = String(text).replace(/```[a-zA-Z]*/g, '').split('```').join('').trim();

  // 1) 直接解析
  try {
    return JSON.parse(raw);
  } catch (e) {
    // 继续尝试截取
  }

  // 2) 截取第一个 { 到最后一个 }（对象形态）
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    } catch (e) {
      // 继续尝试数组形态
    }
  }

  // 3) 截取第一个 [ 到最后一个 ]（数组形态）
  const firstBracket = raw.indexOf('[');
  const lastBracket = raw.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try {
      return JSON.parse(raw.slice(firstBracket, lastBracket + 1));
    } catch (e) {
      return null;
    }
  }

  return null;
}

/**
 * 严格校验模型输出 —— 这一步是「防幻觉」的核心
 * 规则：
 *   - dish_id 必须在候选列表中存在，否则丢弃
 *   - 菜品 tags 不得含忌口词，否则丢弃
 *   - 菜品价格不得超过预算，否则丢弃
 *   - 重复推荐同一道菜只保留第一条
 *   - match_score 归一化为 0~100 整数；reason 截断到 40 字
 * @returns {{list:Array, dropped:number, summary:string}}
 */
function validateAIResult(parsed, candidateMap, pref) {
  const out = { list: [], dropped: 0, summary: '' };
  if (!parsed) {
    return out;
  }

  // 兼容模型可能返回数组，或把数组放在 recommendations / data / list 字段里
  let items = [];
  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (Array.isArray(parsed.recommendations)) {
    items = parsed.recommendations;
  } else if (Array.isArray(parsed.data)) {
    items = parsed.data;
  } else if (Array.isArray(parsed.list)) {
    items = parsed.list;
  }

  if (parsed && typeof parsed.summary === 'string') {
    out.summary = parsed.summary.trim().slice(0, 120);
  }

  const allergySet = new Set(pref.allergies || []);
  const usedIds = new Set();

  for (let i = 0; i < items.length; i++) {
    if (out.list.length >= MAX_RECOMMEND) {
      break;
    }
    const item = items[i] || {};

    // ---- 校验1：dish_id 必须来自候选列表 ----
    const dishId = String(
      item.dish_id != null ? item.dish_id : (item.dishId != null ? item.dishId : (item.id != null ? item.id : ''))
    ).trim();
    const dish = candidateMap.get(dishId);
    if (!dish) {
      out.dropped++;
      console.warn('[shiyu-recommend] 丢弃无效 dish_id:', dishId);
      continue;
    }

    // ---- 去重：同一道菜只保留一次 ----
    if (usedIds.has(dishId)) {
      out.dropped++;
      continue;
    }

    // ---- 校验2：tags 不得含忌口词（模型幻觉兜底） ----
    if (hasAllergyConflict(dish.tags, allergySet)) {
      out.dropped++;
      console.warn('[shiyu-recommend] 丢弃含忌口食材的推荐:', dish.name, JSON.stringify(dish.tags));
      continue;
    }

    // ---- 校验3：价格不得超过预算 ----
    if (pref.budget && toNumber(dish.price, 0) > pref.budget) {
      out.dropped++;
      console.warn('[shiyu-recommend] 丢弃超预算推荐:', dish.name, dish.price);
      continue;
    }

    // ---- 归一化 match_score 与 reason ----
    let score = Math.round(toNumber(item.match_score != null ? item.match_score : item.score, 70));
    score = Math.max(0, Math.min(100, score));

    let reason = typeof item.reason === 'string' ? item.reason.trim() : '';
    if (!reason && item.why) {
      reason = typeof item.why === 'string' ? item.why.trim() : '';
    }
    if (!reason) {
      reason = '综合评分与口味匹配度较高，值得一试';
    }
    if (reason.length > 40) {
      reason = reason.slice(0, 40);
    }

    usedIds.add(dishId);
    out.list.push({
      dish_id: dish._id,
      id: dish._id,
      name: dish.name,
      canteen: dish.canteen,
      window: dish.window,
      price: dish.price,
      rating: dish.rating,
      emoji: dish.emoji,
      image: dish.image || '',
      tags: dish.tags || [],
      reason: reason,
      match_score: score
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// 第10步：本地规则引擎（兜底方案）
// ---------------------------------------------------------------------------

/**
 * 本地智能推荐规则引擎
 * 打分公式（满分 100，超出则截断）：
 *   基础分 55
 *   + 口味命中最多 25（每个命中的口味标签 +13，封顶 25）
 *   + 评分 min(rating * 6, 30)（4.5 分可拿 27 分）
 *   + 预算合理 +5
 *   + 新品 +2
 *   + 热度 min(recommend_count / 40, 5)
 * 取前 5 条，并为每条生成中文推荐理由
 *
 * @param {object} pref 归一化后的偏好
 * @param {Array} dishes 已完成忌口硬过滤的候选菜品
 * @returns {{recommendations:Array, summary:string}}
 */
function localRecommend(pref, dishes) {
  const tasteSet = new Set(pref.taste || []);
  const list = Array.isArray(dishes) ? dishes : [];

  const scored = list.map(function (dish) {
    const tags = dish.tags || [];
    const hits = tags.filter(function (tag) {
      return tasteSet.has(tag);
    });
    const rating = toNumber(dish.rating, 0);
    const price = toNumber(dish.price, 0);
    const recommendCount = toNumber(dish.recommend_count, 0);

    let score = 55;
    score += Math.min(25, hits.length * 13);            // 口味命中
    score += Math.min(rating * 6, 30);                  // 评分
    if (pref.budget && price <= pref.budget) {
      score += 5;                                       // 预算合理
    }
    if (dish.is_new) {
      score += 2;                                       // 新品加成
    }
    score += Math.min(recommendCount / 40, 5);          // 热度

    // ---- 生成 40 字以内的中文推荐理由 ----
    const parts = [];
    if (hits.length > 0) {
      parts.push('命中口味' + hits.slice(0, 2).join('、'));
    } else {
      parts.push('口味温和百搭');
    }
    parts.push('评分' + rating.toFixed(1));
    parts.push(price.toFixed(0) + '元' + (pref.budget ? '在预算内' : ''));
    if (recommendCount >= 100) {
      parts.push('人气很高');
    }
    if (dish.is_new) {
      parts.push('当季新品');
    }
    let reason = parts.join('，');
    if (reason.length > 40) {
      reason = reason.slice(0, 40);
    }

    return {
      dish_id: dish._id,
      id: dish._id,
      name: dish.name,
      canteen: dish.canteen,
      window: dish.window,
      price: dish.price,
      rating: dish.rating,
      emoji: dish.emoji,
      image: dish.image || '',
      tags: tags,
      reason: reason,
      match_score: Math.max(0, Math.min(100, Math.round(score)))
    };
  });

  // 按分数降序，分数相同则价格更低者优先（校园场景更看重性价比）
  scored.sort(function (a, b) {
    if (b.match_score !== a.match_score) {
      return b.match_score - a.match_score;
    }
    return toNumber(a.price, 0) - toNumber(b.price, 0);
  });

  const recommendations = scored.slice(0, MAX_RECOMMEND);

  return {
    recommendations: recommendations,
    summary: buildLocalSummary(pref, list.length, recommendations)
  };
}

/**
 * 生成本地兜底的 summary 文案
 */
function buildLocalSummary(pref, candidateCount, recommendations) {
  const tasteText = (pref.taste && pref.taste.length) ? pref.taste.join('、') : '不限口味';
  const allergyText = (pref.allergies && pref.allergies.length) ? '，已避开' + pref.allergies.join('、') : '';
  const budgetText = pref.budget ? '，预算 ' + pref.budget + ' 元以内' : '';

  if (!recommendations.length) {
    return '暂时没有符合条件的菜品，试试放宽预算或换一个食堂看看';
  }

  const avgPrice = recommendations.reduce(function (sum, item) {
    return sum + toNumber(item.price, 0);
  }, 0) / recommendations.length;

  return '根据你的偏好（' + tasteText + allergyText + budgetText + '），已从 ' + candidateCount +
    ' 道候选菜品中为你精选 ' + recommendations.length + ' 道，人均约 ' + avgPrice.toFixed(1) + ' 元，祝你用餐愉快！';
}

// ---------------------------------------------------------------------------
// 第8步：推荐热度累加
// ---------------------------------------------------------------------------

/**
 * 把被推荐菜品的 recommend_count 累加 1
 * 注意：这是「锦上添花」的统计动作，任何一条失败都不能影响主流程，
 *       因此每条更新各自 try/catch，并用 Promise.all 并行执行。
 */
async function bumpRecommendCount(dishIds) {
  const ids = uniqStrings(dishIds);
  if (ids.length === 0) {
    return 0;
  }

  const results = await Promise.all(ids.map(async function (id) {
    try {
      await db.collection(COLLECTION).doc(id).update({
        recommend_count: dbCmd.inc(1)
      });
      return 1;
    } catch (e) {
      console.warn('[shiyu-recommend] recommend_count 累加失败(忽略):', id, e && (e.message || e));
      return 0;
    }
  }));

  return results.reduce(function (sum, n) { return sum + n; }, 0);
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

exports.main = async (event, context) => {
  const startedAt = Date.now();
  const payload = event || {};

  try {
    // ---------- 第1步 + 第2步：入参归一化 & 文本二次解析 ----------
    const textPref = payload.text ? parsePrefFromText(payload.text) : { taste: [], allergies: [], budget: null, meal_type: '', extra: '' };
    const pref = normalizePref(payload.pref, textPref);

    console.log('[shiyu-recommend] 归一化偏好 =', JSON.stringify(pref));
    if (payload.text) {
      console.log('[shiyu-recommend] 文本解析结果 =', JSON.stringify(textPref));
    }

    // ---------- 第3步：候选召回 + 忌口硬过滤 ----------
    let candidates = [];
    try {
      candidates = await queryCandidates(pref);
    } catch (e) {
      console.error('[shiyu-recommend] 候选菜品查询失败:', e && (e.message || e));
      return { code: -1, message: '菜品数据查询失败，请稍后再试' };
    }

    if (candidates.length === 0) {
      return {
        code: 0,
        message: '没有找到符合条件的菜品，试试放宽预算或更换食堂吧',
        data: {
          recommendations: [],
          summary: '没有找到符合口味、忌口和预算的菜品，试试放宽预算或换一个食堂看看',
          engine: 'local',
          model: '',
          elapsed: Date.now() - startedAt
        }
      };
    }

    // 送给模型的候选（预排序截取，控制 token）
    const promptDishes = pickPromptCandidates(candidates);
    // 校验用的字典：dish_id -> dish，只包含真正给模型看过的菜
    const candidateMap = new Map();
    promptDishes.forEach(function (dish) {
      candidateMap.set(String(dish._id), dish);
    });

    // ---------- 第4步：读取 AI 配置 ----------
    let aiConfig = { provider: '', baseUrl: '', model: '', apiKey: '' };
    try {
      aiConfig = await loadAIConfig();
    } catch (e) {
      console.warn('[shiyu-recommend] 读取 AI 配置异常(改用本地规则):', e && (e.message || e));
    }

    const aiEnabled = !!(aiConfig.apiKey && aiConfig.baseUrl);

    console.log('[shiyu-recommend] 是否启用大模型 =', aiEnabled,
      ', provider =', aiConfig.provider, ', model =', aiConfig.model);

    // ---------- 未配置密钥：直接走本地规则兜底 ----------
    if (!aiEnabled) {
      const local = localRecommend(pref, candidates);
      console.log('[shiyu-recommend] 未配置 API Key，使用本地规则引擎, 耗时 =', Date.now() - startedAt, 'ms');

      return {
        code: 0,
        message: '未配置大模型 API Key，已使用本地智能规则推荐',
        data: {
          recommendations: local.recommendations,
          summary: local.summary,
          engine: 'local',
          model: '',
          elapsed: Date.now() - startedAt
        }
      };
    }

    // ---------- 第5步 + 第6步：构建 Prompt 并调用大模型 ----------
    let aiValidated = { list: [], dropped: 0, summary: '' };
    let aiError = '';

    try {
      const prompt = buildPrompt(pref, promptDishes);
      console.log('[shiyu-recommend] Prompt 候选数 =', promptDishes.length, ', 长度 =', prompt.length);

      const content = await callAI(aiConfig, prompt);
      const parsed = extractJSON(content);

      if (!parsed) {
        aiError = '模型输出无法解析为 JSON';
      } else {
        // ---------- 第7步：严格校验 ----------
        aiValidated = validateAIResult(parsed, candidateMap, pref);
        console.log('[shiyu-recommend] AI 输出校验通过 =', aiValidated.list.length,
          ', 丢弃 =', aiValidated.dropped);
        if (aiValidated.list.length === 0) {
          aiError = '模型输出未通过校验';
        }
      }
    } catch (e) {
      aiError = (e && e.message) ? e.message : '大模型调用失败';
      console.error('[shiyu-recommend] AI 调用失败(降级本地规则):', aiError);
    }

    // ---------- 校验后为空 → 降级本地规则 ----------
    if (aiValidated.list.length === 0) {
      const local = localRecommend(pref, candidates);
      console.log('[shiyu-recommend] 降级本地规则, 原因 =', aiError, ', 耗时 =', Date.now() - startedAt, 'ms');

      return {
        code: 0,
        message: 'AI 推荐暂不可用，已使用本地智能规则推荐',
        data: {
          recommendations: local.recommendations,
          summary: local.summary,
          engine: 'local',
          model: aiConfig.model,
          elapsed: Date.now() - startedAt
        }
      };
    }

    // ---------- 第8步：推荐热度累加（失败不影响主流程） ----------
    let bumped = 0;
    try {
      bumped = await bumpRecommendCount(aiValidated.list.map(function (item) { return item.dish_id; }));
    } catch (e) {
      console.warn('[shiyu-recommend] 热度累加异常(忽略):', e && (e.message || e));
    }

    const elapsed = Date.now() - startedAt;
    console.log('[shiyu-recommend] AI 推荐成功, 条数 =', aiValidated.list.length,
      ', 热度更新 =', bumped, ', 耗时 =', elapsed, 'ms');

    // ---------- 第9步：统一返回 ----------
    return {
      code: 0,
      message: 'success',
      data: {
        recommendations: aiValidated.list,
        summary: aiValidated.summary || buildLocalSummary(pref, candidates.length, aiValidated.list),
        engine: 'ai',
        model: aiConfig.model,
        elapsed: elapsed
      }
    };
  } catch (e) {
    // 最外层兜底：任何未预期异常都不允许让云函数 500，
    // 最差也要尽力返回一份本地规则结果。
    console.error('[shiyu-recommend] 未预期异常:', e && (e.message || e));

    try {
      const textPref = payload.text ? parsePrefFromText(payload.text) : { taste: [], allergies: [], budget: null, meal_type: '', extra: '' };
      const pref = normalizePref(payload.pref, textPref);
      const candidates = await queryCandidates(pref);
      const local = localRecommend(pref, candidates);

      return {
        code: 0,
        message: '推荐服务异常，已返回本地智能规则结果',
        data: {
          recommendations: local.recommendations,
          summary: local.summary,
          engine: 'local',
          model: '',
          elapsed: Date.now() - startedAt
        }
      };
    } catch (inner) {
      console.error('[shiyu-recommend] 兜底推荐同样失败:', inner && (inner.message || inner));
      return {
        code: -1,
        message: '推荐失败：' + (e && e.message ? e.message : '未知错误')
      };
    }
  }
};
