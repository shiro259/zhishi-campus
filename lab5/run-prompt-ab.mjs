/**
 * 实验5 2.2 Prompt 版本对比（v1 与 v2）
 *
 * 同一模型、同一问题、同一参数下分别用 v1 与 v2 模板调用，对比：
 * 回答长度、结构化校验是否通过、引用原文摘录是否合格、追问是否给出。
 * 用法：node lab5/run-prompt-ab.mjs [--q=Q1,Q3 | --q=all] [--versions=v1,v2]
 */
import path from 'node:path';
import { resolveMode, makeGateway, buildRag, writeJsonl, writeText, mdTable, LOG_DIR, ROOT } from './lib.mjs';
import { QUESTIONS } from './question-set.mjs';

const pick = process.argv.find((a) => a.startsWith('--q='))?.slice(4)?.split(',');
const versions = (process.argv.find((a) => a.startsWith('--versions='))?.slice(11) ?? 'v1,v2').split(',');
const cases = pick
  ? (pick.includes('all') ? QUESTIONS : QUESTIONS.filter((q) => pick.includes(q.id)))
  : QUESTIONS.filter((q) => ['Q1', 'Q3', 'Q4'].includes(q.id));

async function main() {
  const { mode, reason } = resolveMode();
  const gateway = makeGateway({ mode, logName: 'prompt-ab-calls.jsonl' });
  const { rag } = buildRag({ mode, gateway });
  console.log(`模型模式：${mode}（${reason}）· 模板 ${versions.join('/')}\n`);

  const rows = [];
  for (const c of cases) {
    for (const version of versions) {
      const res = await rag.ask({ question: c.question, promptVersion: version });
      const row = {
        questionId: c.id, question: c.question, template: version,
        promptChars: res.promptChars,
        promptEstimateTokens: res.promptEstimateTokens,
        answer: res.answer, answerChars: res.answer.length,
        citations: res.citations, validation: res.validation,
        insufficient: res.insufficient, followup: res.followup,
        latencyMs: res.latencyMs, tokens: res.tokens,
      };
      rows.push(row);
      console.log(`\n── ${c.id} ${version}（${row.promptChars} 字 / 约 ${row.promptEstimateTokens} token）`);
      console.log(`回答（${row.answerChars} 字）：${row.answer}`);
      console.log(`引用 ${row.citations.length} 条 · 校验${row.validation.ok ? '通过' : '未通过：' + row.validation.issues.join('；')}${row.insufficient ? ' · 资料不足' : ''}`);
      console.log(`时延 ${row.latencyMs}ms`);
    }
  }

  writeJsonl(path.join(LOG_DIR, 'prompt-ab.jsonl'), rows);
  const md = mdTable(
    ['问题', '模板', '提示词字符', '回答字数', '引用数', '引用合格', '校验', '时延(ms)'],
    rows.map((r) => [
      r.questionId, r.template, r.promptChars, r.answerChars, r.citations.length,
      r.citations.length ? r.citations.every((c) => c.quote) ? '是' : '否' : '—',
      r.validation.ok ? '通过' : r.validation.issues.slice(0, 1).join(''), r.latencyMs,
    ]),
  );
  writeText(path.join(LOG_DIR, 'prompt-ab.md'), md);
  console.log(`\n${md}`);
  console.log(`\n已写入 ${path.relative(ROOT, path.join(LOG_DIR, 'prompt-ab.jsonl'))}`);
}

main().catch((err) => {
  console.error('运行失败：', err.message);
  process.exit(1);
});
