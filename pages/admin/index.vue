<template>
  <view class="admin-index">
    <view class="header">
      <text class="title">🛠️ 管理后台</text>
      <text class="sub">食遇校园运营管理平台</text>
    </view>

    <!-- 数据概览 -->
    <view class="overview">
      <view class="ov-item">
        <text class="ov-num">{{ overview.user_count }}</text>
        <text class="ov-label">用户数</text>
      </view>
      <view class="ov-item">
        <text class="ov-num">{{ overview.dish_count }}</text>
        <text class="ov-label">在售菜品</text>
      </view>
      <view class="ov-item">
        <text class="ov-num">{{ overview.review_count }}</text>
        <text class="ov-label">评价总数</text>
      </view>
      <view class="ov-item warning">
        <text class="ov-num">{{ overview.pending_review_count }}</text>
        <text class="ov-label">待审核</text>
      </view>
    </view>

    <!-- 功能入口 -->
    <view class="menu-grid">
      <view class="menu-item" @click="go('/pages/admin/dashboard')">
        <text class="icon">📊</text>
        <text class="label">数据看板</text>
      </view>
      <view class="menu-item" @click="go('/pages/admin/dishes')">
        <text class="icon">🍜</text>
        <text class="label">菜品管理</text>
      </view>
      <view class="menu-item" @click="go('/pages/admin/reviews')">
        <text class="icon">📝</text>
        <text class="label">评价审核</text>
      </view>
      <view class="menu-item" @click="go('/pages/admin/users')">
        <text class="icon">👥</text>
        <text class="label">用户管理</text>
      </view>
    </view>

    <view class="logout" @click="logout">退出登录</view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { statsApi } from '@/api/index.js'
import { clearAuth } from '@/api/request.js'
import { isAdmin } from '@/common/utils.js'

const overview = ref({
  user_count: 0,
  dish_count: 0,
  review_count: 0,
  pending_review_count: 0
})

onMounted(async () => {
  if (!isAdmin()) {
    uni.showToast({ title: '无管理权限', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 1500)
    return
  }
  try {
    overview.value = await statsApi.overview()
  } catch (e) {}
})

function go(url) {
  uni.navigateTo({ url })
}

function logout() {
  uni.showModal({
    title: '提示',
    content: '确定退出管理后台吗？',
    success: (res) => {
      if (res.confirm) {
        clearAuth()
        uni.reLaunch({ url: '/pages/login/login' })
      }
    }
  })
}
</script>

<style scoped>
.admin-index {
  padding: 30rpx;
  background: #f5f5f5;
  min-height: 100vh;
}

.header {
  background: linear-gradient(135deg, #333, #555);
  border-radius: 20rpx;
  padding: 40rpx;
  margin-bottom: 30rpx;
}

.title {
  font-size: 40rpx;
  font-weight: bold;
  color: #fff;
  display: block;
}

.sub {
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.7);
  margin-top: 10rpx;
  display: block;
}

.overview {
  display: flex;
  background: #fff;
  border-radius: 16rpx;
  padding: 30rpx 0;
  margin-bottom: 30rpx;
}

.ov-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  border-right: 1rpx solid #f0f0f0;
}

.ov-item:last-child {
  border-right: none;
}

.ov-num {
  font-size: 40rpx;
  font-weight: bold;
  color: #333;
}

.ov-item.warning .ov-num {
  color: #ff4d4f;
}

.ov-label {
  font-size: 24rpx;
  color: #999;
  margin-top: 8rpx;
}

.menu-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 20rpx;
}

.menu-item {
  width: calc(50% - 10rpx);
  background: #fff;
  border-radius: 16rpx;
  padding: 40rpx 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.icon {
  font-size: 56rpx;
}

.label {
  font-size: 28rpx;
  color: #333;
  margin-top: 16rpx;
}

.logout {
  margin-top: 60rpx;
  text-align: center;
  color: #ff4d4f;
  font-size: 28rpx;
}
</style>
