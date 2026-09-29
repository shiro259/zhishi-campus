<template>
  <view class="reviews-page">
    <view class="tabs">
      <view class="tab" :class="{ active: status === '' }" @click="status = ''; load()">全部</view>
      <view class="tab" :class="{ active: status === 'pending' }" @click="status = 'pending'; load()">
        待审核
      </view>
      <view class="tab" :class="{ active: status === 'approved' }" @click="status = 'approved'; load()">
        已通过
      </view>
      <view class="tab" :class="{ active: status === 'rejected' }" @click="status = 'rejected'; load()">
        已驳回
      </view>
    </view>

    <view class="review-list">
      <view class="review-item" v-for="r in list" :key="r.id">
        <view class="review-top">
          <view class="stars">
            <text v-for="n in 5" :key="n" :class="{ on: n <= r.rating }">★</text>
          </view>
          <text class="audit" :class="r.audit_status">
            {{ statusText(r.audit_status) }}
          </text>
        </view>
        <text class="content" v-if="r.content">{{ r.content }}</text>
        <view class="tags" v-if="r.tags && r.tags.length">
          <text class="tag" v-for="t in r.tags" :key="t">{{ t }}</text>
        </view>
        <view class="images" v-if="r.images && r.images.length">
          <image v-for="(img, i) in r.images" :key="i" :src="img" class="img" mode="aspectFill" />
        </view>
        <view class="actions" v-if="r.audit_status === 'pending'">
          <view class="btn pass" @click="audit(r, 'approved')">通过</view>
          <view class="btn reject" @click="audit(r, 'rejected')">驳回</view>
          <view class="btn delete" @click="del(r)">删除</view>
        </view>
        <view class="actions" v-else>
          <view class="btn delete" @click="del(r)">删除</view>
        </view>
      </view>
    </view>

    <view class="empty" v-if="list.length === 0">暂无评价</view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { reviewApi, adminApi } from '@/api/index.js'

const list = ref([])
const status = ref('')

onMounted(() => load())

async function load() {
  try {
    const data = await adminApi.allReviews({ audit_status: status.value || undefined, page_size: 100 })
    list.value = data.list || []
  } catch (e) {
    // 降级使用普通接口
    try {
      const data = await reviewApi.list({ audit_status: status.value || undefined, page_size: 100 })
      list.value = data.list || []
    } catch (e2) {}
  }
}

function statusText(s) {
  return { pending: '待审核', approved: '已通过', rejected: '已驳回' }[s] || s
}

async function audit(r, st) {
  try {
    await reviewApi.audit({ review_id: r.id, audit_status: st })
    uni.showToast({ title: st === 'approved' ? '已通过' : '已驳回', icon: 'success' })
    load()
  } catch (e) {}
}

async function del(r) {
  uni.showModal({
    title: '提示',
    content: '确定删除这条评价吗？',
    success: async (res) => {
      if (res.confirm) {
        try {
          await reviewApi.delete(r.id)
          uni.showToast({ title: '已删除', icon: 'success' })
          load()
        } catch (e) {}
      }
    }
  })
}
</script>

<style scoped>
.reviews-page {
  background: #f5f5f5;
  min-height: 100vh;
}

.tabs {
  display: flex;
  background: #fff;
  padding: 16rpx;
  gap: 12rpx;
}

.tab {
  flex: 1;
  text-align: center;
  padding: 16rpx 0;
  font-size: 26rpx;
  color: #666;
  background: #f5f5f5;
  border-radius: 20rpx;
}

.tab.active {
  background: #FF6B35;
  color: #fff;
}

.review-list {
  padding: 20rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.review-item {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
}

.review-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12rpx;
}

.stars text {
  color: #ddd;
  font-size: 28rpx;
}

.stars text.on {
  color: #FF9800;
}

.audit {
  font-size: 22rpx;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
}

.audit.pending {
  background: #fff3e0;
  color: #ff9800;
}

.audit.approved {
  background: #e8f5e9;
  color: #4caf50;
}

.audit.rejected {
  background: #ffebee;
  color: #f44336;
}

.content {
  font-size: 28rpx;
  color: #333;
  line-height: 1.6;
  display: block;
  margin-bottom: 12rpx;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
  margin-bottom: 12rpx;
}

.tag {
  font-size: 22rpx;
  color: #666;
  background: #f5f5f5;
  padding: 4rpx 12rpx;
  border-radius: 6rpx;
}

.images {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  margin-bottom: 12rpx;
}

.img {
  width: 140rpx;
  height: 140rpx;
  border-radius: 8rpx;
}

.actions {
  display: flex;
  gap: 16rpx;
  margin-top: 16rpx;
}

.btn {
  flex: 1;
  text-align: center;
  padding: 16rpx 0;
  border-radius: 8rpx;
  font-size: 26rpx;
}

.btn.pass {
  background: #e8f5e9;
  color: #4caf50;
}

.btn.reject {
  background: #fff3e0;
  color: #ff9800;
}

.btn.delete {
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
