/**
 * 实验5 2.3 切分参数对比（发现问题 → 调整 → 重新检查的证据）
 *
 * 对同一批资料用两套参数切分并对比：
 *  旧参数：maxChars 320、minChars 80（短小节并入上一片段）
 *  新参数：maxChars 220、minChars 24（短小节独立成片段，长小节按句切并保留 1 句重叠）
 * 用法：node lab5/run-chunk-ab.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chunkDocument, readDocMeta } from '../rag/chunker.js';
import { writeText, LOG_DIR, ROOT } from './lib.mjs';

const KB = path.join(ROOT, 'rag', 'kb');
const files = fs.readdirSync(KB).filter((f) => f.endsWith('.md')).sort();

function build(params) {
  const chunks = [];
  for (const f of files) {
    const raw = fs.readFileSync(path.join(KB, f), 'utf8');
    const docId = readDocMeta(raw).docId ?? f.replace(/\.md$/, '');
    chunks.push(...chunkDocument({ docId, raw, ...params }));
  }
  return chunks;
}

const oldChunks = build({ maxChars: 320, minChars: 80 });
const newChunks = build({ maxChars: 220, minChars: 24 });

const oldDish = oldChunks.filter((c) => c.chunkId.startsWith('kb-03'));
const newDish = newChunks.filter((c) => c.chunkId.startsWith('kb-03'));
const oldMax = Math.max(...oldChunks.map((c) => c.charCount));
const newMax = Math.max(...newChunks.map((c) => c.charCount));

const lines = [];
lines.push('# 切分参数对比（2.3 的问题与调整）');
lines.push('');
lines.push('| 参数 | 片段数 | 最大片段字数 | kb-03 菜品卡片片段数 | 宫保鸡丁是否独立成片段 |');
lines.push('| --- | --- | --- | --- | --- |');
lines.push(`| 旧：maxChars 320 / minChars 80 | ${oldChunks.length} | ${oldMax} | ${oldDish.length} | ${oldDish.some((c) => c.section === '宫保鸡丁') ? '是' : '否（被并入大片段）'} |`);
lines.push(`| 新：maxChars 220 / minChars 24 | ${newChunks.length} | ${newMax} | ${newDish.length} | ${newDish.some((c) => c.section === '宫保鸡丁') ? '是' : '否'} |`);
lines.push('');
lines.push('## 旧参数下 kb-03 的片段（节标题 → 字数）');
for (const c of oldDish) lines.push(`- ${c.chunkId} · ${c.section} · ${c.charCount} 字`);
lines.push('');
lines.push('## 新参数下 kb-03 的片段（节标题 → 字数）');
for (const c of newDish) lines.push(`- ${c.chunkId} · ${c.section} · ${c.charCount} 字`);
lines.push('');
lines.push('## 新参数下长小节拆分与重叠');
const longSecs = new Set(newChunks.map((c) => `${c.docId}|${c.section}`));
for (const key of longSecs) {
  const same = newChunks.filter((c) => `${c.docId}|${c.section}` === key);
  if (same.length > 1) {
    for (let i = 1; i < same.length; i += 1) {
      const prev = same[i - 1];
      const sentences = prev.text.split(/(?<=[。！？；])/).filter((s) => s.trim());
      const overlap = sentences[sentences.length - 1];
      lines.push(`- ${same[i - 1].chunkId} → ${same[i].chunkId}：重叠句「${overlap}」（${same[i].text.includes(overlap) ? '已在下一片段开头出现' : '未出现'}）`);
    }
  }
}

const text = lines.join('\n');
writeText(path.join(LOG_DIR, 'chunk-params.txt'), text);
console.log(text);
console.log(`\n已写入 ${path.relative(process.cwd(), path.join(LOG_DIR, 'chunk-params.txt'))}`);
