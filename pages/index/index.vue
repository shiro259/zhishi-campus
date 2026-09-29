<template>
  <view class="home">
    <!-- 顶部搜索栏 -->
    <view class="search-bar">
      <view class="search-input" @click="goSearch">
        <text class="search-icon">🔍</text>
        <text class="search-placeholder">搜索菜品、食堂...</text>
      </view>
    </view>

    <!-- AI 推荐入口 -->
    <view class="ai-banner" @click="goRecommend">
      <view class="ai-banner-left">
        <text class="ai-title">🤖 AI 智能推荐</text>
        <text class="ai-desc">不知道吃什么？告诉AI，秒出菜单</text>
      </view>
      <text class="ai-arrow">›</text>
    </view>

    <!-- 食堂快捷入口 -->
    <scroll-view class="canteen-scroll" scroll-x>
      <view class="canteen-item" v-for="c in canteens" :key="c" @click="goDishList(c)">
        <text class="canteen-icon">🏪</text>
        <text class="canteen-name">{{ c }}</text>
      </view>
    </scroll-view>

    <!-- 今日热门 -->
    <view class="section">
      <view class="section-header">
        <text class="section-title">🔥 今日热门</text>
        <text class="section-more" @click="goDishList()">查看更多 ›</text>
      </view>
      <scroll-view class="dish-scroll" scroll-x>
        <view class="dish-card" v-for="d in hotList" :key="d.id" @click="goDetail(d.id)">
          <image class="dish-img" :src="d.image || defaultImg" mode="aspectFill" />
          <view class="dish-info">
            <text class="dish-name">{{ d.name }}</text>
            <view class="dish-meta">
              <text class="dish-rating">⭐ {{ d.rating }}</text>
              <text class="dish-price">¥{{ d.price }}</text>
            </view>
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- 高分红榜 -->
    <view class="section">
      <view class="section-header">
        <text class="section-title">🏆 高分红榜</text>
      </view>
      <view class="rank-list">
        <view class="rank-item" v-for="(d, idx) in goodList" :key="d.id" @click="goDetail(d.id)">
          <text class="rank-num" :class="{ 'top3': idx < 3 }">{{ idx + 1 }}</text>
          <image class="rank-img" :src="d.image || defaultImg" mode="aspectFill" />
          <view class="rank-info">
            <text class="rank-name">{{ d.name }}</text>
            <text class="rank-loc">{{ d.canteen }} · {{ d.window }}</text>
            <view class="rank-tags">
              <text class="tag" v-for="t in d.tags" :key="t">{{ t }}</text>
            </view>
          </view>
          <view class="rank-right">
            <text class="rank-price">¥{{ d.price }}</text>
            <text class="rank-score">{{ d.rating }}分</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 新品尝鲜 -->
    <view class="section" v-if="newList.length">
      <view class="section-header">
        <text class="section-title">✨ 新品尝鲜</text>
      </view>
      <view class="new-grid">
        <view class="new-item" v-for="d in newList" :key="d.id" @click="goDetail(d.id)">
          <image class="new-img" :src="d.image || defaultImg" mode="aspectFill" />
          <view class="new-badge">NEW</view>
          <text class="new-name">{{ d.name }}</text>
          <text class="new-price">¥{{ d.price }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { onPullDownRefresh } from '@dcloudio/uni-app'
import { dishApi } from '@/api/index.js'
import { getUserInfo } from '@/common/utils.js'

const defaultImg = '/static/jian.png'
const hotList = ref([])
const goodList = ref([])
const newList = ref([])
const canteens = ref([])

onMounted(() => {
  loadData()
  // 检查登录
  if (!getUserInfo()) {
    uni.navigateTo({ url: '/pages/login/login' })
  }
})

async function loadData() {
  try {
    const [hot, good, news, canteenList] = await Promise.all([
      dishApi.hotRank(8),
      dishApi.goodRank(10),
      dishApi.newDishes(6),
      dishApi.canteens()
    ])
    hotList.value = hot || []
    goodList.value = good || []
    newList.value = news || []
    canteens.value = canteenList || []
  } catch (e) {
    console.error('加载数据失败', e)
  }
}

onPullDownRefresh(() => {
  loadData().finally(() => uni.stopPullDownRefresh())
})

function goSearch() {
  uni.switchTab({ url: '/pages/dish-list/dish-list' })
}

function goRecommend() {
  uni.switchTab({ url: '/pages/recommend/recommend' })
}

function goDishList(canteen) {
  uni.switchTab({ url: '/pages/dish-list/dish-list' })
}

function goDetail(id) {
  uni.navigateTo({ url: `/pages/dish/dish?id=${id}` })
}
</script>

<style scoped>
.home {
  padding-bottom: 40rpx;
  background: #f5f5f5;
  min-height: 100vh;
}

.search-bar {
  padding: 20rpx 30rpx;
  background: #FF6B35;
}

.search-input {
  height: 72rpx;
  background: #fff;
  border-radius: 36rpx;
  display: flex;
  align-items: center;
  padding: 0 30rpx;
}

.search-icon {
  margin-right: 12rpx;
}

.search-placeholder {
  color: #999;
  font-size: 28rpx;
}

.ai-banner {
  margin: 20rpx 30rpx;
  padding: 30rpx;
  background: linear-gradient(135deg, #667eea, #764ba2);
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ai-title {
  color: #fff;
  font-size: 32rpx;
  font-weight: bold;
  display: block;
}

.ai-desc {
  color: rgba(255, 255, 255, 0.85);
  font-size: 24rpx;
  margin-top: 8rpx;
  display: block;
}

.ai-arrow {
  color: #fff;
  font-size: 48rpx;
}

.canteen-scroll {
  white-space: nowrap;
  padding: 10rpx 30rpx;
}

.canteen-item {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  margin-right: 40rpx;
}

.canteen-icon {
  font-size: 48rpx;
}

.canteen-name {
  font-size: 24rpx;
  color: #333;
  margin-top: 8rpx;
}

.section {
  margin: 30rpx;
  background: #fff;
  border-radius: 20rpx;
  padding: 30rpx;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20rpx;
}

.section-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
}

.section-more {
  font-size: 24rpx;
  color: #FF6B35;
}

.dish-scroll {
  white-space: nowrap;
}

.dish-card {
  display: inline-block;
  width: 220rpx;
  margin-right: 20rpx;
  vertical-align: top;
}

.dish-img {
  width: 220rpx;
  height: 160rpx;
  border-radius: 12rpx;
  background: #f0f0f0;
}

.dish-info {
  margin-top: 10rpx;
}

.dish-name {
  font-size: 26rpx;
  color: #333;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dish-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 6rpx;
}

.dish-rating {
  font-size: 22rpx;
  color: #FF9800;
}

.dish-price {
  font-size: 24rpx;
  color: #FF6B35;
  font-weight: bold;
}

.rank-list {
  display: flex;
  flex-direction: column;
}

.rank-item {
  display: flex;
  align-items: center;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #f0f0f0;
}

.rank-item:last-child {
  border-bottom: none;
}

.rank-num {
  width: 50rpx;
  text-align: center;
  font-size: 32rpx;
  font-weight: bold;
  color: #ccc;
}

.rank-num.top3 {
  color: #FF6B35;
}

.rank-img {
  width: 100rpx;
  height: 100rpx;
  border-radius: 12rpx;
  margin: 0 20rpx;
  background: #f0f0f0;
}

.rank-info {
  flex: 1;
}

.rank-name {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
  display: block;
}

.rank-loc {
  font-size: 22rpx;
  color: #999;
  margin-top: 6rpx;
  display: block;
}

.rank-tags {
  margin-top: 8rpx;
}

.tag {
  display: inline-block;
  font-size: 20rpx;
  color: #FF6B35;
  background: #FFF0EB;
  padding: 2rpx 12rpx;
  border-radius: 8rpx;
  margin-right: 8rpx;
}

.rank-right {
  text-align: right;
}

.rank-price {
  font-size: 28rpx;
  color: #FF6B35;
  font-weight: bold;
  display: block;
}

.rank-score {
  font-size: 22rpx;
  color: #FF9800;
  margin-top: 6rpx;
  display: block;
}

.new-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 20rpx;
}

.new-item {
  width: calc(33.33% - 14rpx);
  position: relative;
}

.new-img {
  width: 100%;
  height: 160rpx;
  border-radius: 12rpx;
  background: #f0f0f0;
}

.new-badge {
  position: absolute;
  top: 8rpx;
  left: 8rpx;
  background: #FF6B35;
  color: #fff;
  font-size: 18rpx;
  padding: 2rpx 10rpx;
  border-radius: 6rpx;
}

.new-name {
  font-size: 24rpx;
  color: #333;
  display: block;
  margin-top: 8rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.new-price {
  font-size: 22rpx;
  color: #FF6B35;
  font-weight: bold;
}
</style>
