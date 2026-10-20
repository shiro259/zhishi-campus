/**
 * 知识库建索引（实验5 2.3、2.4）
 *
 * 输入：rag/kb/*.md（带 YAML 头信息的资料）
 * 输出：rag/index/chunks.json —— 每个片段的正文与元数据（文档、标题、小节、来源、授权、更新日期、字符数）
 * 片段之间与原文逐一对应，构建后可用 chunkId 回溯到原文件。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chunkDocument, readDocMeta } from './chunker.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const KB_DIR = path.join(ROOT, 'rag', 'kb');
const OUT_DIR = path.join(ROOT, 'rag', 'index');

const files = fs.readdirSync(KB_DIR).filter((f) => f.endsWith('.md')).sort();
if (files.length === 0) {
  console.error('没有找到知识库资料（rag/kb/*.md）');
  process.exit(1);
}

const docs = [];
const chunks = [];
let totalChars = 0;

for (const file of files) {
  const raw = fs.readFileSync(path.join(KB_DIR, file), 'utf8');
  const meta = readDocMeta(raw);
  const docChunks = chunkDocument({ docId: meta.docId ?? file.replace(/\.md$/, ''), raw });
  const docChars = docChunks.reduce((s, c) => s + c.charCount, 0);
  docs.push({
    docId: meta.docId ?? file,
    file,
    title: meta.title ?? file,
    sourceOrg: meta.sourceOrg ?? '',
    sourceType: meta.sourceType ?? '',
    url: meta.url ?? '',
    license: meta.license ?? '',
    updatedAt: meta.updatedAt ?? '',
    privacy: meta.privacy ?? '',
    chunkCount: docChunks.length,
    charCount: docChars,
  });
  totalChars += docChars;
  chunks.push(...docChunks.map((c) => ({ ...c, sourceOrg: meta.sourceOrg ?? '', license: meta.license ?? '', updatedAt: meta.updatedAt ?? '' })));
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const index = {
  version: 'v1.0',
  builtAt: new Date().toISOString(),
  docs,
  chunks,
  stats: {
    docCount: docs.length,
    chunkCount: chunks.length,
    totalChars,
    avgChunkChars: Math.round(chunks.reduce((s, c) => s + c.charCount, 0) / chunks.length),
  },
};
fs.writeFileSync(path.join(OUT_DIR, 'chunks.json'), JSON.stringify(index, null, 2), 'utf8');

console.log(`知识库索引完成：${index.stats.docCount} 份资料 / ${index.stats.chunkCount} 个片段 / ${index.stats.totalChars} 字符（平均 ${index.stats.avgChunkChars} 字符/片段）`);
console.log(`输出：${path.relative(ROOT, path.join(OUT_DIR, 'chunks.json'))}`);
