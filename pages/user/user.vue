<template>
  <view class="user-page">
    <!-- 用户信息卡片 -->
    <view class="user-card" v-if="user">
      <image class="avatar" :src="user.avatar || defaultAvatar" mode="aspectFill" @click="editProfile" />
      <view class="user-info">
        <text class="nickname">{{ user.nickname }}</text>
        <text class="student-id" v-if="user.student_id">学号：{{ user.student_id }}</text>
        <view class="tags" v-if="user.taste_pref && user.taste_pref.length">
          <text class="pref-tag" v-for="t in user.taste_pref" :key="t">{{ t }}</text>
        </view>
      </view>
      <text class="edit-icon" @click="editProfile">✏️</text>
    </view>

    <view class="login-card" v-else @click="goLogin">
      <text class="login-text">点击登录</text>
    </view>

    <!-- 数据统计 -->
    <view class="stats-card" v-if="user">
      <view class="stat-item" @click="goMyReviews">
        <text class="stat-num">{{ reviewCount }}</text>
        <text class="stat-label">我的评价</text>
      </view>
      <view class="stat-item" @click="goRecommend">
        <text class="stat-num">-</text>
        <text class="stat-label">推荐次数</text>
      </view>
      <view class="stat-item">
        <text class="stat-num">{{ user.allergies ? user.allergies.length : 0 }}</text>
        <text class="stat-label">忌口食材</text>
      </view>
    </view>

    <!-- 功能菜单 -->
    <view class="menu-card">
      <view class="menu-item" @click="goMyReviews">
        <text class="menu-icon">📝</text>
        <text class="menu-text">我的评价</text>
        <text class="menu-arrow">›</text>
      </view>
      <view class="menu-item" @click="goRecommend">
        <text class="menu-icon">🤖</text>
        <text class="menu-text">AI 推荐记录</text>
        <text class="menu-arrow">›</text>
      </view>
      <view class="menu-item" @click="editProfile">
        <text class="menu-icon">⚙️</text>
        <text class="menu-text">口味与忌口设置</text>
        <text class="menu-arrow">›</text>
      </view>
      <view class="menu-item" v-if="user && user.role === 'admin'" @click="goAdmin">
        <text class="menu-icon">🛠️</text>
        <text class="menu-text">管理后台</text>
        <text class="menu-arrow">›</text>
      </view>
    </view>

    <view class="menu-card" v-if="user">
      <view class="menu-item" @click="logout">
        <text class="menu-icon">🚪</text>
        <text class="menu-text logout">退出登录</text>
        <text class="menu-arrow">›</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { authApi, reviewApi } from '@/api/index.js'
import { getUserInfo, saveUserInfo, clearAuth, isLoggedIn } from '@/common/utils.js'

const defaultAvatar = '/static/userImg/user.png'
const user = ref(null)
const reviewCount = ref(0)

onShow(() => {
  loadUser()
})

onMounted(() => {
  loadUser()
})

async function loadUser() {
  const local = getUserInfo()
  if (local) {
    user.value = local
    try {
      const fresh = await authApi.getMyInfo()
      user.value = fresh
      saveUserInfo(fresh)
      // 加载我的评价数
      const data = await reviewApi.mine({ page_size: 1 })
      reviewCount.value = data.total || 0
    } catch (e) {
      // token 失效
      if (e.statusCode === 401) {
        clearAuth()
        user.value = null
      }
    }
  }
}

function goLogin() {
  uni.navigateTo({ url: '/pages/login/login' })
}

function editProfile() {
  if (!isLoggedIn()) return goLogin()
  uni.navigateTo({ url: '/pages/user/edit' })
}

function goMyReviews() {
  if (!isLoggedIn()) return goLogin()
  uni.navigateTo({ url: '/pages/review/review' })
}

function goRecommend() {
  uni.switchTab({ url: '/pages/recommend/recommend' })
}

function goAdmin() {
  uni.navigateTo({ url: '/pages/admin/index' })
}

function logout() {
  uni.showModal({
    title: '提示',
    content: '确定退出登录吗？',
    success: (res) => {
      if (res.confirm) {
        clearAuth()
        user.value = null
        uni.showToast({ title: '已退出登录', icon: 'success' })
      }
    }
  })
}
</script>

<style scoped>
.user-page {
  background: #f5f5f5;
  min-height: 100vh;
  padding-bottom: 40rpx;
}

.user-card {
  background: linear-gradient(135deg, #FF6B35, #FF8C5A);
  padding: 50rpx 30rpx;
  display: flex;
  align-items: center;
  position: relative;
}

.avatar {
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  border: 4rpx solid #fff;
  background: #fff;
}

.user-info {
  flex: 1;
  margin-left: 24rpx;
}

.nickname {
  font-size: 34rpx;
  font-weight: bold;
  color: #fff;
}

.student-id {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.85);
  margin-top: 8rpx;
  display: block;
}

.tags {
  margin-top: 10rpx;
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
}

.pref-tag {
  font-size: 20rpx;
  color: #FF6B35;
  background: rgba(255, 255, 255, 0.9);
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
}

.edit-icon {
  font-size: 32rpx;
}

.login-card {
  background: linear-gradient(135deg, #FF6B35, #FF8C5A);
  padding: 80rpx 30rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-text {
  color: #fff;
  font-size: 32rpx;
  border: 2rpx solid #fff;
  padding: 16rpx 60rpx;
  border-radius: 40rpx;
}

.stats-card {
  margin: 20rpx 24rpx;
  background: #fff;
  border-radius: 16rpx;
  padding: 30rpx;
  display: flex;
  justify-content: space-around;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-num {
  font-size: 36rpx;
  font-weight: bold;
  color: #FF6B35;
}

.stat-label {
  font-size: 24rpx;
  color: #999;
  margin-top: 8rpx;
}

.menu-card {
  margin: 20rpx 24rpx;
  background: #fff;
  border-radius: 16rpx;
  overflow: hidden;
}

.menu-item {
  display: flex;
  align-items: center;
  padding: 28rpx 24rpx;
  border-bottom: 1rpx solid #f5f5f5;
}

.menu-item:last-child {
  border-bottom: none;
}

.menu-icon {
  font-size: 32rpx;
  margin-right: 20rpx;
}

.menu-text {
  flex: 1;
  font-size: 28rpx;
  color: #333;
}

.menu-text.logout {
  color: #ff4d4f;
}

.menu-arrow {
  color: #ccc;
  font-size: 32rpx;
}
</style>
