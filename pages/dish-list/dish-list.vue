<template>
  <view class="dish-list-page">
    <!-- 搜索栏 -->
    <view class="search-bar">
      <view class="search-box">
        <text class="search-icon">🔍</text>
        <input
          class="search-input"
          type="text"
          v-model="keyword"
          placeholder="搜索菜品名称"
          placeholder-style="color:#999;font-size:28rpx"
          confirm-type="search"
          @confirm="onSearch"
        />
        <text class="search-clear" v-if="keyword" @click="clearKeyword">✕</text>
      </view>
      <text class="search-btn" @click="onSearch">搜索</text>
    </view>

    <!-- 筛选栏 -->
    <view class="filter-bar">
      <picker
        class="filter-picker"
        mode="selector"
        :range="canteenOptions"
        :value="canteenIndex"
        @change="onCanteenChange"
      >
        <view class="filter-item" :class="{ active: !!filters.canteen }">
          <text class="filter-text">{{ filters.canteen || '全部食堂' }}</text>
          <text class="filter-arrow">▾</text>
        </view>
      </picker>

      <picker
        class="filter-picker"
        mode="selector"
        :range="categoryOptions"
        :value="categoryIndex"
        @change="onCategoryChange"
      >
        <view class="filter-item" :class="{ active: !!filters.category }">
          <text class="filter-text">{{ filters.category || '全部分类' }}</text>
          <text class="filter-arrow">▾</text>
        </view>
      </picker>
    </view>

    <!-- 排序切换 -->
    <view class="sort-bar">
      <view
        class="sort-item"
        v-for="s in sortOptions"
        :key="s.value"
        :class="{ active: sortMode === s.value }"
        @click="onSortChange(s.value)"
      >
        {{ s.label }}
      </view>
    </view>

    <!-- 首次加载中 -->
    <view class="state-box" v-if="firstLoading">
      <text class="state-icon">⏳</text>
      <text class="state-text">加载中...</text>
    </view>

    <!-- 请求失败 -->
    <view class="state-box" v-else-if="loadError && !list.length">
      <text class="state-icon">😵</text>
      <text class="state-text">{{ loadError }}</text>
      <view class="state-btn" @click="retry">重新加载</view>
    </view>

    <!-- 空态 -->
    <view class="state-box" v-else-if="!list.length">
      <text class="state-icon">🍚</text>
      <text class="state-text">暂无符合条件的菜品，试试换个筛选条件</text>
      <view class="state-btn" @click="resetFilter">重置筛选条件</view>
    </view>

    <!-- 菜品列表 -->
    <view class="dish-list" v-else>
      <view class="list-count">
        <text>共 {{ total }} 道菜品</text>
      </view>

      <view class="dish-card" v-for="d in list" :key="d.id" @click="goDetail(d.id)">
        <view class="dish-img-wrap">
          <DishImage :dish="d" :size="150" :radius="16" />
        </view>

        <view class="dish-main">
          <view class="dish-title-row">
            <text class="dish-name">{{ d.name }}</text>
            <text class="dish-new" v-if="d.is_new">NEW</text>
          </view>

          <text class="dish-loc">{{ formatLocation(d) || '位置待完善' }}</text>

          <view class="dish-tags" v-if="d.tags && d.tags.length">
            <text class="tag" v-for="(t, i) in d.tags.slice(0, 3)" :key="i">{{ t }}</text>
          </view>

          <view class="dish-bottom">
            <text class="dish-price">{{ money(d.price) }}</text>
            <text class="dish-rating">⭐ {{ ratingText(d.rating) }}</text>
          </view>
        </view>
      </view>

      <view class="list-footer">
        <text v-if="loading">加载中...</text>
        <text v-else-if="hasMore">上拉加载更多</text>
        <text v-else>没有更多菜品了</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onLoad, onShow, onReachBottom, onPullDownRefresh } from '@dcloudio/uni-app'
import { dishApi } from '@/api/index.js'
import { formatLocation } from '@/common/utils.js'
import DishImage from '@/components/DishImage/DishImage.vue'

const PAGE_SIZE = 10

const sortOptions = [
  { value: 'default', label: '默认' },
  { value: 'rating', label: '评分优先' },
  { value: 'price', label: '价格从低到高' }
]

const keyword = ref('')
const sortMode = ref('default')
const filters = ref({ canteen: '', category: '' })

const canteenOptions = ref(['全部食堂'])
const categoryOptions = ref(['全部分类'])

const list = ref([])
const page = ref(1)
const total = ref(0)
const hasMore = ref(true)
const loading = ref(false)
const firstLoading = ref(false)
const loadError = ref('')
const everLoaded = ref(false)
const starting = ref(false)

const canteenIndex = computed(() => {
  const i = canteenOptions.value.indexOf(filters.value.canteen)
  return i > -1 ? i : 0
})

const categoryIndex = computed(() => {
  const i = categoryOptions.value.indexOf(filters.value.category)
  return i > -1 ? i : 0
})

onLoad((options) => {
  const opt = options || {}
  // 首页食堂入口可以带 canteen / category 参数进来
  const canteen = safeDecode(opt.canteen)
  const category = safeDecode(opt.category)
  const kw = safeDecode(opt.keyword)
  if (canteen) filters.value.canteen = canteen
  if (category) filters.value.category = category
  if (kw) keyword.value = kw
  init()
})

// tabBar 切回来时列表为空则自动加载，避免白屏
onShow(() => {
  if (starting.value || loading.value) return

  // 首页食堂入口是 tabBar 页面跳转（switchTab 不支持携带 query 参数），
  // 因此它会把目标食堂暂存在本机，这里取出来应用后立即清除。
  const pending = takePendingCanteen()
  if (pending) {
    filters.value.canteen = pending
    // 拉一次筛选器选项，保证 picker 能定位到该食堂，再重新查询列表
    init()
    return
  }

  if (!everLoaded.value || (loadError.value && !list.value.length)) {
    init()
  }
})

/**
 * 取出并清除首页暂存的待筛选食堂
 * @returns {string} 食堂名，没有则返回空串
 */
function takePendingCanteen() {
  let pending = ''
  try {
    pending = uni.getStorageSync('shiyu_pending_canteen') || ''
  } catch (e) {
    return ''
  }
  if (!pending) return ''
  try {
    uni.removeStorageSync('shiyu_pending_canteen')
  } catch (e) {
    // 忽略
  }
  return pending
}

onReachBottom(() => {
  if (!loading.value && hasMore.value) {
    loadList(false)
  }
})

onPullDownRefresh(async () => {
  try {
    await loadList(true)
  } finally {
    uni.stopPullDownRefresh()
  }
})

async function init() {
  if (starting.value) return
  starting.value = true
  try {
    await loadFilters()
    await loadList(true)
  } finally {
    starting.value = false
  }
}

async function loadFilters() {
  const [canteens, categories] = await Promise.all([
    safeCall(() => dishApi.canteens(), []),
    safeCall(() => dishApi.categories(), [])
  ])

  // dishApi.canteens()/categories() 可能返回数组，也可能返回 { list, engine }
  const canteenList = normalizeOptions(canteens)
  const categoryList = normalizeOptions(categories)

  if (canteenList.length) {
    canteenOptions.value = ['全部食堂', ...canteenList]
  }
  if (categoryList.length) {
    categoryOptions.value = ['全部分类', ...categoryList]
  }
  // URL 带入的筛选值可能不在云端枚举里，补进去保证 picker 能定位
  if (filters.value.canteen && canteenOptions.value.indexOf(filters.value.canteen) === -1) {
    canteenOptions.value = [...canteenOptions.value, filters.value.canteen]
  }
  if (filters.value.category && categoryOptions.value.indexOf(filters.value.category) === -1) {
    categoryOptions.value = [...categoryOptions.value, filters.value.category]
  }
}

function normalizeOptions(res) {
  const rows = Array.isArray(res) ? res : ((res && res.list) || [])
  return rows.filter((item) => typeof item === 'string' && item)
}

async function loadList(reset = false) {
  if (loading.value) return
  if (!reset && !hasMore.value) return

  const targetPage = reset ? 1 : page.value
  loading.value = true

  if (reset) {
    list.value = []
    total.value = 0
    hasMore.value = true
    loadError.value = ''
    firstLoading.value = true
  }

  try {
    const res = await dishApi.list({
      keyword: keyword.value.trim() || undefined,
      canteen: filters.value.canteen || undefined,
      category: filters.value.category || undefined,
      sortByRating: sortMode.value === 'rating' ? true : undefined,
      // 本地兜底链路支持 sortByPrice（云函数忽略该字段），
      // 同时下面再对已加载数据做一次前端排序，保证两条链路顺序一致
      sortByPrice: sortMode.value === 'price' ? true : undefined,
      page: targetPage,
      pageSize: PAGE_SIZE
    })

    const rows = Array.isArray(res) ? res : ((res && res.list) || [])
    const merged = reset ? rows : [...list.value, ...rows]
    // 价格排序由前端处理（接口契约只提供 sortByRating）
    list.value = sortMode.value === 'price' ? sortByPriceAsc(merged) : merged

    if (res && typeof res.total === 'number') {
      total.value = res.total
    } else if (reset) {
      total.value = rows.length
    }

    hasMore.value = res && typeof res.hasMore === 'boolean' ? res.hasMore : rows.length >= PAGE_SIZE
    page.value = targetPage + 1
    everLoaded.value = true
  } catch (e) {
    loadError.value = '菜品加载失败，请检查网络后重试'
    uni.showToast({ title: '加载失败，请稍后重试', icon: 'none' })
  } finally {
    loading.value = false
    firstLoading.value = false
  }
}

function onSearch() {
  loadList(true)
}

function clearKeyword() {
  keyword.value = ''
  loadList(true)
}

function onCanteenChange(e) {
  const val = canteenOptions.value[Number(e.detail.value)]
  filters.value.canteen = !val || val === '全部食堂' ? '' : val
  loadList(true)
}

function onCategoryChange(e) {
  const val = categoryOptions.value[Number(e.detail.value)]
  filters.value.category = !val || val === '全部分类' ? '' : val
  loadList(true)
}

function onSortChange(value) {
  if (sortMode.value === value) return
  sortMode.value = value
  loadList(true)
}

function resetFilter() {
  keyword.value = ''
  sortMode.value = 'default'
  filters.value = { canteen: '', category: '' }
  loadList(true)
}

function retry() {
  if (!everLoaded.value) {
    init()
    return
  }
  loadList(true)
}

function goDetail(id) {
  if (!id) return
  uni.navigateTo({ url: `/pages/dish/dish?id=${id}` })
}

/* ===== 工具函数 ===== */
function sortByPriceAsc(rows) {
  return [...rows].sort((a, b) => Number(a.price || 0) - Number(b.price || 0))
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

function safeDecode(value) {
  if (!value) return ''
  try {
    return decodeURIComponent(String(value))
  } catch (e) {
    return String(value)
  }
}

async function safeCall(fn, fallback) {
  try {
    const res = await fn()
    return res === undefined || res === null ? fallback : res
  } catch (e) {
    return fallback
  }
}
</script>

<style scoped>
.dish-list-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: 30rpx;
}

/* 搜索 */
.search-bar {
  display: flex;
  align-items: center;
  padding: 20rpx 24rpx;
  background: #fff;
}

.search-box {
  flex: 1;
  display: flex;
  align-items: center;
  height: 72rpx;
  background: #f5f5f5;
  border-radius: 36rpx;
  padding: 0 24rpx;
}

.search-icon {
  font-size: 26rpx;
  margin-right: 12rpx;
}

.search-input {
  flex: 1;
  height: 72rpx;
  font-size: 28rpx;
  color: #333;
}

.search-clear {
  font-size: 26rpx;
  color: #bbb;
  padding: 0 4rpx;
}

.search-btn {
  font-size: 28rpx;
  color: #FF6B35;
  font-weight: 500;
  padding-left: 20rpx;
}

/* 筛选 */
.filter-bar {
  display: flex;
  gap: 20rpx;
  padding: 0 24rpx 20rpx;
  background: #fff;
}

.filter-picker {
  flex: 1;
}

.filter-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64rpx;
  padding: 0 20rpx;
  background: #f5f5f5;
  border-radius: 16rpx;
}

.filter-item.active {
  background: #FFF0EB;
}

.filter-text {
  font-size: 26rpx;
  color: #666;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.filter-item.active .filter-text {
  color: #FF6B35;
  font-weight: 500;
}

.filter-arrow {
  font-size: 22rpx;
  color: #bbb;
  margin-left: 8rpx;
}

/* 排序 */
.sort-bar {
  display: flex;
  gap: 16rpx;
  padding: 16rpx 24rpx;
  background: #fff;
  border-top: 1rpx solid #f0f0f0;
}

.sort-item {
  font-size: 24rpx;
  color: #666;
  padding: 8rpx 22rpx;
  background: #f5f5f5;
  border-radius: 24rpx;
}

.sort-item.active {
  color: #fff;
  background: #FF6B35;
}

/* 列表 */
.dish-list {
  padding: 20rpx 24rpx 0;
}

.list-count {
  font-size: 24rpx;
  color: #999;
  padding: 0 6rpx 16rpx;
}

.dish-card {
  display: flex;
  background: #fff;
  border-radius: 20rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.dish-img-wrap {
  margin-right: 24rpx;
  flex-shrink: 0;
}

.dish-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.dish-title-row {
  display: flex;
  align-items: center;
}

.dish-name {
  font-size: 30rpx;
  font-weight: bold;
  color: #333;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.dish-new {
  margin-left: 12rpx;
  font-size: 18rpx;
  color: #fff;
  background: #FF6B35;
  padding: 2rpx 10rpx;
  border-radius: 6rpx;
  flex-shrink: 0;
}

.dish-loc {
  font-size: 22rpx;
  color: #999;
  margin-top: 8rpx;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.dish-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
  margin-top: 10rpx;
}

.tag {
  font-size: 20rpx;
  color: #FF6B35;
  background: #FFF0EB;
  padding: 2rpx 12rpx;
  border-radius: 8rpx;
}

.dish-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
  padding-top: 12rpx;
}

.dish-price {
  font-size: 30rpx;
  font-weight: bold;
  color: #FF6B35;
}

.dish-rating {
  font-size: 24rpx;
  color: #FF9800;
}

.list-footer {
  text-align: center;
  padding: 20rpx 0 40rpx;
  font-size: 24rpx;
  color: #999;
}

/* 状态 */
.state-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 140rpx 60rpx;
}

.state-icon {
  font-size: 80rpx;
  margin-bottom: 20rpx;
}

.state-text {
  font-size: 28rpx;
  color: #999;
  text-align: center;
  line-height: 1.6;
}

.state-btn {
  margin-top: 30rpx;
  padding: 14rpx 44rpx;
  font-size: 26rpx;
  color: #FF6B35;
  border: 2rpx solid #FF6B35;
  border-radius: 32rpx;
}
</style>
