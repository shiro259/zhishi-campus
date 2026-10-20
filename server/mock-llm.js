/**
 * 本地确定性模拟模型（测试替身 / test double）
 *
 * 为什么需要它：实验4 的运行与验收在没有外网与 API 密钥的环境下进行，
 * 但 IF-01 的接口形状、A2 的拦截规则、A3 的降级路径都必须真实可测。
 * 本模块按 IF-01 的输入输出契约生成"形状正确、内容确定"的响应，
 * 并可通过 mode 注入真实模型也会出现的四类故障（超时 / 429 / 越界 / 确定性表述），
 * 用来验证程序侧的护栏，而不是用来伪造推荐效果。
 *
 * 真实模型：ZS_LLM_MODE=real 时改由 server/index.js 转发到 DeepSeek（见 callRealModel）。
 */

const MODES = ['normal', 'timeout', 'rate_limit', 'server_error', 'out_of_set', 'unsafe_text', 'short_list'];

function scoreOf(dish, summary) {
  let score = 0.55;
  const matched = (dish.tasteTags ?? []).filter((t) => (summary.tasteTags ?? []).includes(t));
  score += 0.09 * Math.min(matched.length, 2);
  if (summary.healthGoal === '减脂') {
    if ((dish.tasteTags ?? []).includes('清淡')) score += 0.08;
    if ((dish.tasteTags ?? []).includes('油炸')) score -= 0.08;
  }
  if (typeof dish.price === 'number' && summary.budget) {
    if (dish.price <= summary.budget.max && dish.price >= summary.budget.min) score += 0.06;
    else if (dish.price > summary.budget.max) score -= 0.12;
  }
  if (!dish.ingredients) score -= 0.05;
  return Math.round(Math.min(0.95, Math.max(0.1, score)) * 100) / 100;
}

function reasonOf(dish, summary) {
  const parts = [];
  const matched = (dish.tasteTags ?? []).filter((t) => (summary.tasteTags ?? []).includes(t));
  if (matched.length > 0) parts.push(`口味是你常点的「${matched[0]}」`);
  if (summary.healthGoal === '减脂' && (dish.tasteTags ?? []).includes('清淡')) parts.push('少油清淡，适合减脂期');
  if (typeof dish.price === 'number') parts.push(`${dish.price} 元`);
  if (!dish.ingredients) parts.push('配料信息缺失，建议到窗口核对');
  return parts.join('，') || '和你的口味标签比较接近';
}

export function createMockModel({ mode = 'normal', latencyMs = 0 } = {}) {
  async function complete(payload) {
    const { dishes = [], profileSummary = {}, topN = 3 } = payload ?? {};
    if (latencyMs > 0) await new Promise((r) => setTimeout(r, latencyMs));

    if (mode === 'timeout') {
      await new Promise((r) => setTimeout(r, 30000));
    }
    if (mode === 'rate_limit') {
      const err = new Error('模型服务繁忙或已超出本月预算');
      err.code = 'RATE_LIMIT';
      err.status = 429;
      throw err;
    }
    if (mode === 'server_error') {
      const err = new Error('模型服务内部错误');
      err.code = 'UPSTREAM_ERROR';
      err.status = 500;
      throw err;
    }

    let pool = dishes;
    if (mode === 'out_of_set') {
      // 越界：模型返回了候选集合里不存在的菜品（幻觉菜名）
      pool = [...dishes, { dishId: 'd_hallucinated', name: '黑椒和牛盖饭', price: 38, ingredients: ['和牛'], tasteTags: ['重口'] }];
    }

    const ranked = [...pool]
      .map((d) => ({ d, s: scoreOf(d, profileSummary) }))
      .sort((a, b) => b.s - a.s || String(a.d.dishId).localeCompare(String(b.d.dishId)));

    const limit = mode === 'short_list' ? Math.max(1, Math.min(2, ranked.length)) : topN;
    const items = ranked.slice(0, limit).map(({ d, s }) => ({
      dishId: d.dishId,
      score: s,
      reason: reasonOf(d, profileSummary),
      riskTags: Array.isArray(d.allergenTags) ? d.allergenTags : [],
      noveltyHint: true,
    }));

    if (mode === 'unsafe_text' && items.length > 0) {
      // 危险输出：给出确定性安全结论（NFR-06 的硬门槛必须拦住）
      items[0].reason = '这道菜不含花生，可以放心吃';
      items[0].riskTags = [];
    }

    return {
      items,
      engine: 'ai',
      model: `mock-llm-v1/${mode}`,
      usage: { tokens: 480 + dishes.length * 18 },
    };
  }

  return { complete, mode, isMock: true };
}

export { MODES };
