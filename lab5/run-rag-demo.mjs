/**
 * 实验5 2.4 检索与 RAG 最小链路演示
 *
 * 场景一：正常问题 —— 展示 Top-k 排序、排序依据（BM25/余弦/最终分）、实际上下文、最终回答与引用核对；
 * 场景二：无相关资料 —— 展示"资料不足"分支（不发模型请求）。
 * 全部记录（检索片段、上下文、回答）落盘，供报告引用。
 * 用法：ZS_LLM_MODE=real DEEPSEEK_API_KEY=... node lab5/run-rag-demo.mjs
 */
import path from 'node:path';
import { resolveMode, makeGateway, buildRag, writeText, writeJsonl, mdTable, LOG_DIR, ROOT } from './lib.mjs';
import { renderContext } from '../rag/prompt.js';

const QUESTIONS = [
  { id: 'D1', kind: '正常问题', question: '宫保鸡丁里有没有花生？' },
  { id: 'D2', kind: '无相关资料', question: '今天操场的天气怎么样？' },
];

async function main() {
  const { mode, reason } = resolveMode();
  const gateway = makeGateway({ mode, logName: 'rag-demo-calls.jsonl' });
  const { index, retriever, rag } = buildRag({ mode, gateway, promptVersion: 'v2' });
  console.log(`模型模式：${mode}（${reason}）· 知识库 ${index.stats.docCount} 份 / ${index.stats.chunkCount} 片段\n`);

  const records = [];
  for (const q of QUESTIONS) {
    const res = await rag.ask({ question: q.question, topK: 4 });
    const context = renderContext(res.retrieved.relevant);

    console.log(`\n════════ ${q.id} ${q.kind}：${q.question}`);
    console.log(`\n检索排序（k=${res.retrieved.topK}，阈值 ${res.retrieved.threshold}，查询词 ${res.retrieved.queryTerms.length} 个）：`);
    console.log(mdTable(
      ['来源', '片段', '文档', '小节', 'BM25', '余弦', '最终分', '相关', '命中词'],
      res.retrieved.ranked.map((r) => [
        r.sourceId, r.chunkId, r.title, r.section, r.bm25, r.cosine, r.finalScore, r.relevant ? '是' : '否', r.hitTerms.slice(0, 4).join(' '),
      ]),
    ));
    console.log(`\n实际上下文（${context.length} 字）：\n${context || '（空）'}`);
    console.log(`\n回答：${res.answer}`);
    if (res.followup) console.log(`追问：${res.followup}`);
    console.log(`\n引用核对：${res.validation.ok ? '通过' : '未通过 → ' + res.validation.issues.join('；')}`);
    for (const c of res.citations) console.log(`  [${c.id}] → ${c.chunk}「${c.quote}」`);
    console.log(`时延 ${res.latencyMs}ms · token ${res.tokens.totalTokens ?? '—'} · insufficient=${res.insufficient}`);

    records.push({
      caseId: q.id, kind: q.kind, mode, question: q.question,
      topK: res.retrieved.topK, threshold: res.retrieved.threshold,
      ranked: res.retrieved.ranked, queryTerms: res.retrieved.queryTerms,
      context, contextChars: context.length,
      answer: res.answer, followup: res.followup, citations: res.citations,
      validation: res.validation, latencyMs: res.latencyMs, tokens: res.tokens, insufficient: res.insufficient,
    });
  }

  writeJsonl(path.join(LOG_DIR, 'rag-demo.jsonl'), records);
  writeText(path.join(LOG_DIR, 'rag-demo.md'), records.map((r) => `## ${r.caseId} ${r.kind}\n\n问题：${r.question}\n\n上下文（${r.contextChars} 字）：\n\n\`\`\`text\n${r.context}\n\`\`\`\n\n回答：${r.answer}\n`).join('\n'));
  console.log(`\n已写入 ${path.relative(ROOT, path.join(LOG_DIR, 'rag-demo.jsonl'))}`);
  console.log(`检索器统计：${JSON.stringify(retriever.stats)}`);
}

main().catch((err) => {
  console.error('运行失败：', err.message);
  process.exit(1);
});
