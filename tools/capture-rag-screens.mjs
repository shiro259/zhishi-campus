/**
 * 实验5 截图工具：问一问（RAG）页面的真实操作截图
 *
 * 通过 CDP 驱动 headless Edge 真实点选问题、等待回答渲染后截图，
 * 并把每张图的可见文本与控制台报错写入清单（截图可用清单复核，不是摆拍）。
 *
 * 用法：
 *   1) node server/index.js（端口记在 ZS_APP_URL，默认 http://127.0.0.1:8788）
 *   2) msedge --headless=new --remote-debugging-port=9223 --user-data-dir=...
 *   3) node tools/capture-rag-screens.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = path.join(ROOT, 'docs', 'report', 'figures5');
const CDP = process.env.ZS_CDP_URL ?? 'http://127.0.0.1:9223';
const APP = process.env.ZS_APP_URL ?? 'http://127.0.0.1:8788';

class Session {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    this.consoleErrors = [];
    this.exceptions = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(`${msg.error.message} (${msg.error.code})`)) : resolve(msg.result);
        return;
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        this.consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '));
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        this.exceptions.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
      }
      this.handlers.get(msg.method)?.forEach((h) => h(msg.params));
    });
  }

  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    const session = new Session(ws);
    await session.send('Page.enable');
    await session.send('Runtime.enable');
    await session.send('Emulation.setDeviceMetricsOverride', { width: 440, height: 940, deviceScaleFactor: 2, mobile: true });
    return session;
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP 超时：${method}`));
        }
      }, 30000);
    });
  }

  resetLogs() { this.consoleErrors = []; this.exceptions = []; }

  async evaluate(expression, { awaitPromise = false } = {}) {
    const res = await this.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (res.exceptionDetails) throw new Error(`页面脚本异常：${res.exceptionDetails.exception?.description ?? res.exceptionDetails.text}`);
    return res.result?.value;
  }

  async goto(url) {
    const done = new Promise((resolve) => {
      this.handlers.set('Page.loadEventFired', [() => { this.handlers.delete('Page.loadEventFired'); resolve(); }]);
    });
    await this.send('Page.navigate', { url });
    await Promise.race([done, new Promise((r) => setTimeout(r, 8000))]);
    await new Promise((r) => setTimeout(r, 350));
  }

  async waitFor(expression, { timeoutMs = 20000, intervalMs = 200 } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.evaluate(expression)) return true;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error(`等待条件超时：${expression}`);
  }

  async text() { return this.evaluate('document.body.innerText'); }

  async setValue(selector, value) {
    await this.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error('缺少元素 ${selector}');
      el.value = ${JSON.stringify(value)};
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
  }

  async click(selector) {
    await this.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  }

  async screenshot(file) {
    const metrics = await this.send('Page.getLayoutMetrics');
    const { width, height } = metrics.cssContentSize ?? metrics.contentSize;
    const res = await this.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale: 1 },
    });
    fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
    return { width, height, bytes: fs.statSync(file).size };
  }
}

async function newTarget(url) {
  const res = await fetch(`${CDP}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  if (!res.ok) throw new Error(`无法新建标签页：HTTP ${res.status}`);
  return res.json();
}

async function closeTarget(id) {
  await fetch(`${CDP}/json/close/${id}`).catch(() => {});
}

async function ask(page, question) {
  await page.goto(`${APP}/rag`);
  await page.waitFor(`Boolean(document.querySelector('#askBtn'))`);
  await page.setValue('#question', question);
  await page.click('#askBtn');
  await page.waitFor(`!document.querySelector('#answerCard').hidden`);
  // 等状态条写完（回答卡里第 2 个段落带 ms 字样）
  await page.waitFor(`document.body.innerText.includes('ms')`);
}

const SCENES = [
  {
    id: 'fig5-1',
    name: '问一问-正常问答（宫保鸡丁含花生）',
    question: '宫保鸡丁里有没有花生？',
    note: 'RAG 正常路径：顶部状态条给出模型/耗时/token，回答正文标注资料编号，下方列出引用原文与检索 Top-k 明细（BM25、余弦、最终分、是否相关）。',
  },
  {
    id: 'fig5-2',
    name: '问一问-多片段综合（预算12元减脂）',
    question: '我预算 12 元、不吃辣、想减脂，帮我挑两三道菜并说说理由。',
    note: '多片段综合：检索同时命中预算、菜品卡片与膳食指南三个片段，回答把预算与清淡口味合在一起，引用 2—3 条来源。',
  },
  {
    id: 'fig5-3',
    name: '问一问-资料不足（知识库无此内容）',
    question: '三食堂二楼这周新上了什么菜？',
    note: '资料不足路径：知识库只覆盖一食堂一楼 3 号窗口，页面直接给出"资料不足"与追问，不发模型请求、不编造菜名。',
  },
  {
    id: 'fig5-4',
    name: '问一问-程序侧护栏（超范围问题）',
    question: '我对花生过敏，能不能吃抗过敏药来预防？',
    note: '护栏路径：用药类问题在程序侧被拦截，页面提示"超出选餐助手处理范围"并说明可以问什么，未调用模型。',
  },
];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const target = await newTarget(`${APP}/rag`);
  const page = await Session.connect(target.webSocketDebuggerUrl);
  const manifest = [];
  try {
    for (const scene of SCENES) {
      page.resetLogs();
      const file = path.join(OUT_DIR, `${scene.id}-${scene.name}.png`);
      try {
        await ask(page, scene.question);
        const shot = await page.screenshot(file);
        const text = await page.text();
        manifest.push({
          id: scene.id, name: scene.name, question: scene.question, note: scene.note,
          url: await page.evaluate('location.href'),
          file: path.relative(ROOT, file).replace(/\\/g, '/'),
          size: `${shot.width}x${shot.height}`, bytes: shot.bytes,
          visibleText: text.replace(/\s*\n\s*/g, ' | ').slice(0, 900),
          consoleErrors: page.consoleErrors, exceptions: page.exceptions,
          ok: page.exceptions.length === 0,
        });
        console.log(`✔ ${scene.id} ${scene.name} → ${shot.width}x${shot.height}, ${shot.bytes}B`);
      } catch (err) {
        let shot = null;
        let text = '';
        try {
          shot = await page.screenshot(path.join(OUT_DIR, `${scene.id}-FAILED.png`));
          text = await page.text();
        } catch { /* ignore */ }
        manifest.push({
          id: scene.id, name: scene.name, tag: 'FAILED', failed: err.message,
          file: shot ? path.relative(ROOT, path.join(OUT_DIR, `${scene.id}-FAILED.png`)).replace(/\\/g, '/') : null,
          visibleText: text.replace(/\s*\n\s*/g, ' | ').slice(0, 900),
          consoleErrors: page.consoleErrors, exceptions: page.exceptions,
        });
        console.log(`✖ ${scene.id} ${scene.name} 失败：${err.message}`);
      }
    }
  } finally {
    await closeTarget(target.id);
  }
  const manifestFile = path.join(OUT_DIR, 'manifest-lab5.json');
  fs.writeFileSync(manifestFile, JSON.stringify({ capturedAt: new Date().toISOString(), app: APP, scenes: manifest }, null, 2), 'utf8');
  console.log(`\n清单：${path.relative(ROOT, manifestFile)}（${manifest.filter((m) => !m.failed).length}/${manifest.length} 成功）`);
  if (manifest.some((m) => m.failed)) process.exitCode = 1;
}

main().catch((err) => {
  console.error('截图失败：', err);
  process.exit(1);
});
