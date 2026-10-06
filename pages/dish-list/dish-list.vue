<template>
  <view class="page">
    <!-- ==================== 顶部吸附区 ==================== -->
    <view class="sticky">
      <!-- 搜索：胶囊输入框 + 左侧搜索图标 + 有内容时右侧清空 -->
      <view class="search-row">
        <view class="search">
          <Icon name="search" :size="30" color="#B8B2AA" />
          <input
            class="search-input"
            type="text"
            v-model="keyword"
            placeholder="搜索菜品名称"
            placeholder-class="search-ph"
            confirm-type="search"
            @confirm="onSearch"
          />
          <view class="search-clear" v-if="keyword" @click="clearKeyword">
            <Icon name="close" :size="28" color="#8A8580" />
          </view>
        </view>
        <text class="search-btn" @click="onSearch">搜索</text>
      </view>

      <!-- 筛选：文字 + 下拉箭头的轻量胶囊（自绘外观包住 picker） -->
      <view class="filters">
        <picker
          class="picker"
          mode="selector"
          :range="canteenOptions"
          :value="canteenIndex"
          @change="onCanteenChange"
        >
          <view class="pill" :class="{ 'pill-on': !!filters.canteen }">
            <text class="pill-text">{{ filters.canteen || '全部食堂' }}</text>
            <Icon name="down" :size="24" :color="filters.canteen ? '#FF5A36' : '#B8B2AA'" />
          </view>
        </picker>

        <picker
          class="picker"
          mode="selector"
          :range="categoryOptions"
          :value="categoryIndex"
          @change="onCategoryChange"
        >
          <view class="pill" :class="{ 'pill-on': !!filters.category }">
            <text class="pill-text">{{ filters.category || '全部分类' }}</text>
            <Icon name="down" :size="24" :color="filters.category ? '#FF5A36' : '#B8B2AA'" />
          </view>
        </picker>
      </view>

      <!-- 排序：三个纯文字 tab -->
      <view class="sorts">
        <view
          class="sort"
          v-for="s in sortOptions"
          :key="s.value"
          :class="{ 'sort-on': sortMode === s.value }"
          @click="onSortChange(s.value)"
        >
          {{ s.label }}
        </view>
      </view>
    </view>

    <!-- 首次加载中 -->
    <view class="state" v-if="firstLoading">
      <view class="spinner" />
      <text class="state-main">正在加载菜单…</text>
    </view>

    <!-- 请求失败 -->
    <view class="state" v-else-if="loadError && !list.length">
      <Icon name="warning" :size="72" color="#D8D3CB" />
      <text class="state-main">{{ loadError }}</text>
      <text class="state-sub">检查一下网络，或稍后再试</text>
      <view class="btn-ghost" @click="retry">重新加载</view>
    </view>

    <!-- 空态 -->
    <view class="state" v-else-if="!list.length">
      <Icon name="search" :size="72" color="#D8D3CB" />
      <text class="state-main">没有找到符合条件的菜品</text>
      <text class="state-sub">换个关键词，或者把筛选条件放宽一点</text>
      <view class="btn-ghost" @click="resetFilter">重置筛选条件</view>
    </view>

    <!-- 菜品网格 -->
    <view v-else>
      <text class="count">共 {{ total }} 道</text>

      <view class="grid">
        <view class="card" v-for="d in list" :key="d.id" @click="goDetail(d.id)">
          <view class="card-img">
            <DishImage :dish="d" :size="220" :radius="0" />
            <text class="badge" v-if="d.is_new">NEW</text>
          </view>

          <view class="card-body">
            <text class="card-name">{{ d.name }}</text>
            <text class="card-loc">{{ d.canteen || '未知食堂' }} · {{ d.window || '未知窗口' }}</text>

            <view class="card-foot">
              <text class="price">{{ money(d.price) }}</text>
              <view class="score">
                <Icon name="star" :size="24" color="#FF5A36" />
                <text class="score-num">{{ ratingText(d.rating) }}</text>
              </view>
            </view>
          </view>
        </view>
      </view>

      <view class="footer">
        <view class="footer-loading" v-if="loading">
          <view class="spinner spinner-sm" />
          <text class="footer-text">加载中…</text>
        </view>
        <text class="footer-text" v-else-if="hasMore">上拉加载更多</text>
        <text class="footer-text" v-else>没有更多菜品了</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onLoad, onShow, onReachBottom, onPullDownRefresh } from '@dcloudio/uni-app'
import { dishApi } from '@/api/index.js'
import DishImage from '@/components/DishImage/DishImage.vue'

const PAGE_SIZE = 10

const sortOptions = [
  { value: 'default', label: '默认' },
  { value: 'rating', label: '评分' },
  { value: 'price', label: '价格' }
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

<style lang="scss" scoped>
@import '@/common/tokens.scss';
.page {
  min-height: 100vh;
  background: $canvas;
  padding: $gap-page;
}

/* ==================== 顶部吸附区 ==================== */
.sticky {
  position: sticky;
  top: 0;
  z-index: 10;
  background: $canvas;
  padding-bottom: $gap;
}

/* 搜索 */
.search-row {
  display: flex;
  align-items: center;
}

.search {
  flex: 1;
  display: flex;
  align-items: center;
  height: $h-input;
  padding: 0 $gap-card;
  background: $surface-sunken;
  border-radius: $radius-pill;
  box-sizing: border-box;
}

.search-input {
  flex: 1;
  height: $h-input;
  margin-left: $gap-sm;
  font-size: $fs-body;
  color: $ink;
}

.search-ph {
  color: $gray4;
  font-size: $fs-body;
}

.search-clear {
  display: flex;
  align-items: center;
  padding-left: $gap-sm;
}

.search-btn {
  margin-left: $gap;
  font-size: $fs-sub;
  color: $brand;
  font-weight: $fw-medium;
}

/* 筛选胶囊 */
.filters {
  display: flex;
  align-items: center;
  margin-top: $gap;
}

.picker {
  flex-shrink: 0;
}

.picker + .picker {
  margin-left: $gap-sm;
}

.pill {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 0 24rpx;
  height: 56rpx;
  line-height: 56rpx;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-pill;
  font-size: $fs-cap;
  color: $gray7;
  box-sizing: border-box;
}

.pill-text {
  max-width: 260rpx;
  line-height: 56rpx;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.pill-on {
  background: $brand-soft;
  border-color: $brand-line;
  color: $brand;
  font-weight: $fw-medium;
}

/* 排序 */
.sorts {
  display: flex;
  align-items: center;
  margin-top: $gap;
}

.sort {
  margin-right: $gap-lg;
  font-size: $fs-sub;
  color: $gray6;
}

.sort-on {
  color: $ink;
  font-weight: $fw-bold;
}

/* ==================== 结果数 ==================== */
.count {
  display: block;
  margin-bottom: $gap;
  font-size: $fs-cap;
  color: $gray6;
}

/* ==================== 两列卡片网格 ==================== */
.grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
}

.card {
  width: 48.5%;
  margin-bottom: $gap;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
  box-shadow: $shadow-card;
  overflow: hidden;
  box-sizing: border-box;
}

.card-img {
  position: relative;
}

.card-img :deep(.dish-image) {
  width: 100% !important;
  height: 220rpx !important;
}

.badge {
  position: absolute;
  top: 12rpx;
  left: 12rpx;
  height: 36rpx;
  line-height: 36rpx;
  padding: 0 14rpx;
  background: $brand;
  color: #fff;
  font-size: $fs-tag;
  border-radius: $radius-pill;
}

.card-body {
  padding: $gap-card;
}

.card-name {
  display: block;
  font-size: $fs-card;
  font-weight: $fw-bold;
  color: $ink;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.card-loc {
  display: block;
  margin-top: 8rpx;
  font-size: $fs-cap;
  color: $gray6;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: $gap-sm;
}

.price {
  font-size: $fs-card;
  font-weight: $fw-bold;
  color: $brand;
}

.score {
  display: flex;
  align-items: center;
  gap: 4rpx;
}

.score-num {
  font-size: $fs-cap;
  color: $gray6;
}

/* ==================== 列表尾部 ==================== */
.footer {
  padding: $gap 0 40rpx;
  text-align: center;
}

.footer-loading {
  display: flex;
  align-items: center;
  justify-content: center;
}

.footer-text {
  font-size: $fs-cap;
  color: $gray6;
}

.footer-loading .footer-text {
  margin-left: 10rpx;
}

/* ==================== 加载 / 空态 ==================== */
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
  padding: 140rpx $gap 0;
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

.btn-ghost {
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
</style>
