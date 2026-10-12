<template>
  <view class="chat-page">
    <!-- ==================== 消息列表 ==================== -->
    <scroll-view
      class="msg-list"
      scroll-y
      :scroll-into-view="scrollId"
      scroll-with-animation
    >
      <!-- ---------- 欢迎区：对话还没开始时展示 ----------
           用 v-if="messages.length <= 1" 与原来的快捷提问保持一致：
           一旦开始对话，欢迎区收起，界面回到纯粹的聊天。 -->
      <view class="welcome" v-if="messages.length <= 1" id="msg-welcome">
        <!-- AI 助手欢迎区：品牌橙渐变 + 机器人形象 -->
        <view class="hero">
          <view class="hero-halo"></view>
          <AiMascot :size="136" glow float />

          <text class="hero-title">你好，我是食遇 AI</text>

          <view class="hero-pill">
            <Icon name="sparkle" :size="24" color="#ff5a36" />
            <text class="hero-pill-text">AI 食堂推荐 · 我知道食堂的每道菜</text>
          </view>
        </view>

        <!-- 快捷提问 → 美食推荐入口卡片 -->
        <view class="block">
          <text class="block-title">想吃点什么？点一下直接问</text>
          <view class="entry-grid">
            <view
              class="entry-card"
              v-for="e in quickEntries"
              :key="e.text"
              @click="sendQuick(e.text)"
            >
              <view class="entry-icon">
                <Icon :name="e.icon" :size="32" color="#ff5a36" />
              </view>
              <text class="entry-text">{{ e.text }}</text>
              <text class="entry-hint">{{ e.hint }}</text>
            </view>
          </view>
        </view>

        <!-- 今日推荐菜品预览 -->
        <view class="block" v-if="todayPicks.length">
          <view class="block-head">
            <text class="block-title">今日推荐</text>
            <view class="block-more" @click="goList">
              <text class="block-more-text">看全部</text>
              <Icon name="right" :size="22" color="#8a8580" />
            </view>
          </view>
          <view class="pick-row">
            <view
              class="pick-card"
              v-for="d in todayPicks"
              :key="d.id || d._id"
              @click="goDetail(d.id || d._id)"
            >
              <DishImage :dish="d" :size="196" :height="136" :radius="20" />
              <text class="pick-name">{{ d.name }}</text>
              <view class="pick-meta">
                <text class="pick-price">¥{{ d.price }}</text>
                <view class="pick-score">
                  <Icon name="star" :size="20" color="#ff5a36" />
                  <text class="pick-score-text">{{ formatRating(d.rating) }}</text>
                </view>
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- ---------- 对话消息 ---------- -->
      <view
        class="msg-item"
        :class="m.role === 'user' ? 'msg-user' : 'msg-bot'"
        v-for="(m, msgIndex) in messages"
        :key="msgIndex"
        :id="'msg-' + msgIndex"
      >
        <view class="avatar-wrap">
          <AiMascot v-if="m.role !== 'user'" :size="68" />
          <view v-else class="user-avatar">
            <Icon name="user" :size="34" color="#8a8580" />
          </view>
        </view>

        <view class="bubble" :class="m.role === 'user' ? 'user-bubble' : 'bot-bubble'">
          <!-- 菜品卡片（AI 返回的推荐菜品） -->
          <view v-if="m.dishes && m.dishes.length" class="dish-cards">
            <view
              class="dish-card"
              v-for="(d, di) in m.dishes"
              @click="goDetail(d.dish_id || d.id)"
              :key="d.dish_id || d.id || di"
            >
              <view class="dish-card-head">
                <text class="dish-rank">{{ di + 1 }}</text>
                <text class="dish-card-name">{{ d.name }}</text>
                <text class="dish-card-price">¥{{ d.price }}</text>
              </view>
              <view class="dish-card-loc">
                <Icon name="location" :size="20" color="#b8b2aa" />
                <text class="dish-card-loc-text">{{ formatLocation(d) || '位置待完善' }}</text>
              </view>
              <view class="dish-card-tags">
                <text class="dish-tag" v-for="t in (d.tags || []).slice(0, 3)" :key="t">{{ t }}</text>
                <view class="dish-tag dish-tag-rate">
                  <Icon name="star" :size="18" color="#ff5a36" />
                  <text class="dish-tag-rate-text">{{ d.rating }}</text>
                </view>
              </view>
              <text class="dish-card-reason" v-if="d.reason">{{ d.reason }}</text>

              <!-- 不满意就换：等价于对 AI 说「第 N 个不要」，但不用用户自己数 -->
              <view class="dish-card-actions" v-if="!sending">
                <view class="dish-act" @click.stop="goDetail(d.dish_id || d.id)">
                  <text class="dish-act-text">看详情</text>
                </view>
                <view class="dish-act" @click.stop="rejectDish(msgIndex, di + 1, d.name)">
                  <Icon name="refresh" :size="24" color="#8a8580" />
                  <text class="dish-act-text">换一道</text>
                </view>
              </view>
            </view>
          </view>

          <!-- 澄清选项（AI 发现需求自相矛盾时给出可点选项） -->
          <view class="clarify" v-if="m.kind === 'clarify'">
            <text class="clarify-detail" v-if="m.detail">{{ m.detail }}</text>
            <view class="clarify-options">
              <view
                class="clarify-opt"
                v-for="(o, oi) in m.options"
                :key="oi"
                @click="chooseOption(msgIndex, o)"
              >
                <text class="clarify-opt-text">{{ o.label }}</text>
              </view>
            </view>
            <text class="clarify-hint">也可以直接打字告诉我</text>
          </view>

          <!-- 文字内容 -->
          <text class="bubble-text" v-if="m.content && m.kind !== 'clarify'">{{ m.content }}</text>
          <text class="bubble-text bubble-text-question" v-if="m.content && m.kind === 'clarify'">{{ m.content }}</text>

          <!-- 降级说明（云函数未部署 / 大模型不可用） -->
          <text class="bubble-notice" v-if="m.notice">{{ m.notice }}</text>

          <!-- 加载中：大模型要 5~15 秒，等超过 4 秒就补一句说明，避免用户以为卡死 -->
          <view class="typing" v-if="m.loading">
            <text class="typing-dot" v-for="i in 3" :key="i" :style="{ animationDelay: i * 0.2 + 's' }" />
            <text class="typing-hint">{{ waitHint }}</text>
          </view>
        </view>
      </view>

      <!-- 底部留白 -->
      <view class="msg-bottom" />
    </scroll-view>

    <!-- ==================== 累计条件条 ==================== -->
    <view class="pref-bar" v-if="prefText || excludedCount">
      <view class="pref-main">
        <Icon name="filter" :size="24" color="#ff5a36" />
        <text class="pref-text">{{ prefText || '未设置条件' }}</text>
        <text class="pref-excluded" v-if="excludedCount">已排除 {{ excludedCount }} 道</text>
      </view>
      <text class="pref-reset" @click="resetConversation">重新开始</text>
    </view>

    <!-- ==================== 输入栏（悬浮圆角） ==================== -->
    <view class="input-bar">
      <view class="input-pill">
        <input
          class="input-field"
          v-model="inputText"
          placeholder="说说你想吃什么…"
          placeholder-class="input-ph"
          confirm-type="send"
          :disabled="sending"
          @confirm="send()"
        />
      </view>
      <view class="send-btn" :class="{ disabled: !inputText.trim() || sending }" @click="send()">
        <Icon v-if="!sending" name="right" :size="36" color="#ffffff" />
        <text class="send-btn-text" v-else>···</text>
      </view>
    </view>
  </view>
</template>

<script setup>
/**
 * AI 助手对话页（知食校园）
 *
 * 定位：把「不知道吃啥」这件事交给 AI —— 说一句口味/预算/忌口，直接给出菜品。
 *
 * 数据链路：
 *   对话内容 → 云函数 shiyu-chat（大模型，返回文字 + [DISH:id] 标注解析出的菜品）
 *   今日推荐 → @/api/index.js → shiyu-dish 的 hot 榜单（云端不可用时自动走本地菜谱）
 *
 * 页面是 tabBar 页，用 onShow 而非 onLoad：切换 tab 不会重新触发 onLoad。
 */
import { ref, computed, nextTick } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { buildPrefSentence, explainCloudError, dishApi, recommendApi } from '@/api/index.js'
import { formatLocation } from '@/common/utils.js'
import DishImage from '@/components/DishImage/DishImage.vue'
import Icon from '@/components/Icon/Icon.vue'
import AiMascot from '@/components/AiMascot/AiMascot.vue'

const messages = ref([])
const inputText = ref('')
const sending = ref(false)
const scrollId = ref('msg-welcome')
/** 今日推荐（欢迎区里的预览模块） */
const todayPicks = ref([])

/**
 * 当前会话累计生效的条件（由云函数 shiyu-agent 回传）
 * 用途：一是让用户随时看清"我现在在按什么条件推荐"，二是提供"清空重来"的出口
 */
const activePref = ref(null)
/** 被用户否掉的菜品数量，用来提示条件已经收紧到什么程度 */
const excludedCount = ref(0)

/**
 * 等待提示文案
 * 大模型一轮要 5~15 秒，只转圈不说话会让人以为卡死，等久了补一句说明。
 */
const waitingSeconds = ref(0)
let waitTimer = null

const waitHint = computed(() => {
  const s = waitingSeconds.value
  if (s < 4) return ''
  if (s < 12) return 'AI 正在按你的条件挑选…'
  if (s < 25) return '还在生成，模型有点忙…'
  return '等得有点久了，马上就好'
})

function startWaitTimer() {
  stopWaitTimer()
  waitingSeconds.value = 0
  waitTimer = setInterval(() => { waitingSeconds.value += 1 }, 1000)
}

function stopWaitTimer() {
  if (waitTimer) {
    clearInterval(waitTimer)
    waitTimer = null
  }
  waitingSeconds.value = 0
}

const quickQuestions = [
  '想吃辣的，10块以内',
  '推荐个清淡的早餐',
  '不吃香菜，有什么好吃的？',
  '高分菜品有哪些？'
]

/**
 * 快捷入口卡片的图标与副标题
 *
 * 用「问题原文 → 样式」的映射，而不是按下标取：
 * 下标耦合在有人调整 quickQuestions 顺序时会静默错位（卡片配错图标很难被发现）。
 * 映射里没有的问题会退化成默认样式，不会报错。
 */
const QUICK_ENTRY_META = {
  '想吃辣的，10块以内': { icon: 'fire', hint: '按口味 + 预算挑' },
  '推荐个清淡的早餐': { icon: 'bowl', hint: '清爽好消化' },
  '不吃香菜，有什么好吃的？': { icon: 'heart', hint: '按忌口自动规避' },
  '高分菜品有哪些？': { icon: 'star', hint: '同学评分最高' }
}

const quickEntries = computed(() =>
  quickQuestions.map((q) => ({
    text: q,
    icon: (QUICK_ENTRY_META[q] && QUICK_ENTRY_META[q].icon) || 'sparkle',
    hint: (QUICK_ENTRY_META[q] && QUICK_ENTRY_META[q].hint) || '点一下问 AI'
  }))
)

/** 评分展示：非数字时给占位符，避免卡片上出现 "undefined" */
function formatRating(r) {
  const n = Number(r)
  return Number.isFinite(n) ? n.toFixed(1) : '—'
}

/** 滚动到底部 */
function scrollToBottom() {
  nextTick(() => {
    if (messages.value.length > 0) {
      scrollId.value = 'msg-' + (messages.value.length - 1)
    }
  })
}

/** 发送快捷提问 */
function sendQuick(q) {
  inputText.value = q
  send()
}

/**
 * 拉取「今日推荐」
 *
 * 只在第一次进入时请求一次（tabBar 来回切换不重复拉）。
 * 首页是 tabBar 页里最像「首页」的一屏，这里放三条高频菜做预览，
 * 让还没开口的用户先看到食堂有什么。
 * 失败就保持为空 —— 欢迎区里这块不渲染，不打断聊天主流程。
 */
let todayPicksLoaded = false
async function loadTodayPicks() {
  if (todayPicksLoaded) return
  todayPicksLoaded = true
  try {
    const res = await dishApi.rank('hot', 3)
    todayPicks.value = (res && res.list) || []
  } catch (e) {
    todayPicks.value = []
  }
}

/** 发送消息 */
async function send() {
  const text = inputText.value.trim()
  if (!text || sending.value) return

  // 添加用户消息
  messages.value.push({ role: 'user', content: text })
  inputText.value = ''
  scrollToBottom()

  // 添加 AI 加载消息
  messages.value.push({ role: 'bot', content: '', loading: true, dishes: [] })
  sending.value = true
  startWaitTimer()
  scrollToBottom()

  try {
    await sendToAgent(text)
  } catch (e) {
    const idx = messages.value.length - 1
    messages.value[idx] = {
      role: 'bot',
      kind: 'error',
      content: '推荐失败：\n\n' + ((e && e.message) || '未知错误'),
      dishes: [],
      loading: false
    }
  } finally {
    stopWaitTimer()
    sending.value = false
    scrollToBottom()
  }
}

/**
 * 走「可对话推荐 Agent」：把这句话交给 shiyu-agent
 *
 * 与逐条拼对话历史的老实现相比，这里把状态放到云端会话里：
 *   · 云函数记住已累积的条件与已排除的菜品，因此「第一个太油了」能精准作用到某道菜；
 *   · 云函数检测到需求矛盾时返回 type='clarify'，页面渲染成可点选项，而不是硬猜。
 * 云函数未部署时会自动降级为单轮推荐（api 层兜底），页面用 notice 说明差异。
 */
async function sendToAgent(text) {
  const data = await recommendApi.agentTurn({ text })
  const idx = messages.value.length - 1

  // 记住累计条件，用于顶部条件条与"被否掉 N 道"的提示
  if (data.prefSnapshot) activePref.value = data.prefSnapshot
  if (typeof data.excludedCount === 'number') excludedCount.value = data.excludedCount

  // ---------- 情况一：AI 先澄清（F2） ----------
  if (data.type === 'clarify') {
    messages.value[idx] = {
      role: 'bot',
      kind: 'clarify',
      content: data.question,
      detail: data.detail || '',
      options: (data.options || []).map((o) => ({ label: o.label, apply: o.apply || {} })),
      dishes: [],
      loading: false
    }
    return
  }

  // ---------- 情况二：正常推荐 ----------
  const rows = data.recommendations || []
  messages.value[idx] = {
    role: 'bot',
    kind: 'recommend',
    content: data.summary || '',
    dishes: rows,
    notice: data.notice || '',
    engine: data.engine || '',
    loading: false
  }
}

/**
 * 用户点了澄清选项
 * 把该选项的 apply 内容回传给云函数（相当于用户替我们把条件定下来），然后继续推荐。
 */
async function chooseOption(msgIndex, option) {
  if (sending.value) return

  messages.value.push({ role: 'user', content: option.label })
  messages.value.push({ role: 'bot', content: '', loading: true, dishes: [] })
  sending.value = true
  startWaitTimer()
  scrollToBottom()

  try {
    const data = await recommendApi.agentTurn({
      text: option.label,
      applyOption: option.apply || {},
      skipClarify: true
    })
    const idx = messages.value.length - 1
    if (data.prefSnapshot) activePref.value = data.prefSnapshot
    if (typeof data.excludedCount === 'number') excludedCount.value = data.excludedCount

    messages.value[idx] = {
      role: 'bot',
      kind: 'recommend',
      content: data.summary || '',
      dishes: data.recommendations || [],
      notice: data.notice || '',
      engine: data.engine || '',
      loading: false
    }
  } catch (e) {
    const idx = messages.value.length - 1
    messages.value[idx] = {
      role: 'bot',
      kind: 'error',
      content: '推荐失败：\n\n' + ((e && e.message) || '未知错误'),
      dishes: [],
      loading: false
    }
  } finally {
    stopWaitTimer()
    sending.value = false
    scrollToBottom()
  }
}

/**
 * 对某条推荐里的某道菜表达不满意 —— 「就这道不要」快捷操作
 * 等价于对 AI 说「第 N 个太油了」，但不需要用户自己数序号
 * @param {number} msgIndex 消息下标
 * @param {number} rank 该菜在这批推荐里的名次（从 1 开始）
 * @param {string} name 菜名，用于回显
 */
async function rejectDish(msgIndex, rank, name) {
  if (sending.value) return

  messages.value.push({ role: 'user', content: `不要「${name}」，换一个` })
  messages.value.push({ role: 'bot', content: '', loading: true, dishes: [] })
  sending.value = true
  startWaitTimer()
  scrollToBottom()

  try {
    // 交给云函数解析"第 N 个"：会话里记着上一轮推荐顺序，能精准排除
    const data = await recommendApi.agentTurn({ text: `第${rank}个不想要，换一道`, skipClarify: true })
    const idx = messages.value.length - 1
    if (data.prefSnapshot) activePref.value = data.prefSnapshot
    if (typeof data.excludedCount === 'number') excludedCount.value = data.excludedCount

    messages.value[idx] = {
      role: 'bot',
      kind: 'recommend',
      content: data.summary || '',
      dishes: data.recommendations || [],
      notice: data.notice || '',
      engine: data.engine || '',
      loading: false
    }
  } catch (e) {
    const idx = messages.value.length - 1
    messages.value[idx] = {
      role: 'bot',
      kind: 'error',
      content: '推荐失败：\n\n' + ((e && e.message) || '未知错误'),
      dishes: [],
      loading: false
    }
  } finally {
    stopWaitTimer()
    sending.value = false
    scrollToBottom()
  }
}

/** 清空条件，开始一段新对话 */
function resetConversation() {
  uni.showModal({
    title: '重新开始',
    content: '会清空当前累积的口味、预算与忌口条件，确定吗？',
    success: (res) => {
      if (!res.confirm) return
      recommendApi.endAgentSession()
      messages.value = []
      activePref.value = null
      excludedCount.value = 0
      scrollId.value = 'msg-welcome'
      uni.showToast({ title: '已清空条件', icon: 'none' })
    }
  })
}

/** 条件条文案：把累计条件拼成一句话，让用户看得见 AI 记住了什么 */
const prefText = computed(() => {
  const p = activePref.value
  if (!p) return ''
  const parts = []
  if (p.taste && p.taste.length) parts.push(p.taste.join('/'))
  if (p.budget) parts.push(p.budget + ' 元内')
  if (p.allergies && p.allergies.length) parts.push('忌 ' + p.allergies.join(''))
  if (p.canteen) parts.push(p.canteen)
  return parts.join(' · ')
})

/** 是否处于多轮对话模式（云函数没部署时 sessionId 为空） */
const agentMode = computed(() => !!recommendApi.getAgentSessionId())

/** 跳转菜品详情 */
function goDetail(id) {
  if (!id) return
  uni.navigateTo({ url: `/pages/dish/dish?id=${id}` })
}

/** 去菜品列表看全部（tabBar 页用 switchTab） */
function goList() {
  uni.switchTab({ url: '/pages/dish-list/dish-list' })
}

/**
 * 消费首页「快捷口味」留下的一次性偏好
 *
 * 首页是 tabBar 页，switchTab 不能带 query，所以它在切换前把偏好写进
 * shiyu_pending_pref。这里读取后**立即删除**（一次性），再翻译成一句中文
 * 回填到输入框 —— 不自动发送，避免用户误点一下就直接消耗一次大模型调用。
 */
function consumePendingPref() {
  let pref = null
  try {
    pref = uni.getStorageSync('shiyu_pending_pref') || null
    if (pref) uni.removeStorageSync('shiyu_pending_pref')
  } catch (e) {
    return
  }
  if (!pref || typeof pref !== 'object') return

  const text = buildPrefSentence(pref)
  if (!text) return

  inputText.value = text
  nextTick(() => {
    uni.showToast({ title: '已带回你的口味，点发送即可', icon: 'none' })
  })
}

// onShow 而非 onLoad：tabBar 页切换不会重新触发 onLoad
onShow(() => {
  consumePendingPref()
  loadTodayPicks()
})
</script>

<style lang="scss" scoped>
@import '@/common/tokens.scss';
/**
 * 对话页样式
 *
 * 全部使用 common/tokens.scss 的设计令牌（uni.scss 已自动注入）。
 * 改造前这里写死了 $brand / $surface-sunken / 20rpx，还有 emoji 当头像和图标，
 * 所以看着像「能跑的 demo」而不是能上线的产品。
 */

.chat-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: $canvas;
}

/* ==================== 消息列表 ==================== */

.msg-list {
  flex: 1;
  padding: 24rpx;
  box-sizing: border-box;
}

.msg-item {
  display: flex;
  margin-bottom: 32rpx;
  align-items: flex-start;
}

.msg-user {
  flex-direction: row-reverse;
}

.avatar-wrap {
  flex-shrink: 0;
}

.user-avatar {
  width: 68rpx;
  height: 68rpx;
  border-radius: 50%;
  background: $surface;
  border: 1rpx solid $line;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ==================== 欢迎区 ==================== */

.welcome {
  padding-bottom: 8rpx;
}

/* 品牌橙渐变主视觉 */
.hero {
  position: relative;
  padding: 40rpx 32rpx 36rpx;
  border-radius: $radius-lg;
  /**
   * 渐变几乎竖直（168deg）并压深下半段：
   * 机器人形象在浅色区、白色标题落在深色区。
   * 实测过第一版 150deg / $brand→$brand-dark 时，标题压在偏亮的橙上只有 2.88:1，
   * 达不到大字号 3:1 的线；现在标题所在区域能到 4:1 以上。
   */
  background: linear-gradient(168deg, $brand 0%, $brand-dark 42%, $brand-dark 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow: hidden;
  box-shadow: 0 12rpx 32rpx rgba(255, 90, 54, 0.22);
}

/* 右上角柔光：让纯色渐变不那么平 */
.hero-halo {
  position: absolute;
  top: -110rpx;
  right: -70rpx;
  width: 340rpx;
  height: 340rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.16);
}

.hero-title {
  position: relative;
  margin-top: 20rpx;
  font-size: 40rpx;
  font-weight: $fw-bold;
  color: #fff;
  letter-spacing: 1rpx;
  text-shadow: 0 2rpx 10rpx rgba(150, 45, 10, 0.28);
}

/* 能力说明放在白色胶囊里：白底 + 品牌橙文字，对比度远好于白字压橙底 */
.hero-pill {
  position: relative;
  display: flex;
  align-items: center;
  margin-top: 24rpx;
  padding: 14rpx 26rpx;
  border-radius: $radius-pill;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 4rpx 14rpx rgba(150, 45, 10, 0.16);
}

/**
 * 能力说明放在白色胶囊里
 *
 * 文字用 $ink 而不是品牌橙：实测 $brand 压在白色上对比度只有 3.09:1，
 * 12pt 的小字达不到 WCAG AA 的 4.5:1（橙色只保留在左侧的 sparkle 图标上，
 * 品牌感靠英雄区的橙色渐变承担）。
 */
.hero-pill-text {
  font-size: $fs-tag;
  font-weight: $fw-medium;
  color: $ink;
  margin-left: 10rpx;
}

/* ==================== 区块通用 ==================== */

.block {
  margin-top: 32rpx;
}

.block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.block-title {
  font-size: $fs-card;
  font-weight: $fw-bold;
  color: $ink;
  display: block;
  margin-bottom: 20rpx;
}

.block-head .block-title {
  margin-bottom: 0;
}

.block-more {
  display: flex;
  align-items: center;
}

.block-more-text {
  font-size: $fs-cap;
  color: $gray6;
  margin-right: 4rpx;
}

/* ==================== 快捷入口卡片 ==================== */

.entry-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  margin-top: 20rpx;
}

.entry-card {
  width: 328rpx;
  box-sizing: border-box;
  background: $surface;
  border: 1rpx solid $line;
  border-radius: $radius-card;
  padding: 24rpx 22rpx;
  margin-bottom: 20rpx;
  box-shadow: $shadow-card;
}

.entry-card:active {
  background: $brand-soft;
  border-color: $brand-line;
}

.entry-icon {
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  background: $brand-soft;
  display: flex;
  align-items: center;
  justify-content: center;
}

.entry-text {
  display: block;
  font-size: $fs-sub;
  font-weight: $fw-medium;
  color: $ink;
  line-height: 1.45;
  margin-top: 16rpx;
}

.entry-hint {
  display: block;
  font-size: $fs-tag;
  color: $gray6;
  margin-top: 8rpx;
}

/* ==================== 今日推荐预览 ==================== */

.pick-row {
  display: flex;
  justify-content: space-between;
  margin-top: 20rpx;
}

.pick-card {
  width: 196rpx;
}

.pick-card:active {
  opacity: 0.85;
}

.pick-name {
  display: block;
  font-size: $fs-cap;
  font-weight: $fw-medium;
  color: $ink;
  margin-top: 14rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pick-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8rpx;
}

.pick-price {
  font-size: $fs-cap;
  font-weight: $fw-bold;
  color: $brand;
}

.pick-score {
  display: flex;
  align-items: center;
}

.pick-score-text {
  font-size: $fs-tag;
  color: $gray6;
  margin-left: 4rpx;
}

/* ==================== 聊天气泡（圆角卡片 + 层次） ==================== */

.bubble {
  max-width: 76%;
  padding: 24rpx 26rpx;
  border-radius: $radius-lg;
  position: relative;
}

.bot-bubble {
  background: $surface;
  border-top-left-radius: $radius-sm;
  margin-left: 18rpx;
  box-shadow: 0 6rpx 22rpx rgba(20, 17, 15, 0.06);
}

.user-bubble {
  background: linear-gradient(135deg, $brand 0%, $brand 100%);
  border-top-right-radius: $radius-sm;
  margin-right: 18rpx;
  box-shadow: 0 8rpx 22rpx rgba(255, 90, 54, 0.26);
}

.bubble-text {
  font-size: $fs-body;
  line-height: 1.62;
  white-space: pre-wrap;
  word-break: break-all;
}

.user-bubble .bubble-text {
  color: #fff;
}

.bot-bubble .bubble-text {
  color: $gray7;
}

/* ---------- 打字动画 ---------- */

.typing {
  display: flex;
  align-items: center;
  padding: 8rpx 0;
}

.typing-dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: $brand-line;
  margin: 0 6rpx;
  animation: blink 1.2s infinite;
}

/* 等待超过 4 秒才出现的说明，安抚"是不是卡死了"的疑虑 */
.typing-hint {
  margin-left: 14rpx;
  font-size: $fs-tag;
  color: $gray6;
}

@keyframes blink {
  0%, 100% { opacity: 0.35; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.2); }
}

/* ==================== 气泡里的菜品卡片 ==================== */

.dish-cards {
  margin-bottom: 18rpx;
}

.dish-card {
  /* 用暖白画布色做内嵌卡：比在白色气泡里再放一张白卡更有层次 */
  background: $canvas;
  border-radius: $radius;
  padding: 22rpx;
  margin-bottom: 16rpx;
  border: 1rpx solid $line;
}

.dish-card:active {
  background: $surface-sunken;
}

.dish-card-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.dish-card-name {
  font-size: $fs-body;
  font-weight: $fw-bold;
  color: $ink;
}

.dish-card-price {
  font-size: $fs-body;
  font-weight: $fw-bold;
  color: $brand;
}

.dish-card-loc {
  display: flex;
  align-items: center;
  margin-top: 8rpx;
}

.dish-card-loc-text {
  font-size: $fs-tag;
  color: $gray6;
  margin-left: 6rpx;
}

.dish-card-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 12rpx;
}

.dish-tag {
  font-size: $fs-tag;
  color: $gray6;
  background: $surface-sunken;
  padding: 4rpx 14rpx;
  border-radius: $radius-sm;
  margin: 0 8rpx 8rpx 0;
}

.dish-tag-rate {
  display: flex;
  align-items: center;
  background: $brand-soft;
}

.dish-tag-rate-text {
  font-size: $fs-tag;
  color: $brand;
  font-weight: $fw-medium;
  margin-left: 4rpx;
}

.dish-card-reason {
  display: block;
  font-size: $fs-tag;
  color: $gray6;
  line-height: 1.5;
  margin-top: 10rpx;
  padding-top: 12rpx;
  border-top: 1rpx solid $line;
}

/* ==================== 序号角标（方便用户对照"第几个"） ==================== */

.dish-rank {
  width: 36rpx;
  height: 36rpx;
  line-height: 36rpx;
  text-align: center;
  border-radius: 50%;
  background: $brand-soft;
  color: $brand;
  font-size: $fs-tag;
  font-weight: $fw-bold;
  margin-right: 12rpx;
  flex-shrink: 0;
}

/* ==================== 菜品卡片操作（换一道） ==================== */

.dish-card-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 16rpx;
  padding-top: 14rpx;
  border-top: 1rpx solid $line;
}

.dish-act {
  display: flex;
  align-items: center;
  height: 52rpx;
  padding: 0 22rpx;
  margin-left: 14rpx;
  border: 2rpx solid $line;
  border-radius: $radius-pill;
}

.dish-act-text {
  margin-left: 6rpx;
  font-size: $fs-tag;
  color: $gray7;
}

/* ==================== 澄清卡片（F2：矛盾需求） ==================== */

.clarify {
  margin-top: 8rpx;
}

.clarify-detail {
  display: block;
  font-size: $fs-cap;
  color: $gray6;
  line-height: 1.6;
}

.clarify-options {
  display: flex;
  flex-wrap: wrap;
  margin-top: 16rpx;
}

.clarify-opt {
  height: 64rpx;
  line-height: 64rpx;
  padding: 0 26rpx;
  margin: 0 14rpx 14rpx 0;
  background: $brand-soft;
  border: 2rpx solid $brand-line;
  border-radius: $radius-pill;
}

.clarify-opt-text {
  font-size: $fs-sub;
  color: $brand;
  font-weight: $fw-medium;
}

.clarify-hint {
  display: block;
  margin-top: 4rpx;
  font-size: $fs-tag;
  color: $gray4;
}

.bubble-text-question {
  font-weight: $fw-medium;
  color: $ink;
}

.bubble-notice {
  display: block;
  margin-top: 12rpx;
  padding-top: 12rpx;
  border-top: 1rpx dashed $line;
  font-size: $fs-tag;
  color: $warning;
  line-height: 1.5;
}

/* ==================== 累计条件条 ==================== */

.pref-bar {
  display: flex;
  align-items: center;
  padding: 14rpx 24rpx;
  background: $surface;
  border-top: 1rpx solid $line;
}

.pref-main {
  flex: 1;
  display: flex;
  align-items: center;
  min-width: 0;
}

.pref-text {
  margin-left: 10rpx;
  font-size: $fs-cap;
  color: $gray7;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.pref-excluded {
  margin-left: 14rpx;
  font-size: $fs-tag;
  color: $gray4;
  flex-shrink: 0;
}

.pref-reset {
  margin-left: 20rpx;
  font-size: $fs-cap;
  color: $gray6;
  flex-shrink: 0;
}

/* ==================== 输入栏（悬浮圆角） ==================== */

.input-bar {
  display: flex;
  align-items: center;
  padding: 16rpx 24rpx;
  background: $canvas;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
}

.input-pill {
  flex: 1;
  height: 88rpx;
  background: $surface;
  border-radius: $radius-pill;
  border: 1rpx solid $line;
  box-shadow: 0 8rpx 24rpx rgba(20, 17, 15, 0.07);
  display: flex;
  align-items: center;
  padding: 0 32rpx;
  box-sizing: border-box;
}

.input-field {
  flex: 1;
  height: 100%;
  font-size: $fs-body;
  color: $ink;
}

.input-ph {
  color: $gray4;
  font-size: $fs-body;
}

.send-btn {
  margin-left: 18rpx;
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, $brand 0%, $brand-dark 100%);
  box-shadow: 0 8rpx 20rpx rgba(255, 90, 54, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.send-btn.disabled {
  background: $line-strong;
  box-shadow: none;
}

.send-btn-text {
  color: #fff;
  font-size: $fs-sub;
}

.msg-bottom {
  height: 24rpx;
}
</style>

