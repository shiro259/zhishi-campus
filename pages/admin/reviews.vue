<template>
  <view class="reviews-page">
    <!-- ================= 顶部标题 ================= -->
    <view class="hero">
      <text class="hero-title">评价审核</text>
      <text class="hero-sub">
        通过后才会在菜品详情页公开展示 · 共 {{ total }} 条
      </text>
    </view>

    <!-- ================= Tab ================= -->
    <view class="tabs">
      <view
        class="tab"
        :class="{ active: tab === 'pending' }"
        @click="switchTab('pending')"
      >
        <text class="tab-text">待审核</text>
      </view>
      <view
        class="tab"
        :class="{ active: tab === 'all' }"
        @click="switchTab('all')"
      >
        <text class="tab-text">全部</text>
      </view>
    </view>

    <!-- ================= 加载中 ================= -->
    <view class="state-box" v-if="loading">
      <Icon name="clock" :size="72" />
      <text class="state-text">评价加载中…</text>
    </view>

    <!-- ================= 加载失败 ================= -->
    <view class="state-box" v-else-if="error">
      <Icon name="warning" :size="72" />
      <text class="state-text">{{ error }}</text>
      <!-- 口令错误是最常见原因：直接引导去 AI 配置页填写，不要让管理员对着空列表无从下手 -->
      <view class="retry-btn primary" v-if="authError" @click="goConfig">
        去填写管理口令
      </view>
      <view class="retry-btn" @click="reload">重新加载</view>
    </view>

    <!-- ================= 空态 ================= -->
    <view class="state-box" v-else-if="!list.length">
      <Icon name="check" :size="72" />
      <text class="state-text">
        {{ tab === 'pending' ? '暂无待审核评价，辛苦啦' : '还没有评价数据' }}
      </text>
    </view>

    <!-- ================= 列表 ================= -->
    <view class="list" v-else>
      <view class="item" v-for="r in list" :key="r._id || r.id">
        <view class="item-head">
          <text class="avatar">{{ avatarText(r.nickname) }}</text>
          <view class="head-main">
            <text class="nickname">{{ r.nickname || '匿名同学' }}</text>
            <text class="dish-name">{{ r.dish_name || r.dish_id || '未知菜品' }}</text>
          </view>
          <text class="status-tag" :class="'status-' + statusOf(r.status)">
            {{ statusText(r.status) }}
          </text>
        </view>

        <view class="stars-row">
          <view class="stars">
            <view
              class="star"
              v-for="n in 5"
              :key="n"
              :class="{ on: n <= starCount(r.rating) }"
            >
              <Icon name="star" :size="28" />
            </view>
          </view>
          <text class="score">{{ Number(r.rating || 0).toFixed(1) }} 分</text>
          <text class="time">{{ formatTime(r.create_date) }}</text>
        </view>

        <text class="content">{{ r.content || '（该同学没有填写文字评价）' }}</text>

        <view class="actions" v-if="statusOf(r.status) === 0">
          <view class="act-btn pass" @click="audit(r, 1)">通过</view>
          <view class="act-btn reject" @click="audit(r, 2)">拒绝</view>
        </view>
      </view>

      <view class="load-tip" v-if="loadingMore">加载中…</view>
      <view class="load-tip" v-else-if="hasMore" @click="loadMore">上拉或点击加载更多</view>
      <view class="load-tip no-more" v-else>没有更多了</view>
    </view>
  </view>
</template>

<script setup>
/**
 * 评价审核
 *
 * 待审核 → reviewApi.pending()；全部 → reviewApi.all()（含所有审核状态）。
 * 审核通过/拒绝 → reviewApi.audit({ id, status })，状态就地更新，不整页重载。
 * 评价状态：0 待审核 / 1 已通过 / 2 已拒绝。
 */
import { ref, computed } from 'vue'
import { onLoad, onReachBottom, onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { reviewApi } from '@/api/index.js'
import { formatTime, getUserInfo } from '@/common/utils.js'

/** 待审核一页 20 条；「全部」按需求一次取 50 条 */
const PAGE_SIZE = { pending: 20, all: 50 }

const tab = ref('pending')
const list = ref([])
const total = ref(0)
const page = ref(1)
const hasMore = ref(false)
const loading = ref(false)
const loadingMore = ref(false)
const error = ref('')

let denied = false
let inited = false
let seq = 0 // 防止切换 tab 时旧请求覆盖新数据

function toast(title) {
  uni.showToast({ title, icon: 'none' })
}

/** 是否为管理口令错误（用于展示「去填写口令」入口） */
const authError = computed(() => error.value.indexOf('口令') >= 0)

function goConfig() {
  uni.navigateTo({ url: '/pages/admin/ai-config' })
}

/* ------------------------------ 展示辅助 ------------------------------ */

function statusOf(status) {
  const s = Number(status)
  return s === 1 || s === 2 ? s : 0
}

function statusText(status) {
  const s = statusOf(status)
  if (s === 1) return '已通过'
  if (s === 2) return '已拒绝'
  return '待审核'
}

/** 星级：四舍五入取整，用于决定点亮几颗星 */
function starCount(rating) {
  const n = Math.round(Number(rating) || 0)
  if (n < 0) return 0
  return n > 5 ? 5 : n
}

/** 头像用昵称首字，避免用 emoji 充当界面元素 */
function avatarText(nickname) {
  const name = String(nickname || '').trim()
  return name ? name.slice(0, 1) : '匿'
}

/* ------------------------------ 数据加载 ------------------------------ */

async function fetchPage(targetPage, append) {
  const token = ++seq
  if (append) loadingMore.value = true
  else loading.value = true
  error.value = ''

  try {
    const params = { page: targetPage, pageSize: PAGE_SIZE[tab.value] }
    // pending 只看待审核；all 看全部状态（管理接口，需口令），不能用公开的 list（只含已通过）
    const res =
      tab.value === 'pending' ? await reviewApi.pending(params) : await reviewApi.all(params)

    // 请求期间用户切了 tab，丢弃这次结果
    if (token !== seq) return

    const rows = (res && res.list) || []
    list.value = append ? [...list.value, ...rows] : rows
    total.value = Number((res && res.total) || list.value.length)
    page.value = targetPage
    hasMore.value =
      typeof res.hasMore === 'boolean' ? res.hasMore : list.value.length < total.value
  } catch (e) {
    if (token !== seq) return
    const msg = (e && e.message) || '评价加载失败'
    if (append) {
      toast('加载更多失败：' + msg)
    } else {
      error.value = msg
      list.value = []
      toast('评价加载失败')
    }
  } finally {
    if (token === seq) {
      loading.value = false
      loadingMore.value = false
    }
  }
}

async function reload() {
  if (denied) return
  await fetchPage(1, false)
}

function loadMore() {
  if (denied || loading.value || loadingMore.value || !hasMore.value) return
  fetchPage(page.value + 1, true)
}

function switchTab(next) {
  if (tab.value === next) return
  tab.value = next
  list.value = []
  hasMore.value = false
  fetchPage(1, false)
}

/* ------------------------------ 审核 ------------------------------ */

/** 就地更新状态，避免整页重载导致滚动位置丢失 */
async function audit(r, status) {
  const id = r._id || r.id
  if (!id) {
    toast('该评价缺少 id，无法操作')
    return
  }
  try {
    await reviewApi.audit({ id, status })
    r.status = status
    uni.showToast({ title: status === 1 ? '已通过' : '已拒绝', icon: 'success' })
  } catch (e) {
    const msg = (e && e.message) || '请检查云端配置'
    if (msg.indexOf('口令') >= 0) {
      // 口令不对时列表接口通常也已失败并停在错误页；兜底再弹一次引导
      uni.showModal({
        title: '管理口令校验失败',
        content: '请在「AI 配置」页填写正确的管理口令后再审核',
        confirmText: '去填写',
        success: (res) => {
          if (res.confirm) goConfig()
        }
      })
    } else {
      toast('操作失败：' + msg)
    }
  }
}

/* ------------------------------ 生命周期 ------------------------------ */

onLoad(() => {
  const user = getUserInfo()
  if (!user || user.role !== 'admin') {
    denied = true
    uni.showToast({ title: '仅管理员可审核评价', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 1200)
    return
  }
  fetchPage(1, false)
})

onShow(() => {
  // 首次 onShow 紧跟 onLoad，跳过；之后（例如从详情页返回）自动刷新
  if (!inited) {
    inited = true
    return
  }
  if (!denied) fetchPage(1, false)
})

onReachBottom(() => {
  loadMore()
})

onPullDownRefresh(() => {
  const done = () => uni.stopPullDownRefresh()
  if (denied) {
    done()
    return
  }
  fetchPage(1, false).then(done).catch(done)
})
</script>

<style lang="scss" scoped>
@import '@/common/tokens.scss';
.reviews-page {
  min-height: 100vh;
  background: $canvas;
  padding: $gap-page;
  box-sizing: border-box;
}

/* ---------------- 顶部 ---------------- */
.hero {
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
  padding: $gap-card;
  box-shadow: $shadow-card;
}

.hero-title {
  display: block;
  font-size: $fs-title;
  font-weight: $fw-bold;
  color: $ink;
}

.hero-sub {
  display: block;
  margin-top: $gap-sm;
  font-size: $fs-cap;
  color: $gray6;
  line-height: 1.6;
}

/* ---------------- Tabs ---------------- */
.tabs {
  display: flex;
  margin-top: $gap;
  border-bottom: 2rpx solid $line;
}

.tab {
  position: relative;
  padding: 0 8rpx 20rpx;
  margin-right: 48rpx;
}

.tab-text {
  font-size: $fs-body;
  color: $gray6;
}

.tab.active .tab-text {
  color: $ink;
  font-weight: $fw-bold;
}

.tab.active::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -2rpx;
  width: 48rpx;
  height: 4rpx;
  margin-left: -24rpx;
  background: $brand;
  border-radius: $radius-pill;
}

/* ---------------- 状态 ---------------- */
.state-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: $gap;
  padding: 120rpx $gap-page;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
  box-shadow: $shadow-card;
  color: $gray4;
}

.state-text {
  margin-top: $gap;
  font-size: $fs-sub;
  color: $gray6;
  text-align: center;
  line-height: 1.6;
}

.retry-btn {
  margin-top: $gap-lg;
  height: $h-btn-sm;
  line-height: $h-btn-sm;
  padding: 0 48rpx;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-pill;
  font-size: $fs-sub;
  color: $gray7;
}

.retry-btn.primary {
  color: #fff;
  background: $brand;
  border-color: $brand;
  box-shadow: $shadow-brand;
}

/* ---------------- 列表 ---------------- */
.list {
  display: flex;
  flex-direction: column;
  margin-top: $gap;
}

.item {
  margin-bottom: $gap-sm;
  padding: $gap-card;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
  box-shadow: $shadow-card;
}

.item-head {
  display: flex;
  align-items: center;
}

.avatar {
  width: 64rpx;
  height: 64rpx;
  line-height: 64rpx;
  margin-right: $gap-sm;
  flex-shrink: 0;
  text-align: center;
  background: $surface-sunken;
  border-radius: 50%;
  font-size: $fs-body;
  font-weight: $fw-medium;
  color: $gray7;
}

.head-main {
  flex: 1;
  min-width: 0;
}

.nickname {
  display: block;
  font-size: $fs-body;
  font-weight: $fw-medium;
  color: $ink;
}

.dish-name {
  display: block;
  margin-top: 4rpx;
  font-size: $fs-cap;
  color: $gray6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-tag {
  height: 44rpx;
  line-height: 44rpx;
  padding: 0 18rpx;
  border-radius: $radius-pill;
  font-size: $fs-tag;
  flex-shrink: 0;
}

.status-0 {
  background: $warning-soft;
  color: $warning;
}

.status-1 {
  background: $success-soft;
  color: $success;
}

.status-2 {
  background: $danger-soft;
  color: $danger;
}

/* ---------------- 星级 ---------------- */
.stars-row {
  display: flex;
  align-items: center;
  margin-top: $gap;
}

.stars {
  display: flex;
  align-items: center;
}

.star {
  margin-right: 6rpx;
  color: $gray4;
}

.star.on {
  color: $brand;
}

.score {
  margin-left: $gap-sm;
  font-size: $fs-cap;
  color: $gray7;
}

.time {
  flex: 1;
  text-align: right;
  font-size: $fs-cap;
  color: $gray6;
}

.content {
  display: block;
  margin-top: $gap-sm;
  font-size: $fs-sub;
  color: $gray7;
  line-height: 1.7;
}

/* ---------------- 审核按钮 ---------------- */
.actions {
  display: flex;
  align-items: center;
  margin-top: $gap;
}

.act-btn {
  flex: 1;
  height: $h-btn-sm;
  line-height: $h-btn-sm;
  text-align: center;
  border-radius: $radius-pill;
  font-size: $fs-body;
  font-weight: $fw-medium;
}

.act-btn.pass {
  margin-right: $gap-sm;
  color: #fff;
  background: $brand;
  box-shadow: $shadow-brand;
}

.act-btn.reject {
  color: $danger;
  background: $surface;
  border: 2rpx solid $line;
}

/* ---------------- 加载更多 ---------------- */
.load-tip {
  padding: 24rpx 0;
  text-align: center;
  font-size: $fs-cap;
  color: $gray6;
}

.load-tip.no-more {
  color: $gray4;
}
</style>
