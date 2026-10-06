<template>
  <view class="chat-page">
    <!-- 消息列表 -->
    <scroll-view
      class="msg-list"
      scroll-y
      :scroll-into-view="scrollId"
      scroll-with-animation
    >
      <!-- 欢迎消息 -->
      <view class="msg-item msg-bot" id="msg-welcome">
        <view class="avatar bot-avatar">🤖</view>
        <view class="bubble bot-bubble">
          <text class="bubble-text">你好！我是食遇AI助手 🍜\n\n我知道学校食堂的所有菜品，告诉我你想吃什么，我来帮你选！\n\n比如你可以说：\n• "想吃辣的，10块以内"\n• "不吃香菜，有什么清淡的？"\n• "推荐个高分的面食"\n• "今天午餐吃什么好？"</text>
        </view>
      </view>

      <!-- 快捷提问 -->
      <view class="quick-ask" v-if="messages.length <= 1">
        <view class="quick-item" v-for="q in quickQuestions" :key="q" @click="sendQuick(q)">
          {{ q }}
        </view>
      </view>

      <!-- 对话消息 -->
      <view
        class="msg-item"
        :class="m.role === 'user' ? 'msg-user' : 'msg-bot'"
        v-for="(m, i) in messages"
        :key="i"
        :id="'msg-' + i"
      >
        <view class="avatar" :class="m.role === 'user' ? 'user-avatar' : 'bot-avatar'">
          {{ m.role === 'user' ? '😊' : '🤖' }}
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
              <text class="dish-card-loc">{{ formatLocation(d) || '位置待完善' }}</text>
              <view class="dish-card-tags">
                <text class="dish-tag" v-for="t in (d.tags || []).slice(0, 3)" :key="t">{{ t }}</text>
                <text class="dish-tag dish-tag-rate">⭐{{ d.rating }}</text>
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

    <!-- 输入栏 -->
    <view class="input-bar">
      <input
        class="input-field"
        v-model="inputText"
        placeholder="输入你想吃的..."
        confirm-type="send"
        :disabled="sending"
        @confirm="send()"
      />
      <view class="send-btn" :class="{ disabled: !inputText.trim() || sending }" @click="send()">
        <text v-if="!sending">发送</text>
        <text v-else>...</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { buildPrefSentence, explainCloudError } from '@/api/index.js'
import { formatLocation } from '@/common/utils.js'

const messages = ref([])
const inputText = ref('')
const sending = ref(false)
const scrollId = ref('msg-welcome')

const quickQuestions = [
  '想吃辣的，10块以内',
  '推荐个清淡的早餐',
  '不吃香菜，有什么好吃的？',
  '高分菜品有哪些？'
]

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
})
</script>

<style scoped>
.chat-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f0f0f0;
}

/* ---------- 消息列表 ---------- */
.msg-list {
  flex: 1;
  padding: 20rpx 24rpx;
  box-sizing: border-box;
}

.msg-item {
  display: flex;
  margin-bottom: 28rpx;
  align-items: flex-start;
}

.msg-user {
  flex-direction: row-reverse;
}

.avatar {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36rpx;
  flex-shrink: 0;
}

.bot-avatar {
  background: #fff;
  margin-right: 16rpx;
}

.user-avatar {
  background: #FF6B35;
  margin-left: 16rpx;
}

.bubble {
  max-width: 76%;
  padding: 22rpx 26rpx;
  border-radius: 20rpx;
  position: relative;
}

.bot-bubble {
  background: #fff;
  border-top-left-radius: 6rpx;
}

.user-bubble {
  background: #FF6B35;
  border-top-right-radius: 6rpx;
}

.bubble-text {
  font-size: 28rpx;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}

.user-bubble .bubble-text {
  color: #fff;
}

.bot-bubble .bubble-text {
  color: #333;
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
  background: #ccc;
  margin: 0 6rpx;
  animation: blink 1.2s infinite;
}

@keyframes blink {
  0%, 100% { opacity: 0.3; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.2); }
}

/* ---------- 快捷提问 ---------- */
.quick-ask {
  display: flex;
  flex-wrap: wrap;
  padding: 8rpx 88rpx 0;
}

.quick-item {
  font-size: 24rpx;
  color: #FF6B35;
  background: #fff;
  border: 2rpx solid #FF6B35;
  padding: 10rpx 22rpx;
  border-radius: 30rpx;
  margin: 0 14rpx 14rpx 0;
}

/* ---------- 菜品卡片 ---------- */
.dish-cards {
  margin-bottom: 16rpx;
}

.dish-card {
  background: #f9f9f9;
  border-radius: 14rpx;
  padding: 20rpx 22rpx;
  margin-bottom: 14rpx;
  border: 2rpx solid #eee;
}

.dish-card:active {
  background: #f0f0f0;
}

.dish-card-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.dish-card-name {
  font-size: 30rpx;
  font-weight: bold;
  color: #333;
}

.dish-card-price {
  font-size: 30rpx;
  color: #FF6B35;
  font-weight: bold;
}

.dish-card-loc {
  display: block;
  font-size: 22rpx;
  color: #999;
  margin-top: 6rpx;
}

.dish-card-tags {
  display: flex;
  flex-wrap: wrap;
  margin-top: 10rpx;
}

.dish-tag {
  font-size: 20rpx;
  color: #FF6B35;
  background: #fff0eb;
  padding: 4rpx 14rpx;
  border-radius: 8rpx;
  margin: 0 8rpx 8rpx 0;
}

.dish-tag-rate {
  color: #FF9800;
  background: #fff8e8;
}

.dish-card-reason {
  display: block;
  font-size: 23rpx;
  color: #666;
  line-height: 1.5;
  margin-top: 10rpx;
  padding-top: 10rpx;
  border-top: 1rpx solid #f0f0f0;
}

/* ---------- 输入栏 ---------- */
.input-bar {
  display: flex;
  align-items: center;
  padding: 16rpx 24rpx;
  background: #fff;
  border-top: 2rpx solid #eee;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
}

.input-field {
  flex: 1;
  height: 76rpx;
  background: #f5f5f5;
  border-radius: 38rpx;
  padding: 0 28rpx;
  font-size: 28rpx;
  box-sizing: border-box;
}

.send-btn {
  margin-left: 16rpx;
  width: 120rpx;
  height: 76rpx;
  background: #FF6B35;
  border-radius: 38rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 28rpx;
  font-weight: 500;
}

.send-btn.disabled {
  background: #ccc;
}

.msg-bottom {
  height: 20rpx;
}
</style>
