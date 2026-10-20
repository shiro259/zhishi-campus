/**
 * 程序侧边界护栏（实验5 2.1/2.4 的"超出任务范围"处理）
 *
 * 说明：与实验4 的 A2 校验同一思路——能由确定性规则拦住的，就不交给模型。
 * 这里只拦两类：①问题为空或过长；②明显超出"校园食堂选餐"范围的问题（医疗、用药、诊断）。
 * 拦下后不发模型请求，直接返回固定提示，费用与时延都可控。
 */

const OUT_OF_SCOPE = [
  { label: '用药与药物', patterns: [/吃.{0,4}药/, /用药/, /服药/, /药物/, /头孢/, /抗生素/, /氯雷他定/, /西替利嗪/, /扑尔敏/, /止痛药/, /退烧药/, /消炎药/, /激素/] },
  { label: '疾病诊断与治疗', patterns: [/诊断/, /确诊/, /治疗/, /症状/, /发炎/, /感染/, /发烧/, /腹泻/, /胃病/, /肠胃炎/, /怎么治/] },
  { label: '就医与保健', patterns: [/去医院/, /看医生/, /校医院/, /急诊/, /体检报告/, /保健品/] },
  { label: '减肥产品', patterns: [/减肥药/, /代餐粉/, /瘦身/, /抽脂/] },
];

const MAX_QUESTION_CHARS = 300;

/**
 * @returns {{intent:'ok'|'empty'|'too_long'|'out_of_scope', reason:string, rule?:string}}
 */
export function guardQuestion(question) {
  const q = String(question ?? '').trim();
  if (q === '') return { intent: 'empty', reason: '问题为空' };
  if (q.length > MAX_QUESTION_CHARS) {
    return { intent: 'too_long', reason: `问题超过 ${MAX_QUESTION_CHARS} 字，请拆短一点再问` };
  }
  for (const { label, patterns } of OUT_OF_SCOPE) {
    const hit = patterns.find((p) => p.test(q));
    if (hit) {
      return {
        intent: 'out_of_scope',
        reason: `命中「${label}」规则（${hit}）`,
        rule: label,
      };
    }
  }
  return { intent: 'ok', reason: '在选餐范围内' };
}

/** 被护栏拦下时的固定回复（不编造、不发模型） */
export function guardedReply(guard) {
  if (guard.intent === 'empty') {
    return { answer: '', followup: '请输入你的问题。', insufficient: true };
  }
  if (guard.intent === 'too_long') {
    return { answer: guard.reason, followup: '可以只问一道菜或者一个方面。', insufficient: true };
  }
  return {
    answer: `这个问题超出选餐助手的处理范围（${guard.rule}），我无法给用药或就医建议。`,
    followup: '你可以问我某道菜的配料、热量估算、预算搭配或忌口提示；健康与用药问题建议咨询校医院或医生。',
    insufficient: true,
  };
}
