/**
 * 菜单页改版自检
 *
 * 重点：
 *   · 与 git HEAD 对比，原有函数 / 变量一个都不能少
 *   · 五项原有功能都在：搜索、食堂筛选、分类筛选、排序、菜品列表
 *   · 新增的收藏真的能用（直接跑 common/favorites.js，不是看代码里有没有写）
 *   · 需求点名的模块：Banner、AI 入口、悬浮搜索、胶囊筛选、大圆角卡片、
 *     统一图片比例、评分/评价数、推荐标签、收藏按钮
 *
 * 用法：node _ui/check-dish-list.mjs
 */
import { join, dirname } from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createChecker, loadPage, checkCompile, checkStyle, checkLogic, checkIcons, checkTokens, stripCssComments } from './lib/page-check.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PAGE = 'pages/dish-list/dish-list.vue'

const c = createChecker()
const page = loadPage(ROOT, PAGE)

checkCompile(ROOT, page, c)
const style = checkStyle(ROOT, page, c)
// 正则检查用去注释后的样式：注释很长时会撑开定长窗口，导致明明写了却匹配不到
const css = stripCssComments(style)

/* ---------------- 原有逻辑 ---------------- */
// 有意删掉的：状态框里的 emoji 图标（改用 Icon 组件），不是逻辑
const INTENTIONAL = {}
checkLogic(page, INTENTIONAL, c)

const tpl = page.tplSrc
const script = page.script

console.log('\n[原有功能] 五项一个都不能少')
const features = [
  ['搜索菜品：输入框绑定 + 提交 + 防抖', tpl.includes('v-model="keyword"') && tpl.includes('@confirm="onSearch"') && tpl.includes('@input="onKeywordInput"')],
  ['搜索清除按钮', tpl.includes('@click="clearKeyword"')],
  ['食堂筛选：picker 绑定', tpl.includes(':range="canteenOptions"') && tpl.includes('@change="onCanteenChange"')],
  ['分类筛选：picker 绑定', tpl.includes(':range="categoryOptions"') && tpl.includes('@change="onCategoryChange"')],
  ['排序：三个选项 + 切换', tpl.includes('v-for="s in sortOptions"') && tpl.includes('@click="onSortChange(s.value)"')],
  ['菜品列表：卡片 + 进详情', tpl.includes('v-for="d in list"') && tpl.includes('@click="goDetail(d.id)"')],
  ['分页 / 上拉加载', script.includes('onReachBottom') && script.includes('loadList(false)')],
  ['下拉刷新', script.includes('onPullDownRefresh')],
  ['竞态守卫（seq）', script.includes('const mySeq = ++seq') && script.includes('if (mySeq !== seq) return')],
  ['放开筛选补救', tpl.includes('relaxedFilters') && script.includes('res.relaxedFilters')]
]
features.forEach(([name, ok]) => c.ok(name, ok))

/* ---------------- 需求点名的模块 ---------------- */
console.log('\n[需求] 点名的模块')
const wants = [
  ['顶部校园美食推荐 Banner', 'class="banner"', null],
  ['Banner 用橙色品牌渐变', null, /\.banner \{[\s\S]{0,320}?linear-gradient/],
  ['AI 智能推荐入口', 'class="ai-entry"', null],
  ['AI 入口跳推荐页（tabBar 用 switchTab）', 'function goAi', null],
  ['搜索框悬浮圆角', null, /\.search-box \{[\s\S]{0,300}?border-radius: \$radius-pill/],
  ['搜索框有悬浮阴影', null, /\.search-box \{[\s\S]{0,300}?box-shadow/],
  ['筛选按钮胶囊式', null, /\.chip \{[\s\S]{0,260}?border-radius: \$radius-pill/],
  ['排序按钮也是胶囊', 'chip-sort', null],
  ['菜品卡片大圆角白卡', null, /\.dish-card \{[\s\S]{0,300}?border-radius: \$radius-card/],
  ['菜品卡片有投影', null, /\.dish-card \{[\s\S]{0,300}?box-shadow/],
  ['图片比例统一（4:3）', ':size="220" :height="165"', null],
  ['评分标签', 'ratingText(d.rating)', null],
  ['评价数', 'reviewText(d)', null],
  ['推荐标签', 'dishBadges(d)', null],
  ['数据来源标识（云端 / 本机）', 'list-source', null],
  ['收藏按钮', 'class="fav-btn"', null],
  ['收藏按钮不触发进详情', '@click.stop="toggleFav(d)"', null]
]
wants.forEach(([name, needle, re]) => {
  const hit = needle
    ? tpl.includes(needle) || script.includes(needle) || style.includes(needle)
    : re.test(tpl) || re.test(css)
  c.ok(name, hit)
})

/* ---------------- 收藏功能真的能用 ---------------- */
console.log('\n[收藏] 直接跑 common/favorites.js')
{
  // 用内存版 uni 存储把模块跑起来，验证增删查与持久化
  const store = new Map()
  globalThis.uni = {
    getStorageSync: (k) => (store.has(k) ? store.get(k) : ''),
    setStorageSync: (k, v) => store.set(k, v)
  }
  const fav = await import('../common/favorites.js?v=' + Date.now())
  c.check('初始为空', fav.getFavorites(), [])
  c.check('未收藏时 isFavorite=false', fav.isFavorite('d001'), false)
  c.check('收藏返回 true', fav.toggleFavorite('d001'), true)
  c.check('收藏后能查到', fav.getFavorites(), ['d001'])
  c.check('已收藏时 isFavorite=true', fav.isFavorite('d001'), true)
  c.check('再点一次取消', fav.toggleFavorite('d001'), false)
  c.check('取消后为空', fav.getFavorites(), [])
  fav.addFavorite('d002')
  fav.addFavorite('d003')
  fav.addFavorite('d002') // 幂等
  c.check('重复添加不产生重复项', fav.getFavorites(), ['d002', 'd003'])
  c.check('数量正确', fav.countFavorites(), 2)
  fav.removeFavorite('d002')
  c.check('删除只影响目标', fav.getFavorites(), ['d003'])
  c.check('空 id 不会写进去', (fav.addFavorite(''), fav.getFavorites()), ['d003'])
  // 坏数据（非数组 / 含空值）要能自愈
  store.set('shiyu_favorites', 'not-an-array')
  c.check('存储里是坏数据时返回空数组', fav.getFavorites(), [])
  store.set('shiyu_favorites', ['d001', '', null, 'd001'])
  c.check('存储里有空值与重复项时自动清洗', fav.getFavorites(), ['d001'])
  // 存储不可用（抛异常）时不能把页面搞崩
  globalThis.uni = {
    getStorageSync: () => { throw new Error('storage disabled') },
    setStorageSync: () => { throw new Error('storage disabled') }
  }
  let threw = false
  try {
    fav.getFavorites()
    fav.toggleFavorite('d009')
  } catch (e) {
    threw = true
  }
  c.ok('存储不可用时既不抛错也不崩', !threw)
}

/* ---------------- 推荐标签的推导规则 ---------------- */
console.log('\n[推荐标签] 由真实字段推导')
{
  const { loadMenu } = await import('./lib/preview-common.mjs')
  const menu = await loadMenu(ROOT)
  // 与页面里的 dishBadges 同一套阈值
  const badgesOf = (d) => {
    const out = []
    if (d.is_new) out.push('新品')
    if (Number(d.recommend_count) >= 150) out.push('AI 热门')
    if (Number(d.rating) >= 4.7) out.push('高口碑')
    return out.slice(0, 2)
  }
  const withBadge = menu.onSale.filter((d) => badgesOf(d).length)
  const counts = { 新品: 0, 'AI 热门': 0, 高口碑: 0 }
  menu.onSale.forEach((d) => badgesOf(d).forEach((b) => counts[b]++))
  console.log(`    40 道菜里有 ${withBadge.length} 道带标签：新品 ${counts['新品']} / AI 热门 ${counts['AI 热门']} / 高口碑 ${counts['高口碑']}`)
  c.ok('标签不是所有菜都有（有区分度）', withBadge.length > 0 && withBadge.length < menu.onSale.length)
  c.ok('三个标签在真实数据里都出现得不太少', counts['新品'] >= 3 && counts['AI 热门'] >= 3 && counts['高口碑'] >= 3)
  c.ok('页面里的阈值与这里一致',
    script.includes('recommend_count) >= 150') && script.includes('rating) >= 4.7'))
  // 评价数文案
  c.ok('评价数为 0 时不显示（不出现「0 评价」）', script.includes('n <= 0) return'))
  c.ok('评价数超过 1000 用 k 表示', script.includes("toFixed(1)}k 评价"))
}

/* ---------------- 数据来源标识 ---------------- */
console.log('\n[数据来源] 让「云端 / 本机」在界面上可见')
{
  c.ok('记录了接口返回的 engine', script.includes('dataSource.value = res.engine'))
  c.ok('只在首屏（reset）时记录，翻页不覆盖', /if \(reset && res && res\.engine\)/.test(script))
  c.ok('云端显示「云端菜单」', script.includes("'云端菜单'"))
  c.ok('本机显示「本机演示数据」', script.includes("'本机演示数据'"))
  c.ok('模板里渲染了这个标识', tpl.includes('class="list-source"'))
  c.ok('标识不再是空白（有值才显示）', tpl.includes('v-if="dataSource"'))
  // engine 的取值必须与 api 层一致，否则永远显示不出「云端菜单」
  const apiSrc = readFileSync(join(ROOT, 'api/index.js'), 'utf8')
  c.ok('api 层确实返回 engine=cloud', apiSrc.includes("engine: 'cloud'"))
  c.ok('api 层确实返回 engine=local', apiSrc.includes("engine: 'local'"))
}

/* ---------------- 图标 / emoji / 令牌 ---------------- */
checkIcons(ROOT, page, [], c)
checkTokens(style, c, {
  forbidden: ['#FF6B35', '#f5f5f5', '#FFF0EB', 'color: #333', 'color: #999', 'color: #bbb'],
  allowedRaw: ['50%']
})

process.exit(c.summary() === 0 ? 0 : 1)
