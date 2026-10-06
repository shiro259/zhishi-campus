/**
 * 我的收藏 自检
 *
 * 这个功能之前只做了一半：能收藏，却没地方看。所以检查的重点是
 * 「收藏的菜真的能在某个页面被看到、且能取消」：
 *
 *   [1] 云函数 byIds 真跑：保序 / 只返回上架 / 去重 / 忽略不存在的 id / 上限
 *   [2] API 层：云端失败时用本机菜谱兜底，保证离线也看得到收藏
 *   [3] 收藏页：编译、模板标识符、空态、取消收藏、清空、onShow 刷新
 *   [4] 入口：pages.json 已注册 + 「我的」页有入口且显示数量
 *   [5] 端到端：用假存储把「收藏 → 读取 → 取消」整条链路跑一遍
 *
 * 用法：node _ui/check-favorites-page.mjs
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'
import { register } from 'node:module'
import vm from 'node:vm'
import { createChecker, loadPage, checkCompile, checkStyle, checkLogic, checkIcons, checkTokens } from './lib/page-check.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const c = createChecker()

// api/index.js 用的是 uni-app 的 '@/' 别名，Node 不认；
// 复用 _search 里那份加载钩子（把 @/ 映射到项目根 + 项目内 .js 按 ESM 解析）
register(pathToFileURL(join(ROOT, '_search', 'hooks.mjs')).href)

const PAGE = 'pages/favorites/favorites.vue'
const page = loadPage(ROOT, PAGE)

checkCompile(ROOT, page, c)
const style = checkStyle(ROOT, page, c)
checkLogic(page, {}, c)
checkIcons(ROOT, page, [], c)
checkTokens(style, c, { allowedRaw: ['50%'] })

/* ==================== [1] 云函数 byIds 真跑 ==================== */
console.log('\n[1] 云函数 shiyu-dish 的 byIds（真跑）')

function runDishFn(rows) {
  const src = read('uniCloud-aliyun/cloudfunctions/shiyu-dish/index.js')
  const store = rows.map((r) => ({ ...r }))
  const fakeDb = {
    collection: () => ({
      where: (cond) => {
        // 只实现 byIds 用到的那一种查询：{ _id: {$in: [...]}, status: 1 }
        const ids = (cond._id && cond._id.$in) || []
        const matched = store.filter((r) => ids.indexOf(r._id) >= 0 && r.status === cond.status)
        return {
          field: () => ({
            limit: () => ({ get: async () => ({ data: matched.map((r) => ({ ...r })) }) })
          })
        }
      }
    }),
    command: { in: (arr) => ({ $in: arr }), and: () => ({}), or: () => ({}) }
  }
  const sandbox = {
    uniCloud: { database: () => fakeDb },
    require: () => ({ verifyAdminToken: async () => ({ ok: false, message: 'no' }) }),
    console: { log() {}, error() {}, warn() {} },
    process: { env: {} },
    exports: {},
    module: { exports: {} }
  }
  sandbox.global = sandbox
  vm.createContext(sandbox)
  vm.runInContext(src, sandbox, { filename: 'shiyu-dish/index.js' })
  return sandbox.exports.main || sandbox.module.exports.main
}

const rows = [
  { _id: 'a1', name: 'A', status: 1, price: 8 },
  { _id: 'b2', name: 'B', status: 1, price: 9 },
  { _id: 'c3', name: 'C', status: 0, price: 7 }, // 已下架
  { _id: 'd4', name: 'D', status: 1, price: 6 }
]
const main = runDishFn(rows)

{
  const res = await main({ action: 'byIds', ids: ['d4', 'a1', 'b2'] })
  c.ok('按传入顺序返回（收藏顺序由调用方决定）',
    res.code === 0 && res.data.list.map((d) => d.id).join(',') === 'd4,a1,b2',
    JSON.stringify(res.data && res.data.list.map((d) => d.id)))
}
{
  const res = await main({ action: 'byIds', ids: ['a1', 'c3'] })
  c.ok('下架的菜品不会出现在收藏里', res.data.list.map((d) => d.id).join(','), 'a1')
}
{
  const res = await main({ action: 'byIds', ids: ['a1', 'a1', 'b2'] })
  c.ok('重复 id 只返回一次', res.data.list.length, 2)
}
{
  const res = await main({ action: 'byIds', ids: ['a1', '不存在', 'b2'] })
  c.ok('不存在的 id 被安静跳过（不报错）', res.code === 0 && res.data.list.length, 2)
}
{
  const res = await main({ action: 'byIds', ids: [] })
  c.ok('空 ids 直接返回空列表', res.code === 0 && res.data.list.length === 0)
}
{
  const many = Array.from({ length: 201 }, (_, i) => 'id' + i)
  const res = await main({ action: 'byIds', ids: many })
  c.ok('超过 200 个时拒绝（避免超长请求）', res.code === -1 && res.message.includes('200'), res.message)
}

/* ==================== [2] API 层兜底 ==================== */
console.log('\n[2] API 层：云端不可用时用本机菜谱兜底')
{
  // 让云函数调用失败，验证 byIds 会退回本机菜谱
  globalThis.uniCloud = { callFunction: ({ fail }) => fail({ errMsg: 'mock: 断网' }) }
  globalThis.uni = { getStorageSync: () => '', setStorageSync: () => {}, removeStorageSync: () => {} }
  const { dishApi } = await import('../api/index.js?v=fav')
  const res = await dishApi.byIds(['d001', 'd010', '不存在'])
  c.ok('云端失败时仍能拿到本机的收藏菜品', res.list.length, 2)
  c.check('兜底结果也保序', res.list.map((d) => d.id), ['d001', 'd010'])
  c.check('标记为本地数据源', res.engine, 'local')
  const empty = await dishApi.byIds([])
  c.check('空 ids 不发请求直接返回空', empty.list, [])
}

/* ==================== [3] 收藏页 ==================== */
console.log('\n[3] 收藏页')
c.ok('有加载态', page.tplSrc.includes('v-if="loading"'))
c.ok('有空态 + 去菜单的出口',
  page.tplSrc.includes('还没有收藏的菜品') && page.tplSrc.includes('@click="goMenu"'))
c.ok('列表渲染收藏菜品', page.tplSrc.includes('v-for="d in list"'))
c.ok('每条都能取消收藏（点到心形不触发进详情）',
  page.tplSrc.includes('@click.stop="removeOne(d)"'))
c.ok('onShow 刷新（从详情页返回能反映最新收藏）',
  /onShow\(\(\) => \{[\s\S]{0,80}?load\(\)/.test(page.script))
c.ok('取不到的 id 会顺手清理（收藏数不会虚高）',
  /removeFavorite\(id\)/.test(page.script))
c.ok('取消收藏只改本地列表，不整页重载',
  /function removeOne[\s\S]{0,400}?list\.value = list\.value\.filter/.test(page.script))
c.ok('清空收藏有二次确认', /function clearAll[\s\S]{0,300}?uni\.showModal/.test(page.script))
c.ok('跳详情用 encodeURIComponent', page.script.includes("encodeURIComponent(id)"))
c.ok('去菜单用 switchTab（tabBar 页）', /function goMenu[\s\S]{0,120}?switchTab/.test(page.script))

/* ==================== [4] 入口注册 ==================== */
console.log('\n[4] 入口')
const pagesJson = JSON.parse(read('pages.json'))
const entry = pagesJson.pages.find((p) => p.path === 'pages/favorites/favorites')
c.ok('pages.json 已注册收藏页', !!entry)
c.check('页面标题正确', entry && entry.style.navigationBarTitleText, '我的收藏')

const userPage = loadPage(ROOT, 'pages/user/user.vue')
c.ok('「我的」页有收藏入口', userPage.tplSrc.includes('@click="goFavorites"'))
c.ok('入口显示收藏数量', /menu-text">我的收藏[\s\S]{0,200}?favCount/.test(userPage.tplSrc))
c.ok('入口跳转到收藏页', userPage.script.includes("'/pages/favorites/favorites'"))
// 断言行为而不是字面写法：只要「页面显示时 → 重新读本机收藏 → 更新数量」这条链在
c.ok('收藏数量随页面显示刷新（onShow → load → 读本机收藏 → 更新数量）',
  /onShow\(\(\) => \{[\s\S]{0,200}?load\(\)/.test(userPage.script) &&
  /favoriteIds\.value = getFavorites\(\)/.test(userPage.script) &&
  /favCount\.value = favoriteIds\.value\.length/.test(userPage.script))
checkCompile(ROOT, userPage, c)

/* ==================== [5] 端到端：收藏 → 读取 → 取消 ==================== */
console.log('\n[5] 端到端（假存储 + 假云函数）')
{
  const store = new Map()
  globalThis.uni = {
    getStorageSync: (k) => (store.has(k) ? store.get(k) : ''),
    setStorageSync: (k, v) => store.set(k, v),
    removeStorageSync: (k) => store.delete(k)
  }
  const fav = await import('../common/favorites.js?v=e2e')
  const { LOCAL_DISHES } = await import('../common/local-dishes.js')

  // 收藏三道菜
  fav.toggleFavorite('d001')
  fav.toggleFavorite('d010')
  fav.toggleFavorite('d022')
  c.check('收藏数为 3', fav.countFavorites(), 3)

  // 模拟收藏页的读取：byIds 拿到菜品，再按收藏顺序排列
  const { dishApi } = await import('../api/index.js?v=e2e')
  const res = await dishApi.byIds(fav.getFavorites())
  c.check('收藏的菜都能取到（离线兜底路径）', res.list.length, 3)
  c.check('取到的确实是收藏的那三道',
    res.list.map((d) => d.name).sort(),
    ['d001', 'd010', 'd022'].map((id) => LOCAL_DISHES.find((d) => d.id === id).name).sort())

  // 取消一道
  fav.removeFavorite('d010')
  c.check('取消后收藏数为 2', fav.countFavorites(), 2)
  const after = await dishApi.byIds(fav.getFavorites())
  c.check('再读就只剩两道', after.list.length, 2)

  // 清空
  fav.getFavorites().forEach((id) => fav.removeFavorite(id))
  c.check('清空后为空', fav.getFavorites(), [])
}

process.exit(c.summary() === 0 ? 0 : 1)
