/**
 * 本地口味标签表（确定性规则，NFR-06 要求"配料未知不得补全"，标签只做粗分类并可人工修正）
 * 设计依据：M2 只按文本行解析，不猜菜名、不补配料；口味标签用于规则排序（M4）与 AI 的输入摘要。
 */
export const TASTE_LEXICON = [
  { tags: ['清淡'], keywords: ['清炒', '时蔬', '西兰花', '粥', '蒸', '白灼', '汤'] },
  { tags: ['微辣'], keywords: ['微辣', '香辣', '小炒'] },
  { tags: ['辣'], keywords: ['辣', '麻辣', '水煮', '香锅', '花椒', '宫保'] },
  { tags: ['油炸'], keywords: ['炸', '酥', '油焖', '油爆'] },
  { tags: ['重口'], keywords: ['红烧', '酱', '卤', '干锅', '麻婆'] },
  { tags: ['酸甜'], keywords: ['糖醋', '番茄', '酸甜'] },
  { tags: ['米饭'], keywords: ['饭', '盖饭', '套餐'] },
  { tags: ['面食', '汤面'], keywords: ['面', '粉', '粥'] },
];

/** 常见致敏食材关键词：只用于"可能含有"提示，不用于安全判定（ADR-008） */
export const ALLERGEN_KEYWORDS = ['花生', '虾', '蟹', '贝', '鱼', '鸡蛋', '牛奶', '大豆', '芝麻', '坚果', '麸质', '蟹棒'];

export function inferTasteTags(name, ingredients) {
  const text = [name, ...(ingredients ?? [])].join('');
  const tags = new Set();
  for (const { tags: t, keywords } of TASTE_LEXICON) {
    if (keywords.some((k) => text.includes(k))) t.forEach((x) => tags.add(x));
  }
  return [...tags];
}

export function inferAllergenTags(ingredients) {
  if (!Array.isArray(ingredients)) return [];
  const text = ingredients.join('');
  return ALLERGEN_KEYWORDS.filter((k) => text.includes(k)).map((k) => `可能含${k}`);
}
