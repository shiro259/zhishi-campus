/**
 * RAG 最小链路（实验5 2.4、2.6）：问题输入 → 检索 → 上下文组织 → 模型调用 → 回答返回
 *
 * 对外只暴露 ask()，依赖由调用方注入（检索器 + 网关），便于测试与替换：
 *   const rag = createRagService({ retriever, gateway, promptVersion: 'v2' });
 *   const res = await rag.ask({ question: '宫保鸡丁里有花生吗？' });
 * 输入：{ question: string, history?: [{role:'user'|'assistant', content}] }
 * 输出：{ answer, citations, sources, insufficient, followup, validation, latencyMs, tokens, retrieved }
 * 失败返回：检索无结果 → insufficient=true，不发模型请求；模型不可用 → 抛错（由调用方降级）。
 */
import { renderContext, renderTemplate, estimateTokens } from './prompt.js';
import { validateAnswer } from './validate.js';
import { guardQuestion, guardedReply } from './guard.js';

export const DEFAULT_RAG_CONFIG = {
  promptVersion: 'v2',
  topK: 4,
  threshold: 0.2,
  maxHistoryTurns: 2,
};

export function createRagService({ retriever, gateway, config = {}, now = () => Date.now() } = {}) {
  const cfg = { ...DEFAULT_RAG_CONFIG, ...config };

  /**
   * @param {{question:string, history?:Array<{role:string,content:string}>, topK?:number, promptVersion?:string}} input
   */
  async function ask({ question, history = [], topK = cfg.topK, promptVersion = cfg.promptVersion } = {}) {
    const startedAt = now();
    const q = String(question ?? '').trim();

    // ① 程序侧护栏：空问题、超长问题、明显超出选餐范围的问题 → 不发模型请求
    const guard = guardQuestion(q);
    if (guard.intent !== 'ok') {
      const reply = guardedReply(guard);
      return {
        question: q,
        answer: reply.answer,
        citations: [], sources: [],
        insufficient: reply.insufficient,
        followup: reply.followup,
        validation: { ok: true, issues: [], answer: null, guarded: guard.intent },
        latencyMs: now() - startedAt,
        tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        retrieved: { query: q, topK, threshold: cfg.threshold, ranked: [], relevant: [], relevantCount: 0, insufficient: true, guarded: guard.intent },
        promptChars: 0,
        promptEstimateTokens: 0,
        template: promptVersion,
        engine: 'rag',
        guarded: guard,
      };
    }

    const search = retriever.search(q, { topK, threshold: cfg.threshold });
    const hits = search.relevant; // 只有判为相关的片段才进入上下文
    if (hits.length === 0) {
      const latencyMs = now() - startedAt;
      return {
        question: q,
        answer: `资料不足：知识库里没有找到与「${q}」相关的内容，建议到窗口查看当日菜牌，或换个问法。`,
        citations: [], sources: [],
        insufficient: true,
        followup: '可以告诉我你想吃荤还是素、预算多少、有没有忌口，我再帮你挑两三道菜。',
        validation: { ok: true, issues: [], answer: null, guarded: 'NO_RETRIEVAL' },
        latencyMs,
        tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        retrieved: search,
        promptChars: 0,
        promptEstimateTokens: 0,
        template: promptVersion,
        engine: 'rag',
      };
    }

    const context = renderContext(hits);
    const historyTurns = history.slice(-cfg.maxHistoryTurns * 2);
    const rendered = renderTemplate(promptVersion, { context, question: q, history: historyTurns });
    const promptChars = rendered.messages.reduce((s, m) => s + m.content.length, 0);

    let raw;
    try {
      raw = await gateway.chat({ messages: rendered.messages, question: q, meta: { promptVersion } });
    } catch (err) {
      err.code = err.code ?? 'LLM_FAILED';
      throw err;
    }

    const validation = validateAnswer(raw.content, { hits });
    const latencyMs = now() - startedAt;
    const answer = validation.answer;
    const citations = answer?.citations ?? [];

    return {
      question: q,
      answer: answer?.answer ?? '',
      citations: citations.map((c) => ({ ...c, chunk: hits.find((h) => h.sourceId === c.id)?.chunkId ?? null })),
      sources: hits.map((h) => ({
        sourceId: h.sourceId, chunkId: h.chunkId, docId: h.docId, title: h.title, section: h.section,
        charCount: h.charCount, finalScore: h.finalScore, bm25: h.bm25, cosine: h.cosine,
      })),
      insufficient: answer?.insufficient === true,
      followup: answer?.followup ?? '',
      validation,
      latencyMs,
      tokens: {
        promptTokens: raw.usage?.promptTokens ?? null,
        completionTokens: raw.usage?.completionTokens ?? null,
        totalTokens: raw.usage?.totalTokens ?? null,
      },
      retrieved: search,
      promptChars,
      promptEstimateTokens: estimateTokens(rendered.system + rendered.user),
      template: promptVersion,
      engine: 'rag',
      model: raw.model,
      // 便于记录"实际发送的输入与原始返回"（实验5 2.1/2.4 的证据）
      request: rendered.messages,
      raw: raw.content,
    };
  }

  return { ask, config: cfg };
}
