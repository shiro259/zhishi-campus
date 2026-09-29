<template>
  <view class="dishes-page">
    <view class="toolbar">
      <input class="search" v-model="keyword" placeholder="搜索菜品名" @confirm="reload" />
      <view class="add-btn" @click="goEdit()">+ 新增菜品</view>
    </view>

    <view class="dish-list">
      <view class="dish-item" v-for="d in list" :key="d.id">
        <image class="dish-img" :src="d.image || defaultImg" mode="aspectFill" />
        <view class="dish-info">
          <view class="name-row">
            <text class="name">{{ d.name }}</text>
            <text class="status" :class="d.status ? 'on' : 'off'">
              {{ d.status ? '上架' : '下架' }}
            </text>
          </view>
          <text class="loc">{{ d.canteen }} · {{ d.window }} · {{ d.category }}</text>
          <view class="meta">
            <text class="price">¥{{ d.price }}</text>
            <text class="rating">⭐{{ d.rating }}</text>
            <text class="reviews">{{ d.review_count }}评价</text>
          </view>
        </view>
        <view class="actions">
          <text class="action edit" @click="goEdit(d.id)">编辑</text>
          <text class="action del" @click="toggleStatus(d)">
            {{ d.status ? '下架' : '上架' }}
          </text>
        </view>
      </view>
    </view>

    <view class="empty" v-if="list.length === 0">暂无菜品数据</view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { dishApi, adminApi } from '@/api/index.js'

const defaultImg = '/static/jian.png'
const list = ref([])
const keyword = ref('')
const page = ref(1)

onMounted(() => reload())

async function reload() {
  try {
    const data = await adminApi.allDishes({ keyword: keyword.value || undefined, page: 1, page_size: 100 })
    list.value = data.list || []
  } catch (e) {
    // 降级使用普通列表（仅上架菜品）
    try {
      const data = await dishApi.list({ keyword: keyword.value || undefined, page: 1, page_size: 100 })
      list.value = data.list || []
    } catch (e2) {}
  }
}

function goEdit(id) {
  uni.navigateTo({ url: `/pages/admin/dish-edit?id=${id || ''}` })
}

async function toggleStatus(d) {
  try {
    await dishApi.update(d.id, { status: d.status ? 0 : 1 })
    uni.showToast({ title: d.status ? '已下架' : '已上架', icon: 'success' })
    reload()
  } catch (e) {}
}
</script>

<style scoped>
.dishes-page {
  padding: 20rpx;
  background: #f5f5f5;
  min-height: 100vh;
}

.toolbar {
  display: flex;
  gap: 16rpx;
  margin-bottom: 20rpx;
}

.search {
  flex: 1;
  height: 72rpx;
  background: #fff;
  border-radius: 36rpx;
  padding: 0 24rpx;
  font-size: 28rpx;
}

.add-btn {
  height: 72rpx;
  padding: 0 24rpx;
  background: #FF6B35;
  color: #fff;
  border-radius: 36rpx;
  display: flex;
  align-items: center;
  font-size: 28rpx;
}

.dish-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.dish-item {
  display: flex;
  background: #fff;
  border-radius: 16rpx;
  padding: 20rpx;
  align-items: center;
}

.dish-img {
  width: 120rpx;
  height: 120rpx;
  border-radius: 12rpx;
  background: #f0f0f0;
  margin-right: 20rpx;
}

.dish-info {
  flex: 1;
}

.name-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.name {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
}

.status {
  font-size: 20rpx;
  padding: 2rpx 10rpx;
  border-radius: 6rpx;
}

.status.on {
  background: #e8f5e9;
  color: #4caf50;
}

.status.off {
  background: #ffebee;
  color: #f44336;
}

.loc {
  font-size: 22rpx;
  color: #999;
  margin-top: 6rpx;
  display: block;
}

.meta {
  display: flex;
  gap: 16rpx;
  margin-top: 8rpx;
}

.price {
  font-size: 24rpx;
  color: #FF6B35;
  font-weight: bold;
}

.rating {
  font-size: 22rpx;
  color: #FF9800;
}

.reviews {
  font-size: 22rpx;
  color: #999;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.action {
  font-size: 24rpx;
  padding: 8rpx 16rpx;
  border-radius: 8rpx;
  text-align: center;
}

.action.edit {
  background: #e3f2fd;
  color: #2196f3;
}

.action.del {
  background: #ffebee;
  color: #f44336;
}

.empty {
  text-align: center;
  padding: 100rpx 0;
  color: #bbb;
  font-size: 28rpx;
}
</style>
