'use strict';
/**
 * AI 推荐云函数（直连大模型）
 * 作为 Python 后端的备用方案，可直接在云端调用大模型
 */
exports.main = async (event, context) => {
  const { dishes, userPref } = event;

  if (!dishes || dishes.length === 0) {
    return { code: -1, message: '暂无候选菜品' };
  }

  // 构建 Prompt
  const taste = (userPref.taste || []).join('、') || '无特殊偏好';
  const allergies = (userPref.allergies || []).join('、') || '无';
  const budget = userPref.budget ? `${userPref.budget}元以内` : '不限';

  const prompt = `你是「食遇校园」食堂AI推荐助手。请根据同学需求从菜品中推荐3-5道。

【同学需求】口味：${taste}；忌口：${allergies}；预算：${budget}；用餐：${userPref.meal_type || '午餐'}

【菜品列表】
${JSON.stringify(dishes)}

请输出JSON：{"recommendations":[{"dish_id":"","reason":"","match_score":90}],"summary":""}`;

  try {
    // 调用大模型 API（以 DeepSeek 为例）
    const res = await uniCloud.httpclient.request(
      process.env.AI_BASE_URL || 'https://api.deepseek.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.AI_API_KEY || ''}`,
          'Content-Type': 'application/json'
        },
        data: {
          model: process.env.AI_MODEL || 'deepseek-chat',
          messages: [
            { role: 'system', content: '你是校园食堂美食推荐专家。' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 1024
        },
        dataType: 'json',
        timeout: 30000
      }
    );

    const content = res.data?.choices?.[0]?.message?.content;
    if (content) {
      // 解析 JSON
      let result;
      try {
        result = JSON.parse(content.replace(/```json|```/g, '').trim());
      } catch (e) {
        return { code: 0, message: '解析失败，使用兜底推荐', data: fallbackRecommend(dishes, userPref) };
      }
      return { code: 0, message: 'success', data: result };
    }
    return { code: -1, message: 'AI 响应为空' };
  } catch (e) {
    return { code: 0, message: 'AI 调用失败，使用兜底推荐', data: fallbackRecommend(dishes, userPref) };
  }
};

function fallbackRecommend(dishes, userPref) {
  const tasteSet = new Set(userPref.taste || []);
  const allergySet = new Set(userPref.allergies || []);
  const filtered = dishes.filter(d => !(d.tags || []).some(t => allergySet.has(t)));
  const scored = filtered.map(d => {
    let score = 60;
    if ((d.tags || []).some(t => tasteSet.has(t))) score += 20;
    score += Math.min((d.rating || 0) * 4, 20);
    if (userPref.budget && d.price <= userPref.budget) score += 5;
    return { ...d, match_score: Math.min(score, 100), reason: `${d.name}，评分${d.rating || 0}分，广受好评` };
  });
  scored.sort((a, b) => b.match_score - a.match_score);
  return { recommendations: scored.slice(0, 5), summary: `为你精选了${Math.min(5, scored.length)}道菜品` };
}
