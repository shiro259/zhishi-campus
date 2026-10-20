/**
 * M4 规则推荐（降级路径，实验3 表3-5；依据 R5 / ADR-005 / NFR-03）
 * 规则明确、结果可复现：忌口只标记不剔除 → 口味匹配 + 预算过滤 → 负反馈降权
 * → 近 7 天吃过降权 → 信息缺失保守降权。
 */
const DAY_MS = 24 * 60 * 60 * 1000;

function round2(n) {
  return Math.round(n * 100) / 100;
}

function withinDays(dateStr, days, now) {
  const t = Date.parse(`${dateStr}T00:00:00`);
  if (Number.isNaN(t)) return false;
  return now - t < days * DAY_MS;
}

export function createRules({ now = () => Date.now() } = {}) {
  /**
   * @param {object} profile 画像
   * @param {Array} dishes 候选菜品（必须已在候选集合内）
   * @param {object} weights 由反馈累计的口味权重 { mismatchTasteTags: {辣: 1}, version }
   * @param {object} ctx { records, topN }
   */
  function rank(profile, dishes, weights = {}, ctx = {}) {
    const records = ctx.records ?? [];
    const topN = ctx.topN ?? 3;
    const mismatch = weights.mismatchTasteTags ?? {};
    const recentlyEaten = new Set(records.filter((r) => withinDays(r.date, 7, now())).map((r) => r.dishId));

    const items = dishes.map((d) => {
      let score = 0.5;
      const notes = [];
      const tasteTags = d.tasteTags ?? [];

      const matched = tasteTags.filter((t) => (profile?.tasteTags ?? []).includes(t));
      if (matched.length > 0) {
        score += 0.15 * Math.min(matched.length, 2);
        notes.push(`口味接近你偏好的「${matched[0]}」`);
      }

      if (profile?.healthGoal === '减脂') {
        if (tasteTags.includes('清淡')) {
          score += 0.12;
          notes.push('清淡少油，符合减脂目标');
        }
        if (tasteTags.includes('油炸')) {
          score -= 0.12;
          notes.push('偏油，减脂期建议少点');
        }
      }

      if (typeof d.price === 'number' && profile?.budget) {
        if (d.price <= profile.budget.max && d.price >= profile.budget.min) {
          score += 0.08;
          notes.push(`价格 ${d.price} 元在预算内`);
        } else if (d.price > profile.budget.max) {
          score -= 0.2;
          notes.push(`超出预算（${d.price} 元）`);
        }
      }

      const badTaste = tasteTags.filter((t) => mismatch[t]);
      if (badTaste.length > 0) {
        score -= 0.25;
        notes.push('你上次反馈不喜欢同类口味，已降低排序');
      }

      if (recentlyEaten.has(d.dishId)) {
        score -= 0.15;
        notes.push('最近 7 天吃过');
      }

      if (!d.infoComplete) {
        score -= 0.1;
        notes.push('配料信息未知，建议到窗口核对');
      }

      return {
        dishId: d.dishId,
        score: round2(Math.min(0.99, Math.max(0.05, score))),
        reason: notes.join('；') || '按口味标签与预算排序的结果',
        noveltyHint: !recentlyEaten.has(d.dishId),
      };
    });

    // 同分时按 dishId 排序，保证结果可复现（规则路径的核心要求）
    items.sort((a, b) => b.score - a.score || String(a.dishId).localeCompare(String(b.dishId)));
    return items.slice(0, topN);
  }

  return { rank };
}
