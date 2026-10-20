/**
 * 生成实验5 图5-1 / 图5-2 / 图5-3 用的真实数据快照（docs/report/figures5/fig-data.json）
 *
 * 不是手写数据：全部取自真实运行的落盘记录
 *   - 实验5/logs/compare.jsonl   直接模型组 vs RAG 组 7 题对比（Q1 / Q5 / Q7 的 rag 组）
 *   - 实验5/logs/rag-demo.jsonl  检索与 RAG 演示（D1 正常问题：Top-k 排序 + 上下文）
 *   - rag/index/chunks.json      知识库索引的 stats（docCount / chunkCount / totalChars / avgChunkChars）
 *
 * 用法（仓库根 zhishi-campus/ 下）：node lab5/build-fig5-data.mjs
 * 产物：docs/report/figures5/fig-data.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));            // zhishi-campus/lab5
const PROJECT = path.resolve(HERE, '..');                             // zhishi-campus
const WORKSPACE = path.resolve(PROJECT, '..');                        // E:\作业2
const LOG_DIR = path.join(WORKSPACE, '实验5', 'logs');
const INDEX_FILE = path.join(PROJECT, 'rag', 'index', 'chunks.json');
const OUT_DIR = path.join(PROJECT, 'docs', 'report', 'figures5');
const OUT_FILE = path.join(OUT_DIR, 'fig-data.json');

const CONTEXT_CHARS = 200;   // d1.context 只保留前 200 字

/** 缺字段就报错退出（绝不静默填假数据） */
function req(obj, key, where) {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    throw new Error(`${where} 不存在或不是对象，无法读取字段 ${key}`);
  }
  const v = obj[key];
  if (v === undefined) throw new Error(`${where}.${key} 缺失`);
  return v;
}
function reqNum(obj, key, where) {
  const v = req(obj, key, where);
  if (typeof v !== 'number' || Number.isNaN(v)) throw new Error(`${where}.${key} 不是数字（实际 ${JSON.stringify(v)}）`);
  return v;
}
function reqStr(obj, key, where) {
  const v = req(obj, key, where);
  if (typeof v !== 'string') throw new Error(`${where}.${key} 不是字符串（实际 ${JSON.stringify(v)}）`);
  return v;
}
function reqArr(obj, key, where) {
  const v = req(obj, key, where);
  if (!Array.isArray(v)) throw new Error(`${where}.${key} 不是数组（实际 ${JSON.stringify(v)}）`);
  return v;
}

function readJsonl(file, label) {
  if (!fs.existsSync(file)) throw new Error(`找不到 ${label}：${file}`);
  const rows = [];
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      rows.push(JSON.parse(line));
    } catch (err) {
      throw new Error(`${label} 第 ${i + 1} 行不是合法 JSON：${err.message}`);
    }
  }
  if (rows.length === 0) throw new Error(`${label} 是空的：${file}`);
  return rows;
}

function pickTokens(raw, where) {
  const t = req(raw, 'tokens', where);
  return {
    promptTokens: reqNum(t, 'promptTokens', `${where}.tokens`),
    completionTokens: reqNum(t, 'completionTokens', `${where}.tokens`),
    totalTokens: reqNum(t, 'totalTokens', `${where}.tokens`),
  };
}

function main() {
  // ── 知识库规模（来自索引自身的 stats）
  if (!fs.existsSync(INDEX_FILE)) throw new Error(`找不到知识库索引：${INDEX_FILE}`);
  const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  const stats = req(index, 'stats', 'chunks.json');
  const kb = {
    docCount: reqNum(stats, 'docCount', 'chunks.json.stats'),
    chunkCount: reqNum(stats, 'chunkCount', 'chunks.json.stats'),
    totalChars: reqNum(stats, 'totalChars', 'chunks.json.stats'),
    avgChunkChars: reqNum(stats, 'avgChunkChars', 'chunks.json.stats'),
  };
  const chunkArr = reqArr(index, 'chunks', 'chunks.json');
  if (chunkArr.length !== kb.chunkCount) {
    throw new Error(`chunks.json 自相矛盾：stats.chunkCount=${kb.chunkCount}，实际 chunks=${chunkArr.length}`);
  }

  // ── compare.jsonl：Q1 / Q5 / Q7 的 rag 组
  const compareRows = readJsonl(path.join(LOG_DIR, 'compare.jsonl'), 'compare.jsonl');
  const pickCompare = (qid) => {
    const row = compareRows.find((r) => r.questionId === qid);
    if (!row) throw new Error(`compare.jsonl 里没有 questionId=${qid} 的记录`);
    const where = `compare.jsonl[${qid}]`;
    return { row, rag: req(row, 'rag', where), where: `${where}.rag` };
  };

  // Q1：正常问答（有引用、有检索来源）
  const c1 = pickCompare('Q1');
  const q1Sources = reqArr(c1.rag, 'sources', c1.where).map((s, i) => ({
    sourceId: reqStr(s, 'sourceId', `${c1.where}.sources[${i}]`),
    chunkId: reqStr(s, 'chunkId', `${c1.where}.sources[${i}]`),
    title: reqStr(s, 'title', `${c1.where}.sources[${i}]`),
    section: reqStr(s, 'section', `${c1.where}.sources[${i}]`),
    finalScore: reqNum(s, 'finalScore', `${c1.where}.sources[${i}]`),
  }));
  const q1Citations = reqArr(c1.rag, 'citations', c1.where).map((c, i) => ({
    id: reqStr(c, 'id', `${c1.where}.citations[${i}]`),
    quote: reqStr(c, 'quote', `${c1.where}.citations[${i}]`),
  }));
  const q1 = {
    question: reqStr(c1.row, 'question', 'compare.jsonl[Q1]'),
    answer: reqStr(c1.rag, 'answer', c1.where),
    citations: q1Citations,
    sources: q1Sources,
    latencyMs: reqNum(c1.rag, 'latencyMs', c1.where),
    tokens: pickTokens(c1.rag, c1.where),
    insufficient: req(c1.rag, 'insufficient', c1.where) === true,
  };

  // Q5：资料无答案（模型按提示声明"资料不足"，不带引用）
  const c5 = pickCompare('Q5');
  const q5 = {
    question: reqStr(c5.row, 'question', 'compare.jsonl[Q5]'),
    answer: reqStr(c5.rag, 'answer', c5.where),
    followup: reqStr(c5.rag, 'followup', c5.where),
    insufficient: req(c5.rag, 'insufficient', c5.where) === true,
    latencyMs: reqNum(c5.rag, 'latencyMs', c5.where),
    tokens: pickTokens(c5.rag, c5.where),
  };

  // Q7：超范围（程序侧护栏拦截，未发模型请求）
  const c7 = pickCompare('Q7');
  const q7 = {
    question: reqStr(c7.row, 'question', 'compare.jsonl[Q7]'),
    answer: reqStr(c7.rag, 'answer', c7.where),
    followup: reqStr(c7.rag, 'followup', c7.where),
    insufficient: req(c7.rag, 'insufficient', c7.where) === true,
    // 以下两项规格里没要求，图5-3 的状态行要用它证明"未调用模型"，所以一并落盘
    latencyMs: reqNum(c7.rag, 'latencyMs', c7.where),
    tokens: pickTokens(c7.rag, c7.where),
  };

  // ── rag-demo.jsonl：D1 的检索排序与上下文
  const demoRows = readJsonl(path.join(LOG_DIR, 'rag-demo.jsonl'), 'rag-demo.jsonl');
  const d1row = demoRows.find((r) => r.caseId === 'D1');
  if (!d1row) throw new Error('rag-demo.jsonl 里没有 caseId=D1 的记录');
  const dwhere = 'rag-demo.jsonl[D1]';
  const d1 = {
    question: reqStr(d1row, 'question', dwhere),
    ranked: reqArr(d1row, 'ranked', dwhere).map((r, i) => ({
      sourceId: reqStr(r, 'sourceId', `${dwhere}.ranked[${i}]`),
      chunkId: reqStr(r, 'chunkId', `${dwhere}.ranked[${i}]`),
      title: reqStr(r, 'title', `${dwhere}.ranked[${i}]`),
      section: reqStr(r, 'section', `${dwhere}.ranked[${i}]`),
      bm25: reqNum(r, 'bm25', `${dwhere}.ranked[${i}]`),
      cosine: reqNum(r, 'cosine', `${dwhere}.ranked[${i}]`),
      finalScore: reqNum(r, 'finalScore', `${dwhere}.ranked[${i}]`),
      relevant: req(r, 'relevant', `${dwhere}.ranked[${i}]`) === true,
    })),
    contextChars: reqNum(d1row, 'contextChars', dwhere),
    context: reqStr(d1row, 'context', dwhere).slice(0, CONTEXT_CHARS),
    // 以下三项规格里没要求，图5-2 的检索卡片小字要用（k / 阈值 / 相关条数）
    topK: reqNum(d1row, 'topK', dwhere),
    threshold: reqNum(d1row, 'threshold', dwhere),
  };

  if (q1.insufficient !== false) throw new Error('Q1 期望是"正常作答"（insufficient=false），实际为 true');
  if (q5.insufficient !== true) throw new Error('Q5 期望是"资料不足"（insufficient=true），实际为 false');
  if (q7.insufficient !== true) throw new Error('Q7 期望是"无法处理"（insufficient=true），实际为 false');
  if (q1.citations.length === 0) throw new Error('Q1 的引用为空，图5-2 的"引用"小节没有内容可画');
  if (q1.sources.length === 0) throw new Error('Q1 的 sources 为空，图5-2 的检索表格没有内容可画');
  if (d1.ranked.length === 0) throw new Error('D1 的 ranked 为空');

  const out = {
    generatedBy: 'zhishi-campus/lab5/build-fig5-data.mjs',
    note: '全部字段来自真实运行落盘：实验5/logs/compare.jsonl（Q1/Q5/Q7 的 rag 组）、实验5/logs/rag-demo.jsonl（D1）、rag/index/chunks.json（stats）',
    sources: {
      compare: '实验5/logs/compare.jsonl',
      ragDemo: '实验5/logs/rag-demo.jsonl',
      index: 'zhishi-campus/rag/index/chunks.json',
    },
    kb,
    q1,
    q5,
    q7,
    d1,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + '\n', 'utf8');

  // ── 控制台核对信息
  console.log(`已生成 ${path.relative(WORKSPACE, OUT_FILE)}`);
  console.log(`  知识库：${kb.docCount} 份资料 / ${kb.chunkCount} 片段 / ${kb.totalChars} 字 / 平均 ${kb.avgChunkChars} 字每片段`);
  console.log(`  Q1 ${q1.question}`);
  console.log(`     作答=${!q1.insufficient} · ${q1.latencyMs}ms · token 合计 ${q1.tokens.totalTokens}（输入 ${q1.tokens.promptTokens} / 输出 ${q1.tokens.completionTokens}）· 引用 ${q1.citations.length} 条 · 检索来源 ${q1.sources.length} 条`);
  console.log(`     Top1 ${q1.sources[0].sourceId} ${q1.sources[0].chunkId} ${q1.sources[0].title} · ${q1.sources[0].section} final=${q1.sources[0].finalScore}`);
  console.log(`  Q5 ${q5.question}`);
  console.log(`     资料不足=${q5.insufficient} · ${q5.latencyMs}ms · token 合计 ${q5.tokens.totalTokens}`);
  console.log(`  Q7 ${q7.question}`);
  console.log(`     无法处理=${q7.insufficient} · ${q7.latencyMs}ms · token 合计 ${q7.tokens.totalTokens}`);
  console.log(`  D1 ${d1.question}`);
  console.log(`     排序 ${d1.ranked.length} 条（k=${d1.topK}，阈值 ${d1.threshold}）：` +
    d1.ranked.map((r) => `${r.sourceId}/${r.finalScore.toFixed(3)}${r.relevant ? '' : '(不相关)'}`).join(' '));
  console.log(`     上下文 ${d1.contextChars} 字，快照 ${d1.context.length} 字`);

  const q5CalledModel = (q5.tokens.totalTokens ?? 0) > 0;
  if (q5CalledModel) {
    console.log('  [注意] Q5 真实运行 token>0 → 这次"资料不足"是模型按提示声明的，不是"未调用模型"；' +
      '图5-3 左图的状态行会按真实数据显示（Q6 才是 0ms/0token 的无检索分支）。');
  }
}

try {
  main();
} catch (err) {
  console.error('生成图表数据失败：' + err.message);
  process.exit(1);
}
