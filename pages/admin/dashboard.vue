<template>
  <view class="dash-page">
    <!-- ================= 顶部标题 ================= -->
    <view class="hero">
      <view class="hero-main">
        <text class="hero-title">数据看板</text>
        <text class="hero-sub">食遇校园 · 菜品与推荐运营概览</text>
      </view>
      <view class="hero-refresh" @click="load">
        <Icon name="refresh" :size="26" />
        <text class="hero-refresh-text">刷新</text>
      </view>
    </view>

    <!-- ================= 本地数据提示 ================= -->
    <view class="notice" v-if="engine === 'local'">
      <Icon name="info" :size="32" />
      <text class="notice-text">当前使用本地离线数据</text>
    </view>

    <!-- ================= 加载中 ================= -->
    <view class="state-box" v-if="loading">
      <Icon name="clock" :size="72" />
      <text class="state-text">数据加载中…</text>
    </view>

    <!-- ================= 加载失败 ================= -->
    <view class="state-box" v-else-if="error">
      <Icon name="warning" :size="72" />
      <text class="state-text">{{ error }}</text>
      <view class="retry-btn" @click="load">重新加载</view>
    </view>

    <!-- ================= 正文 ================= -->
    <block v-else>
      <!-- 四张统计卡 -->
      <view class="stat-grid">
        <view class="stat-card">
          <text class="stat-label">菜品总数</text>
          <view class="stat-value">
            <view class="stat-dot dot-brand"></view>
            <text class="stat-num">{{ overview.dish_total || 0 }}</text>
          </view>
          <text class="stat-unit">道在售菜品</text>
        </view>

        <view class="stat-card">
          <text class="stat-label">食堂数量</text>
          <view class="stat-value">
            <view class="stat-dot dot-success"></view>
            <text class="stat-num">{{ overview.canteen_total || 0 }}</text>
          </view>
          <text class="stat-unit">个就餐区域</text>
        </view>

        <view class="stat-card">
          <text class="stat-label">平均评分</text>
          <view class="stat-value">
            <view class="stat-dot dot-warning"></view>
            <text class="stat-num">{{ avgRatingText }}</text>
          </view>
          <text class="stat-unit">满分 5.0</text>
        </view>

        <view class="stat-card">
          <text class="stat-label">人均价格</text>
          <view class="stat-value">
            <view class="stat-dot dot-neutral"></view>
            <text class="stat-num">{{ avgPriceText }}</text>
          </view>
          <text class="stat-unit">元 / 道</text>
        </view>
      </view>

      <!-- 食堂菜品分布 -->
      <view class="card">
        <view class="card-head">
          <text class="card-title">食堂菜品分布</text>
          <text class="card-tip">共 {{ dishList.length }} 道</text>
        </view>
        <view class="bar-row" v-for="c in canteenStats" :key="c.name">
          <text class="bar-name">{{ c.name }}</text>
          <view class="bar-track">
            <view class="bar-fill" :style="{ width: c.width + '%' }"></view>
          </view>
          <text class="bar-value">{{ c.count }} 道 · {{ c.percent }}%</text>
        </view>
        <view class="mini-empty" v-if="!canteenStats.length">暂无菜品数据</view>
      </view>

      <!-- 口味标签热度 -->
      <view class="card">
        <view class="card-head">
          <text class="card-title">口味标签热度</text>
          <text class="card-tip">TOP 8</text>
        </view>
        <view class="bar-row" v-for="t in tagStats" :key="t.name">
          <text class="bar-name">{{ t.name }}</text>
          <view class="bar-track">
            <view class="bar-fill" :style="{ width: t.width + '%' }"></view>
          </view>
          <text class="bar-value">{{ t.count }} 次 · {{ t.percent }}%</text>
        </view>
        <view class="mini-empty" v-if="!tagStats.length">暂无标签数据</view>
      </view>

      <!-- Top 推荐菜品 -->
      <view class="card">
        <view class="card-head">
          <text class="card-title">Top 推荐菜品</text>
          <text class="card-tip">按推荐次数</text>
        </view>
        <view class="top-row" v-for="(d, i) in topDishes" :key="d.id || d._id || i">
          <text class="top-rank">{{ i + 1 }}</text>
          <DishImage :dish="d" :size="80" :radius="16" />
          <view class="top-main">
            <text class="top-name">{{ d.name }}</text>
            <text class="top-sub">{{ d.canteen }}{{ d.window ? ' · ' + d.window : '' }}</text>
          </view>
          <text class="top-count">{{ d.recommend_count || 0 }} 次</text>
        </view>
        <view class="mini-empty" v-if="!topDishes.length">暂无推荐记录</view>
      </view>
    </block>
  </view>
</template>

<script setup>
/**
 * 数据看板
 *
 * 数据链路：statsApi.overview() 取四项汇总指标；
 * dishApi.list({ pageSize: 999 }) 拉全量菜品，在页面内做分组统计
 * （食堂分布 / 标签热度 / Top 推荐），全部用 view + 宽度百分比画条形图，
 * 不引入任何图表库。
 */
import { ref, computed } from 'vue'
import { onLoad, onShow, onPullDownRefresh } from '@dcloudio/uni-app'
import { statsApi, dishApi } from '@/api/index.js'
import { getUserInfo, formatPrice } from '@/common/utils.js'
import DishImage from '@/components/DishImage/DishImage.vue'

const loading = ref(false)
const error = ref('')
const engine = ref('')
const overview = ref({ dish_total: 0, canteen_total: 0, avg_rating: 0, avg_price: 0 })
const dishList = ref([])
const canteenStats = ref([])
const tagStats = ref([])
const topDishes = ref([])

/** 管理员校验未通过时不再发请求 */
let denied = false
/** onShow 首次触发紧随 onLoad，跳过以免重复加载 */
let inited = false

/* ------------------------------ 展示辅助 ------------------------------ */

/** 平均评分：保留一位小数 */
const avgRatingText = computed(() => Number(overview.value.avg_rating || 0).toFixed(1))

/** 人均价格：复用 formatPrice 的格式化口径，卡片里省掉 ¥ 符号 */
const avgPriceText = computed(() => formatPrice(Number(overview.value.avg_price || 0)).replace('¥', ''))

/* ------------------------------ 统计计算 ------------------------------ */

/** 食堂分布：按 canteen 分组计数 */
function buildCanteenStats(list) {
  const total = list.length || 1
  const map = {}
  list.forEach((d) => {
    const key = d.canteen || '未标注食堂'
    map[key] = (map[key] || 0) + 1
  })
  return Object.keys(map)
    .map((name) => ({
      name,
      count: map[name],
      percent: Math.round((map[name] / total) * 100)
    }))
    .sort((a, b) => b.count - a.count)
    .map((item) => ({ ...item, width: Math.max(item.percent, 4) }))
}

/** 标签热度：统计 tags 出现频次，取前 8；宽度按最热标签归一化，占比为全部标签出现次数中的份额 */
function buildTagStats(list) {
  const map = {}
  let total = 0
  list.forEach((d) => {
    const tags = Array.isArray(d.tags) ? d.tags : []
    tags.forEach((t) => {
      if (!t) return
      map[t] = (map[t] || 0) + 1
      total += 1
    })
  })
  const sorted = Object.keys(map)
    .map((name) => ({ name, count: map[name] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
  const maxCount = sorted.length ? sorted[0].count : 1
  return sorted.map((item) => ({
    ...item,
    percent: total ? Math.round((item.count / total) * 100) : 0,
    width: Math.max(Math.round((item.count / maxCount) * 100), 4)
  }))
}

/** Top5：按 recommend_count 降序 */
function buildTopDishes(list) {
  return [...list]
    .sort((a, b) => Number(b.recommend_count || 0) - Number(a.recommend_count || 0))
    .slice(0, 5)
}

/* ------------------------------ 数据加载 ------------------------------ */

async function load() {
  if (denied) return
  loading.value = true
  error.value = ''
  try {
    const [ov, dishes] = await Promise.all([
      statsApi.overview(),
      dishApi.list({ pageSize: 999 })
    ])

    overview.value = ov || {}
    const list = (dishes && dishes.list) || []
    dishList.value = list

    canteenStats.value = buildCanteenStats(list)
    tagStats.value = buildTagStats(list)
    topDishes.value = buildTopDishes(list)

    // 只要任一链路来自本地，就按离线数据提示
    const localUsed = (ov && ov.engine === 'local') || (dishes && dishes.engine === 'local')
    engine.value = localUsed ? 'local' : 'cloud'
  } catch (e) {
    error.value = (e && e.message) || '数据加载失败，请稍后重试'
    uni.showToast({ title: '数据加载失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

/* ------------------------------ 生命周期 ------------------------------ */

onLoad(() => {
  const user = getUserInfo()
  if (!user || user.role !== 'admin') {
    denied = true
    uni.showToast({ title: '仅管理员可查看数据看板', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 1200)
    return
  }
  load()
})

onShow(() => {
  // 从菜品编辑页返回时自动刷新，保证统计口径最新
  if (!inited) {
    inited = true
    return
  }
  if (!denied) load()
})

onPullDownRefresh(() => {
  const done = () => uni.stopPullDownRefresh()
  if (denied) {
    done()
    return
  }
  load().then(done).catch(done)
})
</script>

<style lang="scss" scoped>
@import '@/common/tokens.scss';
.dash-page {
  min-height: 100vh;
  background: $canvas;
  padding: $gap-page;
  box-sizing: border-box;
}

/* ---------------- 顶部 ---------------- */
.hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
  padding: $gap-card;
  box-shadow: $shadow-card;
}

.hero-main {
  flex: 1;
  min-width: 0;
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

.hero-refresh {
  display: flex;
  align-items: center;
  height: 56rpx;
  padding: 0 22rpx;
  border-radius: $radius-pill;
  background: $surface-sunken;
  color: $brand;
  flex-shrink: 0;
}

.hero-refresh-text {
  margin-left: 8rpx;
  font-size: $fs-cap;
  color: $brand;
}

/* ---------------- 提示 / 状态 ---------------- */
.notice {
  display: flex;
  align-items: center;
  margin-top: $gap;
  padding: 20rpx $gap-card;
  background: $warning-soft;
  border-radius: $radius;
  color: $warning;
}

.notice-text {
  flex: 1;
  margin-left: $gap-sm;
  font-size: $fs-cap;
  color: $warning;
}

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

/* ---------------- 统计卡 ---------------- */
.stat-grid {
  display: flex;
  flex-wrap: wrap;
  gap: $gap;
  margin-top: $gap;
}

.stat-card {
  width: calc(50% - 10rpx);
  box-sizing: border-box;
  padding: $gap-card;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
  box-shadow: $shadow-card;
}

.stat-label {
  display: block;
  font-size: $fs-cap;
  color: $gray6;
}

.stat-value {
  display: flex;
  align-items: center;
  margin-top: $gap-sm;
}

.stat-dot {
  width: 8rpx;
  height: 8rpx;
  border-radius: 50%;
  margin-right: $gap-sm;
  flex-shrink: 0;
}

.dot-brand {
  background: $brand;
}

.dot-success {
  background: $success;
}

.dot-warning {
  background: $warning;
}

.dot-neutral {
  background: $gray4;
}

.stat-num {
  font-size: $fs-display;
  font-weight: $fw-bold;
  color: $ink;
  line-height: 1.1;
}

.stat-unit {
  display: block;
  margin-top: 8rpx;
  font-size: $fs-tag;
  color: $gray6;
}

/* ---------------- 卡片 ---------------- */
.card {
  margin-top: $gap;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
  padding: $gap-card;
  box-shadow: $shadow-card;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: $gap-card;
}

.card-title {
  font-size: $fs-card;
  font-weight: $fw-bold;
  color: $ink;
}

.card-tip {
  font-size: $fs-cap;
  color: $gray6;
}

/* ---------------- 条形图 ---------------- */
.bar-row {
  display: flex;
  align-items: center;
  margin-bottom: $gap;
}

.bar-row:last-child {
  margin-bottom: 0;
}

.bar-name {
  width: 150rpx;
  font-size: $fs-cap;
  color: $gray7;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bar-track {
  flex: 1;
  height: 12rpx;
  background: $surface-sunken;
  border-radius: $radius-pill;
  overflow: hidden;
  margin: 0 16rpx;
}

.bar-fill {
  height: 100%;
  border-radius: $radius-pill;
  background: $brand;
}

.bar-value {
  width: 170rpx;
  text-align: right;
  font-size: $fs-cap;
  color: $gray6;
}

.mini-empty {
  padding: 40rpx 0;
  text-align: center;
  font-size: $fs-cap;
  color: $gray4;
}

/* ---------------- Top 推荐 ---------------- */
.top-row {
  display: flex;
  align-items: center;
  padding: 18rpx 0;
  border-bottom: 2rpx solid $line;
}

.top-row:last-child {
  border-bottom: none;
}

.top-rank {
  width: 44rpx;
  text-align: center;
  font-size: $fs-sub;
  font-weight: $fw-medium;
  color: $gray4;
}

.top-main {
  flex: 1;
  min-width: 0;
  margin-left: $gap;
}

.top-name {
  display: block;
  font-size: $fs-body;
  font-weight: $fw-medium;
  color: $ink;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.top-sub {
  display: block;
  margin-top: 6rpx;
  font-size: $fs-cap;
  color: $gray6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.top-count {
  font-size: $fs-body;
  font-weight: $fw-bold;
  color: $brand;
  flex-shrink: 0;
  margin-left: $gap-sm;
}
</style>
