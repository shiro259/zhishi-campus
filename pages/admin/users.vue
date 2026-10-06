<template>
  <view class="data-page">
    <!-- 概览 -->
    <view class="ov-grid">
      <view class="ov-card ov-total">
        <text class="ov-num">{{ stats.total }}</text>
        <text class="ov-label">评价总数</text>
      </view>
      <view class="ov-card ov-pending">
        <text class="ov-num">{{ stats.pending }}</text>
        <text class="ov-label">待审核</text>
      </view>
      <view class="ov-card ov-pass">
        <text class="ov-num">{{ stats.passed }}</text>
        <text class="ov-label">已通过</text>
      </view>
      <view class="ov-card ov-reject">
        <text class="ov-num">{{ stats.rejected }}</text>
        <text class="ov-label">已拒绝</text>
      </view>
    </view>

    <!-- 说明 -->
    <view class="tip-card">
      <text class="tip-icon">ℹ️</text>
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
          <text class="avatar">😋</text>
          <view class="head-main">
            <text class="nickname">{{ r.nickname || '匿名同学' }}</text>
            <text class="dish-name">{{ r.dish_name || r.dish_id }}</text>
          </view>
          <text class="status-tag" :class="'status-' + (r.status || 0)">
            {{ statusText(r.status) }}
          </text>
        </view>
        <view class="stars-row">
          <text class="stars">{{ renderStars(r.rating || 0) }}</text>
          <text class="time">{{ formatTime(r.create_date) }}</text>
        </view>
        <text class="content">{{ r.content }}</text>
      </view>

      <view class="empty" v-if="!list.length">
        <text class="empty-emoji">📭</text>
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
import { formatTime, renderStars, ensureAdmin } from '@/common/utils.js'

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

onMounted(async () => {
  // 这一页原来的写法是「先判断本机有没有资料，再判断角色」，
  // 本机没有资料时前半段为 false，整个条件就成了 falsy，于是页面「失效开放」照常渲染。
  // 统一交给 ensureAdmin 判定：它先看本机标记，再向云端验签一次。
  if (!(await ensureAdmin())) return
  load()
})

async function load() {
  loading.value = true
  page.value = 1
  try {
    // 管理端可以读到全部状态的数据，因此这里分别取待审核与公开评价后合并。
    // list 必须带 all:true，否则只回已通过的，已拒绝的评价永远统计不到（恒为 0）。
    const [pending, passed] = await Promise.all([
      reviewApi.pending({ page: 1, pageSize: 100 }),
      reviewApi.list({ page: 1, pageSize: 100, all: true })
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

onPullDownRefresh(() => {
  load().finally(() => uni.stopPullDownRefresh())
})

onReachBottom(() => {
  if (hasMore.value && !loadingMore.value) loadMore()
})
</script>

<style lang="scss" scoped>@import '@/common/tokens.scss';

.data-page {
  padding: 24rpx;
  background: $canvas;
  min-height: 100vh;
  box-sizing: border-box;
}

.ov-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 20rpx;
}

.ov-card {
  width: calc(50% - 10rpx);
  border-radius: 20rpx;
  padding: 32rpx 26rpx;
  box-sizing: border-box;
}

.ov-total { background: linear-gradient(135deg, $brand, $brand-dark); }
.ov-pending { background: linear-gradient(135deg, $brand, $brand); }
.ov-pass { background: linear-gradient(135deg, $success, $success); }
.ov-reject { background: linear-gradient(135deg, $gray6, $gray7); }

.ov-num {
  display: block;
  font-size: 52rpx;
  font-weight: bold;
  color: #fff;
}

.ov-label {
  display: block;
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.85);
  margin-top: 8rpx;
}

.tip-card {
  display: flex;
  align-items: flex-start;
  background: $warning-soft;
  border-radius: 16rpx;
  padding: 20rpx 22rpx;
  margin-top: 24rpx;
}

.tip-icon {
  font-size: 24rpx;
  margin-right: 10rpx;
}

.tip-text {
  flex: 1;
  font-size: 22rpx;
  color: $warning;
  line-height: 1.6;
}

.filter-bar {
  display: flex;
  margin-top: 24rpx;
}

.filter-item {
  padding: 12rpx 30rpx;
  background: #fff;
  border-radius: 30rpx;
  font-size: 25rpx;
  color: $gray7;
  margin-right: 16rpx;
}

.filter-item.active {
  background: $ink;
  color: #fff;
}

.loading {
  text-align: center;
  font-size: 26rpx;
  color: $gray6;
  padding: 80rpx 0;
}

.list {
  margin-top: 24rpx;
}

.item {
  background: #fff;
  border-radius: 20rpx;
  padding: 26rpx;
  margin-bottom: 20rpx;
}

.item-head {
  display: flex;
  align-items: center;
}

.avatar {
  font-size: 44rpx;
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  background: $brand-soft;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 18rpx;
}

.head-main {
  flex: 1;
  min-width: 0;
}

.nickname {
  display: block;
  font-size: 27rpx;
  color: $ink;
  font-weight: 500;
}

.dish-name {
  display: block;
  font-size: 22rpx;
  color: $gray6;
  margin-top: 4rpx;
}

.status-tag {
  font-size: 21rpx;
  padding: 4rpx 14rpx;
  border-radius: 18rpx;
}

.status-0 { background: $warning-soft; color: $warning; }
.status-1 { background: $success-soft; color: $success; }
.status-2 { background: $danger-soft; color: $danger; }

.stars-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16rpx;
}

.stars {
  font-size: 24rpx;
  color: $warning;
}

.time {
  font-size: 21rpx;
  color: $gray4;
}

.content {
  display: block;
  font-size: 25rpx;
  color: $gray7;
  line-height: 1.6;
  margin-top: 12rpx;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 100rpx 0;
}

.empty-emoji {
  font-size: 80rpx;
}

.empty-text {
  margin-top: 18rpx;
  font-size: 26rpx;
  color: $gray6;
}

.load-more {
  text-align: center;
  font-size: 26rpx;
  color: $gray7;
  padding: 26rpx 0;
}
</style>
