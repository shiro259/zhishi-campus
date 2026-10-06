<template>
  <view class="user-page">
    <!-- ==================== 头部：已登录 / 未登录 ==================== -->
    <view class="header">
      <!-- 已登录 -->
      <view class="header-main" v-if="isLogin">
        <view class="avatar">
          <!-- 头像有两种：登录页随机挑的 emoji，或云存储/网络图片地址。
               只有真正的地址才能交给 <image>，否则小程序会把 emoji 当路径加载，头像变成空白 -->
          <image
            v-if="profile.avatar && avatarIsImage"
            class="avatar-img"
            :src="profile.avatar"
            mode="aspectFill"
          />
          <text v-else class="avatar-emoji">{{ profile.avatar || '😋' }}</text>
        </view>
        <view class="header-info">
          <view class="name-row">
            <text class="nickname">{{ profile.nickname || '同学' }}</text>
            <text class="role-tag" :class="{ 'role-admin': isAdminRole }">{{ roleLabel }}</text>
          </view>
          <text class="uid">ID: {{ uidText }}</text>
        </view>
        <text class="edit-entry" @click="goEditProfile">编辑资料 ›</text>
      </view>

      <!-- 未登录：不强制跳转，点击按钮才去登录页 -->
      <view class="header-main" v-else>
        <view class="avatar">
          <text class="avatar-emoji">👤</text>
        </view>
        <view class="header-info">
          <text class="nickname">未登录</text>
          <text class="uid">登录后可同步昵称与身份</text>
        </view>
        <view class="login-btn" @click="goLogin">
          <text class="login-btn-text">点击登录</text>
        </view>
      </view>
    </view>

    <!-- ==================== 我的口味档案 ==================== -->
    <view class="card pref-card" @click="goRecommend">
      <view class="card-head">
        <text class="card-title">🍽️ 我的口味档案</text>
        <text class="card-more">去推荐 ›</text>
      </view>

      <template v-if="pref">
        <text class="pref-label">{{ prefLabel }}</text>
        <view class="pref-chips" v-if="prefChips.length">
          <text class="chip" v-for="c in prefChips" :key="c">{{ c }}</text>
        </view>
      </template>
      <text class="pref-empty" v-else>还没设置口味偏好，去设置一个吧</text>

      <view class="pref-actions" v-if="pref">
        <text class="clear-btn" @click.stop="clearPref">清除口味档案</text>
      </view>
    </view>

    <!-- ==================== 功能列表 ==================== -->
    <view class="card menu-card">
      <!-- 我的评价 -->
      <view class="menu-item" @click="toggleReviews">
        <text class="menu-icon">📝</text>
        <text class="menu-text">我的评价</text>
        <text class="menu-ext" v-if="reviews.length">{{ reviews.length }} 条</text>
        <text class="menu-arrow">{{ showReviews ? '⌃' : '›' }}</text>
      </view>

      <!-- 我的评价：就地展开 -->
      <view class="panel" v-if="showReviews">
        <view class="panel-loading" v-if="loadingReviews">
          <text class="panel-tip">正在加载评价…</text>
        </view>
        <template v-else-if="reviews.length">
          <view class="review-item" v-for="r in reviews" :key="r._id || r.id">
            <view class="review-head">
              <text class="review-nick">{{ r.nickname || '匿名同学' }}</text>
              <text class="review-status" v-if="r.status === 0">审核中</text>
              <text class="review-time">{{ formatTime(r.create_date) }}</text>
            </view>
            <view class="review-stars">
              <text class="stars">{{ stars(r.rating) }}</text>
              <text class="score">{{ formatRating(r.rating) }} 分</text>
            </view>
            <text class="review-content">{{ r.content }}</text>
          </view>
        </template>
        <text class="panel-tip" v-else>还没有发表过评价</text>
      </view>

      <!-- 推荐历史 -->
      <view class="menu-item" @click="toggleHistory">
        <text class="menu-icon">🕘</text>
        <text class="menu-text">推荐历史</text>
        <text class="menu-ext" v-if="history.length">最近 {{ history.length }} 条</text>
        <text class="menu-arrow">{{ showHistory ? '⌃' : '›' }}</text>
      </view>

      <!-- 推荐历史：就地展开 -->
      <view class="panel" v-if="showHistory">
        <template v-if="history.length">
          <view class="history-item" v-for="(h, i) in history" :key="i">
            <view class="history-head">
              <text class="history-label">{{ historyLabel(h) }}</text>
              <text class="history-time">{{ formatTime(h.time) }}</text>
            </view>
            <text class="history-summary" v-if="h.summary">{{ h.summary }}</text>
          </view>
          <view class="panel-foot">
            <text class="clear-btn" @click.stop="clearHistory">清空历史</text>
          </view>
        </template>
        <text class="panel-tip" v-else>还没有推荐记录，去 AI 推荐页试试吧</text>
      </view>

      <!-- 管理后台：仅管理员可见 -->
      <view class="menu-item" v-if="isAdminRole" @click="goAdmin">
        <text class="menu-icon">🛠️</text>
        <text class="menu-text">管理后台</text>
        <text class="menu-arrow">›</text>
      </view>

      <!-- 关于项目 -->
      <view class="menu-item" @click="showAbout">
        <text class="menu-icon">ℹ️</text>
        <text class="menu-text">关于项目</text>
        <text class="menu-arrow">›</text>
      </view>
    </view>

    <!-- ==================== 退出登录 ==================== -->
    <view class="card menu-card" v-if="isLogin">
      <view class="menu-item" @click="logout">
        <text class="menu-icon">🚪</text>
        <text class="menu-text logout-text">退出登录</text>
      </view>
    </view>
  </view>
</template>

<script setup>
/**
 * 我的（食遇校园）
 *
 * 说明：登录态以本地资料（userApi.getProfile()，储存键 userInfo）为准，
 *      全程只调用 @/api/index.js，不直接触碰 uniCloud。
 *      未登录不强制跳转，只有用户主动点击才进登录页。
 */
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { userApi, recommendApi, reviewApi, buildPrefLabel } from '@/api/index.js'
import { clearAuth, formatTime, renderStars } from '@/common/utils.js'

/* -------------------------------- 页面状态 -------------------------------- */

const profile = ref(null)
const uid = ref('')
const pref = ref(null)
const history = ref([])
const reviews = ref([])
const showReviews = ref(false)
const showHistory = ref(false)
const loadingReviews = ref(false)

/* -------------------------------- 计算属性 -------------------------------- */

const isLogin = computed(() => !!profile.value)

const isAdminRole = computed(() => !!profile.value && profile.value.role === 'admin')

const roleLabel = computed(() => (isAdminRole.value ? '管理员' : '普通同学'))

/**
 * 头像是否为「可加载的图片地址」
 *
 * 登录页保存的 avatar 是 emoji（'😋' 之类），把它塞进 <image :src> 会加载失败，
 * 头像呈现空白。这里只有识别为真实地址时才走 <image>，否则用 <text> 直接渲染 emoji。
 */
const avatarIsImage = computed(() => {
  const a = String((profile.value && profile.value.avatar) || '')
  return /^(https?:\/\/|cloud:\/\/|wxfile:\/\/|data:image\/|\/|static\/)/.test(a)
})

/** uid 后 6 位，展示成 ID: xxxxxx */
const uidText = computed(() => {
  const id = String(uid.value || '')
  return id ? id.slice(-6) : '------'
})

/** 上次偏好的一句话标签（与推荐历史同一套风格） */
const prefLabel = computed(() => {
  const p = pref.value
  if (!p) return ''
  try {
    return buildPrefLabel(p)
  } catch (e) {
    return '已保存口味偏好'
  }
})

/** 偏好拆成小标签：口味 / 忌口 / 预算 / 食堂 / 补充 */
const prefChips = computed(() => {
  const p = pref.value || {}
  const chips = []
  if (p.meal_type) chips.push(p.meal_type)
  if (p.taste && p.taste.length) chips.push('爱' + p.taste.join('·'))
  if (p.allergies && p.allergies.length) chips.push('忌' + p.allergies.join('·'))
  if (p.budget) chips.push(p.budget + ' 元内')
  if (p.canteen) chips.push(p.canteen)
  if (p.extra) chips.push(String(p.extra))
  return chips
})

/* -------------------------------- 数据加载 -------------------------------- */

function load() {
  try {
    profile.value = userApi.getProfile()
    uid.value = userApi.getUid() || ''
    pref.value = recommendApi.getSavedPref() || null
    history.value = (recommendApi.getHistory() || []).slice(0, 5)
  } catch (e) {
    // 本地读取异常时保持空态，不白屏
    pref.value = null
    history.value = []
  }
  if (showReviews.value) loadReviews()
}

async function loadReviews() {
  loadingReviews.value = true
  try {
    const res = await reviewApi.mine({ page: 1, pageSize: 20 })
    reviews.value = (res && res.list) || []
  } catch (e) {
    reviews.value = []
    uni.showToast({ title: '评价加载失败，请稍后重试', icon: 'none' })
  } finally {
    loadingReviews.value = false
  }
}

// tabBar 页：onShow 覆盖首次进入与从其它页面返回
onShow(() => {
  load()
})

/* -------------------------------- 交互逻辑 -------------------------------- */

function toggleReviews() {
  if (!isLogin.value) {
    uni.showToast({ title: '登录后可查看我的评价', icon: 'none' })
    setTimeout(() => goLogin(), 600)
    return
  }
  showReviews.value = !showReviews.value
  if (showReviews.value) loadReviews()
}

function toggleHistory() {
  showHistory.value = !showHistory.value
  if (showHistory.value) history.value = (recommendApi.getHistory() || []).slice(0, 5)
}

function clearPref() {
  uni.showModal({
    title: '提示',
    content: '确定清除口味档案吗？下次推荐将不再自动回填。',
    success: (res) => {
      if (!res.confirm) return
      try {
        // savePref(null) 后部分端会留下 'null' 字符串，直接移除储存键最稳妥
        uni.removeStorageSync('shiyu_pref')
      } catch (e) {
        // 忽略存储异常
      }
      pref.value = null
      uni.showToast({ title: '已清除口味档案', icon: 'none' })
    }
  })
}

function clearHistory() {
  uni.showModal({
    title: '提示',
    content: '确定清空推荐历史吗？',
    success: (res) => {
      if (!res.confirm) return
      try {
        recommendApi.clearHistory()
      } catch (e) {
        // 忽略
      }
      history.value = []
      uni.showToast({ title: '已清空推荐历史', icon: 'none' })
    }
  })
}

function showAbout() {
  uni.showModal({
    title: '关于食遇校园',
    content:
      '食遇校园 · AI 智能食堂推荐\n\n用 AI 解决「每天不知道吃啥」：说口味、报预算、填忌口，即可得到食堂菜品推荐。\n\n技术说明：uni-app (Vue3) + uniCloud 云函数 + 大模型 API；云端不可用时自动降级为本地规则引擎，离线也能完整演示。',
    showCancel: false,
    confirmText: '知道了'
  })
}

function logout() {
  uni.showModal({
    title: '提示',
    content: '确定退出登录吗？',
    success: (res) => {
      if (!res.confirm) return
      try {
        userApi.clear()
        clearAuth()
      } catch (e) {
        // 忽略
      }
      reviews.value = []
      showReviews.value = false
      load()
      uni.showToast({ title: '已退出登录', icon: 'none' })
    }
  })
}

function goLogin() {
  uni.navigateTo({ url: '/pages/login/login' })
}

function goEditProfile() {
  // 身份信息保存在本机，修改昵称/头像/身份统一在登录页完成
  uni.navigateTo({ url: '/pages/login/login?mode=edit' })
}

function goRecommend() {
  uni.switchTab({ url: '/pages/recommend/recommend' })
}

function goAdmin() {
  uni.navigateTo({ url: '/pages/admin/index' })
}

/* -------------------------------- 展示辅助 -------------------------------- */

function stars(rating) {
  return renderStars(Number(rating) || 0)
}

function formatRating(rating) {
  const n = Number(rating)
  return Number.isFinite(n) ? n.toFixed(1) : '—'
}

/** 历史记录标签：优先用记录自带的 label，否则按偏好现算一次 */
function historyLabel(item) {
  if (!item) return '无特殊偏好'
  if (item.label) return item.label
  try {
    return buildPrefLabel(item.pref || {})
  } catch (e) {
    return '无特殊偏好'
  }
}
</script>

<style scoped>
.user-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: 60rpx;
}

/* -------------------- 头部 -------------------- */

.header {
  background: linear-gradient(135deg, #FF6B35, #FF8C5A);
  padding: 44rpx 30rpx;
}

.header-main {
  display: flex;
  align-items: center;
}

.avatar {
  width: 128rpx;
  height: 128rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  border: 4rpx solid #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.avatar-img {
  width: 128rpx;
  height: 128rpx;
}

.avatar-emoji {
  font-size: 68rpx;
}

.header-info {
  flex: 1;
  margin-left: 24rpx;
  overflow: hidden;
}

.name-row {
  display: flex;
  align-items: center;
}

.nickname {
  font-size: 36rpx;
  font-weight: bold;
  color: #fff;
}

.role-tag {
  font-size: 20rpx;
  color: #FF6B35;
  background: rgba(255, 255, 255, 0.92);
  border-radius: 20rpx;
  padding: 4rpx 16rpx;
  margin-left: 16rpx;
}

.role-tag.role-admin {
  color: #fff;
  background: rgba(0, 0, 0, 0.28);
}

.uid {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.88);
  margin-top: 10rpx;
  display: block;
}

.edit-entry {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.9);
}

.login-btn {
  border: 2rpx solid #fff;
  border-radius: 40rpx;
  padding: 14rpx 36rpx;
}

.login-btn-text {
  font-size: 28rpx;
  color: #fff;
}

/* -------------------- 通用卡片 -------------------- */

.card {
  margin: 24rpx;
  background: #fff;
  border-radius: 20rpx;
  padding: 28rpx 24rpx;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-title {
  font-size: 30rpx;
  font-weight: bold;
  color: #333;
}

.card-more {
  font-size: 24rpx;
  color: #FF6B35;
}

/* -------------------- 口味档案 -------------------- */

.pref-label {
  font-size: 28rpx;
  color: #333;
  margin-top: 20rpx;
  display: block;
  line-height: 40rpx;
}

.pref-empty {
  font-size: 26rpx;
  color: #999;
  margin-top: 20rpx;
  display: block;
}

.pref-chips {
  display: flex;
  flex-wrap: wrap;
  margin-top: 18rpx;
}

.chip {
  font-size: 22rpx;
  color: #FF6B35;
  background: #FFF0EB;
  border-radius: 20rpx;
  padding: 6rpx 20rpx;
  margin: 0 16rpx 16rpx 0;
}

.pref-actions {
  margin-top: 8rpx;
  display: flex;
  justify-content: flex-end;
}

.clear-btn {
  font-size: 24rpx;
  color: #999;
  border: 1rpx solid #e5e5e5;
  border-radius: 30rpx;
  padding: 8rpx 28rpx;
}

/* -------------------- 功能列表 -------------------- */

.menu-card {
  padding: 0 24rpx;
}

.menu-item {
  display: flex;
  align-items: center;
  padding: 30rpx 0;
  border-bottom: 1rpx solid #f5f5f5;
}

.menu-item:last-child {
  border-bottom: none;
}

.menu-icon {
  font-size: 34rpx;
  margin-right: 20rpx;
}

.menu-text {
  flex: 1;
  font-size: 28rpx;
  color: #333;
}

.menu-text.logout-text {
  color: #ff4d4f;
}

.menu-ext {
  font-size: 22rpx;
  color: #bbb;
  margin-right: 12rpx;
}

.menu-arrow {
  font-size: 30rpx;
  color: #ccc;
}

/* -------------------- 展开面板 -------------------- */

.panel {
  padding: 12rpx 0 24rpx;
  border-bottom: 1rpx solid #f5f5f5;
}

.panel-tip {
  font-size: 24rpx;
  color: #bbb;
  display: block;
  padding: 16rpx 0;
}

.panel-loading {
  padding: 16rpx 0;
}

.panel-foot {
  margin-top: 12rpx;
  display: flex;
  justify-content: flex-end;
}

/* 我的评价 */

.review-item {
  background: #fafafa;
  border-radius: 16rpx;
  padding: 22rpx;
  margin-bottom: 16rpx;
}

.review-item:last-child {
  margin-bottom: 0;
}

.review-head {
  display: flex;
  align-items: center;
}

.review-nick {
  font-size: 26rpx;
  font-weight: 500;
  color: #333;
}

.review-status {
  font-size: 20rpx;
  color: #FF9800;
  background: #FFF6E5;
  border-radius: 8rpx;
  padding: 2rpx 12rpx;
  margin-left: 12rpx;
}

.review-time {
  flex: 1;
  text-align: right;
  font-size: 22rpx;
  color: #bbb;
}

.review-stars {
  margin-top: 10rpx;
  display: flex;
  align-items: center;
}

.stars {
  font-size: 24rpx;
  color: #FFB300;
}

.score {
  font-size: 22rpx;
  color: #FF9800;
  margin-left: 12rpx;
}

.review-content {
  font-size: 26rpx;
  color: #555;
  margin-top: 12rpx;
  display: block;
  line-height: 38rpx;
}

/* 推荐历史 */

.history-item {
  background: #fafafa;
  border-radius: 16rpx;
  padding: 20rpx;
  margin-bottom: 16rpx;
}

.history-item:last-child {
  margin-bottom: 0;
}

.history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.history-label {
  flex: 1;
  font-size: 26rpx;
  font-weight: 500;
  color: #333;
}

.history-time {
  font-size: 22rpx;
  color: #bbb;
  margin-left: 16rpx;
}

.history-summary {
  font-size: 24rpx;
  color: #777;
  margin-top: 10rpx;
  display: block;
  line-height: 36rpx;
}
</style>
