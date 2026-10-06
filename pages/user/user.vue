<template>
  <view class="user-page">
    <!-- ==================== 身份区 ==================== -->
    <view class="card">
      <view class="head-row">
        <view class="avatar">
          <image
            v-if="isLogin && profile.avatar"
            class="avatar-img"
            :src="profile.avatar"
            mode="aspectFill"
          />
          <text v-else-if="isLogin" class="avatar-char">{{ avatarChar }}</text>
          <Icon v-else name="user" :size="40" color="#B8B2AA" />
        </view>
        <view class="head-info">
          <view class="name-row">
            <text class="nickname">{{ isLogin ? nicknameText : '未登录' }}</text>
            <text class="role-tag" v-if="isLogin" :class="{ 'is-admin': isAdminRole }">{{ roleLabel }}</text>
          </view>
          <text class="uid">{{ isLogin ? 'ID: ' + uidText : '登录后可同步昵称与身份' }}</text>
        </view>
        <view class="head-edit" v-if="isLogin" @click="goEditProfile">
          <text class="head-edit-text">编辑</text>
          <Icon name="right" :size="24" color="#B8B2AA" />
        </view>
      </view>

      <!-- 未登录：不强制跳转，点击按钮才去登录页 -->
      <view class="head-login" v-if="!isLogin">
        <view class="btn-primary" @click="goLogin">
          <text class="btn-primary-text">点击登录</text>
        </view>
      </view>
    </view>

    <!-- ==================== 我的口味档案 ==================== -->
    <view class="card" @click="goRecommend">
      <view class="card-head">
        <text class="card-title">我的口味档案</text>
        <view class="card-action" @click.stop="goRecommend">
          <text class="card-action-text">编辑</text>
          <Icon name="right" :size="24" color="#FF5A36" />
        </view>
      </view>

      <template v-if="pref">
        <view class="chip-row" v-if="prefChips.length">
          <view
            class="chip"
            v-for="c in prefChips"
            :key="c.text"
            :class="{ 'is-taste': c.kind === 'taste' }"
          >{{ c.text }}</view>
        </view>

        <view class="card-foot">
          <text class="clear-btn" @click.stop="clearPref">清除档案</text>
        </view>
      </template>

      <view class="empty" v-else>
        <Icon name="clipboard" :size="56" color="#D8D3CB" />
        <text class="empty-text">还没设置口味偏好</text>
        <view class="btn-primary is-inline" @click.stop="goRecommend">
          <text class="btn-primary-text">去设置</text>
        </view>
      </view>
    </view>

    <!-- ==================== 功能列表 ==================== -->
    <view class="card menu-card">
      <!-- 我的评价 -->
      <view class="menu-item" @click="toggleReviews">
        <Icon name="edit" :size="28" color="#8A8580" />
        <text class="menu-text">我的评价</text>
        <text class="menu-ext" v-if="reviews.length">{{ reviews.length }} 条</text>
        <Icon :name="showReviews ? 'up' : 'down'" :size="28" color="#B8B2AA" />
      </view>

      <!-- 我的评价：就地展开 -->
      <view class="panel" v-if="showReviews">
        <text class="panel-tip" v-if="loadingReviews">正在加载评价…</text>
        <template v-else-if="reviews.length">
          <view class="review-item" v-for="r in reviews" :key="r._id || r.id">
            <view class="review-head">
              <view class="rv-avatar">
                <text class="rv-avatar-char">{{ firstChar(r.nickname) }}</text>
              </view>
              <text class="review-nick">{{ r.nickname || '匿名同学' }}</text>
              <text class="review-status" v-if="r.status === 0">审核中</text>
            </view>
            <view class="review-stars">
              <view class="rv-star" v-for="n in 5" :key="n">
                <Icon name="star" :size="28" :color="n <= (Number(r.rating) || 0) ? '#FF5A36' : '#B8B2AA'" />
              </view>
              <text class="review-time">{{ formatTime(r.create_date) }}</text>
            </view>
            <text class="review-content">{{ r.content }}</text>
          </view>
        </template>
        <text class="panel-tip" v-else>还没有发表过评价</text>
      </view>

      <!-- 推荐历史 -->
      <view class="menu-item" @click="toggleHistory">
        <Icon name="clock" :size="28" color="#8A8580" />
        <text class="menu-text">推荐历史</text>
        <text class="menu-ext" v-if="history.length">最近 {{ history.length }} 条</text>
        <Icon :name="showHistory ? 'up' : 'down'" :size="28" color="#B8B2AA" />
      </view>

      <!-- 推荐历史：就地展开 -->
      <view class="panel" v-if="showHistory">
        <template v-if="history.length">
          <view class="history-item" v-for="(h, i) in history" :key="i">
            <view class="history-row">
              <view class="dot"></view>
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
        <Icon name="settings" :size="28" color="#8A8580" />
        <text class="menu-text">管理后台</text>
        <Icon name="right" :size="28" color="#B8B2AA" />
      </view>

      <!-- 关于项目 -->
      <view class="menu-item" @click="showAbout">
        <Icon name="info" :size="28" color="#8A8580" />
        <text class="menu-text">关于项目</text>
        <Icon name="right" :size="28" color="#B8B2AA" />
      </view>
    </view>

    <!-- ==================== 退出登录 ==================== -->
    <view class="card" v-if="isLogin">
      <view class="logout-row" @click="logout">
        <text class="logout-text">退出登录</text>
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
import { clearAuth, formatTime } from '@/common/utils.js'

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

const nicknameText = computed(() => (profile.value && profile.value.nickname) || '同学')

/** 头像占位：昵称首字（不使用 emoji 头像） */
const avatarChar = computed(() => {
  const name = String(nicknameText.value).trim()
  return name ? name.slice(0, 1) : '同'
})

/** uid 后 6 位，展示成 ID: xxxxxx */
const uidText = computed(() => {
  const id = String(uid.value || '')
  return id ? id.slice(-6) : '------'
})

/** 偏好拆成小标签：口味（主色）/ 忌口、预算、食堂（中性） */
const prefChips = computed(() => {
  const p = pref.value || {}
  const chips = []
  if (p.meal_type) chips.push({ text: p.meal_type, kind: 'plain' })
  if (p.taste && p.taste.length) chips.push({ text: '爱' + p.taste.join('·'), kind: 'taste' })
  if (p.allergies && p.allergies.length) {
    chips.push({ text: '忌' + p.allergies.join('·'), kind: 'plain' })
  }
  if (p.budget) chips.push({ text: p.budget + ' 元内', kind: 'plain' })
  if (p.canteen) chips.push({ text: p.canteen, kind: 'plain' })
  if (p.extra) chips.push({ text: String(p.extra), kind: 'plain' })
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

/** 昵称首字，用于头像占位 */
function firstChar(name) {
  const s = String(name || '').trim()
  return s ? s.slice(0, 1) : '匿'
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

<style lang="scss" scoped>
@import '@/common/tokens.scss';
/* ==================== 页面 ==================== */
.user-page {
  min-height: 100vh;
  box-sizing: border-box;
  background: $canvas;
  padding: $gap-page $gap-page 60rpx;
}

/* ==================== 通用卡片 ==================== */
.card {
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
  padding: $gap-card;
  box-shadow: $shadow-card;
  margin-bottom: $gap;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-title {
  font-size: $fs-card;
  font-weight: $fw-bold;
  color: $ink;
}

.card-action {
  display: flex;
  align-items: center;
}

.card-action-text {
  font-size: $fs-sub;
  color: $brand;
}

.card-foot {
  display: flex;
  justify-content: flex-end;
  margin-top: $gap-sm;
}

/* ==================== 主按钮 ==================== */
.btn-primary {
  height: $h-btn;
  background: $brand;
  border-radius: $radius-pill;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: $shadow-brand;
}

.btn-primary.is-inline {
  padding: 0 56rpx;
}

.btn-primary-text {
  color: #fff;
  font-size: $fs-card;
  font-weight: $fw-medium;
}

/* ==================== 身份区 ==================== */
.head-row {
  display: flex;
  align-items: center;
}

.avatar {
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  background: $surface-sunken;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.avatar-img {
  width: 88rpx;
  height: 88rpx;
}

.avatar-char {
  font-size: $fs-card;
  font-weight: $fw-bold;
  color: $ink;
}

.head-info {
  flex: 1;
  min-width: 0;
  margin-left: $gap;
}

.name-row {
  display: flex;
  align-items: center;
}

.nickname {
  font-size: $fs-title;
  font-weight: $fw-bold;
  color: $ink;
}

.role-tag {
  height: 40rpx;
  line-height: 40rpx;
  padding: 0 16rpx;
  margin-left: $gap-sm;
  border-radius: $radius-pill;
  font-size: $fs-tag;
  background: $surface-sunken;
  color: $gray6;
}

.role-tag.is-admin {
  background: $brand-soft;
  color: $brand;
}

.uid {
  display: block;
  margin-top: 8rpx;
  font-size: $fs-tag;
  color: $gray4;
}

.head-edit {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.head-edit-text {
  font-size: $fs-sub;
  color: $gray6;
}

.head-login {
  margin-top: $gap-lg;
}

/* ==================== 口味档案 ==================== */
.chip-row {
  display: flex;
  flex-wrap: wrap;
  margin-top: $gap;
}

.chip {
  height: 56rpx;
  line-height: 56rpx;
  padding: 0 24rpx;
  margin: 0 $gap-sm $gap-sm 0;
  background: $surface-sunken;
  border: 2rpx solid $line;
  border-radius: $radius-pill;
  font-size: $fs-cap;
  color: $gray7;
}

/* 口味用主色，忌口 / 预算 / 食堂保持中性 */
.chip.is-taste {
  background: $brand-soft;
  border-color: $brand-line;
  color: $brand;
}

.clear-btn {
  padding: 8rpx 0;
  font-size: $fs-cap;
  color: $gray4;
}

/* 空态 */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: $gap 0 $gap-sm;
}

.empty-text {
  margin: $gap-sm 0 $gap;
  font-size: $fs-sub;
  color: $gray6;
}

/* ==================== 功能列表 ==================== */
.menu-card {
  padding: 0 $gap-card;
}

.menu-item {
  display: flex;
  align-items: center;
  height: 104rpx;
  box-sizing: border-box;
  border-top: 2rpx solid $line;
}

.menu-card > .menu-item:first-child {
  border-top: none;
}

.menu-text {
  flex: 1;
  margin-left: $gap;
  font-size: $fs-body;
  color: $ink;
}

.menu-ext {
  margin-right: $gap-sm;
  font-size: $fs-tag;
  color: $gray4;
}

/* ==================== 展开区 ==================== */
.panel {
  padding: $gap 0 $gap-lg;
}

.panel-tip {
  display: block;
  padding: $gap 0;
  font-size: $fs-sub;
  color: $gray4;
}

.panel-foot {
  display: flex;
  justify-content: flex-end;
  margin-top: $gap-sm;
}

/* 我的评价 */
.review-item {
  background: $surface-sunken;
  border-radius: $radius;
  padding: $gap;
  margin-bottom: $gap-sm;
}

.review-item:last-child {
  margin-bottom: 0;
}

.review-head {
  display: flex;
  align-items: center;
}

.rv-avatar {
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  background: $surface;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.rv-avatar-char {
  font-size: $fs-cap;
  font-weight: $fw-medium;
  color: $gray7;
}

.review-nick {
  flex: 1;
  margin-left: $gap-sm;
  font-size: $fs-sub;
  font-weight: $fw-medium;
  color: $ink;
}

.review-status {
  height: 36rpx;
  line-height: 36rpx;
  padding: 0 14rpx;
  border-radius: $radius-pill;
  font-size: $fs-tag;
  background: $warning-soft;
  color: $warning;
  flex-shrink: 0;
}

.review-stars {
  display: flex;
  align-items: center;
  margin-top: $gap-sm;
}

.rv-star {
  margin-right: 6rpx;
}

.review-time {
  margin-left: auto;
  font-size: $fs-tag;
  color: $gray4;
}

.review-content {
  display: block;
  margin-top: $gap-sm;
  font-size: $fs-sub;
  color: $gray7;
  line-height: 1.6;
}

/* 推荐历史 */
.history-item {
  background: $surface-sunken;
  border-radius: $radius;
  padding: $gap-sm $gap;
  margin-bottom: $gap-sm;
}

.history-item:last-child {
  margin-bottom: 0;
}

.history-row {
  display: flex;
  align-items: center;
}

.dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: $brand;
  flex-shrink: 0;
}

.history-label {
  flex: 1;
  margin-left: $gap-sm;
  font-size: $fs-sub;
  color: $gray7;
}

.history-time {
  font-size: $fs-tag;
  color: $gray4;
}

.history-summary {
  display: block;
  margin: 6rpx 0 0 24rpx;
  font-size: $fs-cap;
  color: $gray4;
  line-height: 1.6;
}

/* ==================== 退出登录 ==================== */
.logout-row {
  height: $h-btn;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logout-text {
  font-size: $fs-body;
  color: $danger;
}
</style>
