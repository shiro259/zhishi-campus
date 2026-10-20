/**
 * 实验5 共用工具：把 RAG 链路与直接调用组装成可复用的 pipeline，
 * 统一读配置、写日志、打印表格。lab5/ 下的脚本都从这里拿 buildRag / buildDirect。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRetriever } from '../rag/retriever.js';
import { createGateway } from '../rag/gateway.js';
import { createRagService } from '../rag/index.js';
import { renderDirectTemplate } from '../rag/prompt.js';
import { validateAnswer } from '../rag/validate.js';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const LOG_DIR = process.env.LAB5_LOG_DIR || path.join(ROOT, 'data', 'logs', 'lab5');

export function resolveMode() {
  const explicit = process.env.ZS_LLM_MODE;
  if (explicit === 'mock') return { mode: 'mock', reason: '环境变量 ZS_LLM_MODE=mock' };
  if (explicit === 'real') {
    if (!process.env.DEEPSEEK_API_KEY) throw new Error('ZS_LLM_MODE=real 但没有配置 DEEPSEEK_API_KEY');
    return { mode: 'real', reason: '环境变量 ZS_LLM_MODE=real' };
  }
  return process.env.DEEPSEEK_API_KEY
    ? { mode: 'real', reason: '检测到 DEEPSEEK_API_KEY' }
    : { mode: 'mock', reason: '未检测到 DEEPSEEK_API_KEY，回落 mock 替身' };
}

export function loadIndex() {
  const file = path.join(ROOT, 'rag', 'index', 'chunks.json');
  if (!fs.existsSync(file)) throw new Error('索引不存在，请先运行 node rag/build-index.mjs');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function makeGateway({ mode, logName = 'llm-calls.jsonl', overrides = {} }) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  return createGateway({
    mode,
    baseUrl: process.env.ZS_LLM_BASE_URL ?? 'https://api.deepseek.com/v1',
    model: process.env.ZS_LLM_MODEL ?? 'deepseek-chat',
    apiKey: process.env.DEEPSEEK_API_KEY ?? '',
    timeoutMs: Number(process.env.ZS_LLM_TIMEOUT_MS ?? 20000),
    logFile: path.join(LOG_DIR, logName),
    ...overrides,
  });
}

export function buildRag({ mode, gateway, promptVersion = 'v2' } = {}) {
  const index = loadIndex();
  const retriever = createRetriever({ chunks: index.chunks });
  const rag = createRagService({ retriever, gateway, config: { promptVersion } });
  return { index, retriever, rag };
}

/** 直接模型组：不发资料，其余参数与 RAG 组一致 */
export async function directAsk(gateway, question) {
  const startedAt = Date.now();
  const rendered = renderDirectTemplate({ question });
  const raw = await gateway.chat({ messages: rendered.messages, question, meta: { group: 'direct' } });
  const validation = validateAnswer(raw.content, { hits: [] });
  return {
    question,
    answer: validation.answer?.answer ?? '',
    citations: [],
    insufficient: validation.answer?.insufficient === true,
    followup: validation.answer?.followup ?? '',
    validation,
    latencyMs: Date.now() - startedAt,
    tokens: {
      promptTokens: raw.usage?.promptTokens ?? null,
      completionTokens: raw.usage?.completionTokens ?? null,
      totalTokens: raw.usage?.totalTokens ?? null,
    },
    promptChars: rendered.messages.reduce((s, m) => s + m.content.length, 0),
    template: 'direct',
    engine: 'direct',
    model: raw.model,
  };
}

export function writeJsonl(file, rows) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}

export function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
}

/** Markdown 表格：列宽不自动折行，内容里的 | 会被转义 */
export function mdTable(headers, rows) {
  const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, '<br>');
  const lines = [`| ${headers.map(esc).join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`];
  for (const row of rows) lines.push(`| ${row.map(esc).join(' | ')} |`);
  return lines.join('\n');
}

/** 粗略费用估算：DeepSeek 定价按输入 ¥2/百万 token、输出 ¥8/百万 token（以官网为准） */
export function estimateCost({ promptTokens = 0, completionTokens = 0 }) {
  const input = (promptTokens ?? 0) * 2 / 1_000_000;
  const output = (completionTokens ?? 0) * 8 / 1_000_000;
  return { input, output, total: input + output };
}
