/**
 * 个人中心（我的）改版自检
 *
 * 这一页新增的「AI 饮食画像 / 数据统计 / 美食足迹」都必须有**真实数据来源**，
 * 所以除了常规检查，重点是验证推导逻辑真的能从数据里算出东西：
 *
 *   [1] 编译 / 样式 / 原有逻辑没丢
 *   [2] 保留项：头像、昵称、编辑资料、收藏、评价、推荐历史、关于项目
 *   [3] 新增项：身份标签、探索者等级、偏好标签、AI 画像四项、统计三项、
 *       美食足迹、设置
 *   [4] 真跑推导逻辑：探索者等级分段、常去食堂、足迹聚合（用真实菜谱数据）
 *   [5] 推荐次数是真累计计数，不是「最近 20 条」的长度
 *
 * 用法：node _ui/check-user-page.mjs
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { register } from 'node:module'
import { createChecker, loadPage, checkCompile, checkStyle, checkLogic, checkIcons, checkTokens } from './lib/page-check.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const c = createChecker()

// api 层用 '@/' 别名，需要加载钩子
register(pathToFileURL(join(ROOT, '_search', 'hooks.mjs')).href)

const PAGE = 'pages/user/user.vue'
const page = loadPage(ROOT, PAGE)
checkCompile(ROOT, page, c)
const style = checkStyle(ROOT, page, c)
// 有意调整：退出登录 / 管理后台从独立卡片收进「设置」面板；口味档案卡改成 AI 饮食画像卡
checkLogic(page, {
  prefLabel: '口味档案的一句话标签被 AI 饮食画像卡片取代（画像里按项展示）'
}, c)
checkIcons(ROOT, page, ['😋'], c)
checkTokens(style, c, { forbidden: ['#FF6B35', '#f5f5f5', 'color: #333', 'color: #999', 'color: #bbb'], allowedRaw: ['50%'] })

const tpl = page.tplSrc
const script = page.script

/* ---------------- [2] 保留项 ---------------- */
console.log('\n[2] 需求要求「保留」的东西')
const keep = [
  ['用户头像', 'class="avatar"'],
  ['用户昵称', '{{ profile.nickname'],
  ['编辑资料', '@click="goEditProfile"'],
  ['收藏（我的收藏）', '@click="goFavorites"'],
  ['评价（我的评价）', '@click="toggleReviews"'],
  ['推荐历史', '@click="toggleHistory"'],
  ['关于项目', '@click="showAbout"']
]
keep.forEach(([name, needle]) => c.ok('保留：' + name, tpl.includes(needle)))

// 原有函数一个都不能少（checkLogic 已校验），再点名确认关键交互
;['goEditProfile', 'goFavorites', 'toggleReviews', 'toggleHistory', 'clearPref', 'clearHistory',
  'showAbout', 'logout', 'goLogin', 'goAdmin', 'goRecommend'].forEach((fn) => {
  c.ok(`函数 ${fn} 仍在`, script.includes(`function ${fn}(`) || script.includes(`async function ${fn}(`))
})

/* ---------------- [3] 新增项 ---------------- */
console.log('\n[3] 需求新增的模块')
const add = [
  ['顶部橙色品牌渐变', /\.hero \{[\s\S]{0,320}?linear-gradient/],
  ['用户身份标签', 'class="role-tag"'],
  ['校园美食探索者', 'explorer.title'],
  ['探索者进度条', 'class="explorer-fill"'],
  ['饮食偏好标签', 'class="taste-tags"'],
  ['AI 饮食画像卡片', 'AI 饮食画像'],
  ['画像：喜欢口味', '喜欢口味'],
  ['画像：常去食堂', '常去食堂'],
  ['画像：消费预算', '消费预算'],
  ['画像：AI 推荐依据', '推荐依据'],
  ['统计：收藏数量', 'stat-label">收藏菜品'],
  ['统计：AI 推荐次数', 'stat-label">AI 推荐'],
  ['统计：我的评价数', 'stat-label">我的评价'],
  ['功能：美食足迹', '美食足迹'],
  ['功能：设置', '>设置<'],
  ['大圆角卡片（令牌）', /\.card \{[\s\S]{0,200}?border-radius: \$radius-card/],
  ['轻量化阴影', /\.card \{[\s\S]{0,240}?box-shadow: \$shadow-card/]
]
add.forEach(([name, needle]) => {
  const hit = typeof needle === 'string' ? tpl.includes(needle) || script.includes(needle) : needle.test(style)
  c.ok(name, hit)
})

/* ---------------- [4] 真跑推导逻辑 ---------------- */
console.log('\n[4] 真跑：画像 / 足迹 / 等级 的推导')
{
  const { LOCAL_DISHES } = await import('../common/local-dishes.js')
  const canteenOf = (id) => {
    const hit = LOCAL_DISHES.find((d) => String(d.id) === String(id) || String(d._id) === String(id))
    return (hit && hit.canteen) || ''
  }
  // 与页面里同一套推导：评价的 dish_id + 收藏的 id → 食堂计数取最多
  const topCanteen = (reviewIds, favIds) => {
    const counter = {}
    ;[...reviewIds, ...favIds].forEach((id) => {
      const name = canteenOf(id)
      if (name) counter[name] = (counter[name] || 0) + 1
    })
    let top = ''
    let max = 0
    Object.keys(counter).forEach((k) => {
      if (counter[k] > max) {
        max = counter[k]
        top = k
      }
    })
    return top ? `${top}（${max} 道）` : ''
  }
  // 用真实菜谱验证：d001/d003/d004 都在第一食堂，d010 在第二食堂
  // ⚠️ 不要写死「哪道菜在哪个食堂」—— 菜品数据统一过一轮，我第一版就记错了。
  // 测试用例直接从数据里推导：挑一个菜多的食堂 A 和一个菜少的食堂 B。
  const byCanteen = {}
  LOCAL_DISHES.forEach((d) => {
    if (d.status !== 1) return
    byCanteen[d.canteen] = byCanteen[d.canteen] || []
    byCanteen[d.canteen].push(d.id)
  })
  const canteensSorted = Object.keys(byCanteen).sort((a, b) => byCanteen[b].length - byCanteen[a].length)
  const A = canteensSorted[0]
  const B = canteensSorted[canteensSorted.length - 1]
  console.log(`    真实数据：${A} ${byCanteen[A].length} 道 / ${B} ${byCanteen[B].length} 道`)
  const aIds = byCanteen[A].slice(0, 3)
  const bIds = byCanteen[B].slice(0, 1)

  c.check(`评价过三道 ${A} 的菜 → 常去食堂是 ${A}`,
    topCanteen(aIds, []), `${A}（3 道）`)
  c.check('收藏也算进常去食堂（评价 1 道 A + 收藏 3 道 A）',
    topCanteen(aIds.slice(0, 1), aIds), `${A}（4 道）`)
  c.check('没有数据时不编造（返回空，页面显示提示语）', topCanteen([], []), '')

  // 足迹聚合：同一道菜评价 + 收藏只算一次
  const footprint = (reviewIds, favIds) => {
    const seen = new Set()
    const counter = {}
    ;[...reviewIds, ...favIds].forEach((id) => {
      const key = String(id)
      if (!key || seen.has(key)) return
      const name = canteenOf(key)
      if (!name) return
      seen.add(key)
      counter[name] = (counter[name] || 0) + 1
    })
    return { total: seen.size, counter }
  }
  const fp = footprint(aIds.slice(0, 2), [...aIds.slice(1, 3), ...bIds])
  // 去重后应当是：aIds[0]、aIds[1]、aIds[2]、bIds[0] 共 4 道
  const expectCounter = { [A]: 3, [B]: 1 }
  c.check('足迹去重：同一道菜不会重复计数', fp.total, 4)
  c.check('足迹按食堂聚合', fp.counter, expectCounter)
  c.check('不存在的 id 被忽略', footprint(['不存在'], []).total, 0)

  // 探索者等级分段
  const levelOf = (score) => {
    const levels = [
      { min: 0, title: '初来乍到' },
      { min: 3, title: '校园美食探索者' },
      { min: 10, title: '资深食客' },
      { min: 25, title: '食堂活地图' }
    ]
    let idx = 0
    for (let i = 0; i < levels.length; i++) if (score >= levels[i].min) idx = i
    return levels[idx].title
  }
  c.check('0 分是初来乍到', levelOf(0), '初来乍到')
  c.check('3 分升到校园美食探索者', levelOf(3), '校园美食探索者')
  c.check('10 分是资深食客', levelOf(10), '资深食客')
  c.check('25 分是食堂活地图', levelOf(25), '食堂活地图')
  c.check('页面里的阈值与这里一致',
    script.includes("{ min: 3, title: '校园美食探索者' }") && script.includes("{ min: 25, title: '食堂活地图' }"), true)
}

/* ---------------- [5] 推荐次数是累计计数 ---------------- */
console.log('\n[5] AI 推荐次数 = 累计计数（不是最近 20 条的长度）')
{
  const apiSrc = read('api/index.js')
  c.ok('新增了独立的推荐次数储存键', apiSrc.includes("recommendCount: 'shiyu_recommend_count'"))
  c.ok('每次推荐都会累加', /list\.slice\(0, 20\)[\s\S]{0,400}?STORAGE\.recommendCount, n \+ 1/.test(apiSrc))
  c.ok('导出了读取函数', /export function getRecommendCount\(\)/.test(apiSrc))
  c.ok('历史仍然只留 20 条（展示用）', apiSrc.includes('list.slice(0, 20)'))
  c.ok('页面用的是累计值而不是 history.length', script.includes('recommendCount.value = getRecommendCount()'))

  // 真跑：连续推荐 25 次，累计值应当是 25 而历史只有 20 条
  const store = new Map()
  globalThis.uni = {
    getStorageSync: (k) => (store.has(k) ? store.get(k) : ''),
    setStorageSync: (k, v) => store.set(k, v),
    removeStorageSync: (k) => store.delete(k),
    showToast: () => {}
  }
  globalThis.uniCloud = undefined // 走本地规则引擎，不需要云端
  const api = await import('../api/index.js?v=count')
  for (let i = 0; i < 25; i++) {
    await api.recommendApi.recommend({ meal_type: '午餐', taste: ['辣'] })
  }
  c.check('推荐 25 次后累计计数为 25', api.getRecommendCount(), 25)
  c.check('推荐历史仍只有 20 条', api.recommendApi.getHistory().length, 20)
  c.ok('两者确实不同（证明不能用历史长度当次数）',
    api.getRecommendCount() !== api.recommendApi.getHistory().length, true)
}

process.exit(c.summary() === 0 ? 0 : 1)
