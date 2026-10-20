/**
 * 本地确定性嵌入（实验5 2.4）
 *
 * 为什么不用云端嵌入模型：本次运行环境只能连通模型推理接口（无独立的嵌入模型 Key/接口），
 * 为保证"资料片段与用户问题用同一套方法转成数值向量"可复现，这里实现一个纯计算的
 * 字符 n-gram 哈希嵌入（char 1/2/3-gram → 256 维、IDF 加权、L2 归一化）。
 * 它不是神经网络嵌入，语义泛化能力弱于 bge 之类的中文嵌入模型，
 * 这一局限在报告 3.4 / 4.3 里写明；换模型时只需替换 embed() 这一个函数。
 */

export const EMBED_DIM = 256;

const CJK = /[\u3400-\u9fff]/;

function hash32(str, seed = 0x811c9dc5) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 文本 → 词项列表：中文取字、二字词、三字词；英文/数字按连续串取 */
export function terms(text) {
  const s = String(text ?? '').toLowerCase();
  const out = [];
  const words = s.match(/[a-z0-9]+/g) ?? [];
  out.push(...words);
  const chars = [...s];
  const cjkRuns = [];
  let run = '';
  for (const ch of chars) {
    if (CJK.test(ch)) {
      run += ch;
      continue;
    }
    if (run) {
      cjkRuns.push(run);
      run = '';
    }
  }
  if (run) cjkRuns.push(run);
  for (const r of cjkRuns) {
    const c = [...r];
    for (let i = 0; i < c.length; i += 1) {
      out.push(c[i]);
      if (i + 1 < c.length) out.push(c[i] + c[i + 1]);
      if (i + 2 < c.length) out.push(c[i] + c[i + 1] + c[i + 2]);
    }
  }
  return out;
}

/** 建一份词项 → 维度 的稳定映射（FNV-1a 哈希取模），供同一批资料与查询共用 */
export function termToIndex(term) {
  return hash32(term) % EMBED_DIM;
}

/**
 * 把一组文本转成向量。idf 由调用方传入（按同一批片段统计），
 * 这样资料片段与用户问题天然使用同一套权重与同一映射。
 */
export function embed(text, idf = null) {
  const vec = new Float64Array(EMBED_DIM);
  const counts = new Map();
  for (const t of terms(text)) counts.set(t, (counts.get(t) ?? 0) + 1);
  for (const [t, c] of counts) {
    const w = (1 + Math.log(c)) * (idf?.get(t) ?? 1);
    const idx = termToIndex(t);
    vec[idx] += w;
  }
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < EMBED_DIM; i += 1) vec[i] /= norm;
  return Array.from(vec);
}

export function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < EMBED_DIM; i += 1) dot += a[i] * b[i];
  return dot;
}

/** 统计 IDF：df(term) / N 的平滑倒数，供 embed() 加权 */
export function buildIdf(texts) {
  const df = new Map();
  for (const text of texts) {
    const seen = new Set(terms(text));
    for (const t of seen) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const N = texts.length || 1;
  const idf = new Map();
  for (const [t, d] of df) idf.set(t, Math.log(1 + (N - d + 0.5) / (d + 0.5)));
  return idf;
}
