<template>
  <view class="page">
    <!-- ==================== 自定义导航 ==================== -->
    <view class="nav" :style="{ paddingTop: statusBarHeight + 'px' }">
      <view class="nav-inner">
        <view class="nav-left">
          <text class="nav-greet">{{ greeting }}</text>
          <text class="nav-name">{{ nickname }}</text>
        </view>
        <view class="nav-right" @click="goUser">
          <text class="nav-avatar">{{ avatarText }}</text>
        </view>
      </view>

      <!-- 搜索入口 -->
      <view class="search" @click="goSearch">
        <Icon name="search" :size="30" color="#B8B2AA" />
        <text class="search-text">搜索菜品、窗口</text>
      </view>
    </view>

    <!-- ==================== AI 推荐主入口 ==================== -->
    <view class="ai-card" @click="goRecommend">
      <view class="ai-main">
        <view class="ai-badge">
          <Icon name="sparkle" :size="26" color="#FF5A36" />
          <text class="ai-badge-text">AI 智能推荐</text>
        </view>
        <text class="ai-title">不知道吃啥？</text>
        <text class="ai-sub">说口味 · 报预算 · 忌口自动规避</text>
      </view>
      <view class="ai-go">
        <Icon name="right" :size="34" color="#FFFFFF" />
      </view>
    </view>

    <!-- 口味快捷入口：带着偏好直接进推荐页 -->
    <scroll-view class="quick-scroll" scroll-x :show-scrollbar="false">
      <view
        class="quick-chip"
        v-for="t in quickTastes"
        :key="t"
        @click="goRecommendWithTaste(t)"
      >{{ t }}</view>
    </scroll-view>

    <!-- ==================== 食堂入口 ==================== -->
    <view class="section" v-if="canteens.length">
      <view class="section-head">
        <text class="section-title">食堂</text>
      </view>
      <view class="canteen-list">
        <view
          class="canteen"
          v-for="c in canteens"
          :key="c"
          @click="goCanteen(c)"
        >
          <text class="canteen-name">{{ c }}</text>
          <Icon name="right" :size="26" color="#B8B2AA" />
        </view>
      </view>
    </view>

    <!-- ==================== 今日热门 ==================== -->
    <view class="section" v-if="hotList.length">
      <view class="section-head">
        <text class="section-title">今日热门</text>
        <text class="section-more" @click="goSearch">全部菜单</text>
      </view>
      <scroll-view class="hot-scroll" scroll-x :show-scrollbar="false">
        <view class="hot-item" v-for="d in hotList" :key="dishKey(d)" @click="goDetail(d)">
          <view class="hot-img">
            <DishImage :dish="d" :size="240" :radius="20" />
            <view class="hot-tag" v-if="d.is_new">新品</view>
          </view>
          <text class="hot-name">{{ d.name }}</text>
          <view class="hot-meta">
            <text class="hot-price">¥{{ money(d.price) }}</text>
            <view class="hot-rating">
              <Icon name="star" :size="22" color="#FF5A36" />
              <text class="hot-rating-text">{{ rating(d.rating) }}</text>
            </view>
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- ==================== 高分红榜 ==================== -->
    <view class="section" v-if="goodList.length">
      <view class="section-head">
        <text class="section-title">高分红榜</text>
      </view>
      <view class="goods">
        <view
          class="good"
          v-for="(d, i) in goodList"
          :key="dishKey(d)"
          @click="goDetail(d)"
        >
          <text class="good-rank" :class="{ 'good-rank-top': i < 3 }">{{ i + 1 }}</text>
          <DishImage :dish="d" :size="96" :radius="16" />
          <view class="good-body">
            <text class="good-name">{{ d.name }}</text>
            <text class="good-loc">{{ d.canteen }} · {{ d.window }}</text>
          </view>
          <view class="good-right">
            <text class="good-price">¥{{ money(d.price) }}</text>
            <text class="good-score">{{ rating(d.rating) }} 分</text>
          </view>
        </view>
      </view>
    </view>

    <!-- ==================== 新品尝鲜 ==================== -->
    <view class="section" v-if="newList.length">
      <view class="section-head">
        <text class="section-title">新品尝鲜</text>
      </view>
      <view class="new-grid">
        <view class="new-item" v-for="d in newList" :key="dishKey(d)" @click="goDetail(d)">
          <view class="new-img">
            <DishImage :dish="d" :size="200" :radius="20" />
            <view class="new-badge">NEW</view>
          </view>
          <text class="new-name">{{ d.name }}</text>
          <text class="new-price">¥{{ money(d.price) }}</text>
        </view>
      </view>
    </view>

    <!-- ==================== 加载 / 空态 ==================== -->
    <view class="state" v-if="loading && !hasData">
      <view class="spinner" />
      <text class="state-text">正在加载食堂菜单…</text>
    </view>

    <view class="state" v-else-if="!loading && !hasData">
      <Icon name="bowl" :size="72" color="#D8D3CB" />
      <text class="state-title">暂时没有菜品数据</text>
      <text class="state-sub">下拉刷新试试，或到管理后台同步菜品库</text>
      <view class="state-btn" @click="loadData">重新加载</view>
    </view>

    <view class="source" v-if="localEngine && hasData">
      <Icon name="info" :size="24" color="#B8B2AA" />
      <text class="source-text">当前为本地离线数据，配置云服务后可同步食堂最新菜单</text>
    </view>
  </view>
</template>

<script setup>
/**
 * 首页
 *
 * 定制导航栏（navigationStyle: custom），把问候语与搜索整合进头部，
 * 主视觉只保留一个 AI 推荐入口——这是本产品的核心价值，不做功能平铺。
 */
import { ref, computed } from 'vue'
import { onShow, onPullDownRefresh } from '@dcloudio/uni-app'
import { dishApi, recommendApi, userApi } from '@/api/index.js'
import { MEAL_TYPES, TASTE_OPTIONS } from '@/common/constants.js'

const statusBarHeight = ref(20)
const nickname = ref('同学')
const avatarText = ref('同')
const hotList = ref([])
const goodList = ref([])
const newList = ref([])
const canteens = ref([])
const loading = ref(false)
const localEngine = ref(false)

const quickTastes = TASTE_OPTIONS.slice(0, 6)

const hasData = computed(
  () => hotList.value.length || goodList.value.length || newList.value.length || canteens.value.length
)

/** 按时段问候，比"早上好"更贴合"这顿吃什么"的场景 */
const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
})

function currentMealType() {
  const h = new Date().getHours()
  if (h < 10) return '早餐'
  if (h < 15) return '午餐'
  if (h < 21) return '晚餐'
  return '夜宵'
}

/* -------------------------------- 数据 -------------------------------- */

async function loadData() {
  if (loading.value) return
  loading.value = true

  // 状态栏高度：小程序/App 需要给自定义导航让位
  try {
    const info = uni.getSystemInfoSync()
    if (info && info.statusBarHeight) statusBarHeight.value = info.statusBarHeight
  } catch (e) {
    // 使用默认值
  }

  // 本地身份
  try {
    const profile = userApi.getProfile()
    if (profile && profile.nickname) {
      nickname.value = profile.nickname
      avatarText.value = String(profile.nickname).slice(0, 1)
    }
  } catch (e) {
    // 忽略
  }

  try {
    const [hot, good, fresh, canteenRes] = await Promise.all([
      dishApi.rank('hot', 8),
      dishApi.rank('good', 6),
      dishApi.rank('new', 6),
      dishApi.canteens()
    ])

    let usedLocal = false
    const mark = (res) => {
      if (res && res.engine === 'local') usedLocal = true
    }
    mark(hot)
    mark(good)
    mark(fresh)
    mark(canteenRes)

    hotList.value = (hot && hot.list) || []
    goodList.value = (good && good.list) || []
    newList.value = (fresh && fresh.list) || []
    canteens.value = (canteenRes && canteenRes.list) || []
    localEngine.value = usedLocal
  } catch (e) {
    if (!hasData.value) {
      uni.showToast({ title: '数据加载失败，请稍后重试', icon: 'none' })
    }
  } finally {
    loading.value = false
  }
}

onShow(() => {
  loadData()
})

onPullDownRefresh(() => {
  loadData().finally(() => uni.stopPullDownRefresh())
})

/* -------------------------------- 跳转 -------------------------------- */

function dishKey(d) {
  return (d && (d.id || d._id)) || ''
}

function money(v) {
  return Number(v || 0).toFixed(1)
}

function rating(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(1) : '—'
}

function goSearch() {
  uni.switchTab({ url: '/pages/dish-list/dish-list' })
}

function goRecommend() {
  uni.switchTab({ url: '/pages/recommend/recommend' })
}

function goUser() {
  uni.switchTab({ url: '/pages/user/user' })
}

/** 点口味标签：把偏好写进本地档案后进入推荐页，用户少点几步 */
function goRecommendWithTaste(taste) {
  const saved = recommendApi.getSavedPref() || {}
  recommendApi.savePref({
    meal_type: saved.meal_type || currentMealType(),
    taste: [taste],
    allergies: saved.allergies || [],
    budget: saved.budget || null,
    canteen: saved.canteen || '',
    extra: saved.extra || ''
  })
  uni.switchTab({ url: '/pages/recommend/recommend' })
}

/**
 * 食堂入口
 * 菜单页是 tabBar 页，switchTab 不支持携带参数，因此先暂存筛选条件再跳转，
 * 由菜单页在 onShow 中读取（navigateTo 跳 tabBar 页会静默失败，不能依赖）。
 */
function goCanteen(name) {
  if (!name) return
  try {
    uni.setStorageSync('shiyu_pending_canteen', name)
  } catch (e) {
    // 忽略
  }
  uni.switchTab({ url: '/pages/dish-list/dish-list' })
}

function goDetail(d) {
  const id = dishKey(d)
  if (!id) return
  uni.navigateTo({ url: '/pages/dish/dish?id=' + encodeURIComponent(id) })
}
</script>

<style lang="scss" scoped>
@import '@/common/tokens.scss';
.page {
  min-height: 100vh;
  background: $canvas;
  padding-bottom: 60rpx;
}

/* ==================== 导航 ==================== */
.nav {
  background: $surface;
  padding: 0 $gap-page 24rpx;
}

.nav-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 96rpx;
}

.nav-greet {
  font-size: $fs-cap;
  color: $gray6;
}

.nav-name {
  display: block;
  margin-top: 2rpx;
  font-size: $fs-title;
  font-weight: $fw-bold;
  color: $ink;
  letter-spacing: -0.6rpx;
}

.nav-avatar {
  width: 76rpx;
  height: 76rpx;
  border-radius: 50%;
  background: $brand-soft;
  color: $brand;
  font-size: $fs-card;
  font-weight: $fw-bold;
  display: flex;
  align-items: center;
  justify-content: center;
}

.search {
  display: flex;
  align-items: center;
  height: 76rpx;
  padding: 0 26rpx;
  margin-top: 20rpx;
  background: $surface-sunken;
  border-radius: $radius-pill;
}

.search-text {
  margin-left: 14rpx;
  font-size: $fs-sub;
  color: $gray4;
}

/* ==================== AI 主入口 ==================== */
.ai-card {
  margin: $gap-lg $gap-page 0;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-lg;
  padding: 36rpx $gap-card;
  display: flex;
  align-items: center;
  box-shadow: $shadow-card;
}

.ai-main {
  flex: 1;
}

.ai-badge {
  display: inline-flex;
  align-items: center;
  padding: 6rpx 16rpx;
  background: $brand-soft;
  border-radius: $radius-pill;
}

.ai-badge-text {
  margin-left: 6rpx;
  font-size: $fs-tag;
  color: $brand;
  font-weight: $fw-medium;
}

.ai-title {
  display: block;
  margin-top: 20rpx;
  font-size: 42rpx;
  font-weight: $fw-bold;
  color: $ink;
  letter-spacing: -0.8rpx;
}

.ai-sub {
  display: block;
  margin-top: 8rpx;
  font-size: $fs-cap;
  color: $gray6;
}

.ai-go {
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  background: $brand;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: $shadow-brand;
}

/* ==================== 口味快捷 ==================== */
.quick-scroll {
  white-space: nowrap;
  padding: 0 $gap-page;
  margin-top: $gap-lg;
}

.quick-chip {
  display: inline-block;
  height: 64rpx;
  line-height: 64rpx;
  padding: 0 30rpx;
  margin-right: 16rpx;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-pill;
  font-size: $fs-sub;
  color: $gray7;
}

/* ==================== 区块通用 ==================== */
.section {
  margin: $gap-lg $gap-page 0;
}

.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: $gap;
}

.section-title {
  font-size: $fs-card;
  font-weight: $fw-bold;
  color: $ink;
  letter-spacing: -0.4rpx;
}

.section-more {
  font-size: $fs-cap;
  color: $gray6;
}

/* ==================== 食堂 ==================== */
.canteen-list {
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
  overflow: hidden;
  box-shadow: $shadow-card;
}

.canteen {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100rpx;
  padding: 0 $gap-card;
  border-bottom: 2rpx solid $line;
}

.canteen:last-child {
  border-bottom: none;
}

.canteen-name {
  font-size: $fs-body;
  color: $ink;
}

/* ==================== 今日热门 ==================== */
.hot-scroll {
  white-space: nowrap;
}

.hot-item {
  display: inline-block;
  width: 240rpx;
  margin-right: $gap;
  vertical-align: top;
}

.hot-img {
  position: relative;
}

.hot-tag {
  position: absolute;
  top: 12rpx;
  left: 12rpx;
  padding: 2rpx 12rpx;
  background: $brand;
  color: #fff;
  font-size: 20rpx;
  border-radius: $radius-pill;
}

.hot-name {
  display: block;
  margin-top: 16rpx;
  font-size: $fs-sub;
  color: $ink;
  font-weight: $fw-medium;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.hot-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6rpx;
}

.hot-price {
  font-size: $fs-sub;
  color: $brand;
  font-weight: $fw-bold;
}

.hot-rating {
  display: flex;
  align-items: center;
}

.hot-rating-text {
  margin-left: 4rpx;
  font-size: $fs-tag;
  color: $gray6;
}

/* ==================== 高分红榜 ==================== */
.goods {
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
  padding: 8rpx $gap-card;
  box-shadow: $shadow-card;
}

.good {
  display: flex;
  align-items: center;
  padding: 20rpx 0;
  border-bottom: 2rpx solid $line;
}

.good:last-child {
  border-bottom: none;
}

.good-rank {
  width: 44rpx;
  font-size: $fs-body;
  font-weight: $fw-bold;
  color: $gray4;
  flex-shrink: 0;
}

.good-rank-top {
  color: $brand;
}

.good-body {
  flex: 1;
  min-width: 0;
  margin-left: 20rpx;
}

.good-name {
  display: block;
  font-size: $fs-body;
  color: $ink;
  font-weight: $fw-medium;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.good-loc {
  display: block;
  margin-top: 6rpx;
  font-size: $fs-cap;
  color: $gray6;
}

.good-right {
  text-align: right;
  margin-left: 16rpx;
}

.good-price {
  display: block;
  font-size: $fs-body;
  color: $brand;
  font-weight: $fw-bold;
}

.good-score {
  display: block;
  margin-top: 6rpx;
  font-size: $fs-tag;
  color: $gray6;
}

/* ==================== 新品 ==================== */
.new-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
}

.new-item {
  width: 31.5%;
  margin-bottom: $gap;
}

.new-img {
  position: relative;
}

.new-img :deep(.dish-image) {
  width: 100% !important;
  height: 200rpx !important;
}

.new-badge {
  position: absolute;
  top: 10rpx;
  left: 10rpx;
  padding: 2rpx 12rpx;
  background: $brand;
  color: #fff;
  font-size: 20rpx;
  border-radius: $radius-pill;
}

.new-name {
  display: block;
  margin-top: 14rpx;
  font-size: $fs-cap;
  color: $ink;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.new-price {
  display: block;
  margin-top: 4rpx;
  font-size: $fs-cap;
  color: $brand;
  font-weight: $fw-bold;
}

/* ==================== 状态 ==================== */
.state {
  margin: $gap-lg $gap-page 0;
  padding: 80rpx $gap-card;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.spinner {
  width: 44rpx;
  height: 44rpx;
  border: 4rpx solid $line;
  border-top-color: $brand;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.state-text {
  margin-top: $gap;
  font-size: $fs-sub;
  color: $gray6;
}

.state-title {
  margin-top: $gap;
  font-size: $fs-body;
  color: $ink;
  font-weight: $fw-medium;
}

.state-sub {
  margin-top: 8rpx;
  font-size: $fs-cap;
  color: $gray6;
  text-align: center;
}

.state-btn {
  margin-top: $gap-lg;
  height: $h-btn-sm;
  padding: 0 44rpx;
  line-height: $h-btn-sm;
  background: $surface-sunken;
  border-radius: $radius-pill;
  font-size: $fs-sub;
  color: $gray7;
}

/* ==================== 数据来源 ==================== */
.source {
  display: flex;
  align-items: flex-start;
  margin: $gap-lg $gap-page 0;
}

.source-text {
  flex: 1;
  margin-left: 10rpx;
  font-size: $fs-tag;
  color: $gray4;
  line-height: 1.6;
}
</style>
