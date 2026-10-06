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
        v-for="(m, i) in messages"
        :key="i"
        :id="'msg-' + i"
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
              v-for="d in m.dishes"
              :key="d.id"
              @click="goDetail(d.id)"
            >
              <view class="dish-card-head">
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
            </view>
          </view>
          <!-- 文字内容 -->
          <text class="bubble-text" v-if="m.content">{{ m.content }}</text>
          <!-- 加载中 -->
          <view class="typing" v-if="m.loading">
            <text class="typing-dot" v-for="i in 3" :key="i" :style="{ animationDelay: i * 0.2 + 's' }" />
          </view>
        </view>
      </view>

      <!-- 底部留白 -->
      <view class="msg-bottom" />
    </scroll-view>

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
 * AI 助手对话页（食遇校园）
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
import { buildPrefSentence, explainCloudError, dishApi } from '@/api/index.js'
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
  scrollToBottom()

  try {
    // 组装对话历史（发给后端的 messages 不含 system，后端自己加）
    // 注意：下面的 filter 已经用 !m.loading 把「正在加载的 bot 占位消息」排除了，
    // 所以这里绝不能再 .slice(0, -1)。否则会把刚 push 进去的那条用户提问也一起丢掉，
    // 导致首轮提问发送空数组、后续每轮都慢一拍。
    const chatMessages = []
    const recent = messages.value
      .filter(m => !m.loading && (m.content || (m.dishes && m.dishes.length)))
    for (const m of recent) {
      if (m.role === 'user') {
        chatMessages.push({ role: 'user', content: m.content })
      } else {
        chatMessages.push({ role: 'assistant', content: m.content || '' })
      }
    }

    // 调用云函数 shiyu-chat
    //
    // 这里刻意把三类失败分开报出来：以前无论什么原因都只显示一句笼统的
    // 「AI服务暂时不可用」，导致无法判断到底是云空间没关联、云函数没上传，
    // 还是 Key / base_url / 模型配置有问题。
    if (typeof uniCloud === 'undefined' || !uniCloud || !uniCloud.callFunction) {
      throw new Error(
        'uniCloud 不可用：本项目还没关联云服务空间。\n' +
        '请在 HBuilderX 中右键 uniCloud-aliyun → 关联云服务空间（阿里云），然后重新运行。'
      )
    }

    const res = await new Promise((resolve, reject) => {
      uniCloud.callFunction({
        name: 'shiyu-chat',
        data: { messages: chatMessages },
        success: (r) => resolve(r.result),
        fail: (err) => {
          const detail = (err && (err.errMsg || err.message)) || '未知错误'
          // 交给 explainCloudError 翻译：真机上最常见的是域名白名单，
          // 只丢一句 request:fail 用户根本无从下手
          reject(new Error('云函数 shiyu-chat 调用失败：' + explainCloudError(detail)))
        }
      })
    })

    if (!res) {
      throw new Error('云函数 shiyu-chat 没有返回内容，可能还没上传部署。')
    }
    if (res.code !== 0 || !res.data) {
      // 云函数自己给出的业务原因（未配 Key / Key 无效 / base_url 写错等）原样透出
      throw new Error(res.message || '云函数返回异常（未返回 code/data）')
    }

    const idx = messages.value.length - 1
    messages.value[idx] = {
      role: 'bot',
      content: res.data.content || '',
      dishes: res.data.dishes || [],
      loading: false
    }
  } catch (e) {
    const idx = messages.value.length - 1
    messages.value[idx] = {
      role: 'bot',
      content: 'AI 服务调用失败：\n\n' + ((e && e.message) || '未知错误'),
      dishes: [],
      loading: false
    }
  } finally {
    sending.value = false
    scrollToBottom()
  }
}

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
/**
 * 对话页样式
 *
 * 全部使用 common/tokens.scss 的设计令牌（uni.scss 已自动注入）。
 * 改造前这里写死了 #FF6B35 / #f0f0f0 / 20rpx，还有 emoji 当头像和图标，
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
   * 实测过第一版 150deg / #ff8f6b→#e8481f 时，标题压在偏亮的橙上只有 2.88:1，
   * 达不到大字号 3:1 的线；现在标题所在区域能到 4:1 以上。
   */
  background: linear-gradient(168deg, #ff8f6b 0%, #f24e24 42%, #cf3d17 100%);
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
 * 文字用 $ink 而不是品牌橙：实测 #ff5a36 压在白色上对比度只有 3.09:1，
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
  background: linear-gradient(135deg, $brand 0%, #ff8055 100%);
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
  background: linear-gradient(135deg, $brand 0%, #ff8a5c 100%);
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
