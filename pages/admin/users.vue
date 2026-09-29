<template>
  <view class="users-page">
    <view class="toolbar">
      <input class="search" v-model="keyword" placeholder="搜索昵称/学号" @confirm="load" />
    </view>

    <view class="user-list">
      <view class="user-item" v-for="u in list" :key="u.id">
        <image class="avatar" :src="u.avatar || defaultAvatar" mode="aspectFill" />
        <view class="info">
          <view class="name-row">
            <text class="name">{{ u.nickname }}</text>
            <text class="role" v-if="u.role === 'admin'">管理员</text>
            <text class="status" :class="u.status">{{ u.status === 'banned' ? '已封禁' : '正常' }}</text>
          </view>
          <text class="sid" v-if="u.student_id">学号：{{ u.student_id }}</text>
          <view class="prefs" v-if="u.taste_pref && u.taste_pref.length">
            <text class="pref" v-for="t in u.taste_pref" :key="t">{{ t }}</text>
          </view>
        </view>
        <view class="action" @click="ban(u)">
          {{ u.status === 'banned' ? '解封' : '封禁' }}
        </view>
      </view>
    </view>

    <view class="empty" v-if="list.length === 0">暂无用户</view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { adminApi } from '@/api/index.js'

const defaultAvatar = '/static/userImg/user.png'
const list = ref([])
const keyword = ref('')

onMounted(() => load())

async function load() {
  try {
    const data = await adminApi.userList({ keyword: keyword.value || undefined, page_size: 100 })
    list.value = data.list || []
  } catch (e) {}
}

async function ban(u) {
  try {
    await adminApi.banUser(u.id)
    uni.showToast({ title: u.status === 'banned' ? '已解封' : '已封禁', icon: 'success' })
    load()
  } catch (e) {}
}
</script>

<style scoped>
.users-page {
  padding: 20rpx;
  background: #f5f5f5;
  min-height: 100vh;
}

.toolbar {
  margin-bottom: 20rpx;
}

.search {
  width: 100%;
  height: 72rpx;
  background: #fff;
  border-radius: 36rpx;
  padding: 0 24rpx;
  font-size: 28rpx;
  box-sizing: border-box;
}

.user-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.user-item {
  display: flex;
  align-items: center;
  background: #fff;
  border-radius: 16rpx;
  padding: 20rpx;
}

.avatar {
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
  margin-right: 20rpx;
  background: #f0f0f0;
}

.info {
  flex: 1;
}

.name-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.name {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
}

.role {
  font-size: 20rpx;
  color: #fff;
  background: #FF6B35;
  padding: 2rpx 10rpx;
  border-radius: 6rpx;
}

.status {
  font-size: 20rpx;
  padding: 2rpx 10rpx;
  border-radius: 6rpx;
}

.status.active {
  color: #4caf50;
  background: #e8f5e9;
}

.status.banned {
  color: #f44336;
  background: #ffebee;
}

.sid {
  font-size: 22rpx;
  color: #999;
  margin-top: 6rpx;
  display: block;
}

.prefs {
  margin-top: 6rpx;
  display: flex;
  gap: 6rpx;
}

.pref {
  font-size: 20rpx;
  color: #FF6B35;
  background: #FFF0EB;
  padding: 2rpx 8rpx;
  border-radius: 4rpx;
}

.action {
  font-size: 24rpx;
  color: #fff;
  background: #ff4d4f;
  padding: 10rpx 20rpx;
  border-radius: 8rpx;
}

.empty {
  text-align: center;
  padding: 100rpx 0;
  color: #bbb;
  font-size: 28rpx;
}
</style>
