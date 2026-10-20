/**
 * 表现层公共代码：创建应用实例（浏览器 localStorage 作为 D1 适配器）、日志批量上报、通用 DOM 工具。
 * 说明：业务数据只存本机（ADR-003），页面之间通过 localStorage 共享，不依赖服务端会话。
 */
import { createApp, createLocalStorageAdapter, NS } from '../../core/index.js';

const LOG_BUFFER = [];
const MAX_BUFFER = 200;

function sink(entry) {
  LOG_BUFFER.push(entry);
  if (LOG_BUFFER.length > MAX_BUFFER) LOG_BUFFER.splice(0, LOG_BUFFER.length - MAX_BUFFER);
  const fn = entry.level === 'error' ? console.error : entry.level === 'warn' ? console.warn : console.log;
  fn.call(console, `[${entry.scope}] ${entry.event}`, entry);
}

export function flushLogs() {
  if (LOG_BUFFER.length === 0) return Promise.resolve();
  const entries = LOG_BUFFER.splice(0, LOG_BUFFER.length);
  return fetch('/api/log', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ entries }),
  }).catch(() => {});
}

// 日志批量上报，避免每个事件一次请求
setInterval(flushLogs, 1200);
window.addEventListener('pagehide', flushLogs);
window.addEventListener('beforeunload', flushLogs);

/** 本地测试开关：URL 带 ?mock=timeout|rate_limit|out_of_set|unsafe_text|short_list 时，
 *  由 IF-01 返回对应故障，用于验证降级与拦截（仅 mock 模型模式生效）。 */
const mockMode = new URLSearchParams(location.search).get('mock');

export function getMockMode() {
  return mockMode ?? sessionStorage.getItem('zs:mockMode') ?? 'normal';
}

function installMockMode() {
  const fromUrl = new URLSearchParams(location.search).get('mock');
  if (fromUrl) {
    sessionStorage.setItem('zs:mockMode', fromUrl);
    document.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href');
      if (href && href.startsWith('/') && !href.startsWith('//')) {
        a.setAttribute('href', `${href}${href.includes('?') ? '&' : '?'}mock=${fromUrl}`);
      }
    });
  }
}

export const app = createApp({
  storage: createLocalStorageAdapter(window.localStorage),
  sink,
  config: { llmHeaders: mockMode ? { 'x-zs-mock-mode': mockMode } : {} },
});

// ---------------------------------------------------------------- DOM 工具
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function toast(message, ms = 2200) {
  $$('.toast').forEach((t) => t.remove());
  const node = el('div', { class: 'toast', text: message });
  document.body.append(node);
  setTimeout(() => node.remove(), ms);
}

export function formatTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function yesterdayStr(offset = 1) {
  const d = new Date(Date.now() - offset * 86400000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 底部导航：5 个入口对应实验3 图3-5 的 P1—P5 */
export function renderTabs(active) {
  const items = [
    ['/', '首页'],
    ['/menu', '菜单'],
    ['/recommend', '选餐'],
    ['/record', '记录'],
    ['/privacy', '我的数据'],
  ];
  const bar = el('nav', { class: 'tabbar' }, items.map(([href, label]) =>
    el('a', { href, class: href === active ? 'active' : '', text: label })));
  document.body.append(bar);
}

const SAMPLE_MENU_URL = '/sample-data/menu-sample.txt';

export async function fetchSampleMenuText() {
  const res = await fetch(SAMPLE_MENU_URL);
  if (!res.ok) throw new Error(`样例菜单加载失败：HTTP ${res.status}`);
  return res.text();
}

/** 样例数据初始化（实验4 2.2：可重复使用的样例数据；清空后可用同一入口恢复） */
export async function loadSampleData({ withProfile = true } = {}) {
  const raw = await fetchSampleMenuText();
  const parsed = app.menu.parse(raw);
  const saved = app.menu.saveMenuDay({
    date: todayStr(),
    canteen: '一食堂',
    windowName: '3 号窗口',
    dishes: parsed.dishes,
    rawText: raw,
    source: 'sample',
  });
  if (!saved.ok) return { ok: false, errors: saved.errors };
  if (withProfile) {
    app.profile.saveProfile({
      tasteTags: ['微辣', '清淡'],
      avoidList: ['花生', '虾'],
      healthGoal: '减脂',
      budget: { min: 8, max: 15 },
    });
  }
  app.logger.info('sample.loaded', { dishCount: parsed.dishes.length, failedLineCount: parsed.failedLines.length });
  return { ok: true, dishCount: parsed.dishes.length, failedLineCount: parsed.failedLines.length };
}

installMockMode();

export { NS };
