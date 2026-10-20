/**
 * 测试夹具：用内存存储 + 可控的模型替身装配应用，
 * 使 T-01—T-12 可以在没有外网、没有密钥的环境下重复执行（NFR-03 的可验证性）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp, createMemoryAdapter } from '../core/index.js';
import { createMockModel } from '../server/mock-llm.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const SAMPLE_MENU_TEXT = fs.readFileSync(path.join(ROOT, 'sample-data', 'menu-sample.txt'), 'utf8');

export function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

/** 可控模型替身：normal / rate_limit / server_error / out_of_set / unsafe_text / short_list；hang 模拟超时 */
export function fakeFetch({ mode = 'normal', hang = false, latencyMs = 0, counter } = {}) {
  return async (url, init) => {
    if (counter) counter.calls += 1;
    if (hang) {
      return new Promise((_, reject) => {
        const fail = () => reject(Object.assign(new Error('请求已取消'), { name: 'AbortError' }));
        if (init?.signal) {
          if (init.signal.aborted) fail();
          else init.signal.addEventListener('abort', fail);
        }
      });
    }
    const payload = JSON.parse(init.body);
    try {
      const out = await createMockModel({ mode, latencyMs }).complete(payload);
      return jsonResponse(200, out);
    } catch (err) {
      return jsonResponse(err.status ?? 500, { error: { code: err.code, message: err.message } });
    }
  };
}

export function makeApp({ fetchImpl, config = {}, sink, now } = {}) {
  return createApp({
    storage: createMemoryAdapter(),
    sink,
    now,
    fetchImpl: fetchImpl ?? fakeFetch(),
    config: { llmRetries: 0, llmTimeoutMs: 500, ...config },
  });
}

export const DEFAULT_PROFILE = {
  tasteTags: ['辣', '清淡'],
  avoidList: ['花生', '虾'],
  healthGoal: '减脂',
  budget: { min: 8, max: 15 },
};

export function seedProfile(app, over = {}) {
  const res = app.profile.saveProfile({ ...DEFAULT_PROFILE, ...over });
  if (!res.ok) throw new Error(`画像保存失败：${res.errors.join('；')}`);
  return res.profile;
}

export function seedMenu(app, { text = SAMPLE_MENU_TEXT, date, canteen = '一食堂', windowName = '3 号窗口' } = {}) {
  const parsed = app.menu.parse(text);
  const saved = app.menu.saveMenuDay({ date, canteen, windowName, dishes: parsed.dishes, rawText: text });
  if (!saved.ok) throw new Error(`菜单保存失败：${saved.errors.join('；')}`);
  return { parsed, menu: saved.menu };
}

export function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function daysAgoStr(n) {
  const d = new Date(Date.now() - n * 86400000);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 固定的小菜单：用于可复现的排序断言（避免大菜单里同分项影响结论） */
export const FIXED_MENU = [
  '水煮鱼(草鱼、豆芽、辣椒) 15元',
  '清炒时蔬(青菜、蒜) 5元',
  '香煎鸡胸饭(鸡胸肉、米饭、西兰花) 12元',
  '番茄鸡蛋面(番茄、鸡蛋、面条) 9元',
].join('\n');
