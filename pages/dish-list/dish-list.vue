<template>
  <view class="dish-list-page">
    <!-- 搜索栏 -->
    <view class="search-bar">
      <input class="search-input" v-model="keyword" placeholder="搜索菜品名称..."
             confirm-type="search" @confirm="search" />
      <text class="search-btn" @click="search">搜索</text>
    </view>

    <!-- 筛选栏 -->
    <view class="filter-bar">
      <picker mode="selector" :range="canteenFilter" @change="onCanteenFilter">
        <view class="filter-item">
          {{ filters.canteen || '全部食堂' }} ▾
        </view>
      </picker>
      <picker mode="selector" :range="categoryFilter" @change="onCategoryFilter">
        <view class="filter-item">
          {{ filters.category || '全部分类' }} ▾
        </view>
      </picker>
      <view class="filter-item" :class="{ active: sortByRating }" @click="toggleSort">
        {{ sortByRating ? '评分优先' : '默认排序' }}
      </view>
    </view>

    <!-- 菜品列表 -->
    <view class="dish-grid">
      <view class="dish-item" v-for="d in list" :key="d.id" @click="goDetail(d.id)">
        <image class="dish-img" :src="d.image || defaultImg" mode="aspectFill" />
        <view class="dish-info">
          <text class="dish-name">{{ d.name }}</text>
          <text class="dish-loc">{{ d.canteen }} · {{ d.window }}</text>
          <view class="dish-tags">
            <text class="tag" v-for="t in d.tags.slice(0, 2)" :key="t">{{ t }}</text>
          </view>
          <view class="dish-bottom">
            <text class="dish-price">¥{{ d.price }}</text>
            <text class="dish-rating">⭐ {{ d.rating }}</text>
          </view>
        </view>
      </view>
    </view>

    <view class="empty" v-if="list.length === 0 && !loading">
      <text>暂无符合条件的菜品</text>
    </view>

    <view class="loading-more" v-if="loading">加载中...</view>
    <view class="no-more" v-if="!loading && list.length >= total && list.length > 0">没有更多了</view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { onReachBottom, onPullDownRefresh } from '@dcloudio/uni-app'
import { dishApi } from '@/api/index.js'

const defaultImg = '/static/jian.png'

const keyword = ref('')
const list = ref([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const sortByRating = ref(false)

const canteenFilter = ref(['全部食堂'])
const categoryFilter = ref(['全部分类'])
const filters = ref({ canteen: '', category: '' })

onMounted(async () => {
  try {
    const [canteens, categories] = await Promise.all([
      dishApi.canteens(),
      dishApi.categories()
    ])
    if (canteens) canteenFilter.value = ['全部食堂', ...canteens]
    if (categories) categoryFilter.value = ['全部分类', ...categories]
  } catch (e) {}
  loadList(true)
})

async function loadList(reset = false) {
  if (loading.value) return
  loading.value = true
  if (reset) {
    page.value = 1
    list.value = []
  }
  try {
    const params = {
      page: page.value,
      page_size: 20,
      canteen: filters.value.canteen || undefined,
      category: filters.value.category || undefined,
      keyword: keyword.value || undefined
    }
    const data = await dishApi.list(params)
    list.value = reset ? data.list : [...list.value, ...data.list]
    total.value = data.total
    page.value++
  } catch (e) {
  } finally {
    loading.value = false
  }
}

onReachBottom(() => {
  if (list.value.length < total.value) {
    loadList()
  }
})

function search() {
  loadList(true)
}

function onCanteenFilter(e) {
  const val = canteenFilter.value[e.detail.value]
  filters.value.canteen = val === '全部食堂' ? '' : val
  loadList(true)
}

function onCategoryFilter(e) {
  const val = categoryFilter.value[e.detail.value]
  filters.value.category = val === '全部分类' ? '' : val
  loadList(true)
}

function toggleSort() {
  sortByRating.value = !sortByRating.value
  // 简单实现：重新加载并排序
  loadList(true).then(() => {
    if (sortByRating.value) {
      list.value.sort((a, b) => b.rating - a.rating)
    }
  })
}

function goDetail(id) {
  uni.navigateTo({ url: `/pages/dish/dish?id=${id}` })
}

onPullDownRefresh(() => {
  loadList(true).finally(() => uni.stopPullDownRefresh())
})
</script>

<style scoped>
.dish-list-page {
  background: #f5f5f5;
  min-height: 100vh;
  padding-bottom: 30rpx;
}

.search-bar {
  display: flex;
  align-items: center;
  padding: 20rpx 24rpx;
  background: #fff;
  gap: 16rpx;
}

.search-input {
  flex: 1;
  height: 72rpx;
  background: #f5f5f5;
  border-radius: 36rpx;
  padding: 0 30rpx;
  font-size: 28rpx;
}

.search-btn {
  color: #FF6B35;
  font-size: 28rpx;
  padding: 0 10rpx;
}

.filter-bar {
  display: flex;
  padding: 16rpx 24rpx;
  background: #fff;
  border-top: 1rpx solid #f0f0f0;
  gap: 20rpx;
}

.filter-item {
  font-size: 26rpx;
  color: #666;
  padding: 8rpx 20rpx;
  background: #f5f5f5;
  border-radius: 20rpx;
}

.filter-item.active {
  color: #FF6B35;
  background: #FFF0EB;
}

.dish-grid {
  padding: 20rpx 24rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.dish-item {
  display: flex;
  background: #fff;
  border-radius: 16rpx;
  overflow: hidden;
}

.dish-img {
  width: 200rpx;
  height: 200rpx;
  background: #f0f0f0;
}

.dish-info {
  flex: 1;
  padding: 20rpx;
  display: flex;
  flex-direction: column;
}

.dish-name {
  font-size: 30rpx;
  font-weight: bold;
  color: #333;
}

.dish-loc {
  font-size: 22rpx;
  color: #999;
  margin-top: 6rpx;
}

.dish-tags {
  margin-top: 8rpx;
  display: flex;
  gap: 8rpx;
}

.tag {
  font-size: 20rpx;
  color: #FF6B35;
  background: #FFF0EB;
  padding: 2rpx 10rpx;
  border-radius: 6rpx;
}

.dish-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: auto;
}

.dish-price {
  font-size: 30rpx;
  color: #FF6B35;
  font-weight: bold;
}

.dish-rating {
  font-size: 24rpx;
  color: #FF9800;
}

.empty {
  text-align: center;
  padding: 100rpx 0;
  color: #bbb;
  font-size: 28rpx;
}

.loading-more,
.no-more {
  text-align: center;
  padding: 30rpx;
  color: #999;
  font-size: 26rpx;
}
</style>
