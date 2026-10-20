/**
 * 界面截图工具（实验4 3.x 操作记录的截图证据）
 *
 * 做法：通过 Chrome DevTools Protocol 驱动一个 headless Edge，
 * 用真实点击/输入操作走完整流程后截图，并把每张图的页面可见文本与
 * 控制台报错一并写入清单文件 —— 截图不是"摆拍"，可以用清单复核。
 *
 * 用法：
 *   1) 先启动应用：node server/index.js
 *   2) 启动浏览器：msedge --headless=new --remote-debugging-port=9222 --user-data-dir=...
 *   3) node tools/capture-screens.mjs --set=full --tag=v0.2
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = path.join(ROOT, 'docs', 'report', 'figures4');
const CDP = 'http://127.0.0.1:9222';
const APP = process.env.ZS_APP_URL ?? 'http://127.0.0.1:8787';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const TAG = args.tag ?? 'v0.2';
const ONLY = args.only ? String(args.only).split(',') : null;

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
      if (msg.method === 'Log.entryAdded' && ['error', 'warning'].includes(msg.params.entry.level)) {
        this.consoleErrors.push(`[${msg.params.entry.level}] ${msg.params.entry.text} ${msg.params.entry.url ?? ''}`);
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
    await session.send('Log.enable');
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: 440, height: 940, deviceScaleFactor: 2, mobile: true,
    });
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

  resetLogs() {
    this.consoleErrors = [];
    this.exceptions = [];
  }

  async evaluate(expression, { awaitPromise = false } = {}) {
    const res = await this.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (res.exceptionDetails) {
      throw new Error(`页面脚本异常：${res.exceptionDetails.exception?.description ?? res.exceptionDetails.text}`);
    }
    return res.result?.value;
  }

  async goto(url) {
    const done = new Promise((resolve) => {
      const off = () => this.handlers.delete('Page.loadEventFired');
      this.handlers.set('Page.loadEventFired', [() => { off(); resolve(); }]);
    });
    await this.send('Page.navigate', { url });
    await Promise.race([done, new Promise((r) => setTimeout(r, 8000))]);
    await new Promise((r) => setTimeout(r, 350));
  }

  async waitFor(expression, { timeoutMs = 8000, intervalMs = 150 } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.evaluate(expression)) return true;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error(`等待条件超时：${expression}`);
  }

  async text() {
    return this.evaluate('document.body.innerText');
  }

  async clickByText(text, selector = 'button,a') {
    const ok = await this.evaluate(`(() => {
      const nodes = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const hit = nodes.find(n => n.textContent.trim().includes(${JSON.stringify(text)}));
      if (!hit) return false;
      hit.click();
      return true;
    })()`);
    if (!ok) throw new Error(`找不到包含「${text}」的可点击元素`);
    await new Promise((r) => setTimeout(r, 350));
  }

  async setValue(selector, value) {
    await this.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error('缺少元素 ${selector}');
      el.value = ${JSON.stringify(value)};
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
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

// ------------------------------------------------------------------ 场景
/** 保证本机已有画像与当日菜单：没有就走 P5 的"载入样例数据"入口（真实操作，不直接写存储） */
async function ensureProfileAndMenu(page) {
  const ready = await page.evaluate(`Boolean(localStorage.getItem('zs:profile')) && Boolean(localStorage.getItem('zs:menuIndex'))`);
  if (ready) return false;
  await page.goto(`${APP}/privacy`);
  await page.clickByText('载入样例数据');
  await new Promise((r) => setTimeout(r, 700));
  return true;
}

const SCENES = [
  {
    id: 'fig4-1',
    name: '首页-首次使用空状态',
    note: '首次打开（本机无任何数据）时首页的状态：提示先设置画像、再维护菜单，不放占位假数据。',
    async run(page) {
      await page.goto(`${APP}/`);
      await page.evaluate('localStorage.clear(); true');
      await page.goto(`${APP}/`);
      await page.waitFor(`document.body.innerText.includes('未维护菜单')`);
      await page.waitFor(`document.body.innerText.includes('设置口味画像')`);
    },
  },
  {
    id: 'fig4-2',
    name: '推荐页-菜单未维护空态',
    note: '未维护当日菜单时推荐页不发模型请求，直接给出"暂无可靠菜单数据"和下一步按钮。',
    async run(page) {
      // 先只设置画像、不维护菜单：验证"未维护当日菜单"的空态分支
      await page.goto(`${APP}/`);
      if (!(await page.evaluate(`Boolean(localStorage.getItem('zs:profile'))`))) {
        await page.evaluate(`(() => {
          [...document.querySelectorAll('#profileCard button')]
            .filter(b => ['清淡', '微辣'].includes(b.textContent.trim()))
            .forEach(b => b.click());
          return true;
        })()`);
        await page.clickByText('保存画像');
        await page.waitFor(`document.body.innerText.includes('我的口味画像')`);
      }
      await page.evaluate(`localStorage.removeItem('zs:menuIndex'); true`);
      await page.goto(`${APP}/recommend`);
      await page.waitFor(`document.body.innerText.includes('暂无可靠菜单数据')`);
    },
  },
  {
    id: 'fig4-3',
    name: '菜单维护页-解析结果（含未识别行）',
    note: '粘贴食堂公示文本后解析：识别 12 道，1 行无法识别的原文回显并要求手动补充，程序不猜测菜名。',
    async run(page) {
      await page.goto(`${APP}/menu`);
      const raw = await page.evaluate(`fetch('/sample-data/menu-sample.txt').then(r => r.text())`, { awaitPromise: true });
      await page.setValue('#rawText', `${raw}\n这一行既没有菜名结构也没有价格而且特别特别长长长长长长`);
      await page.clickByText('解析为菜品列表');
      await page.waitFor(`document.body.innerText.includes('未能识别')`);
    },
  },
  {
    id: 'fig4-4',
    name: '菜单维护页-保存当日菜单',
    note: '人工核对后可保存；保存成功给出道数与覆盖提示，并列出本机已保存的菜单。',
    async run(page) {
      await page.clickByText('保存当日菜单');
      await page.waitFor(`document.body.innerText.includes('已保存的菜单')`);
    },
  },
  {
    id: 'fig4-5',
    name: '首页-画像与菜单状态',
    note: '设置画像并维护菜单后，首页显示画像摘要、菜单状态与更新时间，可一键进入选餐。',
    async run(page) {
      await page.goto(`${APP}/`);
      await ensureProfileAndMenu(page);
      await page.goto(`${APP}/`);
      await page.waitFor(`document.body.innerText.includes('我的口味画像')`);
      await page.waitFor(`document.body.innerText.includes('已维护')`);
    },
  },
  {
    id: 'fig4-6',
    name: '推荐页-AI 实时推荐 Top3',
    note: '模型可用时返回恰 3 条推荐，含一句话理由、价格、口味标签与"近 7 天没吃过"标记；状态条为绿色。',
    async run(page) {
      await page.goto(`${APP}/`);
      await ensureProfileAndMenu(page);
      await page.goto(`${APP}/recommend`);
      await page.waitFor(`document.querySelectorAll('.dish').length >= 3`);
    },
  },
  {
    id: 'fig4-7',
    name: '推荐页-模型不可用时降级',
    note: '模型超时/429 时自动改用本地规则排序：状态条转橙并说明原因，3 条推荐与记录功能照常可用。',
    async run(page) {
      await page.goto(`${APP}/`);
      await ensureProfileAndMenu(page);
      await page.goto(`${APP}/recommend?mock=rate_limit`);
      // 用"换一批"绕过 24 小时缓存，确保真的发起一次模型调用
      await page.waitFor(`document.querySelectorAll('.dish').length >= 3 || document.body.innerText.includes('暂无可靠菜单数据')`);
      await page.clickByText('换一批');
      await page.waitFor(`document.body.innerText.includes('规则推荐') || document.body.innerText.includes('推荐失败')`);
    },
  },
  {
    id: 'fig4-8',
    name: '推荐页-忌口命中与强制确认',
    note: '候选菜单命中忌口（花生）时，记录按钮先弹出强制确认，只有"已向窗口确认"或"换一道菜"两个出口。',
    async run(page) {
      await page.goto(`${APP}/menu`);
      await page.setValue('#rawText', '水煮鱼(草鱼、豆芽、辣椒) 15元\n宫保鸡丁(鸡丁、花生、黄瓜) 11元\n清炒时蔬(青菜、蒜) 5元');
      await page.clickByText('解析为菜品列表');
      await page.waitFor(`document.body.innerText.includes('解析结果')`);
      await page.clickByText('保存当日菜单');
      await page.waitFor(`document.body.innerText.includes('已保存的菜单')`);
      await page.goto(`${APP}/recommend`);
      await page.waitFor(`document.body.innerText.includes('可能含有花生')`);
      await page.evaluate(`(() => {
        const card = [...document.querySelectorAll('.dish')].find(c => c.textContent.includes('宫保鸡丁'));
        [...card.querySelectorAll('button')].find(b => b.textContent.includes('记录为今日就餐')).click();
        return true;
      })()`);
      await page.waitFor(`document.querySelector('.modal') !== null`);
    },
  },
  {
    id: 'fig4-9',
    name: '记录与反馈页',
    note: '确认后写入就餐记录（含确认时间留痕），可一键反馈"符合/不符合"并查看历史与修改入口。',
    async run(page) {
      await page.clickByText('已向窗口确认');
      await page.goto(`${APP}/record`);
      await page.waitFor(`document.body.innerText.includes('今天的就餐记录')`);
      if (await page.evaluate(`document.body.innerText.includes('符合口味')`)) {
        await page.clickByText('👍 符合口味');
        await page.waitFor(`document.body.innerText.includes('已反馈')`);
      }
    },
  },
  {
    id: 'fig4-10',
    name: '隐私与数据页',
    note: '可核对的"采集什么/不采集什么"清单，以及导出、样例数据恢复与清空入口。',
    async run(page) {
      await page.goto(`${APP}/privacy`);
      await page.waitFor(`document.body.innerText.includes('本机保存了什么')`);
    },
  },
  {
    id: 'fig4-11',
    name: '清空数据-二次确认',
    note: '清空必须二次确认，默认焦点在"取消"；确认后删除画像、菜单、记录、反馈与缓存。',
    async run(page) {
      await page.clickByText('清空全部数据');
      await page.waitFor(`document.querySelector('.modal') !== null`);
    },
  },
  {
    id: 'fig4-12',
    name: '清空后首页回到首次使用状态',
    note: '清空后本机不残留业务数据，首页回到"未维护菜单/未设置画像"的首次使用状态。',
    async run(page) {
      await page.clickByText('确认清空');
      await page.goto(`${APP}/`);
      await page.waitFor(`document.body.innerText.includes('未维护菜单')`);
    },
  },
];

const SCENE_SETS = {
  basic: ['fig4-1', 'fig4-3', 'fig4-6'],
  full: SCENES.map((s) => s.id),
};

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const wanted = ONLY ?? SCENE_SETS[args.set ?? 'full'] ?? SCENE_SETS.full;
  const scenes = SCENES.filter((s) => wanted.includes(s.id));
  const manifest = [];

  const target = await newTarget('about:blank');
  const page = await Session.connect(target.webSocketDebuggerUrl);
  try {
    for (const scene of scenes) {
      page.resetLogs();
      const file = path.join(OUT_DIR, `${scene.id}-${scene.name}.png`);
      try {
        await scene.run(page);
        const shot = await page.screenshot(file);
        const text = await page.text();
        manifest.push({
          id: scene.id, name: scene.name, tag: TAG, note: scene.note, url: await page.evaluate('location.href'),
          file: path.relative(ROOT, file).replace(/\\/g, '/'),
          size: `${shot.width}x${shot.height}`, bytes: shot.bytes,
          visibleText: text.replace(/\s*\n\s*/g, ' | ').slice(0, 700),
          consoleErrors: page.consoleErrors,
          exceptions: page.exceptions,
          ok: page.exceptions.length === 0,
        });
        console.log(`✔ ${scene.id} ${scene.name} → ${shot.width}x${shot.height}, ${shot.bytes}B`);
        if (page.exceptions.length) console.log(`   ⚠ 页面异常：${page.exceptions.join(' / ')}`);
      } catch (err) {
        // 失败时也保留截图：操作记录必须包含失败状态，不能只展示成功页面
        let shot = null;
        let text = '';
        try {
          shot = await page.screenshot(`${OUT_DIR}/${scene.id}-${TAG}-FAILED.png`);
          text = await page.text();
        } catch { /* 截图失败忽略 */ }
        manifest.push({
          id: scene.id, name: scene.name, tag: TAG, note: scene.note, failed: err.message,
          file: shot ? path.relative(ROOT, `${OUT_DIR}/${scene.id}-${TAG}-FAILED.png`).replace(/\\/g, '/') : null,
          visibleText: text.replace(/\s*\n\s*/g, ' | ').slice(0, 700),
          consoleErrors: page.consoleErrors, exceptions: page.exceptions,
        });
        console.log(`✖ ${scene.id} ${scene.name} 失败：${err.message}`);
      }
    }
  } finally {
    await closeTarget(target.id);
  }

  const manifestFile = path.join(OUT_DIR, `manifest-${TAG}.json`);
  fs.writeFileSync(manifestFile, JSON.stringify({ tag: TAG, capturedAt: new Date().toISOString(), app: APP, scenes: manifest }, null, 2), 'utf8');
  console.log(`\n清单：${path.relative(ROOT, manifestFile)}（${manifest.filter((m) => !m.failed).length}/${manifest.length} 成功）`);
  if (manifest.some((m) => m.failed)) process.exitCode = 1;
}

main().catch((err) => {
  console.error('截图失败：', err);
  process.exit(1);
});
