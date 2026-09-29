<template>
  <view class="dashboard">
    <!-- 数据概览卡片 -->
    <view class="overview-cards">
      <view class="card">
        <text class="card-num">{{ overview.user_count }}</text>
        <text class="card-label">用户总数</text>
      </view>
      <view class="card">
        <text class="card-num">{{ overview.dish_count }}</text>
        <text class="card-label">在售菜品</text>
      </view>
      <view class="card">
        <text class="card-num">{{ overview.review_count }}</text>
        <text class="card-label">评价总数</text>
      </view>
      <view class="card warn">
        <text class="card-num">{{ overview.pending_review_count }}</text>
        <text class="card-label">待审核评价</text>
      </view>
    </view>

    <!-- 高频推荐菜品 -->
    <view class="section">
      <text class="section-title">📈 高频推荐菜品 TOP10</text>
      <view class="rank-list">
        <view class="rank-row" v-for="(d, idx) in topDishes" :key="d.name">
          <text class="rank-idx" :class="{ top: idx < 3 }">{{ idx + 1 }}</text>
          <text class="rank-name">{{ d.name }}</text>
          <text class="rank-canteen">{{ d.canteen }}</text>
          <view class="rank-bars">
            <view class="bar" :style="{ width: barWidth(d.recommend_count) + '%' }"></view>
          </view>
          <text class="rank-count">{{ d.recommend_count }}次</text>
        </view>
      </view>
    </view>

    <!-- 食堂菜品分布 -->
    <view class="section">
      <text class="section-title">🏪 各食堂菜品数量</text>
      <view class="stat-list">
        <view class="stat-row" v-for="c in canteenStats" :key="c.canteen">
          <text class="stat-name">{{ c.canteen }}</text>
          <view class="stat-bar-wrap">
            <view class="stat-bar" :style="{ width: (c.count / maxCount * 100) + '%' }"></view>
          </view>
          <text class="stat-count">{{ c.count }}道</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { statsApi } from '@/api/index.js'

const overview = ref({ user_count: 0, dish_count: 0, review_count: 0, pending_review_count: 0 })
const topDishes = ref([])
const canteenStats = ref([])

const maxCount = computed(() => Math.max(...canteenStats.value.map(c => c.count), 1))
const maxRec = computed(() => Math.max(...topDishes.value.map(d => d.recommend_count), 1))

function barWidth(count) {
  return (count / maxRec.value) * 100
}

onMounted(async () => {
  try {
    const [ov, top, cs] = await Promise.all([
      statsApi.overview(),
      statsApi.topDishes(10),
      statsApi.canteenStats()
    ])
    overview.value = ov
    topDishes.value = top || []
    canteenStats.value = cs || []
  } catch (e) {}
})
</script>

<style scoped>
.dashboard {
  padding: 24rpx;
  background: #f5f5f5;
  min-height: 100vh;
}

.overview-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  margin-bottom: 30rpx;
}

.card {
  width: calc(50% - 8rpx);
  background: #fff;
  border-radius: 16rpx;
  padding: 30rpx;
  box-sizing: border-box;
}

.card-num {
  font-size: 44rpx;
  font-weight: bold;
  color: #333;
  display: block;
}

.card.warn .card-num {
  color: #ff4d4f;
}

.card-label {
  font-size: 24rpx;
  color: #999;
  margin-top: 8rpx;
  display: block;
}

.section {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.section-title {
  font-size: 30rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 20rpx;
  display: block;
}

.rank-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.rank-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.rank-idx {
  width: 40rpx;
  text-align: center;
  font-size: 26rpx;
  color: #999;
  font-weight: bold;
}

.rank-idx.top {
  color: #FF6B35;
}

.rank-name {
  width: 140rpx;
  font-size: 24rpx;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rank-canteen {
  width: 120rpx;
  font-size: 20rpx;
  color: #999;
}

.rank-bars {
  flex: 1;
  height: 16rpx;
  background: #f0f0f0;
  border-radius: 8rpx;
  overflow: hidden;
}

.bar {
  height: 100%;
  background: linear-gradient(90deg, #FF6B35, #FF8C5A);
  border-radius: 8rpx;
}

.rank-count {
  width: 80rpx;
  text-align: right;
  font-size: 22rpx;
  color: #FF6B35;
  font-weight: bold;
}

.stat-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.stat-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.stat-name {
  width: 140rpx;
  font-size: 24rpx;
  color: #333;
}

.stat-bar-wrap {
  flex: 1;
  height: 20rpx;
  background: #f0f0f0;
  border-radius: 10rpx;
  overflow: hidden;
}

.stat-bar {
  height: 100%;
  background: linear-gradient(90deg, #667eea, #764ba2);
  border-radius: 10rpx;
}

.stat-count {
  width: 80rpx;
  text-align: right;
  font-size: 22rpx;
  color: #666;
}
</style>
