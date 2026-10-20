/**
 * 实验5 模块级测试（node --test lab5/test-pipeline.mjs）
 *
 * 覆盖切分器、检索器、校验器、护栏、Prompt 模板与 RAG 编排，
 * 不依赖网络与模型 Key，可在任意机器上重复运行（全部断言见报告 3.6/3.7）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitSentences, chunkDocument } from '../rag/chunker.js';
import { createRetriever } from '../rag/retriever.js';
import { validateAnswer } from '../rag/validate.js';
import { guardQuestion, guardedReply } from '../rag/guard.js';
import { PROMPTS, DIRECT_PROMPTS, renderTemplate, renderContext, estimateTokens } from '../rag/prompt.js';
import { createRagService } from '../rag/index.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'rag', 'index', 'chunks.json'), 'utf8'));
const retriever = createRetriever({ chunks: index.chunks });

function fakeGateway(contentOrFn) {
  const calls = [];
  return {
    calls,
    async chat({ messages, question }) {
      calls.push({ messages, question });
      const content = typeof contentOrFn === 'function' ? contentOrFn({ messages, question }) : contentOrFn;
      return { content, usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }, model: 'fake', ok: true };
    },
  };
}

test('切句：句末标点保留，分号也作为切分点', () => {
  const s = splitSentences('宫保鸡丁含花生；对花生过敏要避开。麻辣香锅有虾。');
  assert.deepEqual(s, ['宫保鸡丁含花生；', '对花生过敏要避开。', '麻辣香锅有虾。']);
});

test('切分：超长小节按句切并且相邻片段重叠 1 句', () => {
  const raw = `---\ndocId: t-01\ntitle: 测试\n---\n\n# 测试\n\n## 长小节\n\n${Array.from({ length: 12 }, (_, i) => `第${i + 1}句测试内容，用来触发长度切分。`).join('')}`;
  const chunks = chunkDocument({ docId: 't-01', raw, maxChars: 80 });
  assert.ok(chunks.length >= 2, `应至少切成 2 段，实际 ${chunks.length}`);
  for (let i = 1; i < chunks.length; i += 1) {
    const prevSentences = chunks[i - 1].text.split(/(?<=[。！？；])/).filter((x) => x.trim());
    const last = prevSentences[prevSentences.length - 1];
    assert.ok(chunks[i].text.includes(last), `第 ${i} 段应以重叠句开头`);
  }
  for (const c of chunks) {
    assert.ok(c.charCount <= 80 + 60, `片段 ${c.chunkId} 长度 ${c.charCount} 超出上限`);
    assert.ok(/[。！？；]$/.test(c.text), `片段 ${c.chunkId} 未以句末标点收尾`);
  }
});

test('切分：真实知识库的片段都完整且可回溯', () => {
  const srcDir = path.join(ROOT, 'rag', 'kb');
  for (const doc of index.docs) {
    const raw = fs.readFileSync(path.join(srcDir, doc.file), 'utf8').replace(/^---\n[\s\S]*?\n---\n?/, '');
    const body = raw.replace(/\s+/g, '');
    const docChunks = index.chunks.filter((c) => c.docId === doc.docId);
    assert.ok(docChunks.length > 0, `${doc.docId} 没有片段`);
    for (const c of docChunks) {
      assert.ok(/[。！？；]$/.test(c.text.trim()), `${c.chunkId} 句子不完整`);
      assert.ok(body.includes(c.text.replace(/\s+/g, '')), `${c.chunkId} 不能回溯到原文`);
    }
  }
});

test('检索：菜品问题首位命中菜品卡片，且排序分数单调不增', () => {
  const res = retriever.search('宫保鸡丁里有没有花生？', { topK: 4 });
  assert.ok(res.ranked.length > 0, '应有检索结果');
  assert.ok(/kb-03/.test(res.ranked[0].chunkId) || /花生/.test(res.ranked[0].text), '首位应是菜品卡片或含花生的片段');
  for (let i = 1; i < res.ranked.length; i += 1) {
    assert.ok(res.ranked[i - 1].finalScore >= res.ranked[i].finalScore, '排序应按最终分降序');
  }
  assert.equal(res.insufficient, false);
});

test('检索：资料无关的问题应返回资料不足', () => {
  const res = retriever.search('今天操场的天气怎么样？', { topK: 4 });
  assert.equal(res.insufficient, true);
  assert.equal(res.relevantCount, 0);
});

test('检索：Top-k 的 k 与排序依据字段齐全', () => {
  const res = retriever.search('3 号窗口午餐几点开始供餐？', { topK: 3 });
  assert.ok(res.ranked.length <= 3);
  for (const r of res.ranked) {
    assert.ok(typeof r.bm25 === 'number' && typeof r.cosine === 'number' && typeof r.finalScore === 'number');
    assert.ok(r.hitTerms.length > 0, '应记录命中词作为排序依据');
  }
});

test('校验：缺字段与非法 JSON 被拦下', () => {
  const bad = validateAnswer('不是JSON', { hits: [] });
  assert.equal(bad.ok, false);
  const noAnswer = validateAnswer('{"citations":[]}', { hits: [] });
  assert.equal(noAnswer.ok, false);
});

test('校验：引用编号与原文摘录必须对得上', () => {
  const hits = [{ sourceId: 'S1', chunkId: 'kb-03-c02', text: '配料：鸡丁、花生、黄瓜。口味辣中带甜，花生为公示配料。' }];
  const good = validateAnswer(JSON.stringify({
    answer: '配料里有花生 [S1]，建议向窗口确认。', citations: [{ id: 'S1', quote: '配料：鸡丁、花生、黄瓜。' }], insufficient: false, followup: '',
  }), { hits });
  assert.equal(good.ok, true, good.issues.join('；'));
  const badId = validateAnswer(JSON.stringify({
    answer: '有花生 [S9]', citations: [{ id: 'S9', quote: '随便写一段长文本内容' }], insufficient: false, followup: '',
  }), { hits });
  assert.equal(badId.ok, false);
  const badQuote = validateAnswer(JSON.stringify({
    answer: '有花生 [S1]', citations: [{ id: 'S1', quote: '这句话原文里根本没有出现过' }], insufficient: false, followup: '',
  }), { hits });
  assert.equal(badQuote.ok, false);
});

test('校验：资料不足时必须有追问且不带引用', () => {
  const hits = [{ sourceId: 'S1', chunkId: 'x', text: '一段与问题无关的资料内容。' }];
  const ok = validateAnswer(JSON.stringify({ answer: '资料不足，无法回答。', citations: [], insufficient: true, followup: '你想问哪家食堂？' }), { hits });
  assert.equal(ok.ok, true, ok.issues.join('；'));
  const bad = validateAnswer(JSON.stringify({ answer: '资料不足。', citations: [], insufficient: true, followup: '' }), { hits });
  assert.equal(bad.ok, false);
});

test('护栏：超范围问题被拦下，选餐问题放行', () => {
  assert.equal(guardQuestion('我对花生过敏，能不能吃抗过敏药来预防？').intent, 'out_of_scope');
  assert.equal(guardQuestion('我最近在吃头孢，能喝酒吗？').intent, 'out_of_scope');
  assert.equal(guardQuestion('宫保鸡丁里有花生吗？').intent, 'ok');
  assert.equal(guardQuestion('').intent, 'empty');
  assert.ok(guardedReply(guardQuestion('头孢能喝酒吗')).followup.length > 0);
});

test('Prompt：模板包含资料与问题占位，直接组不含检索资料', () => {
  const r = renderTemplate('v2', { context: '[S1] 测试资料', question: '测试问题' });
  assert.ok(r.user.includes('[S1] 测试资料') && r.user.includes('测试问题'));
  assert.ok(PROMPTS.v2.system.includes('insufficient'));
  const direct = DIRECT_PROMPTS.direct;
  assert.ok(!direct.user.includes('检索资料'));
  assert.ok(estimateTokens('中文测试文本') > 0);
});

test('编排：问题为空时不调用模型，返回追问', async () => {
  const gateway = fakeGateway('{}');
  const rag = createRagService({ retriever, gateway });
  const res = await rag.ask({ question: '   ' });
  assert.equal(res.insufficient, true);
  assert.equal(gateway.calls.length, 0);
  assert.ok(res.followup.length > 0);
});

test('编排：检索不到资料时返回资料不足且不发模型请求', async () => {
  const gateway = fakeGateway('{}');
  const rag = createRagService({ retriever, gateway });
  const res = await rag.ask({ question: '今天操场的天气怎么样？' });
  assert.equal(res.insufficient, true);
  assert.equal(gateway.calls.length, 0);
  assert.equal(res.validation.guarded, 'NO_RETRIEVAL');
});

test('编排：正常问题把 Top-k 片段放进上下文，并核对引用', async () => {
  const gateway = fakeGateway(({ messages }) => {
    const user = messages.find((m) => m.role === 'user').content;
    const quote = user.split('\n').find((l) => l.length > 10 && !l.startsWith('[') && !l.startsWith('【'));
    return JSON.stringify({ answer: '配料里有花生，建议向窗口确认 [S1]。', citations: [{ id: 'S1', quote: quote.slice(0, 20) }], insufficient: false, followup: '' });
  });
  const rag = createRagService({ retriever, gateway });
  const res = await rag.ask({ question: '宫保鸡丁里有没有花生？' });
  assert.equal(gateway.calls.length, 1);
  const ctx = gateway.calls[0].messages.find((m) => m.role === 'user').content;
  assert.ok(ctx.includes('[S1]'), '上下文应带资料编号');
  assert.equal(res.validation.ok, true, res.validation.issues.join('；'));
});
