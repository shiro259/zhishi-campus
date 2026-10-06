<template>
  <view class="dishes-page">
    <!-- ================= 顶部标题 ================= -->
    <view class="hero">
      <text class="hero-title">菜品管理</text>
      <text class="hero-sub">共 {{ total }} 道菜品 · 可搜索 / 筛选 / 编辑</text>
    </view>

    <!-- ================= 工具条 ================= -->
    <view class="toolbar">
      <view class="search-box">
        <Icon name="search" :size="30" />
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
        <view class="search-clear" v-if="keyword" @click="clearKeyword">
          <Icon name="close" :size="26" />
        </view>
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
          <Icon name="down" :size="24" />
        </view>
      </picker>
    </view>

    <!-- ================= 加载中 ================= -->
    <view class="state-box" v-if="loading">
      <Icon name="clock" :size="72" />
      <text class="state-text">菜品加载中…</text>
    </view>

    <!-- ================= 加载失败 ================= -->
    <view class="state-box" v-else-if="error">
      <Icon name="warning" :size="72" />
      <text class="state-text">{{ error }}</text>
      <view class="retry-btn" @click="reload">重新加载</view>
    </view>

    <!-- ================= 空态 ================= -->
    <view class="state-box" v-else-if="!list.length">
      <Icon name="bowl" :size="72" />
      <text class="state-text">
        {{ keyword || currentCanteen() ? '没有符合条件的菜品，换个关键词试试' : '菜品库还是空的，点右下角 + 新增第一道菜' }}
      </text>
    </view>

    <!-- ================= 列表 ================= -->
    <view class="list" v-else>
      <view class="item" v-for="d in list" :key="dishId(d)">
        <DishImage :dish="d" :size="120" :radius="16" />

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
          </view>
        </view>

        <view class="item-ops">
          <view class="op-btn" @click="goEdit(dishId(d))">
            <Icon name="edit" :size="34" />
          </view>
          <view class="op-btn" @click="confirmRemove(d)">
            <Icon name="trash" :size="34" color="#d93a3a" />
          </view>
        </view>
      </view>

      <view class="load-tip" v-if="loadingMore">加载中…</view>
      <view class="load-tip" v-else-if="hasMore" @click="loadMore">上拉或点击加载更多</view>
      <view class="load-tip no-more" v-else>没有更多了</view>
    </view>

    <!-- ================= 悬浮新增按钮 ================= -->
    <view class="fab" @click="goEdit('')">
      <Icon name="plus" :size="48" color="#ffffff" />
    </view>
  </view>
</template>

<script setup>
/**
 * 菜品管理列表
 *
 * 数据链路：dishApi.list({ keyword, canteen, page, pageSize })
 * 分页为触底加载；编辑/新增跳转 dish-edit，删除二次确认后调 dishApi.remove。
 * 菜品缩略图统一由 DishImage 渲染（有图显示照片，无图回退 emoji 方块）。
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
    confirmColor: '#d93a3a',
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

<style lang="scss" scoped>
@import '@/common/tokens.scss';
.dishes-page {
  min-height: 100vh;
  background: $canvas;
  padding: $gap-page;
  padding-bottom: 200rpx;
  box-sizing: border-box;
}

/* ---------------- 顶部 ---------------- */
.hero {
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
  padding: $gap-card;
  box-shadow: $shadow-card;
}

.hero-title {
  display: block;
  font-size: $fs-title;
  font-weight: $fw-bold;
  color: $ink;
}

.hero-sub {
  display: block;
  margin-top: $gap-sm;
  font-size: $fs-cap;
  color: $gray6;
}

/* ---------------- 工具条 ---------------- */
.toolbar {
  display: flex;
  align-items: center;
  margin-top: $gap;
}

.search-box {
  flex: 1;
  display: flex;
  align-items: center;
  height: $h-btn-sm;
  background: $surface-sunken;
  border-radius: $radius-pill;
  padding: 0 $gap;
  color: $gray6;
}

.search-input {
  flex: 1;
  height: $h-btn-sm;
  margin-left: $gap-sm;
  font-size: $fs-body;
  color: $ink;
}

.ph {
  color: $gray4;
  font-size: $fs-body;
}

.search-clear {
  padding: 0 4rpx 0 $gap-sm;
  color: $gray4;
}

.picker-box {
  width: 220rpx;
  margin-left: $gap-sm;
}

.picker-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  height: $h-btn-sm;
  padding: 0 16rpx;
  background: $surface-sunken;
  border-radius: $radius-pill;
  color: $gray6;
}

.picker-text {
  font-size: $fs-cap;
  color: $gray7;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-right: 8rpx;
}

/* ---------------- 状态 ---------------- */
.state-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: $gap;
  padding: 120rpx $gap-page;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
  box-shadow: $shadow-card;
  color: $gray4;
}

.state-text {
  margin-top: $gap;
  font-size: $fs-sub;
  color: $gray6;
  text-align: center;
  line-height: 1.6;
}

.retry-btn {
  margin-top: $gap-lg;
  height: $h-btn-sm;
  line-height: $h-btn-sm;
  padding: 0 48rpx;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-pill;
  font-size: $fs-sub;
  color: $gray7;
}

/* ---------------- 列表 ---------------- */
.list {
  display: flex;
  flex-direction: column;
  margin-top: $gap;
}

.item {
  display: flex;
  align-items: center;
  margin-bottom: $gap-sm;
  padding: $gap-card;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
  box-shadow: $shadow-card;
}

.item-main {
  flex: 1;
  min-width: 0;
  margin-left: $gap;
}

.item-title {
  display: flex;
  align-items: center;
}

.item-name {
  font-size: $fs-body;
  font-weight: $fw-medium;
  color: $ink;
  max-width: 280rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-tag {
  height: 44rpx;
  line-height: 44rpx;
  padding: 0 18rpx;
  margin-left: $gap-sm;
  border-radius: $radius-pill;
  font-size: $fs-tag;
  flex-shrink: 0;
}

.status-tag.on {
  background: $success-soft;
  color: $success;
}

.status-tag.off {
  background: $danger-soft;
  color: $danger;
}

.item-sub {
  display: block;
  margin-top: 8rpx;
  font-size: $fs-cap;
  color: $gray6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-meta {
  display: flex;
  align-items: center;
  margin-top: $gap-sm;
}

.cat {
  height: 40rpx;
  line-height: 40rpx;
  padding: 0 16rpx;
  margin-right: $gap-sm;
  background: $surface-sunken;
  border-radius: $radius-pill;
  font-size: $fs-tag;
  color: $gray6;
}

.price {
  font-size: $fs-body;
  font-weight: $fw-bold;
  color: $brand;
}

/* ---------------- 操作按钮 ---------------- */
.item-ops {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  margin-left: $gap-sm;
}

.op-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  background: $surface-sunken;
  color: $gray7;
}

.op-btn + .op-btn {
  margin-left: $gap-sm;
}

/* ---------------- 加载更多 ---------------- */
.load-tip {
  padding: 24rpx 0;
  text-align: center;
  font-size: $fs-cap;
  color: $gray6;
}

.load-tip.no-more {
  color: $gray4;
}

/* ---------------- 悬浮按钮 ---------------- */
.fab {
  position: fixed;
  right: 40rpx;
  bottom: 70rpx;
  width: 104rpx;
  height: 104rpx;
  border-radius: 50%;
  background: $brand;
  box-shadow: $shadow-brand;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
}
</style>
