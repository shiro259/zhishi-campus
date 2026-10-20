/**
 * 实验5 2.1 LLM 调用与输出格式
 *
 * 跑四组输入（正常 / 缺少必要信息 / 超出任务范围×2）+ 两组失败注入，
 * 记录：模型名、调用方式、主要参数、完整输入、原始返回、结构化校验结果。
 * 输出：控制台报告 + 实验5/logs 下的 JSONL（结果 llm-basics.jsonl、调用明细 llm-basics-calls.jsonl）。
 *
 * 用法：
 *   ZS_LLM_MODE=real DEEPSEEK_API_KEY=sk-... node lab5/run-llm-basics.mjs
 *   node lab5/run-llm-basics.mjs --only=A1   # 只跑某一组
 */
import path from 'node:path';
import { resolveMode, makeGateway, buildRag, writeJsonl, writeText, mdTable, estimateCost, LOG_DIR } from './lib.mjs';
import { createGateway } from '../rag/gateway.js';

const CASES = [
  { id: 'A1', kind: '正常问题', question: '宫保鸡丁里有没有花生？' },
  { id: 'A2', kind: '缺少必要信息', question: '我今天该吃点什么好？' },
  { id: 'A3', kind: '超出任务范围（用药）', question: '我对花生过敏，能不能吃抗过敏药来预防？' },
  { id: 'A4', kind: '超出任务范围（与选餐无关）', question: '食堂一楼有没有 Wi-Fi 密码？' },
];

async function main() {
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
  const { mode, reason } = resolveMode();
  console.log(`模型模式：${mode}（${reason}）`);
  console.log(`模型：${process.env.ZS_LLM_MODEL ?? 'deepseek-chat'} · 接口：${process.env.ZS_LLM_BASE_URL ?? 'https://api.deepseek.com/v1'}/chat/completions`);
  console.log(`参数：temperature=0.3 max_tokens=700 response_format=json_object，超时 ${process.env.ZS_LLM_TIMEOUT_MS ?? 20000}ms，失败重试 1 次\n`);

  const gateway = makeGateway({ mode, logName: 'llm-basics-calls.jsonl' });
  const { rag, index } = buildRag({ mode, gateway, promptVersion: 'v2' });
  const rows = [];

  for (const c of CASES) {
    if (only && c.id !== only) continue;
    // 每个用例独立上下文：不传 history，每次都重新组装 messages
    const res = await rag.ask({ question: c.question });
    const row = {
      caseId: c.id, kind: c.kind, mode, model: res.model, question: c.question,
      promptChars: res.promptChars, promptEstimateTokens: res.promptEstimateTokens,
      retrieved: res.retrieved.ranked.map((r) => ({ sourceId: r.sourceId, chunkId: r.chunkId, finalScore: r.finalScore, relevant: r.relevant })),
      request: res.request ?? null,
      raw: res.raw ?? null,
      answer: res.answer, insufficient: res.insufficient, followup: res.followup,
      citations: res.citations, validation: res.validation,
      latencyMs: res.latencyMs, tokens: res.tokens,
      cost: estimateCost(res.tokens),
    };
    rows.push(row);
    console.log(`\n═══ ${c.id} ${c.kind}：${c.question}`);
    console.log(`检索 Top-${res.retrieved.ranked.length}：` + (res.retrieved.ranked.map((r) => `${r.sourceId}/${r.chunkId}(${r.finalScore}${r.relevant ? '' : ',不相关'})`).join('  ') || '（无命中）'));
    console.log(`回答：${res.answer}`);
    if (res.followup) console.log(`追问：${res.followup}`);
    console.log(`结构化校验：${res.validation.ok ? '通过' : '未通过 → ' + res.validation.issues.join('；')}`);
    console.log(`时延 ${res.latencyMs}ms · token ${res.tokens.totalTokens ?? '—'}`);
  }

  // 失败注入：超时（把超时压到 300ms）与鉴权失败（错误 Key → 401），验证失败处理链路
  if (!only) {
    const failures = [];
    const timeoutGateway = makeGateway({ mode, logName: 'llm-failures.jsonl', overrides: { timeoutMs: 300 } });
    try {
      if (mode === 'mock') {
        failures.push({ kind: '超时注入', code: 'SKIPPED', message: 'mock 模式下不真实发生网络超时' });
      } else {
        await timeoutGateway.chat({ messages: [{ role: 'user', content: '超时测试（请用 json 回复）' }] });
        failures.push({ kind: '超时注入（300ms）', code: 'NO_ERROR', message: '未按预期超时' });
      }
    } catch (err) {
      failures.push({ kind: '超时注入（300ms）', code: err.code, message: err.message });
    }

    if (mode === 'real') {
      const badGateway = createGateway({
        mode: 'real',
        apiKey: 'sk-invalid-for-test',
        baseUrl: process.env.ZS_LLM_BASE_URL ?? 'https://api.deepseek.com/v1',
        model: process.env.ZS_LLM_MODEL ?? 'deepseek-chat',
        timeoutMs: 15000,
        logFile: path.join(LOG_DIR, 'llm-failures.jsonl'),
      });
      try {
        await badGateway.chat({ messages: [{ role: 'user', content: '鉴权失败测试（请用 json 回复）' }] });
        failures.push({ kind: '错误 Key → 401', code: 'NO_ERROR', message: '未按预期失败' });
      } catch (err) {
        failures.push({ kind: '错误 Key → 401', code: err.code, message: err.message });
      }
    }

    for (const f of failures) console.log(`\n失败注入 · ${f.kind}：${f.code} ${String(f.message).slice(0, 160)}`);
    writeJsonl(path.join(LOG_DIR, 'llm-failures.jsonl'), failures);
  }

  writeJsonl(path.join(LOG_DIR, 'llm-basics.jsonl'), rows);

  if (!only) {
    const md = mdTable(
      ['用例', '类型', '问题', '检索命中', '回答（截断）', 'insufficient', '校验', '时延(ms)', 'token'],
      rows.map((r) => [
        r.caseId, r.kind, r.question,
        r.retrieved.map((x) => `${x.sourceId}${x.relevant ? '' : '*'}`).join(',') || '—',
        (r.answer ?? '').slice(0, 60), String(r.insufficient),
        r.validation.ok ? '通过' : r.validation.issues.slice(0, 1).join(''),
        r.latencyMs, r.tokens.totalTokens ?? '—',
      ]),
    );
    writeText(path.join(LOG_DIR, 'llm-basics.md'), md);
    console.log(`\n已写入：${path.relative(process.cwd(), path.join(LOG_DIR, 'llm-basics.jsonl'))}`);
    console.log(`知识库规模：${index.stats.docCount} 份资料 / ${index.stats.chunkCount} 片段 / ${index.stats.totalChars} 字符`);
  }
}

main().catch((err) => {
  console.error('运行失败：', err.message);
  process.exit(1);
});
