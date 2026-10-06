<template>
  <view class="page">
    <!-- 加载中 -->
    <view class="state" v-if="loading">
      <view class="spinner" />
      <text class="state-main">正在加载菜品…</text>
    </view>

    <!-- 加载失败 / 菜品不存在 -->
    <view class="state" v-else-if="error">
      <Icon name="warning" :size="72" color="#D8D3CB" />
      <text class="state-main">{{ error }}</text>
      <text class="state-sub">去推荐页看看今天还有什么好吃的</text>
      <view class="state-btn" @click="goRecommend">回到推荐</view>
    </view>

    <!-- 菜品内容 -->
    <template v-else-if="dish">
      <!-- 菜品大图（有图显示照片，无图由 DishImage 回退为 emoji 方块） -->
      <view class="hero">
        <DishImage :dish="dish" :size="420" :radius="32" />
      </view>

      <!-- 基本信息 -->
      <view class="card">
        <view class="name-row">
          <text class="dish-name">{{ dish.name }}</text>
          <text class="dish-price">{{ money(dish.price) }}</text>
        </view>

        <view class="meta">
          <view class="meta-item">
            <Icon name="location" :size="26" color="#8A8580" />
            <text class="meta-text">{{ dish.canteen || '未知食堂' }} · {{ dish.window || '未知窗口' }}</text>
          </view>
          <view class="meta-item">
            <Icon name="star" :size="26" color="#8A8580" />
            <text class="meta-text">{{ ratingText(dish.rating) }} 分</text>
          </view>
        </view>

        <view class="tags" v-if="dish.tags && dish.tags.length">
          <text class="tag" v-for="(t, i) in dish.tags" :key="i">{{ t }}</text>
        </view>
        <view class="tags" v-else>
          <text class="tag-empty">暂无口味标签</text>
        </view>

        <!-- 数据统计 -->
        <view class="stats">
          <view class="stat">
            <text class="stat-num">{{ count(dish.recommend_count) }}</text>
            <text class="stat-label">推荐次数</text>
          </view>
          <view class="stat">
            <text class="stat-num">{{ count(dish.review_count) }}</text>
            <text class="stat-label">评价数</text>
          </view>
        </view>
      </view>

      <!-- 菜品描述 -->
      <view class="card">
        <view class="card-head">
          <text class="card-title">菜品介绍</text>
        </view>
        <text class="desc" v-if="dish.description">{{ dish.description }}</text>
        <text class="desc desc-empty" v-else>这道菜还没有介绍，欢迎你去尝鲜后补充评价～</text>
      </view>

      <!-- 评价列表 -->
      <view class="card">
        <view class="card-head">
          <text class="card-title">同学评价</text>
          <text class="card-count">{{ reviewTotal }} 条</text>
        </view>

        <view class="review" v-for="r in reviews" :key="r.id">
          <view class="review-top">
            <view class="avatar">
              <text class="avatar-text">{{ avatarText(r) }}</text>
            </view>
            <view class="review-user">
              <view class="review-name-row">
                <text class="nickname">{{ nickname(r) }}</text>
                <text class="review-time">{{ reviewTime(r) }}</text>
              </view>
              <view class="stars">
                <Icon
                  v-for="n in 5"
                  :key="n"
                  name="star"
                  :size="24"
                  :color="n <= Math.round(Number(r.rating || 0)) ? '#FF5A36' : '#B8B2AA'"
                />
              </view>
            </view>
          </view>
          <text class="review-content" v-if="r.content">{{ r.content }}</text>
        </view>

        <view class="review-state" v-if="reviewLoading">
          <view class="spinner spinner-sm" />
          <text class="review-state-text">评价加载中…</text>
        </view>

        <view class="review-empty" v-else-if="!reviews.length">
          <text class="review-empty-icon">🍽️</text>
          <text class="review-empty-text">还没有评价，快来抢沙发吧~</text>
        </view>

        <view class="more-btn" v-if="reviewHasMore && !reviewLoading" @click="loadMoreReviews">
          <text>查看更多评价</text>
        </view>
        <view class="review-end" v-else-if="reviews.length && !reviewLoading">
          <text>—— 已经到底啦 ——</text>
        </view>
      </view>
    </template>

    <!-- 底部固定操作条 -->
    <view class="action-bar" v-if="dish && !loading && !error">
      <view class="btn-ghost" @click="goRecommend">
        <Icon name="refresh" :size="30" color="#4A443F" />
        <text class="btn-ghost-text">换一道</text>
      </view>
      <view class="btn-primary" @click="goReview">
        <Icon name="edit" :size="30" color="#FFFFFF" />
        <text class="btn-primary-text">写评价</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { dishApi, reviewApi } from '@/api/index.js'
import { formatTime } from '@/common/utils.js'
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

<style lang="scss" scoped>
@import '@/common/tokens.scss';
.page {
  min-height: 100vh;
  background: $canvas;
  padding: $gap-page;
  /* 给底部固定操作条留出安全距离 */
  padding-bottom: 180rpx;
  box-sizing: border-box;
}

/* ==================== 顶部大图 ==================== */
.hero {
  margin-bottom: $gap-lg;
}

.hero :deep(.dish-image) {
  width: 100% !important;
  height: 420rpx !important;
}

/* ==================== 卡片 ==================== */
.card {
  margin-bottom: $gap-lg;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
  padding: $gap-card;
  box-shadow: $shadow-card;
  box-sizing: border-box;
}

.name-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.dish-name {
  flex: 1;
  margin-right: $gap;
  font-size: $fs-title;
  font-weight: $fw-bold;
  color: $ink;
}

.dish-price {
  flex-shrink: 0;
  font-size: $fs-display;
  font-weight: $fw-bold;
  color: $brand;
}

/* 元信息 */
.meta {
  display: flex;
  flex-wrap: wrap;
  margin-top: $gap-sm;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 6rpx;
  margin-right: $gap;
  margin-bottom: 6rpx;
}

.meta-text {
  font-size: $fs-cap;
  color: $gray6;
}

/* 口味标签 */
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: $gap-sm;
  margin-top: $gap;
}

.tag {
  padding: 0 20rpx;
  height: 44rpx;
  line-height: 44rpx;
  background: $brand-soft;
  color: $brand;
  font-size: $fs-tag;
  border-radius: $radius-pill;
  box-sizing: border-box;
}

.tag-empty {
  font-size: $fs-tag;
  color: $gray4;
}

/* 统计块 */
.stats {
  display: flex;
  margin-top: $gap-lg;
}

.stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: $gap 0;
  background: $surface-sunken;
  border-radius: $radius;
}

.stat + .stat {
  margin-left: $gap-sm;
}

.stat-num {
  font-size: $fs-card;
  font-weight: $fw-bold;
  color: $ink;
}

.stat-label {
  margin-top: 6rpx;
  font-size: $fs-tag;
  color: $gray6;
}

/* 卡片标题 */
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: $gap-sm;
}

.card-title {
  font-size: $fs-card;
  font-weight: $fw-bold;
  color: $ink;
}

.card-count {
  font-size: $fs-cap;
  color: $gray6;
}

/* 菜品介绍 */
.desc {
  display: block;
  font-size: $fs-body;
  color: $gray7;
  line-height: 1.7;
}

.desc-empty {
  color: $gray4;
}

/* ==================== 评价列表 ==================== */
.review {
  padding: $gap 0;
  border-bottom: 2rpx solid $line;
}

.review:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.review-top {
  display: flex;
  align-items: flex-start;
}

.avatar {
  width: 72rpx;
  height: 72rpx;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $surface-sunken;
  border-radius: 50%;
}

.avatar-text {
  font-size: $fs-sub;
  font-weight: $fw-medium;
  color: $gray7;
}

.review-user {
  flex: 1;
  min-width: 0;
  margin-left: $gap-sm;
}

.review-name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.nickname {
  flex: 1;
  font-size: $fs-sub;
  font-weight: $fw-medium;
  color: $ink;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.review-time {
  flex-shrink: 0;
  margin-left: $gap-sm;
  font-size: $fs-tag;
  color: $gray6;
}

.stars {
  display: flex;
  align-items: center;
  gap: 4rpx;
  margin-top: 6rpx;
}

.review-content {
  display: block;
  margin-top: $gap-sm;
  font-size: $fs-body;
  color: $gray7;
  line-height: 1.7;
}

.review-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: $gap 0;
}

.review-state-text {
  margin-left: 10rpx;
  font-size: $fs-cap;
  color: $gray6;
}

.review-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60rpx 0;
}

.review-empty-icon {
  font-size: 64rpx;
  margin-bottom: $gap-sm;
}

.review-empty-text {
  font-size: $fs-cap;
  color: $gray6;
}

.review-end {
  padding: $gap 0 0;
  text-align: center;
  font-size: $fs-cap;
  color: $gray6;
}

.more-btn {
  margin-top: $gap;
  height: $h-btn-sm;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-pill;
  font-size: $fs-sub;
  color: $gray7;
  box-sizing: border-box;
}

/* ==================== 加载 / 异常态 ==================== */
.spinner {
  width: 44rpx;
  height: 44rpx;
  border: 4rpx solid $line;
  border-top-color: $brand;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.spinner-sm {
  width: 28rpx;
  height: 28rpx;
  border-width: 3rpx;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 180rpx $gap 0;
}

.state-main {
  margin-top: $gap;
  font-size: $fs-body;
  font-weight: $fw-medium;
  color: $ink;
  text-align: center;
}

.state-sub {
  margin-top: $gap-sm;
  font-size: $fs-cap;
  color: $gray6;
  text-align: center;
  line-height: 1.6;
}

/* 异常态里的次按钮（独立定义，避免复用到固定操作条的 flex 规则） */
.state-btn {
  margin-top: $gap-lg;
  height: $h-btn-sm;
  padding: 0 40rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-pill;
  font-size: $fs-sub;
  color: $gray7;
  box-sizing: border-box;
}

/* ==================== 底部固定操作条 ==================== */
.action-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  padding: 20rpx $gap-page calc(20rpx + env(safe-area-inset-bottom));
  background: $surface;
  border-top: 2rpx solid $line;
}

.btn-ghost,
.btn-primary {
  flex: 1;
  height: $h-btn;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: $radius-pill;
  font-size: $fs-card;
  box-sizing: border-box;
}

.btn-ghost {
  margin-right: $gap;
  background: $surface;
  border: 2rpx solid $line;
  color: $gray7;
}

.btn-primary {
  background: $brand;
  color: #fff;
  font-weight: $fw-medium;
  box-shadow: $shadow-brand;
}

.btn-ghost-text {
  margin-left: 8rpx;
  color: $gray7;
}

.btn-primary-text {
  margin-left: 8rpx;
  color: #fff;
  font-weight: $fw-medium;
}
</style>
