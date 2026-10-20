/** P4 记录与反馈页（实验3 图3-9）：记录详情、一键反馈、历史列表与修改入口 */
import { app, $, el, toast, formatTime, todayStr, renderTabs } from './common.js';

let pendingReasonFor = null;

function renderToday() {
  const card = $('#todayCard');
  const today = app.record.todayRecords(todayStr());
  card.replaceChildren(el('h2', { text: '今天的就餐记录' }));
  if (today.length === 0) {
    card.append(
      el('p', { class: 'hint', text: '今天还没有记录。先去选餐，记录后才能反馈。' }),
      el('button', { class: 'small primary', text: '去选餐 →', onclick: () => { location.href = '/recommend'; } }),
    );
    return;
  }
  card.append(el('div', { class: 'list' }, today.map((r) => {
    const fb = app.record.listFeedback().find((f) => f.recordId === r.recordId);
    return el('div', { class: 'dish' }, [
      el('div', { class: 'row between' }, [
        el('span', { class: 'name', text: r.dishName ?? r.dishId }),
        fb ? el('span', { class: fb.result === 'MATCH' ? 'badge' : 'badge warn', text: fb.result === 'MATCH' ? '符合口味' : '不符合口味' }) : null,
      ]),
      el('div', { class: 'kv' }, [el('span', { class: 'k', text: '记录时间' }), el('span', { text: formatTime(r.createdAt) })]),
      el('div', { class: 'kv' }, [el('span', { class: 'k', text: '来源' }), el('span', { text: r.source === 'recommend' ? '来自推荐' : '手动记录' })]),
      el('div', { class: 'kv' }, [el('span', { class: 'k', text: '忌口确认' }), el('span', { text: r.riskConfirmedAt ? formatTime(r.riskConfirmedAt) : '无需确认' })]),
      el('div', { class: 'row', style: 'margin-top:6px' }, [
        el('button', { class: 'small', text: '修改这条记录', onclick: () => editRecord(r) }),
        el('button', { class: 'small danger', text: '删除', onclick: () => removeRecord(r) }),
      ]),
    ]);
  })));
}

function editRecord(r) {
  const name = prompt('修改菜品名（不改直接确定）：', r.dishName ?? '');
  if (name === null) return;
  const result = app.record.updateRecord(r.recordId, { dishName: name.trim() || r.dishName });
  toast(result.ok ? '已修改记录' : result.errors[0]);
  renderAll();
}

function removeRecord(r) {
  if (!confirm(`确认删除「${r.dishName ?? r.dishId}」这条记录？`)) return;
  const rest = app.record.listRecords().filter((x) => x.recordId !== r.recordId);
  app.store.write('zs:record', rest);
  app.logger.info('record.removed', { recordId: r.recordId });
  toast('已删除该记录');
  renderAll();
}

function renderFeedback() {
  const card = $('#feedbackCard');
  const today = app.record.todayRecords(todayStr());
  card.replaceChildren(el('h2', { text: '反馈今天的这顿饭' }));
  if (today.length === 0) {
    card.append(el('p', { class: 'hint', text: '先记录今天吃的，再反馈。' }));
    return;
  }
  const record = today[0];
  const existing = app.record.listFeedback().find((f) => f.recordId === record.recordId);
  if (existing) {
    card.append(
      el('div', { class: existing.result === 'MATCH' ? 'statusbar ok' : 'statusbar warn' }, [
        el('span', { text: existing.result === 'MATCH' ? '已反馈：符合口味' : `已反馈：不符合口味${existing.reason ? `（${existing.reason}）` : ''}` }),
      ]),
      existing.result === 'MISMATCH'
        ? el('p', { class: 'hint', text: '下次推荐会少推同类口味的菜品（本机计算，不上传）。' })
        : null,
    );
    return;
  }

  const reasonInput = el('input', { type: 'text', placeholder: '原因（可不填），例：太辣' });
  card.append(
    el('p', { class: 'hint', text: `针对「${record.dishName ?? record.dishId}」` }),
    el('div', { class: 'row' }, [
      el('button', { class: 'small primary', text: '👍 符合口味', onclick: () => submit(record, 'MATCH', '') }),
      el('button', { class: 'small', text: '👎 不符合口味', onclick: () => { pendingReasonFor = record.recordId; card.append(el('div', {}, [el('label', { text: '不符合的原因（可跳过）' }), reasonInput, el('button', { class: 'small', text: '提交反馈', onclick: () => submit(record, 'MISMATCH', reasonInput.value) })])); } }),
    ]),
    el('p', { class: 'hint', text: '反馈用于调整你个人的推荐顺序，会说明具体影响（例："下次少推同类辣味菜品"）。' }),
  );
}

function submit(record, result, reason) {
  const res = app.record.submitFeedback({ recordId: record.recordId, result, reason });
  if (!res.ok) { toast(res.errors[0]); return; }
  toast(result === 'MATCH' ? '已反馈：符合口味' : '已反馈：不符合口味，下次会少推同类');
  renderAll();
}

function renderHistory() {
  const card = $('#historyCard');
  const all = app.record.listRecords();
  const cutoff = Date.now() - 30 * 86400000;
  const recent = all.filter((r) => Date.parse(r.createdAt) >= cutoff);
  card.replaceChildren(el('h2', { text: `历史记录（${recent.length} 条，保留 30 天）` }));
  if (recent.length === 0) {
    card.append(el('p', { class: 'hint', text: '无记录' }));
    return;
  }
  card.append(el('table', {}, [
    el('thead', {}, [el('tr', {}, [el('th', { text: '日期' }), el('th', { text: '菜品' }), el('th', { text: '反馈' })])]),
    el('tbody', {}, recent.map((r) => {
      const fb = app.record.listFeedback().find((f) => f.recordId === r.recordId);
      return el('tr', {}, [
        el('td', { text: r.date }),
        el('td', { text: r.dishName ?? r.dishId }),
        el('td', { text: fb ? (fb.result === 'MATCH' ? '符合' : '不符合') : '未反馈' }),
      ]);
    })),
  ]));
}

function renderAll() {
  renderToday();
  renderFeedback();
  renderHistory();
}

renderAll();
renderTabs('/record');
