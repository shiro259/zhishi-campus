/** P6 问一问（实验5 RAG 演示入口）：问题 → 检索 → 上下文 → 模型 → 带出处的回答 */
import { $, el, toast } from './common.js';

const EXAMPLES = [
  '宫保鸡丁里有没有花生？',
  '3 号窗口午餐几点开始供餐？',
  '我预算 12 元、不吃辣、想减脂，帮我挑两三道菜',
  '我室友对虾蟹过敏，他要避开哪些菜？',
  '三食堂二楼这周新上了什么菜？',
  '我对花生过敏，能不能吃抗过敏药来预防？',
];

function renderExamples() {
  const box = $('#examples');
  box.replaceChildren(...EXAMPLES.map((q) =>
    el('button', {
      class: 'small ghost',
      text: q,
      onclick: () => {
        $('#question').value = q;
        $('#question').focus();
      },
    }),
  ));
}

function statusLine(res) {
  const mode = res.mode ?? 'rag';
  const parts = [
    mode === 'mock' ? 'mock 替身' : res.model ?? 'deepseek-chat',
    `${res.latencyMs ?? '—'} ms`,
    res.tokens?.totalTokens ? `${res.tokens.totalTokens} token` : '未调用模型',
    res.insufficient ? '资料不足' : '已作答',
  ];
  return parts.join(' · ');
}

function renderAnswer(res) {
  const card = $('#answerCard');
  const nodes = [
    el('h2', { text: '回答' }),
    el('p', { class: 'hint', text: statusLine(res) }),
    el('p', { id: 'answerText', text: res.answer || '（空回答）' }),
  ];
  if (res.followup) nodes.push(el('p', { class: 'hint', text: `追问：${res.followup}` }));
  if (res.guarded) nodes.push(el('p', { class: 'hint', text: `已由程序侧护栏拦下（${res.guarded.rule ?? res.guarded.intent}），未调用模型。` }));
  if (res.citations?.length) {
    nodes.push(el('h3', { text: '引用（对应知识库片段）' }));
    for (const c of res.citations) {
      nodes.push(el('div', { class: 'kv' }, [
        el('span', { class: 'k', text: `[${c.id}] ${c.chunkId ?? ''}` }),
        el('span', { text: `「${c.quote}」` }),
      ]));
    }
    const ok = res.validation?.ok;
    nodes.push(el('p', { class: 'hint', text: ok ? '引用核对通过：编号与原文摘录都能在对应片段里找到。' : `引用核对未通过：${(res.validation?.issues ?? []).join('；')}` }));
  }
  if (res.insufficient) nodes.push(el('p', { class: 'hint', text: '知识库没有足够资料，本次未编造答案。' }));
  card.replaceChildren(...nodes);
  card.hidden = false;
}

function renderSources(res) {
  const card = $('#sourcesCard');
  const ranked = res.retrieved?.ranked ?? [];
  if (ranked.length === 0) {
    card.replaceChildren(el('h2', { text: '检索结果' }), el('p', { class: 'hint', text: '没有命中的知识库片段（返回资料不足）。' }));
    card.hidden = false;
    return;
  }
  const rows = ranked.map((r) => el('tr', {}, [
    el('td', { text: r.sourceId }),
    el('td', { text: r.chunkId }),
    el('td', { text: `${r.title} · ${r.section}` }),
    el('td', { text: String(r.bm25) }),
    el('td', { text: String(r.cosine) }),
    el('td', { text: String(r.finalScore) }),
    el('td', { text: r.relevant ? '相关' : '不相关' }),
  ]));
  card.replaceChildren(
    el('h2', { text: '检索结果（按相关性排序）' }),
    el('p', { class: 'hint', text: `k=${res.retrieved.topK}，阈值 ${res.retrieved.threshold}；最终分 = 0.6×BM25 归一化 + 0.4×余弦。` }),
    el('table', {}, [
      el('thead', {}, [el('tr', {}, ['来源', '片段', '文档 · 小节', 'BM25', '余弦', '最终分', '相关'].map((h) => el('th', { text: h })))]),
      el('tbody', {}, rows),
    ]),
  );
  card.hidden = false;
}

async function ask() {
  const question = $('#question').value.trim();
  if (!question) {
    toast('先写一个想问的问题');
    return;
  }
  const btn = $('#askBtn');
  btn.disabled = true;
  btn.textContent = '正在检索并作答…';
  try {
    const res = await fetch('/api/rag', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message ?? `HTTP ${res.status}`);
    renderAnswer(data);
    renderSources(data);
  } catch (err) {
    toast(`提问失败：${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = '问一问';
  }
}

function init() {
  renderExamples();
  $('#askBtn').addEventListener('click', ask);
  $('#question').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) ask();
  });
  fetch('/api/health')
    .then((r) => r.json())
    .then((h) => {
      $('#modeHint').textContent = `模型：${h.llmMode === 'real' ? h.model : 'mock 替身（未配置 Key）'} · 知识库 7 份资料 / 50 个片段 · 回答只依据检索到的资料并标注编号。`;
    })
    .catch(() => {});
}

init();
