/**
 * 实验5 2.2 证据：打印一份"实际发送给模型的完整输入"（不调用模型）
 * 输出：logs/prompt-input-<模板>.txt，含 system、user、字符数与 token 估算，以及检索到的资料编号
 * 用法：node lab5/show-prompt.mjs [--q=Q1] [--template=v2]
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadIndex, LOG_DIR, ROOT, writeText } from './lib.mjs';
import { createRetriever } from '../rag/retriever.js';
import { renderContext, renderTemplate, estimateTokens } from '../rag/prompt.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const question = args.question ?? '宫保鸡丁里有没有花生？';
const template = args.template ?? 'v2';

const index = loadIndex();
const retriever = createRetriever({ chunks: index.chunks });
const search = retriever.search(question, { topK: 4 });
const context = renderContext(search.relevant);
const rendered = renderTemplate(template, { context, question });
const promptChars = rendered.messages.reduce((s, m) => s + m.content.length, 0);

const lines = [];
lines.push(`# 实际发送给模型的完整输入（模板 ${template}）`);
lines.push('');
lines.push(`问题：${question}`);
lines.push(`知识库：${index.stats.docCount} 份资料 / ${index.stats.chunkCount} 片段`);
lines.push(`检索命中：${search.ranked.map((r) => `${r.sourceId}/${r.chunkId}(${r.finalScore})`).join('  ') || '（无）'}`);
lines.push(`system 字符数：${rendered.system.length} · user 字符数：${rendered.user.length} · 合计 ${promptChars} 字符 · 估算 ${estimateTokens(rendered.system + rendered.user)} token`);
lines.push('');
lines.push('## messages[0] role=system');
lines.push('```text');
lines.push(rendered.system);
lines.push('```');
lines.push('');
lines.push('## messages[1] role=user');
lines.push('```text');
lines.push(rendered.user);
lines.push('```');

const out = path.join(LOG_DIR, `prompt-input-${template}.txt`);
writeText(out, lines.join('\n'));
console.log(lines.join('\n'));
console.log(`\n已写入 ${path.relative(ROOT, out)}`);
