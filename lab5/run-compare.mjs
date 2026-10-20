/**
 * 实验5 2.5 对比测试：直接模型组 vs RAG 组
 *
 * 同一套 7 个固定问题、同一模型、同一参数（temperature 0.3 / max_tokens 700 / JSON 输出），
 * 唯一差异是 RAG 组多了检索资料与"依据资料回答、引用来源"的要求。
 * 每次调用都是独立上下文（不传 history，每次重新组装 messages）。
 * 输出：JSONL + Markdown 表格 + 汇总（规则命中数、时延、token、费用估算）。
 * 用法：ZS_LLM_MODE=real DEEPSEEK_API_KEY=... node lab5/run-compare.mjs [--q=Q1,Q2]
 */
import path from 'node:path';
import { resolveMode, makeGateway, buildRag, directAsk, writeJsonl, writeText, mdTable, estimateCost, LOG_DIR, ROOT } from './lib.mjs';
import { QUESTIONS } from './question-set.mjs';

const pick = process.argv.find((a) => a.startsWith('--q='))?.slice(4)?.split(',');
const cases = pick ? QUESTIONS.filter((q) => pick.includes(q.id)) : QUESTIONS;

async function main() {
  const { mode, reason } = resolveMode();
  const gateway = makeGateway({ mode, logName: 'compare-calls.jsonl' });
  const { rag } = buildRag({ mode, gateway, promptVersion: 'v2' });
  console.log(`模型模式：${mode}（${reason}）· ${cases.length} 个问题 × 2 组 = ${cases.length * 2} 次独立调用\n`);

  const rows = [];
  for (const c of cases) {
    const direct = await directAsk(gateway, c.question);
    const ragRes = await rag.ask({ question: c.question });
    const judge = (r) => {
      const check = c.check({ answer: r.answer, insufficient: r.insufficient, followup: r.followup });
      return { ...check, citationsOk: r.validation.ok };
    };
    const row = {
      questionId: c.id, type: c.type, question: c.question,
      direct: {
        answer: direct.answer, insufficient: direct.insufficient, followup: direct.followup,
        latencyMs: direct.latencyMs, tokens: direct.tokens, cost: estimateCost(direct.tokens),
        autoCheck: judge(direct), validation: direct.validation,
      },
      rag: {
        answer: ragRes.answer, insufficient: ragRes.insufficient, followup: ragRes.followup,
        citations: ragRes.citations, sources: ragRes.sources,
        latencyMs: ragRes.latencyMs, tokens: ragRes.tokens, cost: estimateCost(ragRes.tokens),
        autoCheck: judge(ragRes), validation: ragRes.validation,
        retrieved: ragRes.retrieved.ranked.map((r) => ({ sourceId: r.sourceId, chunkId: r.chunkId, finalScore: r.finalScore, relevant: r.relevant })),
      },
    };
    rows.push(row);
    console.log(`\n══ ${c.id} ${c.type}：${c.question}`);
    console.log(`  直接组：${row.direct.autoCheck.pass ? '规则通过' : '规则未通过'}（${row.direct.autoCheck.note}）· ${row.direct.latencyMs}ms · token ${row.direct.tokens.totalTokens ?? '—'}`);
    console.log(`    答：${row.direct.answer}`);
    console.log(`  RAG 组：${row.rag.autoCheck.pass ? '规则通过' : '规则未通过'}（${row.rag.autoCheck.note}）· 引用 ${row.rag.citations.length} 条 · ${row.rag.latencyMs}ms · token ${row.rag.tokens.totalTokens ?? '—'}`);
    console.log(`    答：${row.rag.answer}`);
  }

  const passDirect = rows.filter((r) => r.direct.autoCheck.pass).length;
  const passRag = rows.filter((r) => r.rag.autoCheck.pass).length;
  const sumLatency = (grp) => rows.reduce((s, r) => s + (r[grp].latencyMs ?? 0), 0);
  const sumTokens = (grp) => rows.reduce((s, r) => s + (r[grp].tokens?.totalTokens ?? 0), 0);
  const summary = {
    mode, questionCount: rows.length, passDirect, passRag,
    directLatency: sumLatency('direct'), ragLatency: sumLatency('rag'),
    directTokens: sumTokens('direct'), ragTokens: sumTokens('rag'),
    directCost: rows.reduce((s, r) => s + r.direct.cost.total, 0),
    ragCost: rows.reduce((s, r) => s + r.rag.cost.total, 0),
  };

  writeJsonl(path.join(LOG_DIR, 'compare.jsonl'), rows);
  const md = [
    '## 对比测试（直接模型组 vs RAG 组）',
    '',
    mdTable(
      ['问题', '类型', '组', '自动规则', '答案（截断）', '引用', 'insufficient', '时延(ms)', 'token'],
      rows.flatMap((r) => [
        [r.questionId, r.type, '直接组', r.direct.autoCheck.pass ? '通过' : '未通过', r.direct.answer.slice(0, 46), '—', String(r.direct.insufficient), r.direct.latencyMs, r.direct.tokens.totalTokens ?? '—'],
        [r.questionId, r.type, 'RAG组', r.rag.autoCheck.pass ? '通过' : '未通过', r.rag.answer.slice(0, 46), String(r.rag.citations.length), String(r.rag.insufficient), r.rag.latencyMs, r.rag.tokens.totalTokens ?? '—'],
      ]),
    ),
    '',
    `规则命中：直接组 ${passDirect}/${rows.length}，RAG 组 ${passRag}/${rows.length}`,
    `总时延：直接组 ${summary.directLatency}ms，RAG 组 ${summary.ragLatency}ms`,
    `总 token：直接组 ${summary.directTokens}，RAG 组 ${summary.ragTokens}`,
    `费用估算（按 ¥2/1M 输入、¥8/1M 输出估算）：直接组 ¥${summary.directCost.toFixed(5)}，RAG 组 ¥${summary.ragCost.toFixed(5)}`,
  ].join('\n');
  writeText(path.join(LOG_DIR, 'compare.md'), md);
  console.log(`\n${md}`);
  console.log(`\n已写入 ${path.relative(ROOT, path.join(LOG_DIR, 'compare.jsonl'))}`);
}

main().catch((err) => {
  console.error('运行失败：', err.message);
  process.exit(1);
});
