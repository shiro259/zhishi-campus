/** 服务端配置：默认使用本地模拟模型（测试替身），配置密钥后走真实模型服务 */
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const config = {
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? '127.0.0.1',
  root: fileURLToPath(new URL('..', import.meta.url)),
  // mock：本地确定性模拟模型（无外网、无密钥时可运行，用于验收 V1—V5 的接口形状与降级路径）
  // real：转发到 OpenAI 兼容的模型服务（DeepSeek），密钥只存在于服务端（ADR-002）
  llmMode: process.env.ZS_LLM_MODE ?? (process.env.DEEPSEEK_API_KEY ? 'real' : 'mock'),
  llmProvider: process.env.ZS_LLM_PROVIDER ?? 'deepseek',
  llmBaseUrl: process.env.ZS_LLM_BASE_URL ?? 'https://api.deepseek.com/v1',
  llmModel: process.env.ZS_LLM_MODEL ?? 'deepseek-chat',
  llmApiKey: process.env.DEEPSEEK_API_KEY ?? '',
  requestTimeoutMs: Number(process.env.ZS_LLM_TIMEOUT_MS ?? 5000),
  logDir: process.env.ZS_LOG_DIR ?? 'data/logs',
  cleanMode: process.env.ZS_CLEAN === '1',
};
