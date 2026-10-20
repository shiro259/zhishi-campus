/**
 * 混合检索（实验5 2.4）：关键词 BM25 + 字符 n-gram 向量余弦
 *
 * 选择理由：
 *  ① 知识库只有 6 份资料、约 30 个片段，纯关键词检索在中文上容易被"同义词/语序"卡住
 *    （"宫保鸡丁有花生吗"命中"宫保鸡丁"但"花生过敏"这种表述命中不到），
 *    纯向量检索在这样的小库上又容易把不相关片段排进 Top-k；
 *  ② 两者加权相加后，既能保证关键词命中的精确性，又能覆盖改写过的说法；
 *  ③ 两条分数都可解释：BM25 词命中、余弦相似度，便于在报告里给出"排序依据"与阈值判断。
 *
 * 相关性判断规则（返回片段不等于资料相关）：
 *  最终分 finalScore = 0.6 × BM25 归一化分 + 0.4 × 余弦相似度；
 *  片段被判为"相关"需同时满足：finalScore ≥ 0.20，且至少命中一个查询词（BM25 > 0）。
 *  没有片段满足时返回 insufficient = true，调用方据此返回资料不足提示。
 */
import { terms, buildIdf, embed, cosine } from './embed.js';

const K1 = 1.2;
const B = 0.75;
const DEFAULT_THRESHOLD = 0.2;

/** 疑问词与高频虚词：不参与"是否相关"的门槛判断，否则"今天怎么样"也会命中 */
const STOP_TERMS = new Set([
  '怎么', '什么', '如何', '哪个', '哪些', '多少', '是否', '可以', '能不', '不能', '是不', '不是',
  '今天', '明天', '现在', '一个', '这个', '那个', '我们', '你们', '他们', '自己', '还是', '或者',
  '的话', '一下', '有点', '感觉', '觉得', '应该', '需要', '帮我', '请问', '想问', '知道',
]);

export function createRetriever({ chunks }) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    throw new Error('检索器需要至少一个知识库片段');
  }
  const idf = buildIdf(chunks.map((c) => c.text));
  const docTerms = chunks.map((c) => terms(c.text));
  const docVectors = chunks.map((c) => embed(c.text, idf));
  const avgLen = docTerms.reduce((s, t) => s + t.length, 0) / docTerms.length;
  const n = chunks.length;

  function bm25(queryTerms, docTf, docLen) {
    let score = 0;
    const qSet = new Set(queryTerms);
    for (const t of qSet) {
      const tf = docTf.get(t) ?? 0;
      if (tf === 0) continue;
      const df = dfIndex.get(t) ?? 0;
      const idfT = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      score += idfT * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * docLen) / avgLen)));
    }
    return score;
  }

  // df 表：同一个词在多少个片段里出现（BM25 的 idf 用）
  const dfIndex = new Map();
  docTerms.forEach((ts) => {
    for (const t of new Set(ts)) dfIndex.set(t, (dfIndex.get(t) ?? 0) + 1);
  });
  function countDf(t) {
    return dfIndex.get(t) ?? 0;
  }

  /**
   * @param {string} query
   * @param {{topK?:number, threshold?:number}} opts
   */
  function search(query, { topK = 4, threshold = DEFAULT_THRESHOLD } = {}) {
    const queryTerms = terms(query);
    const gatingTerms = [...new Set(queryTerms.filter((t) => t.length >= 2 && !STOP_TERMS.has(t)))];
    const qVec = embed(query, idf);
    const scored = chunks.map((chunk, i) => {
      const tf = new Map();
      for (const t of docTerms[i]) tf.set(t, (tf.get(t) ?? 0) + 1);
      const bm = bm25(queryTerms, tf, docTerms[i].length);
      const cos = cosine(qVec, docVectors[i]);
      const hits = [...new Set(queryTerms)].filter((t) => (tf.get(t) ?? 0) > 0);
      const contentHits = gatingTerms.filter((t) => (tf.get(t) ?? 0) > 0);
      return { chunk, bm25: bm, cosine: cos, hits, contentHits, hitCount: hits.length };
    });

    const maxBm = Math.max(...scored.map((s) => s.bm25), 0);
    const withScore = scored.map((s) => ({
      ...s,
      bm25Norm: maxBm > 0 ? s.bm25 / maxBm : 0,
      finalScore: (maxBm > 0 ? s.bm25 / maxBm : 0) * 0.6 + s.cosine * 0.4,
    }));

    const rankedRaw = withScore
      .filter((s) => s.bm25 > 0 && s.contentHits.length > 0) // 只命中疑问词/虚词的片段不参与排序
      .sort((a, b) => b.finalScore - a.finalScore);

    // 同小节被长度切分成多段且同时命中时，只保留最终分最高的一段（避免上下文里出现重叠重复句）
    const seenSection = new Set();
    const ranked = [];
    for (const s of rankedRaw) {
      const key = `${s.chunk.docId}|${s.chunk.section}`;
      if (seenSection.has(key)) continue;
      seenSection.add(key);
      ranked.push(s);
    }

    const top = ranked.slice(0, topK).map((s, i) => ({
      rank: i + 1,
      sourceId: `S${i + 1}`,
      chunkId: s.chunk.chunkId,
      docId: s.chunk.docId,
      title: s.chunk.title,
      section: s.chunk.section,
      text: s.chunk.text,
      charCount: s.chunk.charCount,
      bm25: Math.round(s.bm25 * 1000) / 1000,
      bm25Norm: Math.round(s.bm25Norm * 1000) / 1000,
      cosine: Math.round(s.cosine * 1000) / 1000,
      finalScore: Math.round(s.finalScore * 1000) / 1000,
      hitTerms: s.hits.slice(0, 8),
      contentHits: s.contentHits.slice(0, 8),
      relevant: s.finalScore >= threshold && s.bm25 > 0,
    }));

    const relevant = top.filter((t) => t.relevant);
    return {
      query,
      topK,
      threshold,
      ranked: top,
      relevant,
      relevantCount: relevant.length,
      insufficient: relevant.length === 0,
      queryTerms: [...new Set(queryTerms)].slice(0, 24),
      gatingTerms,
    };
  }

  return {
    search,
    size: n,
    idf,
    /** 展示用：片段数与平均字符数，写进报告 */
    stats: {
      chunkCount: n,
      avgCharCount: Math.round(chunks.reduce((s, c) => s + (c.charCount ?? c.text.length), 0) / n),
    },
  };
}
