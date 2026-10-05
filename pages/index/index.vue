<template>
  <view class="home">
    <!-- ==================== 顶部问候区 ==================== -->
    <view class="hero">
      <view class="hero-row">
        <view class="hero-text">
          <text class="hero-greet">{{ greeting }}，{{ nickname }} 👋</text>
          <text class="hero-sub">现在是{{ mealType }}时间 · 让 AI 帮你决定吃什么</text>
        </view>
        <text class="hero-emoji">🍜</text>
      </view>

      <!-- 搜索入口：菜品列表是 tabBar 页，用 switchTab -->
      <view class="search-box" @click="goSearch">
        <text class="search-icon">🔍</text>
        <text class="search-placeholder">搜索菜品、食堂…</text>
      </view>
    </view>

    <!-- ==================== AI 推荐主入口 ==================== -->
    <view class="ai-card">
      <view class="ai-row">
        <view class="ai-text">
          <text class="ai-title">不知道吃啥？交给 AI</text>
          <text class="ai-desc">说口味 · 报预算 · 忌口自动规避</text>
        </view>
        <text class="ai-robot">🤖</text>
      </view>

      <view class="ai-btn" @click="goRecommend">
        <text class="ai-btn-text">马上推荐</text>
        <text class="ai-btn-arrow">›</text>
      </view>

      <!-- 快捷口味：点一下即预置偏好并跳到推荐页 -->
      <view class="quick-area" v-if="quickTastes.length">
        <text class="quick-tip">快捷口味（点一下直接推荐）</text>
        <view class="quick-tags">
          <text
            class="quick-tag"
            v-for="t in quickTastes"
            :key="t.value"
            @click="pickTaste(t.value)"
          >{{ t.label }}</text>
        </view>
      </view>
    </view>

    <!-- ==================== 食堂快捷入口 ==================== -->
    <view class="section" v-if="canteens.length">
      <view class="section-head">
        <text class="section-title">🏪 食堂直达</text>
      </view>
      <scroll-view class="h-scroll" scroll-x>
        <view
          class="canteen-item"
          v-for="c in canteens"
          :key="c"
          @click="goCanteen(c)"
        >
          <text class="canteen-icon">🏫</text>
          <text class="canteen-name">{{ c }}</text>
        </view>
      </scroll-view>
    </view>

    <!-- ==================== 今日热门 ==================== -->
    <view class="section" v-if="hotList.length">
      <view class="section-head">
        <text class="section-title">🔥 今日热门</text>
        <text class="section-more" @click="goSearch">查看更多 ›</text>
      </view>
      <scroll-view class="h-scroll" scroll-x>
        <view
          class="hot-card"
          v-for="d in hotList"
          :key="dishKey(d)"
          @click="goDetail(d)"
        >
              <DishImage class="hot-img" :dish="d" :size="220" :radius="14" />
          <text class="hot-name">{{ d.name }}</text>
          <view class="hot-meta">
            <text class="hot-rating">⭐ {{ formatRating(d.rating) }}</text>
            <text class="hot-price">{{ formatPrice(d.price) }}</text>
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- ==================== 高分红榜 ==================== -->
    <view class="section" v-if="goodList.length">
      <view class="section-head">
        <text class="section-title">🏆 高分红榜</text>
      </view>
      <view class="rank-list">
        <view
          class="rank-item"
          v-for="(d, idx) in goodList"
          :key="dishKey(d)"
          @click="goDetail(d)"
        >
          <text class="rank-num" :class="{ 'rank-top': idx < 3 }">{{ idx + 1 }}</text>
          <DishImage class="rank-img" :dish="d" :size="100" :radius="12" />
          <view class="rank-info">
            <text class="rank-name">{{ d.name }}</text>
            <text class="rank-loc">{{ formatLocation(d) || '位置待完善' }}</text>
            <view class="rank-tags" v-if="d.tags && d.tags.length">
              <text class="tag" v-for="t in d.tags.slice(0, 3)" :key="t">{{ t }}</text>
            </view>
          </view>
          <view class="rank-right">
            <text class="rank-price">{{ formatPrice(d.price) }}</text>
            <text class="rank-score">{{ formatRating(d.rating) }} 分</text>
          </view>
        </view>
      </view>
    </view>

    <!-- ==================== 新品尝鲜 ==================== -->
    <view class="section" v-if="newList.length">
      <view class="section-head">
        <text class="section-title">✨ 新品尝鲜</text>
      </view>
      <view class="new-grid">
        <view
          class="new-item"
          v-for="d in newList"
          :key="dishKey(d)"
          @click="goDetail(d)"
        >
          <view class="new-img-wrap">
            <DishImage :dish="d" :size="200" :radius="14" />
            <text class="new-badge">NEW</text>
          </view>
          <text class="new-name">{{ d.name }}</text>
          <text class="new-price">{{ formatPrice(d.price) }}</text>
        </view>
      </view>
    </view>

    <!-- ==================== 加载 / 空态 ==================== -->
    <view class="state-box" v-if="loading && !hasData">
      <text class="state-text">正在加载食堂菜单…</text>
    </view>
    <view class="state-box" v-else-if="!loading && !hasData">
      <text class="state-emoji">🍚</text>
      <text class="state-text">暂时没有拿到菜品数据</text>
      <text class="state-retry" @click="loadData">轻触重试</text>
    </view>

    <!-- ==================== 数据来源提示 ==================== -->
    <view class="data-hint" v-if="localEngine">
      <text class="data-hint-text">当前为本地离线数据，配置云服务后可同步食堂最新菜单</text>
    </view>
  </view>
</template>

<script setup>
/**
 * 首页（食遇校园）
 *
 * 定位：解决「每天不知道吃啥」的第一入口，主推 AI 智能推荐。
 *
 * 数据链路：页面 → @/api/index.js → uniCloud 云函数（shiyu-dish）
 *          → 云端不可用时自动降级到本地数据集，接口返回 engine='local' 时底部给出提示。
 * 注意：首页不做登录拦截，未登录也完整可用（昵称降级为「同学」）。
 */
import { ref, computed } from 'vue'
import { onShow, onPullDownRefresh } from '@dcloudio/uni-app'
import { dishApi, recommendApi, userApi } from '@/api/index.js'
import { MEAL_TYPES, TASTE_OPTIONS, EMOJI_MAP } from '@/common/constants.js'
import { formatPrice, formatLocation } from '@/common/utils.js'
import DishImage from '@/components/DishImage/DishImage.vue'

/* -------------------------------- 页面状态 -------------------------------- */

const hour = ref(new Date().getHours())
const nickname = ref('同学')
const canteens = ref([])
const hotList = ref([])
const goodList = ref([])
const newList = ref([])
const loading = ref(false)
/** 本次加载中任意一次接口走了本地兜底 */
const localEngine = ref(false)

/* -------------------------------- 计算属性 -------------------------------- */

/** 问候语：按时段切换 */
const greeting = computed(() => {
  const h = hour.value
  if (h < 11) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
})

/** 当前用餐时段：优先取 constants 里的 MEAL_TYPES，取不到再用兜底文案 */
const mealType = computed(() => {
  const h = hour.value
  let want = '午餐'
  if (h < 10) want = '早餐'
  else if (h < 14) want = '午餐'
  else if (h < 21) want = '晚餐'
  else want = '夜宵'
  const list = Array.isArray(MEAL_TYPES) ? MEAL_TYPES : []
  const hit = list.find((m) => String(m).indexOf(want) > -1)
  return hit || want
})

/** 快捷口味标签：取 TASTE_OPTIONS 前 6 个 */
const quickTastes = computed(() => {
  const list = Array.isArray(TASTE_OPTIONS) ? TASTE_OPTIONS : []
  return list.slice(0, 6)
})

/** 是否已经拿到任意区块数据（用于空态判断） */
const hasData = computed(
  () =>
    canteens.value.length > 0 ||
    hotList.value.length > 0 ||
    goodList.value.length > 0 ||
    newList.value.length > 0
)

/* -------------------------------- 数据加载 -------------------------------- */

async function loadData() {
  if (loading.value) return
  loading.value = true
  hour.value = new Date().getHours()

  // 昵称（本地资料，未登录时降级为「同学」）
  try {
    const profile = userApi.getProfile()
    nickname.value = (profile && profile.nickname) || '同学'
  } catch (e) {
    nickname.value = '同学'
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
    // 整体失败：提示但不白屏，保留已有内容
    uni.showToast({ title: '数据加载失败，请稍后重试', icon: 'none' })
  } finally {
    loading.value = false
  }
}

// 首页是 tabBar 页，onShow 同时覆盖首次进入与从推荐页返回
onShow(() => {
  loadData()
})

onPullDownRefresh(() => {
  loadData().finally(() => uni.stopPullDownRefresh())
})

/* -------------------------------- 交互逻辑 -------------------------------- */

function goSearch() {
  uni.switchTab({ url: '/pages/dish-list/dish-list' })
}

function goRecommend() {
  uni.switchTab({ url: '/pages/recommend/recommend' })
}

/**
 * 点快捷口味：先把偏好写进本地档案，再用一次性 key 交给推荐页回填，
 * 然后切到推荐页 —— 推荐页是 tabBar 页，switchTab 不能带 query，
 * 只能靠本地暂存传递，由推荐页 onShow 读取后立即删除并填进输入框。
 */
function pickTaste(tag) {
  try {
    const saved = recommendApi.getSavedPref() || {}
    const pref = {
      meal_type: saved.meal_type || mealType.value,
      taste: [tag],
      allergies: Array.isArray(saved.allergies) ? saved.allergies : [],
      budget: saved.budget || null,
      canteen: saved.canteen || '',
      extra: saved.extra || ''
    }
    recommendApi.savePref(pref)
    uni.setStorageSync('shiyu_pending_pref', pref)
  } catch (e) {
    // 偏好写入失败不阻塞跳转
  }
  uni.switchTab({ url: '/pages/recommend/recommend' })
}

/**
 * 点食堂进入菜品列表
 *
 * 菜品列表是 tabBar 页：微信小程序/App 端 switchTab 不支持携带 query 参数，
 * 且 navigateTo 跳 tabBar 页会静默失败（fail 回调不触发），因此统一走
 * 「本机暂存筛选条件 + switchTab」，由菜品列表页在 onShow 中读取并消费。
 */
function goCanteen(name) {
  if (!name) return
  try {
    uni.setStorageSync('shiyu_pending_canteen', name)
  } catch (e) {
    // 存储不可用时至少保证能跳过去
  }
  uni.switchTab({ url: '/pages/dish-list/dish-list' })
}

function dishKey(d) {
  return (d && (d.id || d._id)) || (d && d.name) || ''
}

function dishEmoji(d) {
  if (d && d.emoji) return d.emoji
  // 菜品没有真实图片：优先 emoji 字段，其次按分类查 EMOJI_MAP，最后兜底
  const map = EMOJI_MAP || {}
  return (d && map[d.category]) || '🍽️'
}

function formatRating(r) {
  const n = Number(r)
  return Number.isFinite(n) ? n.toFixed(1) : '—'
}

function goDetail(d) {
  const id = dishKey(d)
  if (!id) return
  uni.navigateTo({ url: '/pages/dish/dish?id=' + encodeURIComponent(id) })
}
</script>

<style scoped>
.home {
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: 40rpx;
}

/* -------------------- 顶部问候区 -------------------- */

.hero {
  background: linear-gradient(135deg, #FF6B35, #FF8C5A);
  padding: 36rpx 30rpx 30rpx;
}

.hero-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.hero-text {
  flex: 1;
}

.hero-greet {
  font-size: 42rpx;
  font-weight: bold;
  color: #fff;
  display: block;
}

.hero-sub {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.9);
  margin-top: 10rpx;
  display: block;
}

.hero-emoji {
  font-size: 64rpx;
  margin-left: 20rpx;
}

.search-box {
  margin-top: 26rpx;
  height: 72rpx;
  background: #fff;
  border-radius: 36rpx;
  display: flex;
  align-items: center;
  padding: 0 30rpx;
}

.search-icon {
  font-size: 28rpx;
  margin-right: 12rpx;
}

.search-placeholder {
  font-size: 28rpx;
  color: #bbb;
}

/* -------------------- AI 推荐主入口 -------------------- */

.ai-card {
  margin: 24rpx;
  padding: 32rpx;
  background: #fff;
  border-radius: 20rpx;
  box-shadow: 0 8rpx 24rpx rgba(255, 107, 53, 0.12);
}

.ai-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ai-text {
  flex: 1;
}

.ai-title {
  font-size: 38rpx;
  font-weight: bold;
  color: #333;
  display: block;
}

.ai-desc {
  font-size: 24rpx;
  color: #999;
  margin-top: 12rpx;
  display: block;
}

.ai-robot {
  font-size: 64rpx;
  margin-left: 20rpx;
}

.ai-btn {
  margin-top: 28rpx;
  height: 88rpx;
  background: linear-gradient(135deg, #FF6B35, #FF8C5A);
  border-radius: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ai-btn-text {
  font-size: 32rpx;
  font-weight: bold;
  color: #fff;
}

.ai-btn-arrow {
  font-size: 36rpx;
  color: #fff;
  margin-left: 10rpx;
}

.quick-area {
  margin-top: 28rpx;
  padding-top: 24rpx;
  border-top: 1rpx solid #f5f5f5;
}

.quick-tip {
  font-size: 22rpx;
  color: #999;
  display: block;
  margin-bottom: 16rpx;
}

.quick-tags {
  display: flex;
  flex-wrap: wrap;
}

.quick-tag {
  font-size: 24rpx;
  color: #FF6B35;
  background: #FFF0EB;
  border-radius: 24rpx;
  padding: 8rpx 24rpx;
  margin: 0 16rpx 16rpx 0;
}

/* -------------------- 通用区块 -------------------- */

.section {
  margin: 24rpx;
  background: #fff;
  border-radius: 20rpx;
  padding: 28rpx 24rpx;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 22rpx;
}

.section-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
}

.section-more {
  font-size: 24rpx;
  color: #FF6B35;
}

.h-scroll {
  white-space: nowrap;
  width: 100%;
}

/* 菜品图片：无图时由 DishImage 组件自动回退为 emoji 渐变方块 */

/* -------------------- 食堂快捷入口 -------------------- */

.canteen-item {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  width: 140rpx;
  margin-right: 20rpx;
}

.canteen-icon {
  font-size: 52rpx;
}

.canteen-name {
  font-size: 22rpx;
  color: #333;
  margin-top: 8rpx;
  max-width: 140rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* -------------------- 今日热门 -------------------- */

.hot-card {
  display: inline-block;
  width: 220rpx;
  margin-right: 20rpx;
  vertical-align: top;
}

.hot-img {
  border-radius: 14rpx;
}

.hot-name {
  font-size: 26rpx;
  color: #333;
  margin-top: 12rpx;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hot-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8rpx;
}

.hot-rating {
  font-size: 22rpx;
  color: #FF9800;
}

.hot-price {
  font-size: 26rpx;
  font-weight: bold;
  color: #FF6B35;
}

/* -------------------- 高分红榜 -------------------- */

.rank-list {
  display: flex;
  flex-direction: column;
}

.rank-item {
  display: flex;
  align-items: center;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #f5f5f5;
}

.rank-item:last-child {
  border-bottom: none;
}

.rank-num {
  width: 48rpx;
  text-align: center;
  font-size: 32rpx;
  font-weight: bold;
  color: #ccc;
}

.rank-num.rank-top {
  color: #FF6B35;
}

.rank-img {
  margin: 0 20rpx;
}

.rank-info {
  flex: 1;
  overflow: hidden;
}

.rank-name {
  font-size: 28rpx;
  font-weight: 500;
  color: #333;
  display: block;
}

.rank-loc {
  font-size: 22rpx;
  color: #999;
  margin-top: 6rpx;
  display: block;
}

.rank-tags {
  margin-top: 8rpx;
}

.tag {
  display: inline-block;
  font-size: 20rpx;
  color: #FF6B35;
  background: #FFF0EB;
  border-radius: 8rpx;
  padding: 2rpx 12rpx;
  margin-right: 8rpx;
}

.rank-right {
  text-align: right;
  min-width: 130rpx;
}

.rank-price {
  font-size: 28rpx;
  font-weight: bold;
  color: #FF6B35;
  display: block;
}

.rank-score {
  font-size: 22rpx;
  color: #FF9800;
  margin-top: 6rpx;
  display: block;
}

/* -------------------- 新品尝鲜 -------------------- */

.new-grid {
  display: flex;
  flex-wrap: wrap;
}

.new-item {
  width: 31.5%;
  margin-right: 2.75%;
  margin-bottom: 24rpx;
}

.new-item:nth-child(3n) {
  margin-right: 0;
}

.new-img-wrap {
  position: relative;
}

.new-img-wrap :deep(.dish-image) {
  width: 100% !important;
  height: 180rpx !important;
}

.new-badge {
  position: absolute;
  top: 0;
  left: 0;
  font-size: 18rpx;
  color: #fff;
  background: #FF6B35;
  border-radius: 20rpx 0 20rpx 0;
  padding: 2rpx 12rpx;
}

.new-name {
  font-size: 24rpx;
  color: #333;
  margin-top: 10rpx;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.new-price {
  font-size: 22rpx;
  font-weight: bold;
  color: #FF6B35;
  margin-top: 4rpx;
  display: block;
}

/* -------------------- 状态与提示 -------------------- */

.state-box {
  margin: 24rpx;
  padding: 60rpx 30rpx;
  background: #fff;
  border-radius: 20rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.state-emoji {
  font-size: 64rpx;
  margin-bottom: 16rpx;
}

.state-text {
  font-size: 26rpx;
  color: #999;
}

.state-retry {
  margin-top: 20rpx;
  font-size: 26rpx;
  color: #FF6B35;
  border: 1rpx solid #FF6B35;
  border-radius: 30rpx;
  padding: 8rpx 32rpx;
}

.data-hint {
  padding: 20rpx 30rpx 0;
  text-align: center;
}

.data-hint-text {
  font-size: 22rpx;
  color: #bbb;
  line-height: 32rpx;
}
</style>
