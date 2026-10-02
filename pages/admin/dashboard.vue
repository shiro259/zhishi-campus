<template>
  <view class="dash-page">
    <!-- ================= 顶部标题 ================= -->
    <view class="hero">
      <view class="hero-main">
        <text class="hero-title">📊 数据看板</text>
        <text class="hero-sub">食遇校园 · 菜品与推荐运营概览</text>
      </view>
      <text class="hero-refresh" @click="load">刷新</text>
    </view>

    <!-- ================= 本地数据提示 ================= -->
    <view class="notice" v-if="engine === 'local'">
      <text class="notice-icon">📴</text>
      <text class="notice-text">当前使用本地离线数据</text>
    </view>

    <!-- ================= 加载中 ================= -->
    <view class="state-box" v-if="loading">
      <text class="state-emoji">⏳</text>
      <text class="state-text">数据加载中…</text>
    </view>

    <!-- ================= 加载失败 ================= -->
    <view class="state-box" v-else-if="error">
      <text class="state-emoji">😵</text>
      <text class="state-text">{{ error }}</text>
      <view class="retry-btn" @click="load">重新加载</view>
    </view>

    <!-- ================= 正文 ================= -->
    <block v-else>
      <!-- 四张统计卡 -->
      <view class="stat-grid">
        <view class="stat-card stat-dish">
          <view class="stat-head">
            <text class="stat-label">菜品总数</text>
            <text class="stat-icon">🍜</text>
          </view>
          <text class="stat-num">{{ overview.dish_total || 0 }}</text>
          <text class="stat-unit">道在售菜品</text>
        </view>

        <view class="stat-card stat-canteen">
          <view class="stat-head">
            <text class="stat-label">食堂数量</text>
            <text class="stat-icon">🏫</text>
          </view>
          <text class="stat-num">{{ overview.canteen_total || 0 }}</text>
          <text class="stat-unit">个就餐区域</text>
        </view>

        <view class="stat-card stat-rating">
          <view class="stat-head">
            <text class="stat-label">平均评分</text>
            <text class="stat-icon">⭐</text>
          </view>
          <text class="stat-num">{{ avgRatingText }}</text>
          <text class="stat-unit">满分 5.0</text>
        </view>

        <view class="stat-card stat-price">
          <view class="stat-head">
            <text class="stat-label">人均价格</text>
            <text class="stat-icon">💰</text>
          </view>
          <text class="stat-num">{{ avgPriceText }}</text>
          <text class="stat-unit">元 / 道</text>
        </view>
      </view>

      <!-- 食堂菜品分布 -->
      <view class="card">
        <view class="card-head">
          <text class="card-title">🏪 食堂菜品分布</text>
          <text class="card-tip">共 {{ dishList.length }} 道</text>
        </view>
        <view class="bar-row" v-for="c in canteenStats" :key="c.name">
          <text class="bar-name">{{ c.name }}</text>
          <view class="bar-track">
            <view class="bar-fill fill-canteen" :style="{ width: c.width + '%' }"></view>
          </view>
          <text class="bar-value">{{ c.count }} 道 · {{ c.percent }}%</text>
        </view>
        <view class="mini-empty" v-if="!canteenStats.length">暂无菜品数据</view>
      </view>

      <!-- 口味标签热度 -->
      <view class="card">
        <view class="card-head">
          <text class="card-title">🌶️ 口味标签热度</text>
          <text class="card-tip">TOP 8</text>
        </view>
        <view class="bar-row" v-for="t in tagStats" :key="t.name">
          <text class="bar-name">{{ t.name }}</text>
          <view class="bar-track">
            <view class="bar-fill fill-tag" :style="{ width: t.width + '%' }"></view>
          </view>
          <text class="bar-value">{{ t.count }} 次 · {{ t.percent }}%</text>
        </view>
        <view class="mini-empty" v-if="!tagStats.length">暂无标签数据</view>
      </view>

      <!-- Top 推荐菜品 -->
      <view class="card">
        <view class="card-head">
          <text class="card-title">🔥 Top 推荐菜品</text>
          <text class="card-tip">按推荐次数</text>
        </view>
        <view class="top-row" v-for="(d, i) in topDishes" :key="d.id || d._id || i">
          <text class="top-rank" :class="{ hot: i < 3 }">{{ i + 1 }}</text>
          <DishImage :dish="d" :size="80" :radius="10" />
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

<style scoped>
.dash-page {
  padding: 24rpx;
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
  padding: 32rpx 30rpx;
  margin-bottom: 20rpx;
}

.hero-main {
  flex: 1;
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

.hero-refresh {
  font-size: 24rpx;
  color: #ff6b35;
  background: rgba(255, 107, 53, 0.14);
  border-radius: 24rpx;
  padding: 10rpx 26rpx;
}

/* ---------------- 提示 / 状态 ---------------- */
.notice {
  display: flex;
  align-items: center;
  background: #fffbe6;
  border-radius: 16rpx;
  padding: 18rpx 22rpx;
  margin-bottom: 20rpx;
}

.notice-icon {
  font-size: 24rpx;
  margin-right: 10rpx;
}

.notice-text {
  flex: 1;
  font-size: 22rpx;
  color: #a86b00;
}

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

/* ---------------- 统计卡 ---------------- */
.stat-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 20rpx;
  margin-bottom: 20rpx;
}

.stat-card {
  width: calc(50% - 10rpx);
  border-radius: 22rpx;
  padding: 26rpx 24rpx;
  box-sizing: border-box;
}

.stat-dish {
  background: linear-gradient(135deg, #fff3ed, #ffe4d6);
}

.stat-canteen {
  background: linear-gradient(135deg, #eef4ff, #dfe9ff);
}

.stat-rating {
  background: linear-gradient(135deg, #fff8e6, #ffefc7);
}

.stat-price {
  background: linear-gradient(135deg, #eefaf3, #d9f2e4);
}

.stat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.stat-label {
  font-size: 24rpx;
  color: #666;
}

.stat-icon {
  font-size: 32rpx;
}

.stat-num {
  display: block;
  font-size: 56rpx;
  font-weight: bold;
  margin-top: 14rpx;
  line-height: 1.1;
}

.stat-dish .stat-num {
  color: #ff6b35;
}

.stat-canteen .stat-num {
  color: #3b6fd6;
}

.stat-rating .stat-num {
  color: #e39b00;
}

.stat-price .stat-num {
  color: #2ba58c;
}

.stat-unit {
  display: block;
  font-size: 20rpx;
  color: #999;
  margin-top: 6rpx;
}

/* ---------------- 卡片 ---------------- */
.card {
  background: #fff;
  border-radius: 22rpx;
  padding: 26rpx 24rpx;
  margin-bottom: 20rpx;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24rpx;
}

.card-title {
  font-size: 29rpx;
  font-weight: bold;
  color: #333;
}

.card-tip {
  font-size: 21rpx;
  color: #bbb;
}

/* ---------------- 条形图 ---------------- */
.bar-row {
  display: flex;
  align-items: center;
  margin-bottom: 20rpx;
}

.bar-name {
  width: 150rpx;
  font-size: 24rpx;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bar-track {
  flex: 1;
  height: 22rpx;
  background: #f2f2f2;
  border-radius: 11rpx;
  overflow: hidden;
  margin: 0 16rpx;
}

.bar-fill {
  height: 100%;
  border-radius: 11rpx;
}

.fill-canteen {
  background: linear-gradient(90deg, #ff6b35, #ffa06b);
}

.fill-tag {
  background: linear-gradient(90deg, #667eea, #9b8cf0);
}

.bar-value {
  width: 160rpx;
  text-align: right;
  font-size: 21rpx;
  color: #888;
}

.mini-empty {
  text-align: center;
  font-size: 24rpx;
  color: #bbb;
  padding: 40rpx 0;
}

/* ---------------- Top 推荐 ---------------- */
.top-row {
  display: flex;
  align-items: center;
  padding: 14rpx 0;
  border-bottom: 1rpx solid #f5f5f5;
}

.top-row:last-child {
  border-bottom: none;
}

.top-rank {
  width: 44rpx;
  text-align: center;
  font-size: 26rpx;
  font-weight: bold;
  color: #ccc;
}

.top-rank.hot {
  color: #ff6b35;
}

.top-main {
  flex: 1;
  min-width: 0;
}

.top-name {
  display: block;
  font-size: 27rpx;
  color: #333;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.top-sub {
  display: block;
  font-size: 21rpx;
  color: #999;
  margin-top: 6rpx;
}

.top-count {
  font-size: 24rpx;
  color: #ff6b35;
  font-weight: bold;
}
</style>
