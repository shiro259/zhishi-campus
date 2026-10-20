/**
 * RAG 命令行入口（实验5 2.6）
 *
 * 用法：
 *   node lab5/cli.mjs --question "宫保鸡丁里有花生吗？"
 *   node lab5/cli.mjs --question "..." --topk 4 --template v2 --json
 *
 * 环境变量：
 *   ZS_LLM_MODE=real|mock   默认 real（未配置 Key 时自动回落 mock 并打印原因）
 *   DEEPSEEK_API_KEY=...    真实调用用，密钥只从环境变量读
 *   ZS_LLM_MODEL=deepseek-chat
 *   LAB5_LOG_DIR=<目录>     调用日志落盘位置，默认 data/logs/lab5
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRetriever } from '../rag/retriever.js';
import { createGateway } from '../rag/gateway.js';
import { createRagService } from '../rag/index.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function loadChunks() {
  const file = path.join(ROOT, 'rag', 'index', 'chunks.json');
  if (!fs.existsSync(file)) throw new Error('索引不存在，请先运行 node rag/build-index.mjs');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

export function buildPipeline({ logDir } = {}) {
  const index = loadChunks();
  const retriever = createRetriever({ chunks: index.chunks });
  const mode = process.env.ZS_LLM_MODE === 'mock' ? 'mock' : process.env.DEEPSEEK_API_KEY ? 'real' : 'mock';
  const gateway = createGateway({
    mode,
    baseUrl: process.env.ZS_LLM_BASE_URL ?? 'https://api.deepseek.com/v1',
    model: process.env.ZS_LLM_MODEL ?? 'deepseek-chat',
    apiKey: process.env.DEEPSEEK_API_KEY ?? '',
    timeoutMs: Number(process.env.ZS_LLM_TIMEOUT_MS ?? 20000),
    logFile: logDir ? path.join(logDir, 'llm-calls.jsonl') : null,
    ...(logDir ? {} : {}),
  });
  const rag = createRagService({ retriever, gateway });
  return { index, retriever, gateway, rag, mode };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const question = typeof args.question === 'string' ? args.question : '';
  if (!question) {
    console.error('用法：node lab5/cli.mjs --question "你的问题"');
    process.exit(1);
  }
  const logDir = process.env.LAB5_LOG_DIR || path.join(ROOT, 'data', 'logs', 'lab5');
  const { rag, mode, index } = buildPipeline({ logDir });
  const res = await rag.ask({
    question,
    topK: Number(args.topk ?? 4),
    promptVersion: typeof args.template === 'string' ? args.template : 'v2',
  });

  if (args.json) {
    console.log(JSON.stringify({ mode, kb: index.stats, result: res }, null, 2));
    return;
  }

  console.log(`模式：${mode} · 知识库 ${index.stats.docCount} 份资料 / ${index.stats.chunkCount} 片段`);
  console.log(`\n问题：${question}`);
  console.log('\n检索 Top-k（相关性排序）：');
  for (const r of res.retrieved.ranked) {
    console.log(`  ${r.sourceId} ${r.chunkId}  相关=${r.relevant}  final=${r.finalScore}  bm25=${r.bm25}  cos=${r.cosine}`);
    console.log(`     ${r.title} · ${r.section}`);
  }
  if (res.retrieved.ranked.length === 0) console.log('  （无命中片段）');
  console.log(`\n回答（模板 ${res.template}，${res.latencyMs} ms，token ${res.tokens.totalTokens ?? '—'}）：`);
  console.log(res.answer);
  if (res.followup) console.log(`\n追问：${res.followup}`);
  console.log(`\n引用核对：${res.validation.ok ? '通过' : `未通过（${res.validation.issues.join('；')}）`}`);
  for (const c of res.citations) console.log(`  [${c.id}] ← ${c.chunk}：${c.quote}`);
  if (res.sources.length) {
    console.log('\n来源：');
    for (const s of res.sources) console.log(`  [${s.sourceId}] ${s.title} · ${s.section}（${s.charCount} 字）`);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error('运行失败：', err.message);
    process.exit(1);
  });
}
