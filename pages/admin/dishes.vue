<template>
  <view class="dishes-page">
    <!-- ================= 顶部标题 ================= -->
    <view class="hero">
      <view class="hero-main">
        <text class="hero-title">🍜 菜品管理</text>
        <text class="hero-sub">共 {{ total }} 道菜品 · 可搜索 / 筛选 / 编辑</text>
      </view>
    </view>

    <!-- ================= 工具条 ================= -->
    <view class="toolbar">
      <view class="search-box">
        <text class="search-icon">🔍</text>
        <input
          class="search-input"
          v-model="keyword"
          type="text"
          confirm-type="search"
          placeholder="搜索菜名"
          placeholder-class="ph"
          @input="onKeywordInput"
          @confirm="reload"
        />
        <text class="search-clear" v-if="keyword" @click="clearKeyword">✕</text>
      </view>

      <picker
        class="picker-box"
        mode="selector"
        :range="canteenRange"
        :value="canteenIndex"
        @change="onCanteenChange"
      >
        <view class="picker-inner">
          <text class="picker-text">{{ canteenRange[canteenIndex] }}</text>
          <text class="picker-arrow">▾</text>
        </view>
      </picker>
    </view>

    <!-- ================= 加载中 ================= -->
    <view class="state-box" v-if="loading">
      <text class="state-emoji">⏳</text>
      <text class="state-text">菜品加载中…</text>
    </view>

    <!-- ================= 加载失败 ================= -->
    <view class="state-box" v-else-if="error">
      <text class="state-emoji">😵</text>
      <text class="state-text">{{ error }}</text>
      <view class="retry-btn" @click="reload">重新加载</view>
    </view>

    <!-- ================= 空态 ================= -->
    <view class="state-box" v-else-if="!list.length">
      <text class="state-emoji">🍽️</text>
      <text class="state-text">
        {{ keyword || currentCanteen() ? '没有符合条件的菜品，换个关键词试试' : '菜品库还是空的，点右下角 + 新增第一道菜' }}
      </text>
    </view>

    <!-- ================= 列表 ================= -->
    <view class="list" v-else>
      <view class="item" v-for="d in list" :key="dishId(d)">
        <DishImage :dish="d" :size="120" :radius="14" />

        <view class="item-main">
          <view class="item-title">
            <text class="item-name">{{ d.name }}</text>
            <text class="status-tag" :class="d.status === 1 ? 'on' : 'off'">
              {{ d.status === 1 ? '上架' : '下架' }}
            </text>
          </view>
          <text class="item-sub">{{ formatLocation(d) || '位置待完善' }}</text>
          <view class="item-meta">
            <text class="cat">{{ d.category || '其他' }}</text>
            <text class="price">{{ formatPrice(d.price) }}</text>
            <text class="rating">★ {{ ratingText(d.rating) }}</text>
          </view>
        </view>

        <view class="item-ops">
          <view class="op-btn edit" @click="goEdit(dishId(d))">编辑</view>
          <view class="op-btn del" @click="confirmRemove(d)">删除</view>
        </view>
      </view>

      <view class="load-tip" v-if="loadingMore">加载中…</view>
      <view class="load-tip" v-else-if="hasMore" @click="loadMore">上拉或点击加载更多</view>
      <view class="load-tip no-more" v-else>没有更多了</view>
    </view>

    <!-- ================= 悬浮新增按钮 ================= -->
    <view class="fab" @click="goEdit('')">＋</view>
  </view>
</template>

<script setup>
/**
 * 菜品管理列表
 *
 * 数据链路：dishApi.list({ keyword, canteen, page, pageSize })
 * 分页为触底加载；编辑/新增跳转 dish-edit，删除二次确认后调 dishApi.remove。
 * 菜品没有真实图片，统一渲染 emoji 圆角渐变方块。
 */
import { ref } from 'vue'
import { onLoad, onShow, onReachBottom, onPullDownRefresh } from '@dcloudio/uni-app'
import { dishApi } from '@/api/index.js'
import { formatPrice, ensureAdmin, formatLocation } from '@/common/utils.js'
import DishImage from '@/components/DishImage/DishImage.vue'

const PAGE_SIZE = 10

const loading = ref(false)
const loadingMore = ref(false)
const error = ref('')
const list = ref([])
const total = ref(0)
const page = ref(1)
const hasMore = ref(false)
const keyword = ref('')
const canteenRange = ref(['全部食堂'])
const canteenIndex = ref(0)

let denied = false
let inited = false
let searchTimer = null

/* ------------------------------ 小工具 ------------------------------ */

/** 云函数返回 _id、本地数据返回 id，这里统一取值 */
function dishId(d) {
  return d.id || d._id || ''
}

function ratingText(rating) {
  const v = Number(rating || 0)
  return v ? v.toFixed(1) : '0.0'
}

/** 当前选中的食堂（'' 表示全部） */
function currentCanteen() {
  return canteenIndex.value === 0 ? '' : canteenRange.value[canteenIndex.value]
}

function toast(title) {
  uni.showToast({ title, icon: 'none' })
}

/* ------------------------------ 数据加载 ------------------------------ */

/** 拉取食堂筛选项 */
async function loadCanteens() {
  try {
    const res = await dishApi.canteens()
    const raw = (res && res.list) || []
    const names = raw
      .map((c) => (typeof c === 'string' ? c : c && (c.name || c.canteen)))
      .filter((n) => !!n)
    canteenRange.value = ['全部食堂', ...names]
    if (canteenIndex.value > names.length) canteenIndex.value = 0
  } catch (e) {
    // 食堂列表失败不影响搜索与列表，保持「全部食堂」
    canteenRange.value = ['全部食堂']
    canteenIndex.value = 0
  }
}

/** 加载第 targetPage 页数据 */
async function fetchPage(targetPage, append) {
  if (append) loadingMore.value = true
  else loading.value = true
  error.value = ''

  try {
    const res = await dishApi.list({
      keyword: keyword.value.trim(),
      canteen: currentCanteen(),
      page: targetPage,
      pageSize: PAGE_SIZE
    })

    const rows = (res && res.list) || []
    list.value = append ? [...list.value, ...rows] : rows
    total.value = Number((res && res.total) || list.value.length)
    page.value = targetPage

    if (typeof res.hasMore === 'boolean') {
      hasMore.value = res.hasMore
    } else {
      hasMore.value = list.value.length < total.value
    }
  } catch (e) {
    const msg = (e && e.message) || '菜品加载失败'
    if (append) {
      toast('加载更多失败：' + msg)
    } else {
      error.value = msg
      list.value = []
      toast('菜品加载失败')
    }
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

/** 回到第一页重新加载 */
async function reload() {
  if (denied) return
  const canteen = currentCanteen()
  // 选中的食堂不在最新列表里时回落到「全部食堂」
  if (canteen && !canteenRange.value.includes(canteen)) canteenIndex.value = 0
  await fetchPage(1, false)
}

/** 触底加载下一页 */
function loadMore() {
  if (denied || loading.value || loadingMore.value || !hasMore.value) return
  fetchPage(page.value + 1, true)
}

/* ------------------------------ 交互 ------------------------------ */

/** 搜索输入防抖，避免每敲一个字都请求 */
function onKeywordInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchTimer = null
    fetchPage(1, false)
  }, 400)
}

function clearKeyword() {
  keyword.value = ''
  if (searchTimer) {
    clearTimeout(searchTimer)
    searchTimer = null
  }
  fetchPage(1, false)
}

function onCanteenChange(e) {
  canteenIndex.value = Number(e.detail.value) || 0
  fetchPage(1, false)
}

function goEdit(id) {
  const url = id ? `/pages/admin/dish-edit?id=${id}` : '/pages/admin/dish-edit'
  uni.navigateTo({ url })
}

/** 删除：二次确认后才调用接口 */
function confirmRemove(d) {
  const id = dishId(d)
  if (!id) {
    toast('该菜品缺少 id，无法删除')
    return
  }
  uni.showModal({
    title: '删除菜品',
    content: `确定删除「${d.name}」吗？删除后同学将无法再看到这道菜`,
    confirmColor: '#ff4d4f',
    success: async (res) => {
      if (!res.confirm) return
      try {
        await dishApi.remove(id)
        list.value = list.value.filter((item) => dishId(item) !== id)
        total.value = Math.max(total.value - 1, 0)
        uni.showToast({ title: '已删除', icon: 'success' })
      } catch (e) {
        toast('删除失败：' + ((e && e.message) || '请检查云端配置'))
      }
    }
  })
}

/* ------------------------------ 生命周期 ------------------------------ */

onLoad(async () => {
  // 服务端验签把守（凭证过期 / 口令已改都会被拒），不能只看本机 role
  if (!(await ensureAdmin())) {
    denied = true
    return
  }
  loadCanteens()
  fetchPage(1, false)
})

onShow(() => {
  // 从 dish-edit 返回后刷新，新增/编辑结果立刻可见
  if (!inited) {
    inited = true
    return
  }
  if (!denied) fetchPage(1, false)
})

onReachBottom(() => {
  loadMore()
})

onPullDownRefresh(() => {
  const done = () => uni.stopPullDownRefresh()
  if (denied) {
    done()
    return
  }
  Promise.all([loadCanteens(), fetchPage(1, false)]).then(done).catch(done)
})
</script>

<style scoped>
.dishes-page {
  padding: 24rpx;
  padding-bottom: 180rpx;
  background: #f5f5f5;
  min-height: 100vh;
  box-sizing: border-box;
}

/* ---------------- 顶部 ---------------- */
.hero {
  display: flex;
  align-items: center;
  background: linear-gradient(135deg, #333333, #4d4d4d);
  border-radius: 24rpx;
  padding: 30rpx;
  margin-bottom: 20rpx;
}

.hero-title {
  display: block;
  font-size: 36rpx;
  font-weight: bold;
  color: #fff;
}

.hero-sub {
  display: block;
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.65);
  margin-top: 8rpx;
}

/* ---------------- 工具条 ---------------- */
.toolbar {
  display: flex;
  align-items: center;
  margin-bottom: 20rpx;
}

.search-box {
  flex: 1;
  display: flex;
  align-items: center;
  height: 76rpx;
  background: #fff;
  border-radius: 38rpx;
  padding: 0 24rpx;
  margin-right: 16rpx;
}

.search-icon {
  font-size: 26rpx;
  margin-right: 10rpx;
}

.search-input {
  flex: 1;
  height: 76rpx;
  font-size: 27rpx;
  color: #333;
}

.ph {
  color: #bbb;
  font-size: 26rpx;
}

.search-clear {
  font-size: 24rpx;
  color: #bbb;
  padding: 0 6rpx 0 14rpx;
}

.picker-box {
  width: 230rpx;
}

.picker-inner {
  height: 76rpx;
  background: #fff;
  border-radius: 38rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 20rpx;
}

.picker-text {
  font-size: 25rpx;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker-arrow {
  font-size: 22rpx;
  color: #999;
  margin-left: 8rpx;
}

/* ---------------- 状态 ---------------- */
.state-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 140rpx 40rpx;
  background: #fff;
  border-radius: 24rpx;
}

.state-emoji {
  font-size: 76rpx;
}

.state-text {
  font-size: 26rpx;
  color: #999;
  margin-top: 18rpx;
  text-align: center;
  line-height: 1.6;
}

.retry-btn {
  margin-top: 30rpx;
  padding: 16rpx 48rpx;
  background: #ff6b35;
  color: #fff;
  border-radius: 40rpx;
  font-size: 26rpx;
}

/* ---------------- 列表 ---------------- */
.list {
  display: flex;
  flex-direction: column;
}

.item {
  display: flex;
  align-items: center;
  background: #fff;
  border-radius: 22rpx;
  padding: 24rpx;
  margin-bottom: 18rpx;
}

.emoji-box {
  margin-right: 22rpx;
  flex-shrink: 0;
}

.item-main {
  flex: 1;
  min-width: 0;
}

.item-title {
  display: flex;
  align-items: center;
}

.item-name {
  font-size: 29rpx;
  font-weight: bold;
  color: #333;
  max-width: 300rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-tag {
  font-size: 19rpx;
  padding: 3rpx 12rpx;
  border-radius: 16rpx;
  margin-left: 12rpx;
}

.status-tag.on {
  background: #e8f8f0;
  color: #2ba58c;
}

.status-tag.off {
  background: #fdecec;
  color: #e64340;
}

.item-sub {
  display: block;
  font-size: 22rpx;
  color: #999;
  margin-top: 8rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-meta {
  display: flex;
  align-items: center;
  margin-top: 10rpx;
}

.cat {
  font-size: 19rpx;
  color: #888;
  background: #f5f5f5;
  border-radius: 10rpx;
  padding: 3rpx 12rpx;
  margin-right: 14rpx;
}

.price {
  font-size: 25rpx;
  color: #ff6b35;
  font-weight: bold;
  margin-right: 16rpx;
}

.rating {
  font-size: 21rpx;
  color: #ff9800;
}

/* ---------------- 操作按钮 ---------------- */
.item-ops {
  display: flex;
  flex-direction: column;
  margin-left: 12rpx;
}

.op-btn {
  font-size: 23rpx;
  padding: 10rpx 22rpx;
  border-radius: 14rpx;
  text-align: center;
}

.op-btn.edit {
  background: #eef4ff;
  color: #3b6fd6;
  margin-bottom: 12rpx;
}

.op-btn.del {
  background: #fdecec;
  color: #e64340;
}

/* ---------------- 加载更多 ---------------- */
.load-tip {
  text-align: center;
  font-size: 24rpx;
  color: #999;
  padding: 24rpx 0;
}

.load-tip.no-more {
  color: #ccc;
}

/* ---------------- 悬浮按钮 ---------------- */
.fab {
  position: fixed;
  right: 40rpx;
  bottom: 70rpx;
  width: 108rpx;
  height: 108rpx;
  border-radius: 54rpx;
  background: linear-gradient(135deg, #ff8c5a, #ff6b35);
  color: #fff;
  font-size: 56rpx;
  line-height: 108rpx;
  text-align: center;
  box-shadow: 0 12rpx 28rpx rgba(255, 107, 53, 0.4);
  z-index: 20;
}
</style>
