<template>
  <view class="data-page">
    <!-- 概览 -->
    <view class="ov-grid">
      <view class="ov-card">
        <text class="ov-label">评价总数</text>
        <view class="ov-value">
          <view class="ov-dot dot-brand"></view>
          <text class="ov-num">{{ stats.total }}</text>
        </view>
      </view>
      <view class="ov-card">
        <text class="ov-label">待审核</text>
        <view class="ov-value">
          <view class="ov-dot dot-warning"></view>
          <text class="ov-num">{{ stats.pending }}</text>
        </view>
      </view>
      <view class="ov-card">
        <text class="ov-label">已通过</text>
        <view class="ov-value">
          <view class="ov-dot dot-success"></view>
          <text class="ov-num">{{ stats.passed }}</text>
        </view>
      </view>
      <view class="ov-card">
        <text class="ov-label">已拒绝</text>
        <view class="ov-value">
          <view class="ov-dot dot-danger"></view>
          <text class="ov-num">{{ stats.rejected }}</text>
        </view>
      </view>
    </view>

    <!-- 说明 -->
    <view class="tip-card">
      <Icon name="info" :size="32" />
      <text class="tip-text">
        同学身份保存在各自手机本地，后台不集中存储用户账号。此处汇总全部菜品评价数据，
        用于审核与运营分析；评价通过审核后才会在菜品详情页公开展示。
      </text>
    </view>

    <!-- 筛选 -->
    <view class="filter-bar">
      <view
        class="filter-item"
        v-for="f in filters"
        :key="f.value"
        :class="{ active: status === f.value }"
        @click="switchStatus(f.value)"
      >{{ f.label }}</view>
    </view>

    <!-- 列表 -->
    <view class="loading" v-if="loading">加载中…</view>

    <view class="list" v-else>
      <view class="item" v-for="r in list" :key="r._id">
        <view class="item-head">
          <text class="avatar">{{ avatarText(r.nickname) }}</text>
          <view class="head-main">
            <text class="nickname">{{ r.nickname || '匿名同学' }}</text>
            <text class="dish-name">{{ r.dish_name || r.dish_id }}</text>
          </view>
          <text class="status-tag" :class="'status-' + (r.status || 0)">
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
          <text class="time">{{ formatTime(r.create_date) }}</text>
        </view>

        <text class="content">{{ r.content }}</text>
      </view>

      <view class="empty" v-if="!list.length">
        <Icon name="info" :size="72" />
        <text class="empty-text">当前筛选下还没有评价数据</text>
      </view>

      <view class="load-more" v-if="hasMore && list.length" @click="loadMore">
        {{ loadingMore ? '加载中…' : '加载更多' }}
      </view>
    </view>
  </view>
</template>

<script setup>
/**
 * 评价数据管理页
 *
 * 原设计为「后端用户管理」，迁移到 uniCloud 架构后不再集中存储用户账号，
 * 因此改为汇总展示评价数据（含各审核状态分布），供管理端审核与运营分析。
 */
import { ref, onMounted } from 'vue'
import { onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app'
import { reviewApi } from '@/api/index.js'
import { formatTime, getUserInfo } from '@/common/utils.js'

const filters = [
  { label: '全部', value: '' },
  { label: '待审核', value: 0 },
  { label: '已通过', value: 1 },
  { label: '已拒绝', value: 2 }
]

const loading = ref(false)
const loadingMore = ref(false)
const list = ref([])
const page = ref(1)
const hasMore = ref(false)
const status = ref('')
const stats = ref({ total: 0, pending: 0, passed: 0, rejected: 0 })
/** 一次拉全量后缓存在内存，切换筛选无需重新请求 */
const cached = ref([])

onMounted(() => {
  if (getUserInfo() && getUserInfo().role !== 'admin') {
    uni.showToast({ title: '需要管理员权限', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 1200)
    return
  }
  load()
})

async function load() {
  loading.value = true
  page.value = 1
  try {
    // 管理端可以读到全部状态的数据，因此这里分别取待审核与公开评价后合并
    const [pending, passed] = await Promise.all([
      reviewApi.pending({ page: 1, pageSize: 100 }),
      reviewApi.list({ page: 1, pageSize: 100 })
    ])
    const all = [...(pending.list || []), ...(passed.list || [])]
    // 去重（pending 里可能也包含在公开结果中的记录）
    const seen = {}
    const merged = all.filter((r) => {
      const key = r._id
      if (seen[key]) return false
      seen[key] = 1
      return true
    })
    merged.sort((a, b) => (b.create_date || 0) - (a.create_date || 0))

    stats.value = buildStats(merged)
    applyFilter(merged)
  } catch (e) {
    uni.showToast({ title: '评价数据加载失败', icon: 'none' })
    list.value = []
  } finally {
    loading.value = false
  }
}

/** 用全量数据算出四类统计 */
function buildStats(all) {
  return {
    total: all.length,
    pending: all.filter((r) => (r.status || 0) === 0).length,
    passed: all.filter((r) => r.status === 1).length,
    rejected: all.filter((r) => r.status === 2).length
  }
}

/** 按当前筛选条件切分（数据量不大，纯前端过滤足够） */
function applyFilter(all) {
  // 不传参数时沿用上次的全量数据（切换筛选条件时调用）
  const src = all || cached.value
  cached.value = src
  const filtered = status.value === '' ? src : src.filter((r) => (r.status || 0) === status.value)
  list.value = filtered
  hasMore.value = false
}

function switchStatus(v) {
  status.value = v
  applyFilter()
}

function loadMore() {
  // 数据已一次性拉取，这里只在筛选结果里分批展示，避免重复请求
  loadingMore.value = true
  setTimeout(() => {
    list.value = cached.value
    hasMore.value = false
    loadingMore.value = false
  }, 300)
}

function statusText(s) {
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

onPullDownRefresh(() => {
  load().finally(() => uni.stopPullDownRefresh())
})

onReachBottom(() => {
  if (hasMore.value && !loadingMore.value) loadMore()
})
</script>

<style lang="scss" scoped>
@import '@/common/tokens.scss';
.data-page {
  min-height: 100vh;
  background: $canvas;
  padding: $gap-page;
  box-sizing: border-box;
}

/* ---------------- 概览 ---------------- */
.ov-grid {
  display: flex;
  flex-wrap: wrap;
  gap: $gap;
}

.ov-card {
  width: calc(50% - 10rpx);
  box-sizing: border-box;
  padding: $gap-card;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
  box-shadow: $shadow-card;
}

.ov-label {
  display: block;
  font-size: $fs-cap;
  color: $gray6;
}

.ov-value {
  display: flex;
  align-items: center;
  margin-top: $gap-sm;
}

.ov-dot {
  width: 8rpx;
  height: 8rpx;
  margin-right: $gap-sm;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot-brand {
  background: $brand;
}

.dot-warning {
  background: $warning;
}

.dot-success {
  background: $success;
}

.dot-danger {
  background: $danger;
}

.ov-num {
  font-size: $fs-display;
  font-weight: $fw-bold;
  color: $ink;
  line-height: 1.1;
}

/* ---------------- 说明 ---------------- */
.tip-card {
  display: flex;
  align-items: flex-start;
  margin-top: $gap;
  padding: 20rpx $gap-card;
  background: $warning-soft;
  border-radius: $radius;
  color: $warning;
}

.tip-text {
  flex: 1;
  margin-left: $gap-sm;
  font-size: $fs-cap;
  color: $warning;
  line-height: 1.7;
}

/* ---------------- 筛选 ---------------- */
.filter-bar {
  display: flex;
  align-items: center;
  margin-top: $gap;
}

.filter-item {
  height: $h-btn-sm;
  line-height: $h-btn-sm;
  padding: 0 32rpx;
  margin-right: $gap-sm;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-pill;
  font-size: $fs-sub;
  color: $gray7;
}

.filter-item.active {
  background: $ink;
  border-color: $ink;
  color: #fff;
  font-weight: $fw-medium;
}

/* ---------------- 列表 ---------------- */
.loading {
  padding: 80rpx 0;
  text-align: center;
  font-size: $fs-sub;
  color: $gray6;
}

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

/* ---------------- 空态 / 加载更多 ---------------- */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 100rpx 0;
  color: $gray4;
}

.empty-text {
  margin-top: $gap;
  font-size: $fs-sub;
  color: $gray6;
}

.load-more {
  padding: 26rpx 0;
  text-align: center;
  font-size: $fs-sub;
  color: $gray6;
}
</style>
