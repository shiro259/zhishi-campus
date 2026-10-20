/** P5 隐私与数据页（实验3 图3-10）：采集声明、导出数据、清空数据（二次确认） */
import { app, $, el, toast, formatTime, renderTabs, loadSampleData } from './common.js';

function renderData() {
  const card = $('#dataCard');
  const keys = app.store.keys('zs:');
  const profile = app.profile.getProfile();
  const menuCount = app.store.read('zs:menuIndex', []).length;
  card.replaceChildren(
    el('h2', { text: '本机保存了什么' }),
    el('div', { class: 'kv' }, [el('span', { class: 'k', text: '画像' }), el('span', { text: profile ? `已设置（${formatTime(profile.updatedAt)}）` : '未设置' })]),
    el('div', { class: 'kv' }, [el('span', { class: 'k', text: '菜单' }), el('span', { text: `${menuCount} 份` })]),
    el('div', { class: 'kv' }, [el('span', { class: 'k', text: '就餐记录' }), el('span', { text: `${app.record.listRecords().length} 条` })]),
    el('div', { class: 'kv' }, [el('span', { class: 'k', text: '反馈' }), el('span', { text: `${app.record.listFeedback().length} 条` })]),
    el('div', { class: 'kv' }, [el('span', { class: 'k', text: '存储键' }), el('span', { text: `${keys.length} 个` })]),
  );
}

function confirmClear() {
  const cancelBtn = el('button', { class: 'block', text: '取消（保留数据）', onclick: () => mask.remove() });
  const mask = el('div', { class: 'modal-mask' }, [
    el('div', { class: 'modal' }, [
      el('h3', { text: '确认清空全部数据？' }),
      el('p', { text: '将删除本机的画像、菜单、就餐记录、反馈与推荐缓存，删除后 7 天内不可恢复。' }),
      el('div', { class: 'row' }, [
        cancelBtn,
        el('button', {
          class: 'danger block',
          text: '确认清空',
          onclick: () => {
            const res = app.data.clearAll();
            mask.remove();
            toast(res.ok ? `已清空（删除 ${res.removedCount} 项）` : '清空未完成，请重试');
            renderAll();
          },
        }),
      ]),
    ]),
  ]);
  document.body.append(mask);
  cancelBtn.focus();
}

function renderActions() {
  const card = $('#actionCard');
  card.replaceChildren(
    el('h2', { text: '数据出入口' }),
    el('div', { class: 'row wrap' }, [
      el('button', { class: 'small', text: '导出我的数据（JSON）', onclick: exportJson }),
      el('button', { class: 'small ghost', text: '载入样例数据（演示用）', onclick: onSample }),
      el('button', { class: 'small danger', text: '清空全部数据', onclick: confirmClear }),
    ]),
    el('p', { class: 'hint', text: '样例数据用于演示与恢复：会写入一份当日菜单（12 道）与一份示例画像，可重复载入。' }),
  );
}

function exportJson() {
  const data = app.data.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `zhishi-campus-data-${Date.now()}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  app.logger.info('data.exported', { recordCount: data.records.length, menuCount: data.menus.length });
  toast('已导出本机数据');
}

async function onSample() {
  try {
    const res = await loadSampleData();
    if (!res.ok) { toast(res.errors[0]); return; }
    toast(`已载入样例数据：${res.dishCount} 道菜${res.failedLineCount ? `，${res.failedLineCount} 行待手动补充` : ''}`);
    renderAll();
  } catch (err) {
    toast(`样例数据载入失败：${err.message}`);
  }
}

function renderAll() {
  renderData();
  renderActions();
}

renderAll();
renderTabs('/privacy');
