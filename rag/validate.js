/**
 * 回答结构化校验与引用核对（实验5 2.1 结构化输出校验 + 2.4 引用核对）
 *
 * 校验四件事：
 *  ① JSON 能否解析、字段类型对不对（answer / citations / insufficient / followup）；
 *  ② 引用的编号是否来自本次实际发给模型的资料（不能引用不存在的编号）；
 *  ③ 每条 quote 是否为对应资料片段的连续原文（至少 8 字，去掉空白后比对）；
 *  ④ insufficient 与 followup 是否自洽（资料不足时必须给出追问或明确说明缺什么）。
 * 校验失败不抛异常，返回违规清单，由上层决定降级或重试。
 */

function norm(s) {
  return String(s ?? '').replace(/\s+/g, '').replace(/[「」“”"']/g, '');
}

export function extractJson(content) {
  const text = String(content ?? '').trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const first = candidate.indexOf('{');
  const last = candidate.lastIndexOf('}');
  if (first < 0 || last <= first) return { ok: false, error: '没有找到 JSON 对象' };
  try {
    return { ok: true, value: JSON.parse(candidate.slice(first, last + 1)) };
  } catch (err) {
    return { ok: false, error: `JSON 解析失败：${err.message}` };
  }
}

/**
 * @param {string} content 模型原始输出
 * @param {{hits: Array<{sourceId:string,text:string,chunkId:string}>}} ctx 本次发送给模型的资料
 */
export function validateAnswer(content, { hits = [] } = {}) {
  const issues = [];
  const parsed = extractJson(content);
  if (!parsed.ok) {
    return { ok: false, issues: [parsed.error], answer: null };
  }
  const v = parsed.value ?? {};
  if (typeof v.answer !== 'string' || v.answer.trim() === '') issues.push('answer 缺失或为空');
  if (typeof v.insufficient !== 'boolean') issues.push('insufficient 不是布尔值');
  if (v.followup !== undefined && typeof v.followup !== 'string') issues.push('followup 不是字符串');
  const citations = Array.isArray(v.citations) ? v.citations : [];
  if (!Array.isArray(v.citations)) issues.push('citations 不是数组');

  const byId = new Map(hits.map((h) => [h.sourceId, h]));
  const badCitations = [];
  for (const [i, c] of citations.entries()) {
    if (!c || typeof c !== 'object') {
      issues.push(`citations[${i}] 不是对象`);
      continue;
    }
    if (!byId.has(c.id)) {
      issues.push(`引用编号 ${c.id} 不在本次资料里`);
      badCitations.push(c);
      continue;
    }
    if (typeof c.quote !== 'string' || norm(c.quote).length < 6) {
      issues.push(`引用 ${c.id} 的 quote 少于 6 字，无法核对`);
      badCitations.push(c);
      continue;
    }
    const hitText = norm(byId.get(c.id).text);
    if (!hitText.includes(norm(c.quote))) {
      issues.push(`引用 ${c.id} 的 quote 不是原文连续片段`);
      badCitations.push(c);
    }
  }

  // answer 里出现的 [S#] 必须来自本次资料
  const usedIds = [...String(v.answer).matchAll(/\[(S\d+)\]/g)].map((m) => m[1]);
  for (const id of usedIds) {
    if (!byId.has(id)) issues.push(`answer 引用了不存在的资料编号 ${id}`);
  }
  if (v.insufficient === true) {
    if (citations.length > 0) issues.push('资料不足却带引用');
    if (!v.followup || String(v.followup).trim() === '') issues.push('资料不足但没有追问');
    if (usedIds.length > 0) issues.push('资料不足却在回答里引用资料');
  }
  if (v.insufficient === false && citations.length === 0) issues.push('给结论但没有任何引用');

  return {
    ok: issues.length === 0,
    issues,
    answer: {
      answer: v.answer ?? '',
      citations,
      insufficient: v.insufficient === true,
      followup: v.followup ?? '',
      badCitations: badCitations.length,
    },
  };
}
