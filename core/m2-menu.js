/**
 * M2 菜单服务（实验3 表3-5）
 * parseMenus / saveMenuDay / listDishes / validateMenu：
 * 只按文本行解析，不猜菜名、不补配料（IF-02、V2）。
 */
import { NS } from './d1-store.js';
import { makeDish, newId, toDateString } from './d2-schema.js';
import { inferTasteTags } from './lexicon.js';

const PRICE_RE = /(\d+(?:\.\d{1,2})?)\s*(?:元|块|￥|¥)?\s*$/;
const ING_RE = /[（(]([^）)]*)[）)]/;

/**
 * 解析食堂公示文本。
 * 行格式：菜名(配料1、配料2) 价格元；括号与价格可缺省。
 * 失败行原样回显，绝不猜测补全菜名。
 */
export function parseMenus(rawText) {
  const text = typeof rawText === 'string' ? rawText : '';
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith('#'));
  const dishes = [];
  const failedLines = [];

  if (lines.length === 0) {
    return { status: 'EMPTY', dishes, failedLines, rawText: text, message: '未能识别菜品，请逐条手动添加' };
  }

  for (const line of lines) {
    const ingMatch = line.match(ING_RE);
    let rest = line.replace(ING_RE, ' ');
    let price = null;
    const priceMatch = rest.match(PRICE_RE);
    if (priceMatch) {
      price = Number(priceMatch[1]);
      rest = rest.slice(0, priceMatch.index);
    }
    const name = rest.replace(/[\s\-–—·|]+/g, '').trim();

    if (name.length === 0 || name.length > 20) {
      failedLines.push({ line, reason: name.length === 0 ? '未识别到菜名' : '菜名过长（>20 字）' });
      continue;
    }

    // 配料缺失时如实标记为未知：这里只做占位标记，不推断任何食材
    const ingredients = ingMatch && ingMatch[1].trim().length > 0
      ? ingMatch[1].split(/[、,，/]/).map((s) => s.trim()).filter(Boolean)
      : ['未知'];

    dishes.push({
      name,
      price,
      ingredients,
      tasteTags: inferTasteTags(name, ingMatch ? ingredients : null),
    });
  }

  return {
    status: failedLines.length > 0 ? 'PARTIAL' : 'OK',
    dishes,
    failedLines,
    rawText: text,
    message: failedLines.length > 0 ? `${failedLines.length} 行未能识别，请手动补充或修正` : '',
  };
}

/** 校验菜单能否保存：空菜单与同日同窗口重复导入都必须给出明确结论 */
export function validateMenu(menu) {
  const errors = [];
  if (!Array.isArray(menu?.dishes) || menu.dishes.length === 0) {
    errors.push('菜品列表为空，未识别到任何菜品，请逐条手动添加');
  }
  const names = new Set();
  (menu?.dishes ?? []).forEach((d) => {
    if (names.has(d.name)) errors.push(`菜名重复：${d.name}`);
    names.add(d.name);
  });
  return { ok: errors.length === 0, errors };
}

export function createMenuService({ store, logger, now = () => Date.now() }) {
  function parse(rawText) {
    const started = now();
    const result = parseMenus(rawText);
    logger?.info('menu.parsed', {
      status: result.status,
      dishCount: result.dishes.length,
      failedLineCount: result.failedLines.length,
      latencyMs: now() - started,
    });
    return result;
  }

  /** 保存当日菜单；节假日/临时换菜导致的空菜单不落库，由调用方提示 */
  function saveMenuDay({ date, canteen, windowName, dishes, rawText, source = 'paste' }) {
    const menuId = newId('m');
    const menu = {
      menuId,
      date: date ?? toDateString(),
      canteen,
      windowName,
      source,
      parseStatus: 'OK',
      rawText: rawText ?? '',
      updatedAt: new Date().toISOString(),
      dishes: dishes.map((d) => ({ ...makeDish({ ...d, menuId }) })),
    };

    const check = validateMenu(menu);
    if (!check.ok) {
      logger?.warn('menu.save.rejected', { canteen, windowName, errors: check.errors });
      return { ok: false, errors: check.errors };
    }

    // date + canteen + window 唯一（实验3 表3-7 约束）
    const index = store.read(NS.menuIndex, []);
    const dup = index.find((m) => m.date === menu.date && m.canteen === menu.canteen && m.windowName === menu.windowName);
    store.write(NS.menu(menuId), menu);
    store.write(
      NS.menuIndex,
      [
        ...index.filter((m) => m.menuId !== menuId && !(m.date === menu.date && m.canteen === menu.canteen && m.windowName === menu.windowName)),
        { menuId, date: menu.date, canteen: menu.canteen, windowName: menu.windowName, dishCount: menu.dishes.length, updatedAt: menu.updatedAt },
      ],
    );
    logger?.info('menu.saved', {
      menuId,
      date: menu.date,
      canteen,
      windowName,
      dishCount: menu.dishes.length,
      replaced: dup ? dup.menuId : null,
    });
    return { ok: true, menu, replacedMenuId: dup ? dup.menuId : null };
  }

  function getMenu(menuId) {
    return store.read(NS.menu(menuId), null);
  }

  function findMenu({ date, canteen, windowName }) {
    const index = store.read(NS.menuIndex, []);
    const hit = index
      .filter((m) => (!date || m.date === date) && (!canteen || m.canteen === canteen) && (!windowName || m.windowName === windowName))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];
    return hit ? getMenu(hit.menuId) : null;
  }

  /** 仅返回最近一次维护的菜单（不判断日期新鲜度，日期校验属于 M3 的前置校验） */
  function getLatestMenu() {
    const index = store.read(NS.menuIndex, []);
    if (index.length === 0) return null;
    const latest = [...index].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];
    return getMenu(latest.menuId);
  }

  function listDishes(menuId) {
    return getMenu(menuId)?.dishes ?? [];
  }

  function clearMenus() {
    const index = store.read(NS.menuIndex, []);
    index.forEach((m) => store.remove(NS.menu(m.menuId)));
    store.remove(NS.menuIndex);
    return index.length;
  }

  return { parse, saveMenuDay, getMenu, findMenu, getLatestMenu, listDishes, clearMenus, validateMenu };
}
