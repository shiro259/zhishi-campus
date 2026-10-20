/**
 * A2 结构化校验与安全拦截（实验3 表3-5；IF-05、NFR-06、ADR-004）
 * 目标：程序侧拦住"越界菜名、缺字段、确定性安全表述"三类问题，
 * 校验失败不抛异常，而是返回违规清单，由 M3 决定是否丢弃 AI 结果。
 */
import { validateRecommendationShape } from './d2-schema.js';

export function validateAiOutput(output, ctx = {}) {
  const errors = [];
  const violations = [];

  const shape = validateRecommendationShape(output?.items);
  if (!shape.ok) {
    errors.push(...shape.errors);
    violations.push({ type: 'SCHEMA', detail: shape.errors.join('；') });
  }

  return { ok: errors.length === 0, errors, violations };
}
