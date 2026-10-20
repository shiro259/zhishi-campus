/**
 * 实验5 2.3 知识库与切分抽查
 *
 * 输出：资料清单（来源、格式、授权、隐私）、片段统计、三项完整性检查
 * （字符可回溯、句子完整、无重复/乱码）、3 个片段的逐字抽查、重叠片段示例。
 * 用法：node lab5/run-kb-check.mjs [--log=目录]
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, LOG_DIR, loadIndex, writeText, writeJsonl, mdTable } from './lib.mjs';

const index = loadIndex();
const kbDir = path.join(ROOT, 'rag', 'kb');

function normWhitespace(s) {
  return String(s ?? '').replace(/\s+/g, '');
}

const sources = new Map();
for (const doc of index.docs) {
  const raw = fs.readFileSync(path.join(kbDir, doc.file), 'utf8');
  sources.set(doc.docId, normWhitespace(raw.replace(/^---\n[\s\S]*?\n---\n?/, '')));
}

// ---------- 检查 1：每个片段能否在原文中逐字回溯 ----------
const traceability = index.chunks.map((c) => {
  const src = sources.get(c.docId) ?? '';
  const ok = src.includes(normWhitespace(c.text));
  return { chunkId: c.chunkId, ok };
});

// ---------- 检查 2：句子是否完整（片段以句末标点收尾，且不以标点开头） ----------
const sentenceIntegrity = index.chunks.map((c) => {
  const t = c.text.trim();
  const endsOk = /[。！？；]$/.test(t);
  const startsOk = !/^[，。！？；、）】」』]/.test(t);
  return { chunkId: c.chunkId, ok: endsOk && startsOk, endsOk, startsOk };
});

// ---------- 检查 3：重复与乱码 ----------
const seen = new Map();
const duplicates = [];
for (const c of index.chunks) {
  const key = normWhitespace(c.text).slice(0, 60);
  if (seen.has(key)) duplicates.push({ chunkId: c.chunkId, sameAs: seen.get(key) });
  else seen.set(key, c.chunkId);
}
const garbled = index.chunks.filter((c) => /�|Ã|Â|ï¼|ã|å¾|æ/.test(c.text)).map((c) => c.chunkId);

// ---------- 抽查 3 个片段 ----------
const SAMPLES = [
  'kb-07-c03', // 被长度切分的长小节（与 c04 有句重叠）
  'kb-03-c02', // 菜品卡片（短小节，单独成片段）
  'kb-04-c01', // 规则类短节
];
const samples = SAMPLES.map((id) => {
  const c = index.chunks.find((x) => x.chunkId === id);
  if (!c) return { chunkId: id, missing: true };
  const doc = index.docs.find((d) => d.docId === c.docId);
  const srcOk = sources.get(c.docId)?.includes(normWhitespace(c.text)) ?? false;
  return {
    chunkId: c.chunkId,
    docTitle: c.title,
    section: c.section,
    charCount: c.charCount,
    sourceType: doc?.sourceType ?? '',
    license: doc?.license ?? '',
    updatedAt: doc?.updatedAt ?? '',
    text: c.text,
    traceable: srcOk,
    sentenceComplete: /[。！？；]$/.test(c.text.trim()),
  };
});

// ---------- 重叠片段示例：同一小节被长度切开的相邻片段 ----------
const overlapPairs = [];
for (let i = 1; i < index.chunks.length; i += 1) {
  const prev = index.chunks[i - 1];
  const cur = index.chunks[i];
  if (prev.docId === cur.docId && prev.section === cur.section) {
    const prevSentences = prev.text.split(/(?<=[。！？；])/).filter((s) => s.trim().length > 6);
    const last = prevSentences[prevSentences.length - 1] ?? '';
    if (last && cur.text.includes(last)) {
      overlapPairs.push({ chunkA: prev.chunkId, chunkB: cur.chunkId, overlapSentence: last });
    }
  }
}

const lines = [];
lines.push('# 实验5 知识库与切分抽查（2.3）');
lines.push('');
lines.push(`知识库版本 ${index.version} · 构建时间 ${index.builtAt}`);
lines.push(`规模：${index.stats.docCount} 份资料 / ${index.stats.chunkCount} 个片段 / ${index.stats.totalChars} 字符 / 平均 ${index.stats.avgChunkChars} 字符每片段`);
lines.push('');
lines.push('## 资料清单（来源、格式、授权、隐私）');
lines.push('');
lines.push(mdTable(
  ['docId', '标题', '来源类型', '授权/使用权限', '更新日期', '片段数', '字符数'],
  index.docs.map((d) => [d.docId, d.title, d.sourceType, d.license, d.updatedAt, d.chunkCount, d.charCount]),
));
lines.push('');
lines.push('## 完整性检查');
lines.push('');
lines.push(mdTable(
  ['检查项', '方法', '结果'],
  [
    ['片段可回溯', '把片段文本去掉空白后，在原文正文里逐字查找', `${traceability.filter((t) => t.ok).length}/${traceability.length} 通过`],
    ['句子完整', '片段以句末标点收尾、不以标点开头', `${sentenceIntegrity.filter((t) => t.ok).length}/${sentenceIntegrity.length} 通过`],
    ['重复片段', '比较片段前 60 字的去空白指纹', `${duplicates.length} 处重复`],
    ['乱码', '查找替换符 U+FFFD 与常见乱码序列', `${garbled.length} 处`],
  ],
));
lines.push('');
lines.push('## 片段抽查（3 个）');
for (const s of samples) {
  lines.push('');
  lines.push(`### ${s.chunkId} · ${s.docTitle} · ${s.section}`);
  lines.push('');
  lines.push(`元数据：${s.charCount} 字 · 来源类型 ${s.sourceType} · 授权 ${s.license} · 更新 ${s.updatedAt}`);
  lines.push('');
  lines.push(`原文可回溯：${s.traceable ? '是' : '否'} · 句子完整：${s.sentenceComplete ? '是' : '否'}`);
  lines.push('');
  lines.push('```text');
  lines.push(s.text);
  lines.push('```');
}
lines.push('');
lines.push('## 相邻片段重叠');
lines.push('');
if (overlapPairs.length === 0) lines.push('本次资料没有触发长度切分，相邻片段无重叠。');
for (const o of overlapPairs) {
  lines.push(`- ${o.chunkA} 与 ${o.chunkB} 重叠 1 句：「${o.overlapSentence}」`);
}

const report = lines.join('\n');
writeText(path.join(LOG_DIR, 'kb-check.md'), report);
writeJsonl(path.join(LOG_DIR, 'kb-check.jsonl'), [{ samples, overlapPairs, traceability, sentenceIntegrity, duplicates, garbled }]);
console.log(report);
console.log(`\n已写入 ${path.relative(ROOT, path.join(LOG_DIR, 'kb-check.md'))}`);
