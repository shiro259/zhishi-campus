/**
 * D2 领域对象与校验（实验3 表3-7 的六个对象）
 * 职责：定义 UserProfile / MenuDay / Dish / Recommendation / MealRecord / Feedback 的结构与字段校验。
 */

let seq = 0;
export function newId(prefix) {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36)}`;
}

export const TASTE_TAGS = ['清淡', '微辣', '辣', '重口', '酸甜', '油炸', '汤面', '米饭', '面食'];
export const HEALTH_GOALS = ['减脂', '增肌', '控糖', '无特殊目标'];

function isString(v) {
  return typeof v === 'string';
}

/** UserProfile：忌口可为空（首次设置允许跳过，NFR-08） */
export function validateProfile(input = {}) {
  const errors = [];
  const tasteTags = Array.isArray(input.tasteTags) ? input.tasteTags.filter(isString) : [];
  const avoidList = Array.isArray(input.avoidList) ? input.avoidList.filter(isString) : [];
  const goal = input.healthGoal ?? '无特殊目标';
  if (!HEALTH_GOALS.includes(goal)) errors.push(`健康目标取值非法：${goal}`);

  const budget = input.budget ?? {};
  const min = Number(budget.min);
  const max = Number(budget.max);
  if (Number.isNaN(min) || min < 0) errors.push('预算下限必须是不小于 0 的数字');
  if (Number.isNaN(max) || max < min) errors.push('预算上限必须不小于下限');

  return {
    ok: errors.length === 0,
    errors,
    value: {
      profileId: input.profileId ?? newId('p'),
      tasteTags,
      avoidList,
      healthGoal: goal,
      budget: { min: Number.isNaN(min) ? 0 : min, max: Number.isNaN(max) ? 0 : max },
      updatedAt: input.updatedAt ?? new Date().toISOString(),
    },
  };
}

/** Dish：ingredients 为空即 infoComplete=false，禁止推断补全（FR-02、V2） */
export function validateDish(input = {}) {
  const errors = [];
  if (!isString(input.name) || input.name.trim().length === 0) errors.push('菜名不能为空');
  if (input.name && input.name.length > 20) errors.push('菜名过长（>20 字）');
  if (input.price != null && (typeof input.price !== 'number' || input.price < 0)) {
    errors.push('价格必须是不小于 0 的数字或留空');
  }
  return { ok: errors.length === 0, errors };
}

export function makeDish(input) {
  return {
    dishId: input.dishId ?? newId('d'),
    menuId: input.menuId,
    name: input.name,
    price: input.price ?? null,
    ingredients: Array.isArray(input.ingredients) ? input.ingredients : null,
    allergenTags: Array.isArray(input.allergenTags) ? input.allergenTags : [],
    tasteTags: Array.isArray(input.tasteTags) ? input.tasteTags : [],
    infoComplete: input.ingredients != null && input.ingredients.length > 0,
    updatedAt: new Date().toISOString(),
  };
}

export function validateRecord(input = {}) {
  const errors = [];
  if (!isString(input.dishId) || input.dishId.length === 0) errors.push('记录必须关联菜品');
  if (!isString(input.date) || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    errors.push('日期格式必须为 YYYY-MM-DD');
  }
  return { ok: errors.length === 0, errors };
}

export function validateFeedback(input = {}) {
  const errors = [];
  if (!isString(input.recordId)) errors.push('反馈必须关联一条就餐记录');
  if (!['MATCH', 'MISMATCH'].includes(input.result)) errors.push('反馈结果只能是 MATCH 或 MISMATCH');
  return { ok: errors.length === 0, errors };
}

/** 推荐结果的结构契约（与实验3 IF-01 输出一致） */
export function validateRecommendationShape(items) {
  const errors = [];
  if (!Array.isArray(items)) return { ok: false, errors: ['items 必须是数组'] };
  items.forEach((it, i) => {
    if (!isString(it?.dishId) || it.dishId.length === 0) errors.push(`第 ${i + 1} 条缺少 dishId`);
    if (typeof it?.score !== 'number' || Number.isNaN(it.score)) errors.push(`第 ${i + 1} 条 score 非数字`);
    if (!isString(it?.reason) || it.reason.trim().length === 0) errors.push(`第 ${i + 1} 条缺少理由`);
  });
  return { ok: errors.length === 0, errors };
}

/** 日期工具：本地时区的 YYYY-MM-DD */
export function toDateString(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
