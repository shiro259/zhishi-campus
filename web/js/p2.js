/** P2 当日菜单维护页（实验3 图3-7）：粘贴 → 解析 → 逐条核对修正 → 保存 */
import { app, $, el, toast, formatTime, todayStr, renderTabs, fetchSampleMenuText } from './common.js';

const WINDOWS = [
  ['一食堂', '3 号窗口'],
  ['一食堂', '7 号窗口'],
  ['二食堂', '1 号窗口'],
];

let draft = null;       // 解析结果（可直接编辑）
let parseInfo = null;   // 解析状态与失败行

function renderWindows() {
  const sel = $('#windowSel');
  sel.replaceChildren(...WINDOWS.map(([c, w]) =>
    el('option', { value: `${c}|${w}`, text: `${c} · ${w}` })));
}

function renderResult() {
  const card = $('#resultCard');
  card.replaceChildren();
  if (!draft) {
    card.append(el('h2', { text: '② 解析结果' }), el('p', { class: 'hint', text: '还没有解析结果：粘贴文本后点"解析为菜品列表"。' }));
    return;
  }

  card.append(el('div', { class: 'row between' }, [
    el('h2', { text: `② 解析结果（${draft.length} 道）` }),
    el('span', { class: parseInfo.failedLines.length ? 'badge warn' : 'badge', text: parseInfo.status }),
  ]));

  if (parseInfo.failedLines.length > 0) {
    card.append(
      el('div', { class: 'statusbar warn' }, [el('span', { text: `${parseInfo.failedLines.length} 行未能识别，请手动补充或修正（程序不会猜测菜名）` })]),
      el('div', { class: 'list' }, parseInfo.failedLines.map((f) =>
        el('div', { class: 'kv' }, [el('span', { class: 'k', text: '未识别' }), el('span', { text: `${f.line} —— ${f.reason}` })]))),
    );
  }

  const rows = draft.map((d, i) => {
    const nameInput = el('input', { type: 'text', value: d.name, oninput: (e) => { draft[i].name = e.target.value; } });
    const priceInput = el('input', { type: 'number', min: '0', value: d.price ?? '', placeholder: '价格', oninput: (e) => { draft[i].price = e.target.value === '' ? null : Number(e.target.value); } });
    const ingInput = el('input', {
      type: 'text',
      value: (d.ingredients ?? []).join('、'),
      placeholder: '配料（留空表示未知）',
      oninput: (e) => {
        const parts = e.target.value.split(/[、,，/]+/).map((s) => s.trim()).filter(Boolean);
        draft[i].ingredients = parts.length > 0 ? parts : null;
      },
    });
    return el('tr', {}, [
      el('td', {}, [nameInput]),
      el('td', { style: 'width:72px' }, [priceInput]),
      el('td', {}, [ingInput, d.infoComplete === false || (!d.ingredients || d.ingredients.includes('未知'))
        ? el('div', { class: 'hint', style: 'color:#b7791f', text: '⚠ 配料未知：将按"请现场核对"处理' })
        : null]),
      el('td', { style: 'width:44px' }, [
        el('button', { class: 'small ghost', text: '删除', onclick: () => { draft.splice(i, 1); renderResult(); } }),
      ]),
    ]);
  });

  card.append(el('table', {}, [
    el('thead', {}, [el('tr', {}, [el('th', { text: '菜名' }), el('th', { text: '价格' }), el('th', { text: '配料' }), el('th', {})])]),
    el('tbody', {}, rows),
  ]));

  card.append(el('div', { class: 'row', style: 'margin-top:12px' }, [
    el('button', { class: 'primary block', text: '保存当日菜单', onclick: save }),
  ]));
}

function parse() {
  const raw = $('#rawText').value;
  const result = app.menu.parse(raw);
  parseInfo = result;
  if (result.status === 'EMPTY') {
    draft = null;
    $('#resultCard').replaceChildren(
      el('h2', { text: '② 解析结果' }),
      el('div', { class: 'statusbar warn' }, [el('span', { text: '未能识别菜品，请逐条手动添加（程序不会编造菜名）' })]),
      el('button', { class: 'small', text: '手动添加一行', onclick: () => { draft = [{ name: '', price: null, ingredients: null }]; parseInfo = { status: 'MANUAL', failedLines: [] }; renderResult(); } }),
    );
    return;
  }
  draft = result.dishes;
  renderResult();
}

function save() {
  if (!draft || draft.length === 0) { toast('菜品列表为空，未识别到任何菜品'); return; }
  const [canteen, windowName] = $('#windowSel').value.split('|');
  const saved = app.menu.saveMenuDay({
    date: todayStr(),
    canteen,
    windowName,
    dishes: draft,
    rawText: $('#rawText').value,
    source: 'paste',
  });
  if (!saved.ok) { toast(`保存失败：${saved.errors[0]}`); return; }
  toast(`已保存 ${saved.menu.dishes.length} 道菜${saved.replacedMenuId ? '（覆盖同日同窗口的旧菜单）' : ''}`);
  draft = null;
  parseInfo = null;
  $('#resultCard').replaceChildren();
  renderSaved();
}

function renderSaved() {
  const card = $('#savedCard');
  card.replaceChildren();
  const index = app.store.read('zs:menuIndex', []);
  card.append(el('h2', { text: '③ 已保存的菜单' }));
  if (index.length === 0) {
    card.append(el('p', { class: 'hint', text: '还没有保存任何菜单。' }));
    return;
  }
  card.append(el('div', { class: 'list' }, index.map((m) =>
    el('div', { class: 'kv' }, [
      el('span', { class: 'k', text: m.date }),
      el('span', { text: `${m.canteen} · ${m.windowName}，${m.dishCount} 道（${formatTime(m.updatedAt)}）` }),
    ]))));

  const older = app.store.read('zs:menuIndex', []).filter((m) => m.date !== todayStr());
  if (older.length > 0) {
    card.append(el('button', {
      class: 'small ghost',
      style: 'margin-top:10px',
      text: `复用 ${older[0].date} 的菜单（${older[0].dishCount} 道）`,
      onclick: () => {
        const src = app.menu.getMenu(older[0].menuId);
        const saved = app.menu.saveMenuDay({
          date: todayStr(),
          canteen: src.canteen,
          windowName: src.windowName,
          dishes: src.dishes,
          rawText: src.rawText,
          source: 'reuse',
        });
        toast(saved.ok ? `已复用为今天的菜单（${saved.menu.dishes.length} 道）` : '复用失败');
        renderSaved();
      },
    }));
  }
}

$('#parseBtn').addEventListener('click', parse);
$('#clearBtn').addEventListener('click', () => { $('#rawText').value = ''; draft = null; parseInfo = null; renderResult(); });
$('#sampleBtn').addEventListener('click', async () => {
  $('#rawText').value = await fetchSampleMenuText();
  toast('已载入样例菜单文本，点"解析为菜品列表"');
});

renderWindows();
renderResult();
renderSaved();
renderTabs('/menu');
