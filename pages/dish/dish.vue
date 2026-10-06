<template>
  <view class="dish-page">
    <!-- 加载中 -->
    <view class="state-box" v-if="loading">
      <text class="state-icon">⏳</text>
      <text class="state-text">加载中...</text>
    </view>

    <!-- 加载失败 / 菜品不存在 -->
    <view class="state-box" v-else-if="error">
      <text class="state-icon">😵</text>
      <text class="state-text">{{ error }}</text>
      <view class="state-btn" @click="goRecommend">回到推荐</view>
    </view>

    <!-- 菜品内容 -->
    <template v-else-if="dish">
      <!-- 菜品大图（无图时自动回退为 emoji 展示） -->
      <view class="hero">
        <DishImage :dish="dish" :size="340" :radius="32" />
      </view>

      <!-- 基本信息 -->
      <view class="info-card">
        <view class="name-row">
          <text class="dish-name">{{ dish.name }}</text>
          <text class="dish-price">{{ money(dish.price) }}</text>
        </view>

        <view class="meta-row">
          <text class="rating">⭐ {{ ratingText(dish.rating) }} 分</text>
          <text class="divider">|</text>
          <text class="loc">📍 {{ formatLocation(dish) || '位置待完善' }}</text>
        </view>

        <view class="tag-row" v-if="dish.tags && dish.tags.length">
          <text class="tag" v-for="(t, i) in dish.tags" :key="i">{{ t }}</text>
        </view>
        <view class="tag-row" v-else>
          <text class="tag-empty">暂无口味标签</text>
        </view>

        <!-- 数据统计 -->
        <view class="stats-row">
          <view class="stat-item">
            <text class="stat-num">{{ count(dish.recommend_count) }}</text>
            <text class="stat-label">推荐次数</text>
          </view>
          <view class="stat-item">
            <text class="stat-num">{{ count(dish.review_count) }}</text>
            <text class="stat-label">评价数</text>
          </view>
        </view>
      </view>

      <!-- 菜品描述 -->
      <view class="section">
        <view class="section-title">
          <text>菜品介绍</text>
        </view>
        <text class="desc" v-if="dish.description">{{ dish.description }}</text>
        <text class="desc empty-text" v-else>这道菜还没有介绍，欢迎你去尝鲜后补充评价～</text>
      </view>

      <!-- 评价列表 -->
      <view class="section">
        <view class="section-title">
          <text>真实评价 ({{ reviewTotal }})</text>
        </view>

        <view class="review-item" v-for="r in reviews" :key="r.id">
          <view class="review-header">
            <view class="avatar">
              <text class="avatar-text">{{ avatarText(r) }}</text>
            </view>
            <view class="review-user">
              <text class="nickname">{{ nickname(r) }}</text>
              <view class="stars">
                <text v-for="n in 5" :key="n" :class="{ on: n <= Number(r.rating || 0) }">★</text>
              </view>
            </view>
            <text class="review-time">{{ reviewTime(r) }}</text>
          </view>
          <text class="review-content" v-if="r.content">{{ r.content }}</text>
        </view>

        <view class="review-state" v-if="reviewLoading">
          <text>评价加载中...</text>
        </view>

        <view class="review-empty" v-else-if="!reviews.length">
          <text class="review-empty-icon">🍽️</text>
          <text>还没有评价，快来抢沙发吧~</text>
        </view>

        <view class="more-btn" v-if="reviewHasMore && !reviewLoading" @click="loadMoreReviews">
          <text>查看更多评价</text>
        </view>
        <view class="review-end" v-else-if="reviews.length && !reviewLoading">
          <text>—— 已经到底啦 ——</text>
        </view>
      </view>
    </template>

    <!-- 底部按钮区 -->
    <view class="action-bar" v-if="dish && !loading && !error">
      <view class="btn-ghost" @click="goRecommend">
        <text>回到推荐</text>
      </view>
      <view class="btn-primary" @click="goReview">
        <text>✍️ 写评价</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { dishApi, reviewApi } from '@/api/index.js'
import { formatTime, formatLocation } from '@/common/utils.js'
import DishImage from '@/components/DishImage/DishImage.vue'

const REVIEW_PAGE_SIZE = 5

const dishId = ref('')
const dish = ref(null)
const loading = ref(true)
const error = ref('')

const reviews = ref([])
const reviewTotal = ref(0)
const reviewPage = ref(1)
const reviewHasMore = ref(false)
const reviewLoading = ref(false)

onLoad((options) => {
  const opt = options || {}
  dishId.value = opt.id || opt.dish_id || ''
  if (!dishId.value) {
    loading.value = false
    error.value = '菜品不存在或已被移除'
    return
  }
  loadDish()
})

async function loadDish() {
  loading.value = true
  error.value = ''
  try {
    const data = await dishApi.detail(dishId.value)
    if (!data || (!data.id && !data.name)) {
      dish.value = null
      error.value = '菜品不存在或已下架'
      return
    }
    dish.value = data
    await loadReviews(true)
  } catch (e) {
    dish.value = null
    error.value = '菜品不存在或加载失败，请稍后重试'
    uni.showToast({ title: '菜品加载失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

async function loadReviews(reset = false) {
  if (!dishId.value || reviewLoading.value) return
  if (!reset && !reviewHasMore.value) return

  const targetPage = reset ? 1 : reviewPage.value
  reviewLoading.value = true

  try {
    const res = await reviewApi.list({
      dish_id: dishId.value,
      page: targetPage,
      pageSize: REVIEW_PAGE_SIZE
    })
    const rows = Array.isArray(res) ? res : ((res && res.list) || [])
    reviews.value = reset ? rows : [...reviews.value, ...rows]

    if (res && typeof res.total === 'number') {
      reviewTotal.value = res.total
    } else if (reset) {
      reviewTotal.value = rows.length
    }

    reviewHasMore.value = res && typeof res.hasMore === 'boolean' ? res.hasMore : rows.length >= REVIEW_PAGE_SIZE
    reviewPage.value = targetPage + 1
  } catch (e) {
    uni.showToast({ title: '评价加载失败', icon: 'none' })
  } finally {
    reviewLoading.value = false
  }
}

function loadMoreReviews() {
  loadReviews(false)
}

function goReview() {
  if (!dish.value) return
  const name = encodeURIComponent(dish.value.name || '')
  uni.navigateTo({ url: `/pages/review/review?dish_id=${dish.value.id}&dish_name=${name}` })
}

function goRecommend() {
  uni.switchTab({ url: '/pages/recommend/recommend' })
}

/* ===== 展示辅助 ===== */
function nickname(r) {
  return r.user_nickname || r.nickname || r.user_name || '匿名同学'
}

function avatarText(r) {
  const name = nickname(r)
  return name ? name.slice(0, 1) : '同'
}

function reviewTime(r) {
  return formatTime(r.created_at || r.create_time || r.create_date)
}

function money(value) {
  const n = Number(value)
  if (!isFinite(n)) return '¥--'
  return `¥${n % 1 === 0 ? n : n.toFixed(1)}`
}

function ratingText(value) {
  const n = Number(value)
  return n > 0 ? n.toFixed(1) : '暂无'
}

function count(value) {
  const n = Number(value)
  return isFinite(n) && n > 0 ? n : 0
}
</script>

<style lang="scss" scoped>@import '@/common/tokens.scss';

.dish-page {
  min-height: 100vh;
  background: $canvas;
  padding-bottom: 160rpx;
}

/* 菜品大图展示区：有图显示照片，无图由 DishImage 回退为 emoji 方块 */
.hero {
  height: 420rpx;
  background: linear-gradient(135deg, $brand, $brand-dark);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 信息卡片 */
.info-card {
  position: relative;
  z-index: 2;
  margin: -50rpx 24rpx 0;
  background: #fff;
  border-radius: 20rpx;
  padding: 30rpx;
}

.name-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.dish-name {
  flex: 1;
  font-size: 38rpx;
  font-weight: bold;
  color: $ink;
  margin-right: 20rpx;
}

.dish-price {
  font-size: 38rpx;
  font-weight: bold;
  color: $brand;
}

.meta-row {
  display: flex;
  align-items: center;
  margin-top: 16rpx;
  font-size: 24rpx;
}

.rating {
  color: $warning;
}

.divider {
  margin: 0 14rpx;
  color: $line;
}

.loc {
  color: $gray7;
  flex: 1;
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 20rpx;
}

.tag {
  font-size: 22rpx;
  color: $brand;
  background: $brand-soft;
  padding: 6rpx 18rpx;
  border-radius: 8rpx;
}

.tag-empty {
  font-size: 22rpx;
  color: $gray4;
}

.stats-row {
  display: flex;
  margin-top: 26rpx;
  padding-top: 24rpx;
  border-top: 1rpx solid $surface-sunken;
}

.stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-num {
  font-size: 34rpx;
  font-weight: bold;
  color: $brand;
}

.stat-label {
  font-size: 22rpx;
  color: $gray6;
  margin-top: 8rpx;
}

/* 通用区块 */
.section {
  margin: 24rpx;
  background: #fff;
  border-radius: 20rpx;
  padding: 30rpx;
}

.section-title {
  font-size: 30rpx;
  font-weight: bold;
  color: $ink;
  margin-bottom: 20rpx;
}

.desc {
  font-size: 26rpx;
  color: $gray7;
  line-height: 1.7;
  display: block;
}

.empty-text {
  color: $gray4;
}

/* 评价 */
.review-item {
  padding: 22rpx 0;
  border-bottom: 1rpx solid $surface-sunken;
}

.review-item:last-child {
  border-bottom: none;
}

.review-header {
  display: flex;
  align-items: center;
}

.avatar {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  background: $brand-soft;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 16rpx;
  flex-shrink: 0;
}

.avatar-text {
  font-size: 26rpx;
  color: $brand;
}

.review-user {
  flex: 1;
  min-width: 0;
}

.nickname {
  font-size: 26rpx;
  color: $ink;
  display: block;
}

.stars {
  margin-top: 4rpx;
}

.stars text {
  font-size: 22rpx;
  color: $line-strong;
  margin-right: 2rpx;
}

.stars text.on {
  color: $warning;
}

.review-time {
  font-size: 22rpx;
  color: $gray4;
  flex-shrink: 0;
}

.review-content {
  display: block;
  margin-top: 14rpx;
  font-size: 26rpx;
  color: $gray7;
  line-height: 1.7;
}

.review-state,
.review-end {
  text-align: center;
  padding: 24rpx 0;
  font-size: 24rpx;
  color: $gray4;
}

.review-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 50rpx 0;
  font-size: 26rpx;
  color: $gray4;
}

.review-empty-icon {
  font-size: 66rpx;
  margin-bottom: 16rpx;
}

.more-btn {
  margin-top: 24rpx;
  height: 72rpx;
  border: 2rpx solid $brand;
  border-radius: 36rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26rpx;
  color: $brand;
}

/* 底部按钮 */
.action-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  gap: 20rpx;
  padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom));
  background: #fff;
  box-shadow: 0 -4rpx 16rpx rgba(0, 0, 0, 0.05);
}

.btn-ghost,
.btn-primary {
  flex: 1;
  height: 88rpx;
  border-radius: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30rpx;
}

.btn-ghost {
  color: $brand;
  border: 2rpx solid $brand;
}

.btn-primary {
  color: #fff;
  font-weight: 500;
  background: linear-gradient(135deg, $brand, $brand-dark);
}

/* 状态 */
.state-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 200rpx 60rpx;
}

.state-icon {
  font-size: 80rpx;
  margin-bottom: 20rpx;
}

.state-text {
  font-size: 28rpx;
  color: $gray6;
  text-align: center;
  line-height: 1.6;
}

.state-btn {
  margin-top: 30rpx;
  padding: 14rpx 44rpx;
  font-size: 26rpx;
  color: $brand;
  border: 2rpx solid $brand;
  border-radius: 32rpx;
}
</style>
