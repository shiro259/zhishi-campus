<template>
  <view class="reviews-page">
    <!-- ================= 顶部标题 ================= -->
    <view class="hero">
      <text class="hero-title">📝 评价审核</text>
      <text class="hero-sub">
        通过后评价才会在菜品详情页公开展示 · 共 {{ total }} 条
      </text>
    </view>

    <!-- ================= Tab ================= -->
    <view class="tabs">
      <view
        class="tab"
        :class="{ active: tab === 'pending' }"
        @click="switchTab('pending')"
      >待审核</view>
      <view
        class="tab"
        :class="{ active: tab === 'all' }"
        @click="switchTab('all')"
      >全部</view>
    </view>

    <!-- ================= 加载中 ================= -->
    <view class="state-box" v-if="loading">
      <text class="state-emoji">⏳</text>
      <text class="state-text">评价加载中…</text>
    </view>

    <!-- ================= 加载失败 ================= -->
    <view class="state-box" v-else-if="error">
      <text class="state-emoji">😵</text>
      <text class="state-text">{{ error }}</text>
      <view class="retry-btn" @click="reload">重新加载</view>
    </view>

    <!-- ================= 空态 ================= -->
    <view class="state-box" v-else-if="!list.length">
      <text class="state-emoji">{{ tab === 'pending' ? '🎉' : '📭' }}</text>
      <text class="state-text">
        {{ tab === 'pending' ? '暂无待审核评价，辛苦啦 🎉' : '还没有评价数据' }}
      </text>
    </view>

    <!-- ================= 列表 ================= -->
    <view class="list" v-else>
      <view class="item" v-for="r in list" :key="r._id || r.id">
        <view class="item-head">
          <text class="avatar">{{ r.avatar || '😋' }}</text>
          <view class="head-main">
            <text class="nickname">{{ r.nickname || '匿名同学' }}</text>
            <text class="dish-name">🍽️ {{ r.dish_name || r.dish_id || '未知菜品' }}</text>
          </view>
          <text class="status-tag" :class="'status-' + statusOf(r.status)">
            {{ statusText(r.status) }}
          </text>
        </view>

        <view class="stars-row">
          <text class="stars">{{ renderStars(Number(r.rating || 0)) }}</text>
          <text class="rating-num">{{ Number(r.rating || 0).toFixed(1) }} 分</text>
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
 * 待审核 → reviewApi.pending()；全部 → reviewApi.list()。
 * 审核通过/拒绝 → reviewApi.audit({ id, status })，状态就地更新，不整页重载。
 * 评价状态：0 待审核 / 1 已通过 / 2 已拒绝。
 */
import { ref } from 'vue'
import { onLoad, onReachBottom, onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { reviewApi } from '@/api/index.js'
import { formatTime, renderStars, getUserInfo } from '@/common/utils.js'

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

/* ------------------------------ 数据加载 ------------------------------ */

async function fetchPage(targetPage, append) {
  const token = ++seq
  if (append) loadingMore.value = true
  else loading.value = true
  error.value = ''

  try {
    const params = { page: targetPage, pageSize: PAGE_SIZE[tab.value] }
    const res =
      tab.value === 'pending' ? await reviewApi.pending(params) : await reviewApi.list(params)

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
    toast('操作失败：' + ((e && e.message) || '请检查云端配置'))
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

<style scoped>
.reviews-page {
  padding: 24rpx;
  background: #f5f5f5;
  min-height: 100vh;
  box-sizing: border-box;
}

/* ---------------- 顶部 ---------------- */
.hero {
  background: linear-gradient(135deg, #333333, #4d4d4d);
  border-radius: 24rpx;
  padding: 30rpx;
  margin-bottom: 20rpx;
}

.hero-title {
  display: block;
  font-size: 36rpx;
  font-weight: bold;
  color: #fff;
}

.hero-sub {
  display: block;
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.65);
  margin-top: 8rpx;
}

/* ---------------- Tabs ---------------- */
.tabs {
  display: flex;
  margin-bottom: 20rpx;
}

.tab {
  padding: 14rpx 44rpx;
  background: #fff;
  border-radius: 34rpx;
  font-size: 26rpx;
  color: #666;
  margin-right: 16rpx;
}

.tab.active {
  background: #ff6b35;
  color: #fff;
  font-weight: 500;
}

/* ---------------- 状态 ---------------- */
.state-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 140rpx 40rpx;
  background: #fff;
  border-radius: 24rpx;
}

.state-emoji {
  font-size: 76rpx;
}

.state-text {
  font-size: 26rpx;
  color: #999;
  margin-top: 18rpx;
  text-align: center;
  line-height: 1.6;
}

.retry-btn {
  margin-top: 30rpx;
  padding: 16rpx 48rpx;
  background: #ff6b35;
  color: #fff;
  border-radius: 40rpx;
  font-size: 26rpx;
}

/* ---------------- 列表 ---------------- */
.list {
  display: flex;
  flex-direction: column;
}

.item {
  background: #fff;
  border-radius: 22rpx;
  padding: 26rpx 24rpx;
  margin-bottom: 18rpx;
}

.item-head {
  display: flex;
  align-items: center;
}

.avatar {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #fff3ed, #ffe4d6);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 38rpx;
  margin-right: 18rpx;
  flex-shrink: 0;
}

.head-main {
  flex: 1;
  min-width: 0;
}

.nickname {
  display: block;
  font-size: 27rpx;
  color: #333;
  font-weight: 500;
}

.dish-name {
  display: block;
  font-size: 21rpx;
  color: #999;
  margin-top: 6rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-tag {
  font-size: 20rpx;
  padding: 4rpx 14rpx;
  border-radius: 18rpx;
  flex-shrink: 0;
}

.status-0 {
  background: #fff3e0;
  color: #e6871a;
}

.status-1 {
  background: #e8f8f0;
  color: #2ba58c;
}

.status-2 {
  background: #fdecec;
  color: #e64340;
}

.stars-row {
  display: flex;
  align-items: center;
  margin-top: 16rpx;
}

.stars {
  font-size: 25rpx;
  color: #ff9800;
}

.rating-num {
  font-size: 21rpx;
  color: #ff9800;
  margin-left: 10rpx;
}

.time {
  flex: 1;
  text-align: right;
  font-size: 21rpx;
  color: #bbb;
}

.content {
  display: block;
  font-size: 26rpx;
  color: #555;
  line-height: 1.7;
  margin-top: 14rpx;
}

/* ---------------- 审核按钮 ---------------- */
.actions {
  display: flex;
  margin-top: 20rpx;
}

.act-btn {
  flex: 1;
  text-align: center;
  padding: 18rpx 0;
  border-radius: 16rpx;
  font-size: 27rpx;
  font-weight: 500;
}

.act-btn.pass {
  background: #e8f8f0;
  color: #2ba58c;
  margin-right: 16rpx;
}

.act-btn.reject {
  background: #fdecec;
  color: #e64340;
}

/* ---------------- 加载更多 ---------------- */
.load-tip {
  text-align: center;
  font-size: 24rpx;
  color: #999;
  padding: 24rpx 0;
}

.load-tip.no-more {
  color: #ccc;
}
</style>
