<template>
  <view class="dish-page" v-if="dish">
    <!-- 菜品图片 -->
    <image class="dish-hero" :src="dish.image || defaultImg" mode="aspectFill" />

    <!-- 基本信息 -->
    <view class="info-card">
      <view class="name-row">
        <text class="dish-name">{{ dish.name }}</text>
        <text class="dish-price">¥{{ dish.price }}</text>
      </view>
      <view class="meta-row">
        <text class="rating">⭐ {{ dish.rating }} 分</text>
        <text class="divider">|</text>
        <text class="review-count">{{ dish.review_count }} 条评价</text>
        <text class="divider">|</text>
        <text class="rec-count">推荐 {{ dish.recommend_count }} 次</text>
      </view>
      <view class="loc-row">
        <text class="loc">📍 {{ dish.canteen }} · {{ dish.window }}</text>
      </view>
      <view class="tag-row">
        <text class="tag" v-for="t in dish.tags" :key="t">{{ t }}</text>
      </view>
      <view class="desc" v-if="dish.description">
        {{ dish.description }}
      </view>
    </view>

    <!-- 评价按钮 -->
    <view class="review-btn" @click="goReview">
      <text>✍️ 我要评价</text>
    </view>

    <!-- 评价列表 -->
    <view class="reviews-section">
      <view class="section-title">
        <text>真实评价 ({{ reviews.length }})</text>
      </view>

      <view class="review-item" v-for="r in reviews" :key="r.id">
        <view class="review-header">
          <image class="avatar" :src="r.user_avatar || defaultAvatar" mode="aspectFill" />
          <view class="review-user">
            <text class="nickname">{{ r.user_nickname || '匿名用户' }}</text>
            <view class="stars">
              <text v-for="n in 5" :key="n" :class="{ on: n <= r.rating }">★</text>
            </view>
          </view>
          <text class="review-time">{{ formatTime(r.created_at) }}</text>
        </view>
        <text class="review-content" v-if="r.content">{{ r.content }}</text>
        <view class="review-tags" v-if="r.tags && r.tags.length">
          <text class="r-tag" v-for="t in r.tags" :key="t">{{ t }}</text>
        </view>
        <view class="review-images" v-if="r.images && r.images.length">
          <image v-for="(img, i) in r.images" :key="i" :src="img" mode="aspectFill"
                 class="review-img" @click="previewImage(r.images, i)" />
        </view>
        <view class="review-footer">
          <text class="like-btn" @click="like(r)">👍 {{ r.likes }}</text>
        </view>
      </view>

      <view class="empty" v-if="reviews.length === 0">
        <text>还没有评价，快来抢沙发吧~</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { dishApi, reviewApi } from '@/api/index.js'
import { formatTime } from '@/common/utils.js'

const defaultImg = '/static/jian.png'
const defaultAvatar = '/static/userImg/user.png'

const dish = ref(null)
const reviews = ref([])

onLoad(async (options) => {
  if (options.id) {
    await loadDish(options.id)
    await loadReviews(options.id)
  }
})

async function loadDish(id) {
  try {
    dish.value = await dishApi.detail(id)
  } catch (e) {
    uni.showToast({ title: '菜品不存在', icon: 'none' })
  }
}

async function loadReviews(id) {
  try {
    const data = await reviewApi.list({ dish_id: id, audit_status: 'approved', page_size: 50 })
    reviews.value = data.list || []
  } catch (e) {}
}

function like(r) {
  reviewApi.like(r.id).then(() => {
    r.likes++
    uni.showToast({ title: '点赞成功', icon: 'success' })
  })
}

function previewImage(images, index) {
  uni.previewImage({ urls: images, current: index })
}

function goReview() {
  uni.navigateTo({ url: `/pages/review/review?dish_id=${dish.value.id}` })
}
</script>

<style scoped>
.dish-page {
  padding-bottom: 140rpx;
  background: #f5f5f5;
  min-height: 100vh;
}

.dish-hero {
  width: 100%;
  height: 400rpx;
  background: #e0e0e0;
}

.info-card {
  background: #fff;
  margin: -40rpx 24rpx 0;
  border-radius: 20rpx;
  padding: 30rpx;
  position: relative;
  z-index: 2;
}

.name-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.dish-name {
  font-size: 36rpx;
  font-weight: bold;
  color: #333;
  flex: 1;
}

.dish-price {
  font-size: 36rpx;
  color: #FF6B35;
  font-weight: bold;
}

.meta-row {
  display: flex;
  align-items: center;
  margin-top: 16rpx;
  font-size: 24rpx;
  color: #999;
}

.rating {
  color: #FF9800;
}

.divider {
  margin: 0 12rpx;
  color: #ddd;
}

.loc-row {
  margin-top: 16rpx;
}

.loc {
  font-size: 26rpx;
  color: #666;
}

.tag-row {
  margin-top: 16rpx;
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.tag {
  font-size: 22rpx;
  color: #FF6B35;
  background: #FFF0EB;
  padding: 6rpx 16rpx;
  border-radius: 8rpx;
}

.desc {
  margin-top: 20rpx;
  font-size: 26rpx;
  color: #666;
  line-height: 1.6;
}

.review-btn {
  position: fixed;
  bottom: 30rpx;
  left: 50%;
  transform: translateX(-50%);
  width: 90%;
  height: 88rpx;
  background: linear-gradient(135deg, #FF6B35, #FF8C5A);
  border-radius: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 30rpx;
  font-weight: 500;
  z-index: 10;
  box-shadow: 0 8rpx 20rpx rgba(255, 107, 53, 0.3);
}

.reviews-section {
  margin: 30rpx 24rpx;
  background: #fff;
  border-radius: 20rpx;
  padding: 30rpx;
}

.section-title {
  font-size: 30rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 20rpx;
}

.review-item {
  padding: 20rpx 0;
  border-bottom: 1rpx solid #f0f0f0;
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
  margin-right: 16rpx;
}

.review-user {
  flex: 1;
}

.nickname {
  font-size: 26rpx;
  color: #333;
  display: block;
}

.stars {
  margin-top: 4rpx;
}

.stars text {
  color: #ddd;
  font-size: 22rpx;
}

.stars text.on {
  color: #FF9800;
}

.review-time {
  font-size: 22rpx;
  color: #bbb;
}

.review-content {
  margin-top: 12rpx;
  font-size: 26rpx;
  color: #333;
  line-height: 1.6;
  display: block;
}

.review-tags {
  margin-top: 12rpx;
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
}

.r-tag {
  font-size: 20rpx;
  color: #666;
  background: #f5f5f5;
  padding: 4rpx 12rpx;
  border-radius: 6rpx;
}

.review-images {
  margin-top: 12rpx;
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
}

.review-img {
  width: 180rpx;
  height: 180rpx;
  border-radius: 8rpx;
}

.review-footer {
  margin-top: 12rpx;
}

.like-btn {
  font-size: 24rpx;
  color: #999;
}

.empty {
  text-align: center;
  padding: 60rpx 0;
  color: #bbb;
  font-size: 26rpx;
}
</style>
