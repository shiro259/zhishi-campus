/**
 * AI 对话页改版自检
 *
 * 改版最大的风险是「聊天功能被 UI 改坏」，所以这里除了编译与样式，重点核对：
 *   · 与 git HEAD 对比，原有函数 / 变量一个都不能少（有意删除的要写清原因）
 *   · 发送链路完整：输入框 v-model / @confirm / 发送按钮 / sending 禁用 / 打字动画
 *   · 需求点名的模块都在：欢迎区、机器人形象、橙色渐变、圆角气泡、入口卡片、
 *     今日推荐预览、悬浮输入框
 *
 * 用法：node _ui/check-chat.mjs
 */
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createChecker,
  loadPage,
  checkCompile,
  checkStyle,
  checkLogic,
  checkIcons,
  checkTokens
} from './lib/page-check.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PAGE = 'pages/recommend/recommend.vue'

const c = createChecker()
const page = loadPage(ROOT, PAGE)

/* ---------------- 编译 ---------------- */
checkCompile(ROOT, page, c)
const style = checkStyle(ROOT, page, c)

/* ---------------- 逻辑没丢 ---------------- */
// 有意调整的地方必须写明原因
const INTENTIONAL = {
  // 原来那条「欢迎气泡」的文案被搬进了新的欢迎区：
  // 问候语进 hero 标题，示例问题变成快捷入口卡片，职责重复所以不再单独留一条气泡。
  // 它不是一个函数或状态，这里列出以防将来有人误删真正的逻辑。
}
checkLogic(page, INTENTIONAL, c)

/* ---------------- 聊天功能完整性 ---------------- */
console.log('\n[聊天功能] 发送链路')
const tpl = page.tplSrc
const mustKeep = [
  ['输入框绑定 inputText', 'v-model="inputText"'],
  ['回车发送', '@confirm="send()"'],
  ['发送按钮', '@click="send()"'],
  ['发送中禁用输入', ':disabled="sending"'],
  ['消息列表滚动锚点', ':scroll-into-view="scrollId"'],
  ['加载中打字动画', 'class="typing"'],
  ['AI 返回的菜品卡片', 'v-if="m.dishes && m.dishes.length"'],
  ['菜名', '{{ d.name }}'],
  ['价格', '¥{{ d.price }}'],
  ['位置', 'formatLocation(d)'],
  ['推荐理由', 'd.reason'],
  ['点卡片进详情', 'goDetail(d.dish_id || d.id)'],
  ['快捷提问点击', 'sendQuick(e.text)'],
  ['发送/滚动的三个函数都在脚本里', null]
]
mustKeep.forEach(([name, needle]) => {
  if (needle === null) {
    const okAll = ['async function send()', 'function sendQuick(', 'function scrollToBottom(', 'function goDetail(', 'function consumePendingPref(']
      .every((f) => page.script.includes(f))
    c.ok(name, okAll)
  } else {
    c.ok(name, tpl.includes(needle))
  }
})

// 关键行为：当前架构已从「拼对话历史发给 shiyu-chat」升级为
// 「把每一句话交给 shiyu-agent，由云端会话维护累计条件与已排除的菜」。
// 因此这里改为断言新架构的能力点，旧实现的两条断言（手拼 chatMessages / 三类失败文案）已不适用。
c.ok('走可对话 Agent（多轮修正由云端会话维护）',
  page.script.includes('recommendApi.agentTurn') && page.script.includes('agentMode'))
c.ok('服务端返回澄清时渲染成可点选项（F2）',
  tpl.includes("m.kind === 'clarify'") && page.script.includes('chooseOption'))
c.ok('提供「换一道」快捷修正（等价于说「第 N 个不要」）',
  tpl.includes('rejectDish(') && page.script.includes('第${rank}个不想要'))
c.ok('展示累计条件条与重新开始入口',
  tpl.includes('prefText') && page.script.includes('resetConversation'))
c.ok('会话可持久化（退出再回来能接着改需求）',
  page.script.includes('getAgentSessionId') && page.script.includes('endAgentSession'))
c.ok('保留首页口味回填（consumePendingPref + 一次性 key）',
  page.script.includes("uni.getStorageSync('shiyu_pending_pref')") && page.script.includes('buildPrefSentence'))
c.ok('保留 tabBar 页用 onShow（不能用 onLoad）', page.script.includes('onShow(() =>'))

/* ---------------- 需求点名的模块 ---------------- */
console.log('\n[需求] 点名的模块')
const want = [
  ['顶部 AI 助手欢迎区', 'class="welcome"'],
  ['可爱的校园美食 AI 机器人形象', '<AiMascot'],
  ['橙色品牌渐变', /\.hero \{[\s\S]{0,300}?linear-gradient/.test(style)],
  ['聊天气泡是圆角卡片', /\.bubble \{[\s\S]{0,200}?border-radius/.test(style)],
  ['气泡有阴影层次',
    /\.bot-bubble \{[\s\S]{0,220}?box-shadow/.test(style) &&
    /\.user-bubble \{[\s\S]{0,220}?box-shadow/.test(style)],
  ['快捷问题改造成入口卡片', 'class="entry-card"'],
  ['今日推荐菜品预览模块', 'class="pick-row"'],
  ['输入框悬浮圆角设计',
    /\.input-pill \{[\s\S]{0,260}?border-radius: \$radius-pill/.test(style) &&
    /\.input-pill \{[\s\S]{0,260}?box-shadow/.test(style)]
]
want.forEach(([name, needle]) => {
  // needle 可能是字符串（模板/样式里找子串）、正则，或已经算好的布尔值
  let hit
  if (typeof needle === 'boolean') hit = needle
  else if (needle instanceof RegExp) hit = needle.test(tpl) || needle.test(style)
  else hit = tpl.includes(needle) || style.includes(needle)
  c.ok(name, hit)
})

// 欢迎区随对话开始收起，与原来「快捷提问只在 messages.length<=1 出现」保持一致
c.ok('欢迎区在开始对话后收起（v-if="messages.length <= 1"）', tpl.includes('v-if="messages.length <= 1"'))
c.ok('欢迎区保留了 id="msg-welcome"（scrollId 初始锚点仍然有效）', tpl.includes('id="msg-welcome"'))

/* ---------------- 今日推荐的数据来源 ---------------- */
console.log('\n[数据] 今日推荐')
c.ok('用 dishApi.rank 拉取（与首页榜单同一份数据口径）', page.script.includes("dishApi.rank('hot', 3)"))
c.ok('只拉一次（tabBar 来回切换不重复请求）', page.script.includes('todayPicksLoaded'))
c.ok('失败不打断聊天主流程（有 try/catch 兜底）', /try \{[\s\S]{0,200}?dishApi\.rank\('hot', 3\)[\s\S]{0,200}?catch/.test(page.script))

/* ---------------- 图标 / emoji ---------------- */
checkIcons(ROOT, page, [], c)

/* ---------------- 设计令牌 ---------------- */
// 50% 是「正圆」（头像、圆形图标底、发送按钮），不属于圆角令牌范畴
checkTokens(style, c, {
  forbidden: ['#FF6B35', '#f0f0f0', 'color: #333', 'color: #999', 'color: #bbb'],
  allowedRaw: ['50%']
})

process.exit(c.summary() === 0 ? 0 : 1)
