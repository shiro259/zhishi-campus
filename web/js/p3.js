/** P3 推荐页与忌口确认（实验3 图3-8）：展示 Top3、理由、风险行；记录与"换一批" */
import { app, $, el, toast, todayStr, formatTime, renderTabs } from './common.js';

let lastResult = null;

function setStatus(text, kind = '') {
  const bar = $('#statusBar');
  bar.className = `statusbar ${kind}`.trim();
  bar.replaceChildren(el('span', { text }));
}

function statusFor(res) {
  if (res.cached) return ['24 小时内的缓存结果（相同画像与菜单不重复请求）', 'ok'];
  if (res.engine === 'rules' && res.degraded) return [`模型服务不可用，已改用本地规则推荐（${res.degradedReason ?? '原因未知'}）`, 'warn'];
  if (res.engine === 'rules') return ['本地规则推荐（本次未使用 AI）', 'ok'];
  return [`实时推荐 · 候选 ${res.candidateCount ?? '-'} 道中挑选 3 道`, 'ok'];
}

function renderEmpty(message, actionText, href) {
  $('#recList').replaceChildren(
    el('div', { class: 'card empty' }, [
      el('p', { text: message }),
      el('button', { class: 'primary small', text: actionText, onclick: () => { location.href = href; } }),
    ]),
  );
}

function renderError(err) {
  setStatus(`推荐失败：${err.message}（${err.code ?? 'UNKNOWN'}）`, 'danger');
  $('#recList').replaceChildren(
    el('div', { class: 'card empty' }, [
      el('p', { text: '这次没能拿到推荐，请稍后重试。' }),
      el('button', { class: 'primary small', text: '重新推荐', onclick: () => load(true) }),
    ]),
  );
  $('#engineTag').textContent = '失败';
}

function recordCard(item, profile) {
  const dish = item.dish ?? {};
  const risk = app.risk.check(dish, profile?.avoidList ?? []);
  const confirmed = app.risk.isConfirmed(item.dishId);

  const node = el('div', { class: 'dish' }, [
    el('div', { class: 'row between' }, [
      el('span', { class: 'name', text: dish.name ?? item.dishId }),
      el('span', { class: 'score', text: `推荐分 ${item.score}` }),
    ]),
    el('div', { class: 'row wrap' }, [
      dish.price != null ? el('span', { class: 'badge gray', text: `${dish.price} 元` }) : null,
      dish.tasteTags?.length ? el('span', { class: 'badge gray', text: dish.tasteTags.join('/') }) : null,
      item.noveltyHint ? el('span', { class: 'badge', text: '近 7 天没吃过' }) : null,
    ]),
    el('div', { class: 'reason', text: item.reason }),
    risk.hint ? el('div', { class: 'risk', text: `⚠ ${risk.hint}` }) : null,
    el('div', { class: 'row', style: 'margin-top:6px' }, [
      el('button', {
        class: 'small primary',
        text: '记录为今日就餐',
        onclick: () => onRecord(item),
      }),
      risk.hint
        ? el('button', {
          class: confirmed ? 'small ghost' : 'small',
          text: confirmed ? `已确认 ${formatTime(app.risk.confirmedAt(item.dishId))}` : '我已向窗口确认',
          onclick: () => { app.risk.confirm(item.dishId); toast('已记录你的确认（留痕）'); render(lastResult); },
        })
        : null,
    ]),
  ]);
  return node;
}

function render(res) {
  lastResult = res;
  if (res.status === app.STATUS.NO_PROFILE) {
    $('#engineTag').textContent = '';
    setStatus(res.message, 'warn');
    return renderEmpty(res.message, '去设置画像', '/');
  }
  if (res.status === app.STATUS.EMPTY_MENU) {
    $('#engineTag').textContent = '';
    setStatus(res.message, 'warn');
    return renderEmpty(res.message, '去维护菜单', '/menu');
  }

  const [text, kind] = statusFor(res);
  setStatus(text, kind);
  $('#engineTag').textContent = res.engine === 'ai' ? 'AI' : '规则';
  const profile = app.profile.getProfile();
  $('#recList').replaceChildren(...res.items.map((it) => recordCard(it, profile)));
}

function skeletons() {
  setStatus('正在生成推荐…', '');
  $('#recList').replaceChildren(...[1, 2, 3].map(() => el('div', { class: 'skeleton' })));
}

async function onRecord(item) {
  const dish = item.dish ?? {};
  const result = app.record.record({
    dishId: item.dishId,
    dishName: dish.name,
    tasteTags: dish.tasteTags ?? [],
    date: todayStr(),
    source: 'recommend',
    riskConfirmedAt: app.risk.isConfirmed(item.dishId) ? app.risk.confirmedAt(item.dishId) : null,
  });
  if (!result.ok) { toast(result.errors[0]); return; }
  toast(`已记录：${dish.name}（${formatTime(result.record.createdAt)}）`);
  setTimeout(() => { location.href = '/record'; }, 900);
}

async function load(force = false) {
  skeletons();
  try {
    const res = await app.recommend.recommend({ force });
    render(res);
  } catch (err) {
    app.logger.error('page.recommend.failed', { code: err.code, message: err.message });
    renderError(err);
  }
}

$('#moreBtn').addEventListener('click', () => load(true));
load(false);
renderTabs('/recommend');
