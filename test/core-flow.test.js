/**
 * T-01—T-09：核心业务闭环的功能测试（对应实验2 表3-6 的验收示例 V1—V5 与 FR-01—FR-08）
 * 运行：node --test test/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLogger } from '../core/logger.js';
import { createCollectingSink } from '../core/logger.js';
import {
  makeApp, seedProfile, seedMenu, fakeFetch, todayStr, daysAgoStr, FIXED_MENU, SAMPLE_MENU_TEXT,
} from './_helpers.js';

test('T-01 画像保存后可读取，重启（新实例、同一存储）不丢失（FR-01、NFR-04）', () => {
  const app = makeApp();
  seedProfile(app);
  const again = app.profile.getProfile();
  assert.equal(again.tasteTags.includes('辣'), true);
  assert.equal(again.avoidList.length, 2);
  assert.equal(again.healthGoal, '减脂');

  // 非法输入必须有明确结论，不能写入
  const bad = app.profile.saveProfile({ tasteTags: [], avoidList: [], healthGoal: '增肌', budget: { min: 20, max: 5 } });
  assert.equal(bad.ok, false);
  assert.match(bad.errors.join('；'), /预算上限/);
});

test('T-02 菜单解析：12 行全部识别；空文本给出"逐条手动添加"且不编造菜名（IF-02、NFR-02）', () => {
  const app = makeApp();
  const parsed = app.menu.parse(SAMPLE_MENU_TEXT);
  assert.equal(parsed.status, 'OK');
  assert.equal(parsed.dishes.length, 12);
  assert.equal(parsed.failedLines.length, 0);
  assert.equal(parsed.dishes[0].name, '香煎鸡胸饭');
  assert.equal(parsed.dishes[0].price, 12);

  const empty = app.menu.parse('   \n  ');
  assert.equal(empty.status, 'EMPTY');
  assert.equal(empty.dishes.length, 0);
  assert.match(empty.message, /手动添加/);

  const messy = app.menu.parse('香煎鸡胸饭 12元\n这一行没有价格也没有菜名结构并且特别长特别长特别长长长长长长\n');
  assert.equal(messy.failedLines.length >= 1, true, '无法识别的行必须回显而不是被静默丢弃');
});

test('T-03 推荐返回恰 3 条、字段完整、dishId 均在候选集合内（V1、IF-06）', async () => {
  const app = makeApp({ fetchImpl: fakeFetch({ mode: 'normal' }) });
  seedProfile(app);
  const { menu } = seedMenu(app, { date: todayStr() });
  const candidateIds = new Set(menu.dishes.map((d) => d.dishId));

  const res = await app.recommend.recommend();
  assert.equal(res.status, 'OK');
  assert.equal(res.items.length, 3);
  assert.equal(res.engine, 'ai');
  for (const item of res.items) {
    assert.equal(candidateIds.has(item.dishId), true, `推荐结果越界：${item.dishId}`);
    assert.equal(typeof item.score, 'number');
    assert.equal(typeof item.reason, 'string');
    assert.equal(item.reason.length > 0, true);
  }
});

test('T-04 当日菜单未维护（无菜单 / 只有昨天菜单）→ 返回空态且不调用模型（V2、S5、NFR-03）', async () => {
  // (a) 完全没有菜单
  const counterA = { calls: 0 };
  const appA = makeApp({ fetchImpl: fakeFetch({ counter: counterA }) });
  seedProfile(appA);
  const resA = await appA.recommend.recommend();
  assert.equal(resA.status, 'EMPTY_MENU');
  assert.match(resA.message, /暂无可靠菜单数据/);
  assert.equal(counterA.calls, 0, '菜单为空时不允许调用模型');

  // (b) 只有昨天维护的菜单，今天未维护
  const counterB = { calls: 0 };
  const appB = makeApp({ fetchImpl: fakeFetch({ counter: counterB }) });
  seedProfile(appB);
  seedMenu(appB, { date: daysAgoStr(1) });
  const resB = await appB.recommend.recommend();
  assert.equal(resB.status, 'EMPTY_MENU', '过期菜单不得当作今日菜单使用');
  assert.equal(counterB.calls, 0);
});

test('T-05 配料未知的菜品标记为"未知"，不得补全配料，也不得输出确定性安全结论（V2、S6、NFR-06）', async () => {
  const app = makeApp();
  seedProfile(app);
  const text = '香煎鸡胸饭(鸡胸肉、米饭) 12元\n清炒时蔬(青菜) 5元\n特色小炒 9元\n';
  const { menu } = seedMenu(app, { date: todayStr(), text });
  const mystery = menu.dishes.find((d) => d.name === '特色小炒');

  assert.equal(mystery.ingredients, null, '配料未知必须是 null，不能用"未知"占位并当作已知');
  assert.equal(mystery.infoComplete, false);

  const check = app.risk.check(mystery, ['花生']);
  assert.equal(check.unknown, true);
  assert.match(check.hint, /现场核对/);
  assert.doesNotMatch(check.hint, /不含|可以吃|放心|没问题/);
});

test('T-06 忌口命中时必须提示"可能含有"且用户未确认前不可记录（V3、FR-05）', async () => {
  const app = makeApp();
  seedProfile(app, { avoidList: ['花生'] });
  const { menu } = seedMenu(app, { date: todayStr() });
  const kungpao = menu.dishes.find((d) => d.name === '宫保鸡丁');

  const check = app.risk.check(kungpao, ['花生']);
  assert.equal(check.hit, true);
  assert.equal(check.allowRecord, false, '命中忌口时 allowRecord 必须为 false');
  assert.equal(check.hint, '可能含有花生，请向窗口确认');
  assert.doesNotMatch(check.hint, /不含|可以吃|放心/);

  const blocked = app.record.record({ dishId: kungpao.dishId, dishName: kungpao.name, tasteTags: kungpao.tasteTags, date: todayStr() });
  assert.equal(blocked.ok, false, '未确认忌口提示时不得写入就餐记录');
  assert.equal(app.record.todayRecords(todayStr()).length, 0);

  app.risk.confirm(kungpao.dishId);
  const allowed = app.record.record({
    dishId: kungpao.dishId,
    dishName: kungpao.name,
    tasteTags: kungpao.tasteTags,
    date: todayStr(),
    riskConfirmedAt: app.risk.confirmedAt(kungpao.dishId),
  });
  assert.equal(allowed.ok, true);
  assert.equal(Boolean(allowed.record.riskConfirmedAt), true, '确认动作必须留痕');
});

test('T-07 模型超时或 429 时自动降级为规则推荐，核心流程不中断（V4、NFR-03）', async () => {
  const app = makeApp({ fetchImpl: fakeFetch({ mode: 'rate_limit' }) });
  seedProfile(app);
  seedMenu(app, { date: todayStr() });

  const res = await app.recommend.recommend();
  assert.equal(res.status, 'OK');
  assert.equal(res.engine, 'rules');
  assert.equal(res.degraded, true);
  assert.equal(res.items.length, 3);
  assert.match(res.degradedReason ?? '', /模型服务|超时|繁忙/);
});

test('T-07b 模型调用超时受控制（默认 5 秒，ABORT 后不再等待）（NFR-01）', async () => {
  const app = makeApp({ fetchImpl: fakeFetch({ hang: true }), config: { llmTimeoutMs: 200, llmRetries: 0 } });
  seedProfile(app);
  seedMenu(app, { date: todayStr() });
  const started = Date.now();
  const res = await app.recommend.recommend();
  const cost = Date.now() - started;
  assert.equal(res.engine, 'rules');
  assert.equal(cost < 2000, true, `超时控制失效，耗时 ${cost}ms`);
});

test('T-08 负反馈后同类口味菜品不再进入 Top3，且缓存按权重版本失效（V5、FR-07）', async () => {
  const app = makeApp({ fetchImpl: fakeFetch({ mode: 'rate_limit' }) }); // 固定用规则路径，保证可复现
  seedProfile(app);
  const { menu } = seedMenu(app, { date: todayStr(), text: FIXED_MENU });
  const fish = menu.dishes.find((d) => d.name === '水煮鱼');

  const before = await app.recommend.recommend();
  assert.equal(before.items.some((i) => i.dishId === fish.dishId), true, '初始推荐应包含水煮鱼');

  app.record.record({ dishId: fish.dishId, dishName: fish.name, tasteTags: fish.tasteTags, date: todayStr() });
  const rec = app.record.todayRecords(todayStr())[0];
  const fb = app.record.submitFeedback({ recordId: rec.recordId, result: 'MISMATCH', reason: '太辣' });
  assert.equal(fb.ok, true);
  assert.equal(fb.feedback.weightDelta < 0, true);
  assert.equal(app.record.getWeights().version > before.weightsVersion, true, '负反馈必须让权重版本 +1，否则缓存不会失效');

  const after = await app.recommend.recommend();
  assert.equal(after.items.some((i) => i.dishId === fish.dishId), false, '负反馈后该菜品不应再进入 Top3');
  assert.equal(after.items.length, 3);
});

test('T-09 同一天可记录多条；重复记录同一道菜给出提示而不是静默覆盖（FR-06、UC-06）', async () => {
  const app = makeApp();
  seedProfile(app, { avoidList: [] });
  const { menu } = seedMenu(app, { date: todayStr() });
  const a = menu.dishes[0];
  const b = menu.dishes[1];

  assert.equal(app.record.record({ dishId: a.dishId, dishName: a.name, date: todayStr() }).ok, true);
  assert.equal(app.record.record({ dishId: b.dishId, dishName: b.name, date: todayStr() }).ok, true);
  assert.equal(app.record.todayRecords(todayStr()).length, 2, '一天两餐必须都能保存，不能相互覆盖');

  const dup = app.record.record({ dishId: a.dishId, dishName: a.name, date: todayStr() });
  assert.equal(dup.ok, true);
  assert.equal(dup.duplicate, true, '重复记录同一道菜必须给出提示');
  assert.equal(app.record.todayRecords(todayStr()).length, 2);

  const updated = app.record.updateRecord(dup.record.recordId, { dishName: '改名测试' });
  assert.equal(updated.ok, true);
  assert.equal(app.record.listRecords().some((r) => r.dishName === '改名测试'), true);
});

test('T-11 模型输出不合规（越界菜名 / 确定性安全表述 / 条数不符）时丢弃 AI 结果并改用规则基线（NFR-06、ADR-004）', async () => {
  // 越界菜名
  const appA = makeApp({ fetchImpl: fakeFetch({ mode: 'out_of_set' }) });
  seedProfile(appA, { avoidList: [] });
  const { menu } = seedMenu(appA, { date: todayStr() });
  const ids = new Set(menu.dishes.map((d) => d.dishId));
  const resA = await appA.recommend.recommend();
  assert.equal(resA.items.every((i) => ids.has(i.dishId)), true, 'AI 返回的集合外菜品必须被丢弃');

  // 确定性安全表述
  const appB = makeApp({ fetchImpl: fakeFetch({ mode: 'unsafe_text' }) });
  seedProfile(appB, { avoidList: ['花生'] });
  seedMenu(appB, { date: todayStr() });
  const resB = await appB.recommend.recommend();
  const wording = resB.items.map((i) => `${i.reason}${(i.riskTags ?? []).join('')}`).join('｜');
  assert.doesNotMatch(wording, /不含|可以吃|放心吃|绝对安全|无需确认/);

  // 条数不足
  const appC = makeApp({ fetchImpl: fakeFetch({ mode: 'short_list' }) });
  seedProfile(appC, { avoidList: [] });
  seedMenu(appC, { date: todayStr() });
  const resC = await appC.recommend.recommend();
  assert.equal(resC.items.length, 3, 'AI 结果不足 3 条时必须用规则基线补齐');
});

test('T-13 关键路径必须留下可定位问题的日志（实验4 2.5）', async () => {
  const sink = createCollectingSink();
  const app = makeApp({ fetchImpl: fakeFetch({ mode: 'rate_limit' }), sink });
  seedProfile(app);
  seedMenu(app, { date: todayStr() });
  await app.recommend.recommend();

  const events = sink.entries.map((e) => e.event);
  assert.equal(events.includes('profile.saved'), true);
  assert.equal(events.includes('menu.parsed'), true);
  assert.equal(events.includes('menu.saved'), true);
  assert.equal(events.includes('llm.call.failed'), true);
  assert.equal(events.includes('recommend.done'), true);

  const failure = sink.byEvent('llm.call.failed')[0];
  assert.equal(failure.code, 'RATE_LIMIT');
  assert.equal(typeof failure.latencyMs, 'number');
  // 日志不得包含忌口清单内容（NFR-05）
  assert.equal(/花生|虾/.test(JSON.stringify(sink.entries)), false);
});
