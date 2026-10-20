/** P1 首页（实验3 图3-6）：唯一入口与导航枢纽，核心任务 ≤1 次点击可达 */
import { app, $, el, toast, formatTime, todayStr, renderTabs, NS } from './common.js';

const TASTE_OPTIONS = ['清淡', '微辣', '辣', '重口', '酸甜', '油炸', '面食'];
const GOAL_OPTIONS = ['减脂', '增肌', '控糖', '无特殊目标'];

let editing = false;

function renderProfile() {
  const card = $('#profileCard');
  card.replaceChildren();
  const profile = app.profile.getProfile();

  if (!profile) {
    card.append(
      el('h2', { text: '第 1 步：设置口味画像' }),
      el('p', { class: 'hint', text: '忌口可以不填；不采集学号、姓名与位置。' }),
    );
  } else {
    card.append(
      el('div', { class: 'row between' }, [
        el('h2', { text: '我的口味画像' }),
        el('button', { class: 'small ghost', text: editing ? '收起' : '修改画像', onclick: () => { editing = !editing; renderProfile(); } }),
      ]),
      el('div', { class: 'row wrap' }, [
        ...profile.tasteTags.map((t) => el('span', { class: 'badge', text: t })),
        el('span', { class: 'badge gray', text: profile.healthGoal }),
        el('span', { class: 'badge gray', text: `预算 ${profile.budget.min}—${profile.budget.max} 元` }),
        el('span', { class: 'badge gray', text: `忌口 ${profile.avoidList.length} 项` }),
      ]),
      el('p', { class: 'hint', text: `更新于 ${formatTime(profile.updatedAt)}` }),
    );
    if (!editing) return;
  }

  const selected = new Set(profile?.tasteTags ?? []);
  const chips = el('div', { class: 'row wrap' }, TASTE_OPTIONS.map((t) =>
    el('button', {
      class: selected.has(t) ? 'small primary' : 'small',
      text: t,
      onclick: (e) => {
        if (selected.has(t)) selected.delete(t); else selected.add(t);
        e.target.className = selected.has(t) ? 'small primary' : 'small';
      },
    })));

  const goalSel = el('select', {}, GOAL_OPTIONS.map((g) =>
    el('option', { value: g, text: g, selected: (profile?.healthGoal ?? '无特殊目标') === g })));

  const budgetMin = el('input', { type: 'number', min: '0', value: profile?.budget.min ?? 8 });
  const budgetMax = el('input', { type: 'number', min: '0', value: profile?.budget.max ?? 15 });
  const avoidInput = el('input', { type: 'text', placeholder: '如：花生、虾（用顿号或逗号分隔，可留空）', value: (profile?.avoidList ?? []).join('、') });

  const form = el('div', {}, [
    el('label', { text: '口味偏好（可多选）' }), chips,
    el('label', { text: '健康目标' }), goalSel,
    el('label', { text: '预算区间（元）' }), el('div', { class: 'row' }, [budgetMin, el('span', { text: '—' }), budgetMax]),
    el('label', { text: '忌口 / 过敏（可跳过）' }), avoidInput,
    el('div', { class: 'row', style: 'margin-top:12px' }, [
      el('button', {
        class: 'primary block',
        text: '保存画像',
        onclick: () => {
          const result = app.profile.saveProfile({
            profileId: profile?.profileId,
            tasteTags: [...selected],
            avoidList: avoidInput.value.split(/[、,，\s]+/).map((s) => s.trim()).filter(Boolean),
            healthGoal: goalSel.value,
            budget: { min: Number(budgetMin.value), max: Number(budgetMax.value) },
          });
          if (!result.ok) { toast(`保存失败：${result.errors[0]}`); return; }
          editing = false;
          toast('画像已保存');
          renderAll();
        },
      }),
    ]),
  ]);
  card.append(form);
}

function renderMenu() {
  const card = $('#menuCard');
  card.replaceChildren();
  const latest = app.menu.getLatestMenu();
  if (!latest) {
    card.append(
      el('h2', { text: '第 2 步：维护今天的菜单' }),
      el('p', { class: 'hint', text: '还没有菜单数据：把食堂公示的菜单文本粘贴进来，30 秒即可。' }),
      el('div', { class: 'statusbar warn' }, [el('span', { text: '未维护菜单，无法推荐' })]),
      el('div', { class: 'row', style: 'margin-top:10px' }, [
        el('button', { class: 'primary small', text: '去维护菜单', onclick: () => { location.href = '/menu'; } }),
      ]),
    );
    return;
  }
  card.append(
    el('h2', { text: '今日菜单状态' }),
    el('div', { class: 'kv' }, [el('span', { class: 'k', text: '窗口' }), el('span', { text: `${latest.canteen} · ${latest.windowName}` })]),
    el('div', { class: 'kv' }, [el('span', { class: 'k', text: '菜品' }), el('span', { text: `已维护 ${latest.dishes.length} 道` })]),
    el('div', { class: 'kv' }, [el('span', { class: 'k', text: '日期' }), el('span', { text: latest.date })]),
    el('p', { class: 'hint', text: `更新于 ${formatTime(latest.updatedAt)}` }),
    el('div', { class: 'row', style: 'margin-top:10px' }, [
      el('button', { class: 'small', text: '维护菜单', onclick: () => { location.href = '/menu'; } }),
      el('button', { class: 'small ghost', text: '查看菜品', onclick: () => { location.href = '/menu'; } }),
    ]),
  );
}

function renderRecord() {
  const card = $('#recordCard');
  card.replaceChildren();
  const today = app.record.todayRecords(todayStr());
  if (today.length === 0) {
    card.append(el('h2', { text: '今天还没有记录' }), el('p', { class: 'hint', text: '去选餐 →' }));
    return;
  }
  const latest = today[0];
  card.append(
    el('h2', { text: '今天的记录' }),
    el('div', { class: 'kv' }, [el('span', { class: 'k', text: '菜品' }), el('span', { text: latest.dishName ?? latest.dishId })]),
    el('div', { class: 'kv' }, [el('span', { class: 'k', text: '记录时间' }), el('span', { text: formatTime(latest.createdAt) })]),
    latest.riskConfirmedAt ? el('span', { class: 'badge warn', text: `已确认忌口提示 ${formatTime(latest.riskConfirmedAt)}` }) : null,
    el('div', { class: 'row', style: 'margin-top:10px' }, [
      el('button', { class: 'small', text: '去反馈 / 修改', onclick: () => { location.href = '/record'; } }),
    ]),
  );
}

function renderAll() {
  renderProfile();
  renderMenu();
  renderRecord();
}

$('#today').textContent = todayStr();
$('#startBtn').addEventListener('click', () => {
  const profile = app.profile.getProfile();
  if (!profile) { toast('先设置口味画像（约 30 秒）'); editing = true; renderProfile(); return; }
  if (!app.menu.getLatestMenu()) { toast('先去维护今天的菜单'); location.href = '/menu'; return; }
  location.href = '/recommend';
});

renderAll();
renderTabs('/');
console.log('[p1] 本地存储键：', app.store.keys(NS.profile));
