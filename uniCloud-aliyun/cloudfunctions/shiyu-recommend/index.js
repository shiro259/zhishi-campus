'use strict'
/**
 * 食遇校园 · AI 智能推荐云函数
 * 对接通义千问（Qwen）大模型，通过 Prompt 工程生成个性化菜品推荐
 *
 * 部署：在 HBuilderX 中右键 shiyu-recommend → 上传部署
 * 配置：在 shiyu-config 云函数中设置 API Key
 */

// 本地菜品库（与前端 common/local-dishes.js 一致）
const LOCAL_DISHES = [
  { id: 'd001', name: '麻婆豆腐', price: 8, canteen: '第一食堂', window: '川味窗口', category: '川菜', tags: ['辣', '下饭'], description: '经典川菜，麻辣鲜香，豆腐嫩滑，配米饭一绝。', rating: 4.0 },
  { id: 'd002', name: '宫保鸡丁', price: 12, canteen: '第一食堂', window: '川味窗口', category: '川菜', tags: ['辣', '甜', '下饭'], description: '鸡丁鲜嫩，花生酥脆，甜辣适口，人气爆款。', rating: 4.1 },
  { id: 'd003', name: '鱼香肉丝', price: 10, canteen: '第一食堂', window: '川味窗口', category: '川菜', tags: ['辣', '酸', '下饭'], description: '酸甜微辣，肉丝滑嫩，经典鱼香味型。', rating: 4.1 },
  { id: 'd004', name: '番茄炒蛋', price: 6, canteen: '第一食堂', window: '家常窗口', category: '家常菜', tags: ['清淡', '甜'], description: '酸甜可口，鸡蛋嫩滑，老少皆宜。', rating: 4.2 },
  { id: 'd005', name: '红烧排骨', price: 15, canteen: '第一食堂', window: '家常窗口', category: '家常菜', tags: ['咸香', '下饭'], description: '排骨软烂入味，酱香浓郁，分量十足。', rating: 4.1 },
  { id: 'd006', name: '兰州拉面', price: 10, canteen: '第二食堂', window: '面食窗口', category: '面食', tags: ['清淡', '汤面'], description: '手工拉面，汤清面爽，牛肉片香。', rating: 4.6 },
  { id: 'd007', name: '重庆小面', price: 9, canteen: '第二食堂', window: '面食窗口', category: '面食', tags: ['辣', '干拌面'], description: '麻辣鲜香，面条劲道，正宗重庆味。', rating: 4.8 },
  { id: 'd008', name: '黄焖鸡米饭', price: 14, canteen: '第二食堂', window: '快餐窗口', category: '快餐', tags: ['咸香', '下饭'], description: '鸡肉鲜嫩，汤汁浓郁，米饭管够。', rating: 4.0 },
  { id: 'd009', name: '沙县蒸饺', price: 8, canteen: '第二食堂', window: '小吃窗口', category: '小吃', tags: ['清淡'], description: '皮薄馅大，蘸醋吃更香，早餐首选。', rating: 4.3 },
  { id: 'd010', name: '皮蛋瘦肉粥', price: 6, canteen: '第二食堂', window: '小吃窗口', category: '小吃', tags: ['清淡', '养胃'], description: '粥稠米香，皮蛋瘦肉搭配，暖胃又营养。', rating: 4.0 },
  { id: 'd011', name: '广东肠粉', price: 7, canteen: '第三食堂', window: '粤菜窗口', category: '粤菜', tags: ['清淡', '早餐'], description: '米浆蒸制，滑嫩Q弹，淋上酱汁超满足。', rating: 4.8 },
  { id: 'd012', name: '白切鸡', price: 16, canteen: '第三食堂', window: '粤菜窗口', category: '粤菜', tags: ['清淡', '鲜嫩'], description: '皮爽肉滑，原汁原味，配姜葱酱绝佳。', rating: 4.0 },
  { id: 'd013', name: '蜜汁叉烧饭', price: 15, canteen: '第三食堂', window: '粤菜窗口', category: '粤菜', tags: ['甜', '下饭'], description: '叉烧肥瘦相间，蜜汁香甜，米饭吸满肉汁。', rating: 4.2 },
  { id: 'd014', name: '螺蛳粉', price: 12, canteen: '第三食堂', window: '地方风味', category: '地方菜', tags: ['辣', '酸', '汤面'], description: '酸辣鲜爽，配料丰富，闻着臭吃着香。', rating: 4.4 },
  { id: 'd015', name: '麻辣香锅', price: 18, canteen: '第三食堂', window: '地方风味', category: '地方菜', tags: ['辣', '重油'], description: '自选食材，麻辣干香，重口味必点。', rating: 4.3 },
  { id: 'd016', name: '牛肉拉面', price: 11, canteen: '第二食堂', window: '', category: '面食', tags: ['清淡', '汤面'], description: '清真牛肉，汤浓面劲，分量实在。', rating: 4.5 },
  { id: 'd017', name: '大盘鸡', price: 20, canteen: '第三食堂', window: '', category: '地方菜', tags: ['辣', '咸香'], description: '鸡肉土豆配皮带面，新疆特色，香辣过瘾。', rating: 4.6 },
  { id: 'd018', name: '烤羊肉串', price: 3, canteen: '第三食堂', window: '', category: '烧烤', tags: ['辣', '咸香'], description: '现烤羊肉，外焦里嫩，撒上孜然辣椒面。', rating: 4.7 },
  { id: 'd019', name: '手抓饭', price: 13, canteen: '第三食堂', window: '', category: '地方菜', tags: ['咸香'], description: '胡萝卜羊肉焖饭，油润不腻，香气扑鼻。', rating: 4.3 },
  { id: 'd020', name: '珍珠奶茶', price: 10, canteen: '第一食堂', window: '饮品窗口', category: '饮品', tags: ['甜'], description: 'Q弹珍珠，香浓奶茶，下午茶必备。', rating: 4.6 },
  { id: 'd021', name: '水果沙拉', price: 12, canteen: '第二食堂', window: '轻食窗口', category: '轻食', tags: ['清淡', '健康'], description: '新鲜水果搭配酸奶，低脂健康。', rating: 4.2 },
  { id: 'd022', name: '蔬菜沙拉', price: 8, canteen: '第二食堂', window: '轻食窗口', category: '轻食', tags: ['清淡', '健康'], description: '新鲜时蔬，油醋汁调味，减脂首选。', rating: 4.5 }
]

/**
 * 构建 Prompt
 */
function buildPrompt(pref, text) {
  const tasteMap = { spicy: '辣', light: '清淡', oily: '重油', salty: '咸香', sweet: '甜', sour: '酸' }
  const allergyMap = { coriander: '香菜', onion: '葱', garlic: '蒜', no_spicy: '辣', offal: '内脏', seafood: '海鲜' }

  const parts = []
  if (pref.meal_type) parts.push(`餐次：${pref.meal_type}`)
  if (pref.taste && pref.taste.length) parts.push(`口味偏好：${pref.taste.map(t => tasteMap[t] || t).join('、')}`)
  if (pref.allergies && pref.allergies.length) parts.push(`忌口：不吃${pref.allergies.map(a => allergyMap[a] || a).join('、')}`)
  if (pref.budget && pref.budget < 999) parts.push(`预算：${pref.budget}元以内`)
  if (pref.canteen) parts.push(`食堂：${pref.canteen}`)
  if (text) parts.push(`补充说明：${text}`)

  const dishList = LOCAL_DISHES.map(d => `${d.id} ${d.name} ¥${d.price} ${d.canteen} ${d.tags.join('/')}`).join('\n')

  return `你是一位校园食堂美食推荐专家。请根据以下学生偏好，从菜品库中推荐3道最合适的菜品。

【学生偏好】
${parts.join('\n')}

【菜品库】
${dishList}

【要求】
1. 严格遵循忌口要求：如果学生不吃辣，绝不推荐带"辣"标签的菜
2. 价格必须在预算范围内
3. 返回JSON格式，不要有多余文字

【返回格式】
{
  "recommendations": [
    {
      "id": "菜品ID",
      "name": "菜品名",
      "reason": "30字以内的推荐理由，要有食欲感"
    }
  ],
  "summary": "一句话总结推荐理由"
}`
}

/**
 * 调用通义千问 API
 */
async function callQwen(prompt, config) {
  const apiKey = config.api_key || ''
  const model = config.model || 'qwen-turbo'
  const baseUrl = config.base_url || 'https://dashscope.aliyuncs.com/compatible-mode/v1'

  if (!apiKey) throw new Error('未配置 API Key')

  // 通义千问使用 OpenAI 兼容格式
  const url = baseUrl.replace(/\/$/, '') + '/chat/completions'
  const res = await uniCloud.httpclient.request(url, {
    method: 'POST',
    timeout: 15000,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    data: {
      model: model,
      messages: [
        { role: 'system', content: '你是校园食堂美食推荐专家，只返回JSON格式数据。' },
        { role: 'user', content: prompt }
      ],
      // 沿用管理后台配置的温度；推荐类任务偏保守，默认 0.7
      temperature: typeof config.temperature === 'number' ? config.temperature : 0.7,
      response_format: { type: 'json_object' }
    }
  })

  if (res.status !== 200) {
    throw new Error(`API 返回 ${res.status}: ${(res.data && res.data.error && res.data.error.message) || '未知错误'}`)
  }

  const content = res.data.choices[0].message.content
  return JSON.parse(content)
}

/**
 * 本地规则兜底
 */
function localRecommend(pref) {
  const dishes = LOCAL_DISHES.filter(d => d.status !== 0)
  const scored = dishes.map(d => {
    let score = d.rating * 10
    if (pref.taste && pref.taste.includes('spicy') && d.tags.includes('辣')) score += 30
    if (pref.taste && pref.taste.includes('light') && d.tags.includes('清淡')) score += 30
    if (pref.budget && pref.budget < 999 && d.price > pref.budget) score -= 100
    score += Math.min(d.review_count || 20, 20)
    if (d.is_new) score += 5
    return { ...d, _score: score }
  })
  scored.sort((a, b) => b._score - a._score)
  return scored.slice(0, 3)
}

/**
 * 主入口
 */
exports.main = async (event, context) => {
  const { pref = {}, text = '' } = event

  try {
    // 读取配置
    const db = uniCloud.database()
    const configCol = db.collection('shiyu-config')
    const configRes = await configCol.limit(1).get()
    const config = (configRes.data && configRes.data[0]) || {}

    if (!config.api_key) {
      // 未配置 Key → 本地规则兜底
      const recs = localRecommend(pref)
      return {
        code: 0,
        data: {
          recommendations: recs.map(d => ({
            id: d.id, name: d.name, price: d.price,
            canteen: d.canteen, window: d.window, category: d.category,
            tags: d.tags, image: '', description: d.description,
            rating: d.rating, reason: `${d.description}`
          })),
          summary: '本地规则推荐（未配置大模型 API Key）',
          engine: 'local'
        }
      }
    }

    // 调用大模型
    const prompt = buildPrompt(pref, text)
    const aiResult = await callQwen(prompt, config)

    // 用 AI 返回的 ID 从菜品库补全详细信息
    const recommendations = (aiResult.recommendations || []).map(r => {
      const dish = LOCAL_DISHES.find(d => d.id === r.id || d.name === r.name) || {}
      return {
        id: dish.id || r.id,
        name: dish.name || r.name,
        price: dish.price || 0,
        canteen: dish.canteen || '',
        window: dish.window || '',
        category: dish.category || '',
        tags: dish.tags || [],
        image: dish.image || '',
        description: dish.description || '',
        rating: dish.rating || 0,
        reason: r.reason || '推荐菜品'
      }
    })

    return {
      code: 0,
      data: {
        recommendations,
        summary: aiResult.summary || 'AI 智能推荐',
        engine: 'ai',
        model: config.model || 'qwen-turbo'
      }
    }
  } catch (e) {
    // 大模型调用失败 → 本地规则兜底
    const recs = localRecommend(pref)
    return {
      code: 0,
      data: {
        recommendations: recs.map(d => ({
          id: d.id, name: d.name, price: d.price,
          canteen: d.canteen, window: d.window, category: d.category,
          tags: d.tags, image: '', description: d.description,
          rating: d.rating, reason: d.description
        })),
        summary: `本地规则推荐（${e.message}）`,
        engine: 'local'
      }
    }
  }
}
