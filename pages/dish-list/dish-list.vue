<template>
  <view class="dish-list-page">
    <!-- ==================== 顶部校园美食推荐 Banner ====================
         页面有原生导航栏（「食堂菜单」），所以 Banner 从导航栏下方开始 -->
    <view class="banner">
      <view class="banner-body">
        <text class="banner-kicker">校园美食探索</text>
        <text class="banner-title">今天想吃点什么？</text>
        <text class="banner-sub">三个食堂 · 每天都有新发现</text>

        <!-- AI 智能推荐入口 -->
        <view class="ai-entry" @click="goAi">
          <view class="ai-entry-mark">
            <Icon name="sparkle" :size="30" color="#ffffff" />
          </view>
          <view class="ai-entry-text">
            <text class="ai-entry-title">AI 智能推荐</text>
            <text class="ai-entry-sub">说口味 · 报预算 · 忌口自动规避</text>
          </view>
          <Icon name="right" :size="28" color="#ffffff" />
        </view>
      </view>
    </view>

    <!-- ==================== 搜索栏（悬浮圆角） ==================== -->
    <view class="search-wrap">
      <view class="search-box">
        <Icon name="search" :size="32" color="#ff5a36" />
        <input
          class="search-input"
          type="text"
          v-model="keyword"
          placeholder="搜菜名、口味、窗口"
          placeholder-class="search-ph"
          confirm-type="search"
          @input="onKeywordInput"
          @confirm="onSearch"
        />
        <view class="search-clear" v-if="keyword" @click="clearKeyword">
          <Icon name="close" :size="26" color="#b8b2aa" />
        </view>
      </view>
      <view class="search-btn" @click="onSearch">
        <text class="search-btn-text">搜索</text>
      </view>
    </view>

    <!-- ==================== 筛选（胶囊式） ==================== -->
    <view class="filter-row">
      <picker
        class="filter-picker"
        mode="selector"
        :range="canteenOptions"
        :value="canteenIndex"
        @change="onCanteenChange"
      >
        <view class="chip" :class="{ active: !!filters.canteen }">
          <Icon name="location" :size="26" :color="filters.canteen ? '#ff5a36' : '#8a8580'" />
          <text class="chip-text">{{ filters.canteen || '全部食堂' }}</text>
          <Icon name="down" :size="22" :color="filters.canteen ? '#ff5a36' : '#b8b2aa'" />
        </view>
      </picker>

      <picker
        class="filter-picker"
        mode="selector"
        :range="categoryOptions"
        :value="categoryIndex"
        @change="onCategoryChange"
      >
        <view class="chip" :class="{ active: !!filters.category }">
          <Icon name="filter" :size="26" :color="filters.category ? '#ff5a36' : '#8a8580'" />
          <text class="chip-text">{{ filters.category || '全部分类' }}</text>
          <Icon name="down" :size="22" :color="filters.category ? '#ff5a36' : '#b8b2aa'" />
        </view>
      </picker>
    </view>

    <!-- 排序：同样是胶囊，选中态用品牌色实底 -->
    <view class="sort-row">
      <view
        class="chip chip-sort"
        v-for="s in sortOptions"
        :key="s.value"
        :class="{ 'chip-on': sortMode === s.value }"
        @click="onSortChange(s.value)"
      >
        <text class="chip-text">{{ s.label }}</text>
      </view>
    </view>

    <!-- 首次加载中 -->
    <view class="state-box" v-if="firstLoading">
      <view class="state-mark">
        <Icon name="clock" :size="56" color="#ff5a36" />
      </view>
      <text class="state-text">正在上菜…</text>
    </view>

    <!-- 请求失败 -->
    <view class="state-box" v-else-if="loadError && !list.length">
      <view class="state-mark">
        <Icon name="warning" :size="56" color="#ff5a36" />
      </view>
      <text class="state-text">{{ loadError }}</text>
      <view class="state-btn" @click="retry">重新加载</view>
    </view>

    <!-- 空态 -->
    <view class="state-box" v-else-if="!list.length">
      <view class="state-mark">
        <Icon name="bowl" :size="56" color="#ff5a36" />
      </view>
      <text class="state-text">{{ emptyText }}</text>
      <view class="state-btn" @click="resetFilter">重置筛选条件</view>
    </view>

    <!-- ==================== 菜品列表 ==================== -->
    <view class="dish-list" v-else>
      <!-- 自动放开筛选的说明：不让「筛选条突然变空」显得莫名其妙 -->
      <view class="relax-tip" v-if="relaxedFilters">
        <text class="relax-tip-text">当前筛选里没搜到，已为你放开食堂 / 分类筛选</text>
      </view>

      <view class="list-count">
        <text>共 {{ total }} 道菜品</text>
        <text class="list-source" v-if="dataSource">{{ sourceText }}</text>
      </view>

      <view class="dish-card" v-for="d in list" :key="d.id" @click="goDetail(d.id)">
        <!-- 图片比例统一 4:3，收藏按钮压在图片右上角 -->
        <view class="dish-img-wrap">
          <DishImage :dish="d" :size="220" :height="165" :radius="20" />
          <view class="fav-btn" :class="{ 'is-fav': isFav(d) }" @click.stop="toggleFav(d)">
            <Icon name="heart" :size="30" :color="isFav(d) ? '#ffffff' : '#8a8580'" />
          </view>
        </view>

        <view class="dish-main">
          <view class="dish-title-row">
            <text class="dish-name">{{ d.name }}</text>
          </view>

          <!-- 推荐标签：全部由真实字段推导（新品 / AI 热门 / 高口碑） -->
          <view class="dish-badges" v-if="dishBadges(d).length">
            <text
              class="badge"
              :class="'badge-' + b.tone"
              v-for="b in dishBadges(d)"
              :key="b.text"
            >{{ b.text }}</text>
          </view>

          <view class="dish-loc">
            <Icon name="location" :size="20" color="#b8b2aa" />
            <text class="dish-loc-text">{{ formatLocation(d) || '位置待完善' }}</text>
          </view>

          <view class="dish-tags" v-if="d.tags && d.tags.length">
            <text class="tag" v-for="(t, i) in d.tags.slice(0, 3)" :key="i">{{ t }}</text>
          </view>

          <view class="dish-bottom">
            <text class="dish-price">{{ money(d.price) }}</text>
            <view class="dish-metrics">
              <view class="metric">
                <Icon name="star" :size="22" color="#ff5a36" />
                <text class="metric-strong">{{ ratingText(d.rating) }}</text>
              </view>
              <text class="metric-text" v-if="reviewText(d)">{{ reviewText(d) }}</text>
            </view>
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
import { ref, computed, onUnmounted } from 'vue'
import { onLoad, onShow, onReachBottom, onPullDownRefresh } from '@dcloudio/uni-app'
import { dishApi } from '@/api/index.js'
import { formatLocation } from '@/common/utils.js'
import { getFavorites, toggleFavorite } from '@/common/favorites.js'
import DishImage from '@/components/DishImage/DishImage.vue'
import Icon from '@/components/Icon/Icon.vue'

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

/**
 * 已经用于查询的关键词
 *
 * 用 ref 而不是普通变量：空态文案要跟着它更新。
 * 同时它也是「输入框里的新内容是否真的需要再查一次」的判断依据。
 */
const appliedKeyword = ref('')

/** 本次结果是否为了搜到东西而自动放开了食堂/分类筛选 */
const relaxedFilters = ref(false)

/** 已收藏的菜品 id（本机存储，见 common/favorites.js） */
const favorites = ref([])

/**
 * 本次列表数据来自哪里：'cloud' | 'local'
 *
 * 直接显示接口返回的 engine 字段，而不是猜。这条信息很关键：
 * 之前排查「搜不到菜 / 搜出别的菜」时，一半时间都花在确认
 * 「现在看的到底是云端数据库还是本机兜底数据」上。
 */
const dataSource = ref('')

const sourceText = computed(() =>
  dataSource.value === 'cloud' ? '云端菜单' : dataSource.value === 'local' ? '本机演示数据' : ''
)

/**
 * 空态文案
 *
 * 搜索搜不到时必须把「搜的是什么」写出来：原来只有一句「暂无符合条件的菜品」，
 * 用户无法判断是自己打错字、筛选条件叠加了，还是真的没有这道菜。
 */
const emptyText = computed(() => {
  const kw = appliedKeyword.value
  const extra = []
  if (filters.value.canteen) extra.push(filters.value.canteen)
  if (filters.value.category) extra.push(filters.value.category)
  const scope = extra.length ? `（已筛选：${extra.join(' · ')}）` : ''
  if (kw) return `没搜到和「${kw}」相关的菜${scope}，换个词试试`
  return `暂无符合条件的菜品${scope}，试试换个筛选条件`
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
  // 收藏状态以本机存储为准：从详情页返回时可能已经变了，每次显示都重新读一遍
  favorites.value = getFavorites()

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

/** 请求序号：用于丢弃过期响应，避免慢的旧请求覆盖新结果 */
let seq = 0

/** 边打边搜的防抖计时器 */
let searchTimer = null

async function loadList(reset = false) {
  // reset（搜索 / 换筛选 / 清空关键词）**不允许**被在途请求拦下。
  // 原来的 `if (loading.value) return` 会让「加载中点搜索」这次请求被直接丢弃：
  // 关键词变了、列表却还是上一次的结果 —— 看起来就是「搜不到」或「搜出来别的菜」。
  // 只有「加载更多」才需要等前一次结束。
  if (!reset && (loading.value || !hasMore.value)) return

  const targetPage = reset ? 1 : page.value
  const mySeq = ++seq
  appliedKeyword.value = keyword.value.trim()
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

    // 已经有更新的请求发出去了 → 本次结果作废，绝不写进界面
    if (mySeq !== seq) return

    // 记下这份数据来自云端还是本机兜底（翻页时不覆盖，保持一致）
    if (reset && res && res.engine) dataSource.value = res.engine

    const rows = Array.isArray(res) ? res : ((res && res.list) || [])
    const merged = reset ? rows : [...list.value, ...rows]
    // 价格排序由前端处理（接口契约只提供 sortByRating）
    list.value = sortMode.value === 'price' ? sortByPriceAsc(merged) : merged

    // 接口为了搜到东西，可能自动放开了食堂/分类筛选（见 api/index.js 的 searchFallback）。
    // 结果既然已经放开，筛选条也必须跟着清空 —— 否则筛选条写着「第一食堂」、
    // 列表里却是别的食堂的菜，比搜不到更让人困惑；同时放开后翻页参数才和结果一致。
    if (res && res.relaxedFilters && (filters.value.canteen || filters.value.category)) {
      filters.value.canteen = ''
      filters.value.category = ''
      relaxedFilters.value = true
    } else if (reset) {
      relaxedFilters.value = false
    }

    if (res && typeof res.total === 'number') {
      total.value = res.total
    } else if (reset) {
      total.value = rows.length
    }

    hasMore.value = res && typeof res.hasMore === 'boolean' ? res.hasMore : rows.length >= PAGE_SIZE
    page.value = targetPage + 1
    everLoaded.value = true
  } catch (e) {
    if (mySeq !== seq) return
    loadError.value = '菜品加载失败，请检查网络后重试'
    uni.showToast({ title: '加载失败，请稍后重试', icon: 'none' })
  } finally {
    // 过期请求不能把最新请求的 loading 关掉，否则会提前解除加载态
    if (mySeq === seq) {
      loading.value = false
      firstLoading.value = false
    }
  }
}

function onSearch() {
  cancelSearchTimer()
  loadList(true)
}

/**
 * 输入框内容变化 → 防抖后自动搜索
 *
 * 页面上虽然有「搜索」按钮和键盘回车，但同学输入完通常直接等结果。
 * 没有这个边打边搜时，输入框里的字和列表内容对不上，
 * 表现出来就是「搜了半天搜不到」——其实压根没发起查询。
 */
function onKeywordInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchTimer = null
    // 输入内容与「已经查过的关键词」相同（例如刚点过搜索 / 清空）就不再重复请求
    if (keyword.value.trim() === appliedKeyword.value) return
    loadList(true)
  }, 350)
}

function cancelSearchTimer() {
  if (searchTimer) {
    clearTimeout(searchTimer)
    searchTimer = null
  }
}

function clearKeyword() {
  cancelSearchTimer()
  keyword.value = ''
  loadList(true)
}

onUnmounted(cancelSearchTimer)

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
  cancelSearchTimer()
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

/** 去 AI 推荐页（tabBar 页用 switchTab） */
function goAi() {
  uni.switchTab({ url: '/pages/recommend/recommend' })
}

/* ===== 推荐标签 / 收藏 / 数据展示 ===== */

/**
 * 菜品推荐标签
 *
 * 三个标签全部由**真实字段**推导，不编造数据：
 *   · 新品   ← is_new
 *   · AI 热门 ← recommend_count（被 AI 推荐的次数）达到 150
 *   · 高口碑 ← rating ≥ 4.7
 * 最多显示两个，避免卡片被标签占满。
 */
function dishBadges(d) {
  if (!d) return []
  const out = []
  if (d.is_new) out.push({ text: '新品', tone: 'new' })
  if (Number(d.recommend_count) >= 150) out.push({ text: 'AI 热门', tone: 'hot' })
  if (Number(d.rating) >= 4.7) out.push({ text: '高口碑', tone: 'top' })
  return out.slice(0, 2)
}

/**
 * 评价数文案
 *
 * 数据里只有真实的评价条数（review_count）与被推荐次数（recommend_count），
 * 没有「销量」字段，所以这里显示的是**评价数**而不是编一个销量出来。
 * 想显示真实销量的话，需要给菜品加 sales 字段（云端种子、本机菜谱、AI 兜底库三处同步）。
 */
function reviewText(d) {
  const n = Number(d && d.review_count)
  if (!Number.isFinite(n) || n <= 0) return ''
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k 评价` : `${n} 评价`
}

/** 该菜品是否已收藏 */
function isFav(d) {
  const id = d && (d.id || d._id)
  return !!id && favorites.value.indexOf(String(id)) >= 0
}

/** 切换收藏 */
function toggleFav(d) {
  const id = d && (d.id || d._id)
  if (!id) return
  const now = toggleFavorite(id)
  favorites.value = getFavorites()
  uni.showToast({
    title: now ? '已收藏' : '已取消收藏',
    icon: 'none',
    duration: 1200
  })
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
/**
 * 菜单页样式
 *
 * 全部使用 common/tokens.scss 的设计令牌（uni.scss 已自动注入）。
 * 改造前这里同样写死了 $brand / $canvas / 20rpx，还拿 emoji 当图标。
 */

.dish-list-page {
  min-height: 100vh;
  background: $canvas;
  padding-bottom: 32rpx;
}

/* ==================== 顶部校园美食推荐 Banner ==================== */

.banner {
  position: relative;
  margin: 20rpx 24rpx 0;
  padding: 36rpx 32rpx 88rpx; /* 底部多留一截，给悬浮搜索框压上来 */
  border-radius: $radius-lg;
  /**
   * 渐变自上而下由深转亮（196deg）。
   *
   * 深色段必须覆盖**整块文字**（kicker + 标题 + 副标题，约占 Banner 上方 62%），
   * 所以第二个色标放在 68% 而不是 52%：实测 52% 时第三行小字已经落在渐变的浅段上，
   * 背景亮度对应的对比度只有 4.14:1，达不到小字 4.5:1 的标准。
   * 浅段留给压上来的白色 AI 卡片，视觉上有层次但不影响可读性。
   */
  background: linear-gradient(196deg, $brand-dark 0%, $brand-dark 68%, $brand 100%);
  overflow: hidden;
  box-shadow: 0 12rpx 32rpx rgba(255, 90, 54, 0.2);
}

/**
 * 深色 Banner 上原本想加一团右上角白色柔光做层次，实测后去掉了：
 * 它正好压在标题右端，把那片背景提亮到 4.09:1（透明 0.08 时就已如此），
 * 小字达不到 4.5:1。层次交给渐变本身，不牺牲可读性。
 */

.banner-body {
  position: relative;
}

.banner-kicker {
  display: block;
  font-size: $fs-tag;
  /* 半透明白会拉低对比度，小字统一用 0.95 */
  color: rgba(255, 255, 255, 0.95);
  letter-spacing: 4rpx;
}

.banner-title {
  display: block;
  font-size: 44rpx;
  font-weight: $fw-bold;
  color: #fff;
  margin-top: 10rpx;
  text-shadow: 0 2rpx 10rpx rgba(150, 45, 10, 0.3);
}

.banner-sub {
  display: block;
  font-size: $fs-cap;
  color: rgba(255, 255, 255, 0.95);
  margin-top: 10rpx;
}

/* AI 智能推荐入口：白底卡片压在橙色渐变的右下 */
.ai-entry {
  display: flex;
  align-items: center;
  margin-top: 28rpx;
  padding: 20rpx 24rpx;
  border-radius: $radius-card;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 8rpx 22rpx rgba(150, 45, 10, 0.18);
}

.ai-entry:active {
  background: #fff;
}

.ai-entry-mark {
  width: 60rpx;
  height: 60rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, $brand 0%, $brand-dark 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.ai-entry-text {
  flex: 1;
  margin: 0 $gap;
  min-width: 0;
}

.ai-entry-title {
  display: block;
  font-size: $fs-sub;
  font-weight: $fw-bold;
  color: $ink;
}

.ai-entry-sub {
  display: block;
  font-size: $fs-tag;
  color: $gray6;
  margin-top: 6rpx;
}

/* ==================== 搜索栏（悬浮圆角） ==================== */

.search-wrap {
  position: relative;
  z-index: 3;
  margin: -60rpx 24rpx 0;
  display: flex;
  align-items: center;
}

.search-box {
  flex: 1;
  display: flex;
  align-items: center;
  height: 88rpx;
  background: $surface;
  border-radius: $radius-pill;
  padding: 0 28rpx;
  box-shadow: 0 10rpx 26rpx rgba(20, 17, 15, 0.1);
}

.search-input {
  flex: 1;
  height: 88rpx;
  font-size: $fs-body;
  color: $ink;
  margin-left: 14rpx;
}

.search-ph {
  color: $gray4;
  font-size: $fs-body;
}

.search-clear {
  padding: 8rpx;
}

.search-btn {
  margin-left: 16rpx;
  height: 88rpx;
  padding: 0 34rpx;
  border-radius: $radius-pill;
  background: linear-gradient(135deg, $brand 0%, $brand-dark 100%);
  box-shadow: 0 8rpx 20rpx rgba(255, 90, 54, 0.28);
  display: flex;
  align-items: center;
  justify-content: center;
}

.search-btn-text {
  font-size: $fs-sub;
  font-weight: $fw-bold;
  color: #fff;
}

/* ==================== 筛选 / 排序（胶囊式） ==================== */

.filter-row {
  display: flex;
  margin: 28rpx 24rpx 0;
}

.filter-picker {
  flex: 1;
}

.filter-picker + .filter-picker {
  margin-left: $gap;
}

.chip {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 68rpx;
  padding: 0 22rpx;
  border-radius: $radius-pill;
  background: $surface;
  border: 1rpx solid $line;
  box-shadow: $shadow-card;
}

.chip.active {
  background: $brand-soft;
  border-color: $brand-line;
}

.chip-text {
  font-size: $fs-cap;
  color: $gray7;
  margin: 0 8rpx;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.chip.active .chip-text {
  color: $brand;
  font-weight: $fw-medium;
}

.sort-row {
  display: flex;
  margin: 20rpx 24rpx 0;
}

.chip-sort {
  flex: 1;
  padding: 0 12rpx;
}

.chip-sort + .chip-sort {
  margin-left: 16rpx;
}

/* 排序选中：品牌色实底 */
.chip-on {
  background: linear-gradient(135deg, $brand 0%, $brand-dark 100%);
  border-color: transparent;
  box-shadow: 0 8rpx 18rpx rgba(255, 90, 54, 0.26);
}

.chip-on .chip-text {
  color: #fff;
  font-weight: $fw-bold;
}

/* ==================== 列表 ==================== */

.dish-list {
  padding: 28rpx 24rpx 0;
}

.list-count {
  font-size: $fs-cap;
  color: $gray6;
  padding: 0 6rpx 20rpx;
  display: flex;
  align-items: center;
}

/* 数据来源标识：让「现在看的是云端还是本机演示数据」一眼可见 */
.list-source {
  font-size: $fs-tag;
  color: $gray4;
  margin-left: 12rpx;
  padding: 2rpx 12rpx;
  border-radius: $radius-sm;
  background: $surface-sunken;
}

/* 自动放开筛选的提示条：浅色底 + 小字，不抢菜品卡片的视觉重点 */
.relax-tip {
  background: $warning-soft;
  border-radius: $radius;
  padding: 18rpx 22rpx;
  margin-bottom: 20rpx;
}

.relax-tip-text {
  font-size: $fs-cap;
  color: $warning;
  line-height: 1.5;
}

/* 大圆角白卡 + 极浅投影 */
.dish-card {
  display: flex;
  background: $surface;
  border-radius: $radius-card;
  padding: 24rpx;
  margin-bottom: 24rpx;
  box-shadow: $shadow-card;
}

.dish-card:active {
  background: $surface;
}

.dish-img-wrap {
  position: relative;
  margin-right: 24rpx;
  flex-shrink: 0;
}

/* 收藏按钮：压在图片右上角，半透明白底 + 描边，选中变品牌色实心 */
.fav-btn {
  position: absolute;
  top: 12rpx;
  right: 12rpx;
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2rpx 10rpx rgba(20, 17, 15, 0.12);
}

.fav-btn.is-fav {
  background: $brand;
  box-shadow: 0 4rpx 14rpx rgba(255, 90, 54, 0.35);
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
  font-size: 32rpx;
  font-weight: $fw-bold;
  color: $ink;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 推荐标签 */
.dish-badges {
  display: flex;
  flex-wrap: wrap;
  margin-top: 12rpx;
}

.badge {
  font-size: $fs-tag;
  padding: 4rpx 14rpx;
  border-radius: $radius-sm;
  margin-right: 10rpx;
}

.badge-new {
  color: #fff;
  background: $brand;
}

.badge-hot {
  color: $brand;
  background: $brand-soft;
  border: 1rpx solid $brand-line;
}

.badge-top {
  color: $warning;
  background: $warning-soft;
}

.dish-loc {
  display: flex;
  align-items: center;
  margin-top: 12rpx;
}

.dish-loc-text {
  font-size: $fs-tag;
  color: $gray6;
  margin-left: 6rpx;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.dish-tags {
  display: flex;
  flex-wrap: wrap;
  margin-top: 12rpx;
}

.tag {
  font-size: $fs-tag;
  color: $gray6;
  background: $surface-sunken;
  padding: 4rpx 14rpx;
  border-radius: $radius-sm;
  margin: 0 10rpx 8rpx 0;
}

.dish-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
  padding-top: 16rpx;
}

.dish-price {
  font-size: $fs-card;
  font-weight: $fw-bold;
  color: $brand;
}

.dish-metrics {
  display: flex;
  align-items: center;
}

.metric {
  display: flex;
  align-items: center;
}

.metric-strong {
  font-size: $fs-cap;
  font-weight: $fw-medium;
  color: $gray7;
  margin-left: 4rpx;
}

.metric-text {
  font-size: $fs-tag;
  color: $gray4;
  margin-left: 12rpx;
}

.list-footer {
  text-align: center;
  padding: 24rpx 0 40rpx;
  font-size: $fs-cap;
  color: $gray4;
}

/* ==================== 状态 ==================== */

.state-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 60rpx;
}

.state-mark {
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  background: $brand-soft;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 28rpx;
}

.state-text {
  font-size: $fs-sub;
  color: $gray6;
  text-align: center;
  line-height: 1.6;
}

.state-btn {
  margin-top: 32rpx;
  padding: 16rpx 48rpx;
  font-size: $fs-sub;
  color: $brand;
  border: 1rpx solid $brand-line;
  border-radius: $radius-pill;
}
</style>
