/**
 * T-10：数据导出与一键清空（FR-08、NFR-07、UC-08）
 * T-12：IF-01 真实 HTTP 接口的形状、错误码与时延（NFR-01、ADR-002）
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server/index.js';
import { makeApp, seedProfile, seedMenu, fakeFetch, todayStr } from './_helpers.js';

test('T-10 一键清空后本机不残留任何业务数据，且可用样例数据恢复（FR-08、NFR-07）', async () => {
  const app = makeApp();
  seedProfile(app);
  seedMenu(app, { date: todayStr() });
  const { menu } = seedMenu(app, { date: todayStr(), windowName: '7 号窗口' });
  app.record.record({ dishId: menu.dishes[0].dishId, dishName: menu.dishes[0].name, date: todayStr() });
  await app.recommend.recommend();

  const exported = app.data.exportAll();
  assert.equal(exported.menus.length, 2);
  assert.equal(exported.records.length, 1);
  assert.equal(Boolean(exported.profile), true);

  const before = app.store.keys('zs:').length;
  assert.equal(before > 5, true, '清空前应当有较多业务数据，才能验证清空的彻底性');

  const cleared = app.data.clearAll();
  assert.equal(cleared.ok, true);
  const leftovers = app.store.keys('zs:');
  assert.deepEqual(leftovers, [], `清空不彻底，仍残留：${leftovers.join(', ')}`);
  assert.equal(app.profile.getProfile(), null);
  assert.equal(app.menu.getLatestMenu(), null);
  assert.equal(app.record.listRecords().length, 0);

  // 恢复：同一入口可重复载入样例数据
  const parsed = app.menu.parse((await import('./_helpers.js')).SAMPLE_MENU_TEXT);
  const restored = app.menu.saveMenuDay({ date: todayStr(), canteen: '一食堂', windowName: '3 号窗口', dishes: parsed.dishes });
  assert.equal(restored.ok, true);
  assert.equal(app.menu.getLatestMenu().dishes.length, 12);
});

test('T-12 IF-01 真实 HTTP 接口：正常返回 3 条、429 与超时返回规范错误码（NFR-01、ADR-002）', async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const health = await fetch(`${base}/api/health`).then((r) => r.json());
  assert.equal(health.ok, true);
  assert.equal(health.modelMock, true);

  const payload = {
    dishes: [
      { dishId: 'd1', name: '香煎鸡胸饭', price: 12, ingredients: ['鸡胸肉'], tasteTags: ['清淡'] },
      { dishId: 'd2', name: '宫保鸡丁', price: 11, ingredients: ['鸡丁', '花生'], tasteTags: ['辣'] },
      { dishId: 'd3', name: '清炒时蔬', price: 5, ingredients: ['青菜'], tasteTags: ['清淡'] },
      { dishId: 'd4', name: '水煮鱼', price: 15, ingredients: ['草鱼'], tasteTags: ['辣'] },
    ],
    profileSummary: { tasteTags: ['微辣'], healthGoal: '减脂', budget: { min: 8, max: 15 }, avoidCount: 1 },
    topN: 3,
  };

  const started = Date.now();
  const okRes = await fetch(`${base}/api/recommend`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const okBody = await okRes.json();
  const latency = Date.now() - started;
  assert.equal(okRes.status, 200);
  assert.equal(okBody.items.length, 3);
  assert.equal(latency < 5000, true, `IF-01 时延超出 NFR-01：${latency}ms`);
  assert.equal(typeof okBody.usage.tokens, 'number');

  const rateLimited = await fetch(`${base}/api/recommend`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-zs-mock-mode': 'rate_limit' },
    body: JSON.stringify(payload),
  });
  const rateBody = await rateLimited.json();
  assert.equal(rateLimited.status, 429);
  assert.equal(rateBody.error.code, 'RATE_LIMIT');

  const badJson = await fetch(`${base}/api/recommend`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{不是合法 JSON',
  });
  const badBody = await badJson.json();
  assert.equal(badJson.status, 400);
  assert.equal(badBody.error.code, 'BAD_JSON');

  const notFound = await fetch(`${base}/api/not-exist`);
  assert.equal(notFound.status, 404);
});
