<template>
  <view class="home" :style="pageStyle">
    <!-- ==================== 顶部视觉 Banner ====================
         校园食堂实景图做底：左侧压暗保证白字对比度，右侧保留食堂场景；
         上面再叠一层品牌橙渐变，和全局主题色统一。
         图放在 static/banner/ 下（小程序只能读包内 static 资源）。 -->
    <view class="banner">
      <image class="banner-img" :src="bannerSrc" mode="aspectFill" />
      <view class="banner-scrim"></view>
      <view class="banner-tint"></view>

      <view class="banner-body">
        <!-- 问候语保留：按时段 + 用户昵称，未登录降级为「同学」 -->
        <view class="banner-hello">
          <text class="banner-hello-text">{{ greeting }}，{{ nickname }} 👋</text>
        </view>

        <text class="banner-title">食遇校园</text>
        <text class="banner-sub">AI 食堂推荐</text>
        <text class="banner-slogan">不知道吃什么？让 AI 帮你决定</text>
      </view>
    </view>

    <!-- ==================== 搜索栏（从 Banner 底部悬浮） ====================
         菜品列表是 tabBar 页，switchTab 不支持带 query，因此这里只做入口 -->
    <view class="search-wrap">
      <view class="search-box" @click="goSearch">
        <Icon name="search" :size="34" color="#ff5a36" />
        <text class="search-placeholder">搜索菜品、食堂……</text>
      </view>
    </view>

    <!-- ==================== AI 推荐主入口 ==================== -->
    <view class="ai-card">
      <view class="ai-head">
        <view class="ai-mark">
          <Icon name="sparkle" :size="38" color="#ffffff" />
        </view>
        <view class="ai-headtext">
          <text class="ai-title">不知道吃啥？交给 AI</text>
          <text class="ai-desc">说口味 · 报预算 · 忌口自动规避</text>
        </view>
      </view>

      <!-- 推荐依据：把「AI 到底按什么推荐」讲清楚 -->
      <view class="ai-facts">
        <text class="ai-fact">现在是{{ mealType }}时间</text>
        <text class="ai-fact">今日口味</text>
        <text class="ai-fact">预算</text>
        <text class="ai-fact">忌口</text>
        <text class="ai-fact">热门排行</text>
      </view>

      <view class="ai-btn" @click="goRecommend">
        <text class="ai-btn-text">立即推荐</text>
        <Icon name="right" :size="34" color="#ffffff" />
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

    <!-- ==================== 多人拼饭入口 ==================== -->
    <view class="group-entry" @click="goGroup">
      <view class="group-icon">
        <Icon name="user" :size="34" color="#ff5a36" />
      </view>
      <view class="group-body">
        <text class="group-title">几个人一起吃？</text>
        <text class="group-sub">有人忌口、有人要辣？算出大家都能吃的菜</text>
      </view>
      <Icon name="right" :size="30" color="#b8b2aa" />
    </view>

    <!-- ==================== 今日热门 ==================== -->
    <view class="section" v-if="hotList.length">
      <view class="sec-head">
        <view class="sec-title">
          <Icon name="fire" :size="34" color="#ff5a36" />
          <text class="sec-title-text">今日热门</text>
        </view>
        <view class="sec-more" @click="goSearch">
          <text class="sec-more-text">查看更多</text>
          <Icon name="right" :size="24" color="#8a8580" />
        </view>
      </view>

      <scroll-view class="rail" scroll-x :show-scrollbar="false">
        <view
          class="hot-card"
          v-for="d in hotList"
          :key="dishKey(d)"
          @click="goDetail(d)"
        >
          <!-- 图片比例统一成 4:3，横向排列时视觉更整齐 -->
          <DishImage :dish="d" :size="256" :height="192" :radius="20" />
          <text class="hot-name">{{ d.name }}</text>
          <view class="hot-meta">
            <text class="hot-price">{{ formatPrice(d.price) }}</text>
            <view class="score">
              <Icon name="star" :size="22" color="#ff5a36" />
              <text class="score-text">{{ formatRating(d.rating) }}</text>
            </view>
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- ==================== 高分红榜 ==================== -->
    <view class="section" v-if="goodList.length">
      <view class="sec-head">
        <view class="sec-title">
          <Icon name="star" :size="34" color="#ff5a36" />
          <text class="sec-title-text">高分红榜</text>
        </view>
      </view>

      <view class="rank-list">
        <view
          class="rank-item"
          v-for="(d, idx) in goodList"
          :key="dishKey(d)"
          @click="goDetail(d)"
        >
          <text class="rank-num" :class="{ 'rank-top': idx < 3 }">{{ idx + 1 }}</text>
          <DishImage :dish="d" :size="112" :radius="16" />

          <view class="rank-info">
            <text class="rank-name">{{ d.name }}</text>
            <view class="rank-loc">
              <Icon name="location" :size="20" color="#b8b2aa" />
              <text class="rank-loc-text">{{ formatLocation(d) || '位置待完善' }}</text>
            </view>
            <view class="rank-tags" v-if="d.tags && d.tags.length">
              <text class="tag" v-for="t in d.tags.slice(0, 3)" :key="t">{{ t }}</text>
            </view>
          </view>

          <view class="rank-right">
            <text class="rank-price">{{ formatPrice(d.price) }}</text>
            <view class="score score-right">
              <Icon name="star" :size="22" color="#ff5a36" />
              <text class="score-text">{{ formatRating(d.rating) }}</text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- ==================== 新品尝鲜 ==================== -->
    <view class="section" v-if="newList.length">
      <view class="sec-head">
        <view class="sec-title">
          <Icon name="bowl" :size="34" color="#ff5a36" />
          <text class="sec-title-text">新品尝鲜</text>
        </view>
      </view>

      <view class="new-grid">
        <view
          class="new-item"
          v-for="d in newList"
          :key="dishKey(d)"
          @click="goDetail(d)"
        >
          <view class="new-thumb">
            <DishImage :dish="d" :size="200" :height="150" :radius="20" />
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
import { formatPrice, formatLocation, localAssetUrl } from '@/common/utils.js'
import DishImage from '@/components/DishImage/DishImage.vue'
import Icon from '@/components/Icon/Icon.vue'

/* -------------------------------- 页面状态 -------------------------------- */

const hour = ref(new Date().getHours())
const nickname = ref('同学')
const hotList = ref([])
const goodList = ref([])
const newList = ref([])
const loading = ref(false)
/** 本次加载中任意一次接口走了本地兜底 */
const localEngine = ref(false)

/* -------------------------------- 视觉相关 -------------------------------- */

/**
 * Banner 图：校园食堂实景照
 *
 * 必须放在 static/ 下 —— 小程序运行时只认包内静态资源（或云存储），
 * 放在项目根目录的「首页照片/」里在小程序里是加载不到的。
 * 原图 1672×941 PNG（1.7MB），已由 _ui/banner.mjs 处理成 1125×600 的 JPEG（约 79KB）。
 */
const bannerSrc = localAssetUrl('static/banner/canteen.jpg')

/**
 * 顶部安全区内边距
 *
 * 首页在 pages.json 里配的是 navigationStyle: custom（没有原生导航栏），
 * 页面内容从屏幕最顶端开始渲染。不加这段内边距，Banner 里的文字会顶到手机状态栏
 * （时间、电量）下面，看起来像被截断了。
 */
const statusBarHeight = ref(0)
try {
  const info = (uni.getWindowInfo && uni.getWindowInfo()) || uni.getSystemInfoSync() || {}
  statusBarHeight.value = Number(info.statusBarHeight) || 0
} catch (e) {
  statusBarHeight.value = 0
}

const pageStyle = computed(() => ({
  paddingTop: statusBarHeight.value + 'px'
}))

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

/**
 * 快捷口味标签：取 TASTE_OPTIONS 前 6 个，统一成 { label, value }
 *
 * constants 里的选项既可能是纯中文词（当前形态 ['辣','清淡',...]），
 * 也可能是 { label, value } 对象。模板里用的是 t.value / t.label，
 * 所以这里必须先归一化 —— 否则纯字符串取不到 .value，标签会渲染成空白，
 * 点一下还会把 undefined 存进偏好里。
 */
const quickTastes = computed(() => {
  const list = Array.isArray(TASTE_OPTIONS) ? TASTE_OPTIONS : []
  return list.slice(0, 6).map((t) => {
    if (typeof t === 'string') return { label: t, value: t }
    return {
      label: (t && (t.label || t.value)) || '',
      value: (t && (t.value || t.label)) || ''
    }
  })
})

/**
 * 首页是否已经拿到要展示的数据（用于空态判断）
 *
 * 只统计**真正会在页面上渲染的**三个榜单：
 * 原来还包含食堂列表，但首页已去掉「食堂直达」入口，
 * 若仍把它算作数据，会出现「食堂请求成功、三个榜单都为空」时
 * 页面既没有内容、也不显示空态提示的情况。
 */
const hasData = computed(
  () =>
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
    // 首页已去掉「食堂直达」，因此不再请求食堂列表（少一次云函数调用，首屏更快）
    const [hot, good, fresh] = await Promise.all([
      dishApi.rank('hot', 8),
      dishApi.rank('good', 6),
      dishApi.rank('new', 6)
    ])

    let usedLocal = false
    const mark = (res) => {
      if (res && res.engine === 'local') usedLocal = true
    }
    mark(hot)
    mark(good)
    mark(fresh)

    hotList.value = (hot && hot.list) || []
    goodList.value = (good && good.list) || []
    newList.value = (fresh && fresh.list) || []
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

function dishKey(d) {
  return (d && (d.id || d._id)) || (d && d.name) || ''
}

/** 去多人拼饭页 */
function goGroup() {
  uni.navigateTo({ url: '/pages/group/group' })
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

<style lang="scss" scoped>
@import '@/common/tokens.scss';
/**
 * 首页样式
 *
 * 全部使用 common/tokens.scss 的设计令牌（uni.scss 已自动注入，无需 import）：
 * 品牌橙 $brand、暖白画布 $canvas、统一圆角 $radius-card / $radius-lg、
 * 两档极浅投影。之前这里写死了一堆 $brand / 20rpx / emoji 图标，
 * 是全项目唯一没走设计系统的页面，所以看起来比其它页面「廉价」。
 */

.home {
  min-height: 100vh;
  background: $canvas;
  padding-bottom: 48rpx;
}

/* ==================== 顶部 Banner ==================== */

.banner {
  position: relative;
  margin: 16rpx 24rpx 0;
  height: 400rpx; /* ≈200px */
  border-radius: 48rpx; /* 24px */
  overflow: hidden;
  /* 图片没加载出来时先铺底色，避免白块闪一下 */
  background: $surface-sunken;
  box-shadow: $shadow-raise;
}

.banner-img {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
}

/**
 * 左侧压暗层
 *
 * 这张实景图平均亮度 192/255（很亮），而且实测照片里有一处接近纯白的高光
 * （_ui/preview.mjs 会把文字底下的像素量出来）：只叠浅橙蒙版时，
 * 白字压在最亮处对比度只有 1:1 —— 等于看不见。
 * 所以左侧先压一层足够强的中性暗色，且一直压到文字列的右端才淡出：
 *   · 0% 处 0.78、文字列末端约 0.68 → 白字对比度 6:1 以上
 *   · 86% 之后才降到接近 0 → 右侧仍然保留食堂场景
 */
.banner-scrim {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    96deg,
    rgba(20, 17, 15, 0.78) 0%,
    rgba(20, 17, 15, 0.68) 42%,
    rgba(20, 17, 15, 0.42) 66%,
    rgba(20, 17, 15, 0.12) 86%,
    rgba(20, 17, 15, 0) 100%
  );
}

/** 品牌橙渐变：与主题色统一，右侧几乎透明，把食堂场景留出来 */
.banner-tint {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    96deg,
    rgba(255, 90, 54, 0.44) 0%,
    rgba(255, 90, 54, 0.32) 46%,
    rgba(255, 90, 54, 0.14) 74%,
    rgba(255, 90, 54, 0.02) 100%
  );
}

/* 文字左侧排列，右侧留给食堂场景 */
.banner-body {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  /* 右侧留出足够空间（180pt），文字列只占 Banner 左侧约一半，
     这样白字始终落在被压暗的区域内，右侧照片保持干净 */
  padding: 0 360rpx 0 44rpx;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.banner-hello {
  align-self: flex-start;
  background: rgba(255, 255, 255, 0.22);
  border-radius: $radius-pill;
  padding: 6rpx 20rpx;
  margin-bottom: 20rpx;
}

.banner-hello-text {
  font-size: $fs-tag;
  color: rgba(255, 255, 255, 0.96);
}

.banner-title {
  font-size: $fs-display;
  font-weight: $fw-bold;
  color: #fff;
  letter-spacing: 2rpx;
  line-height: 1.15;
  text-shadow: 0 2rpx 8rpx rgba(20, 17, 15, 0.4);
}

.banner-sub {
  font-size: $fs-cap;
  font-weight: $fw-medium;
  color: rgba(255, 255, 255, 0.92);
  letter-spacing: 6rpx;
  margin-top: 12rpx;
  text-shadow: 0 2rpx 8rpx rgba(20, 17, 15, 0.4);
}

.banner-slogan {
  font-size: $fs-tag;
  color: rgba(255, 255, 255, 0.86);
  margin-top: 22rpx;
  line-height: 1.55;
  text-shadow: 0 2rpx 8rpx rgba(20, 17, 15, 0.4);
}

/* ==================== 搜索栏（悬浮在 Banner 底部） ==================== */

.search-wrap {
  position: relative;
  z-index: 3;
  margin: -48rpx 24rpx 0;
}

.search-box {
  height: 96rpx;
  background: $surface;
  border-radius: 48rpx;
  display: flex;
  align-items: center;
  padding: 0 32rpx;
  box-shadow: 0 12rpx 32rpx rgba(20, 17, 15, 0.1);
}

.search-placeholder {
  font-size: $fs-body;
  color: $gray4;
  margin-left: 16rpx;
}

/* ==================== AI 推荐主入口 ==================== */

.ai-card {
  margin: 28rpx 24rpx 0;
  padding: $gap-card 32rpx;
  background: $surface;
  border-radius: $radius-lg;
  box-shadow: $shadow-card;
  border: 1rpx solid $brand-line;
}

.ai-head {
  display: flex;
  align-items: center;
}

.ai-mark {
  width: 76rpx;
  height: 76rpx;
  border-radius: $radius-card;
  background: linear-gradient(135deg, $brand, $brand-dark);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: $shadow-brand;
}

.ai-headtext {
  flex: 1;
  margin-left: $gap;
}

.ai-title {
  font-size: $fs-card;
  font-weight: $fw-bold;
  color: $ink;
  display: block;
}

.ai-desc {
  font-size: $fs-cap;
  color: $gray6;
  margin-top: 8rpx;
  display: block;
}

.ai-facts {
  display: flex;
  flex-wrap: wrap;
  margin-top: 24rpx;
}

.ai-fact {
  font-size: $fs-tag;
  color: $brand;
  background: $brand-soft;
  border-radius: $radius-pill;
  padding: 8rpx 20rpx;
  margin: 0 12rpx 12rpx 0;
}

/* 橙色渐变主按钮 */
.ai-btn {
  margin-top: 12rpx;
  height: $h-btn;
  background: linear-gradient(135deg, $brand, $brand-dark);
  border-radius: $radius-pill;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: $shadow-brand;
}

.ai-btn-text {
  font-size: $fs-card;
  font-weight: $fw-bold;
  color: #fff;
  margin-right: 8rpx;
}

.quick-area {
  margin-top: 28rpx;
  padding-top: 24rpx;
  border-top: 1rpx solid $line;
}

.quick-tip {
  font-size: $fs-tag;
  color: $gray6;
  display: block;
  margin-bottom: 16rpx;
}

.quick-tags {
  display: flex;
  flex-wrap: wrap;
}

.quick-tag {
  font-size: $fs-cap;
  color: $brand;
  background: $brand-soft;
  border-radius: $radius-pill;
  padding: 10rpx 26rpx;
  margin: 0 16rpx 16rpx 0;
}

/* ==================== 多人拼饭入口 ==================== */

.group-entry {
  display: flex;
  align-items: center;
  margin: $gap-lg $gap-page 0;
  padding: $gap-card;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
  box-shadow: $shadow-card;
}

.group-icon {
  width: 76rpx;
  height: 76rpx;
  border-radius: $radius;
  background: $brand-soft;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.group-body {
  flex: 1;
  min-width: 0;
  margin: 0 18rpx;
}

.group-title {
  display: block;
  font-size: $fs-body;
  font-weight: $fw-medium;
  color: $ink;
}

.group-sub {
  display: block;
  margin-top: 6rpx;
  font-size: $fs-tag;
  color: $gray6;
  line-height: 1.5;
}

/* ==================== 通用区块 ==================== */

.section {
  margin: 28rpx 24rpx 0;
  background: $surface;
  border-radius: $radius-lg;
  padding: 32rpx;
  box-shadow: $shadow-card;
}

.sec-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24rpx;
}

.sec-title {
  display: flex;
  align-items: center;
}

.sec-title-text {
  font-size: $fs-card;
  font-weight: $fw-bold;
  color: $ink;
  margin-left: 12rpx;
}

.sec-more {
  display: flex;
  align-items: center;
}

.sec-more-text {
  font-size: $fs-cap;
  color: $gray6;
  margin-right: 4rpx;
}

/* 横向滚动条隐藏（部分机型会画一条灰线，影响观感） */
.rail {
  white-space: nowrap;
  width: 100%;
}

/* 让横向列表能贴着卡片边缘滚出去，两端又不显得切口生硬 */
.rail {
  margin: 0 -32rpx;
  padding: 0 32rpx;
}

/* ==================== 今日热门 ==================== */

.hot-card {
  display: inline-block;
  width: 256rpx;
  margin-right: $gap;
  vertical-align: top;
}

.hot-name {
  font-size: $fs-sub;
  font-weight: $fw-medium;
  color: $ink;
  margin-top: 16rpx;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hot-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10rpx;
}

.hot-price {
  font-size: $fs-body;
  font-weight: $fw-bold;
  color: $brand;
}

/* 评分：图标 + 数字，比整行橙色更轻 */
.score {
  display: flex;
  align-items: center;
}

.score-text {
  font-size: $fs-tag;
  color: $gray6;
  margin-left: 6rpx;
}

/* ==================== 高分红榜 ==================== */

.rank-list {
  display: flex;
  flex-direction: column;
}

.rank-item {
  display: flex;
  align-items: center;
  padding: 22rpx 0;
  border-bottom: 1rpx solid $line;
}

.rank-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.rank-num {
  width: 44rpx;
  text-align: center;
  font-size: $fs-card;
  font-weight: $fw-bold;
  color: $gray4;
  flex-shrink: 0;
}

.rank-num.rank-top {
  color: $brand;
}

.rank-info {
  flex: 1;
  overflow: hidden;
  margin: 0 $gap;
}

.rank-name {
  font-size: $fs-body;
  font-weight: $fw-medium;
  color: $ink;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rank-loc {
  display: flex;
  align-items: center;
  margin-top: 8rpx;
}

.rank-loc-text {
  font-size: $fs-tag;
  color: $gray4;
  margin-left: 6rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rank-tags {
  margin-top: 12rpx;
}

.tag {
  display: inline-block;
  font-size: $fs-tag;
  color: $gray6;
  background: $surface-sunken;
  border-radius: $radius-sm;
  padding: 4rpx 14rpx;
  margin-right: 10rpx;
}

.rank-right {
  text-align: right;
  min-width: 120rpx;
  flex-shrink: 0;
}

.rank-price {
  font-size: $fs-body;
  font-weight: $fw-bold;
  color: $brand;
  display: block;
}

.score-right {
  justify-content: flex-end;
  margin-top: 8rpx;
}

/* ==================== 新品尝鲜 ==================== */

.new-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
}

.new-item {
  width: 200rpx;
  margin-bottom: 28rpx;
}

.new-thumb {
  position: relative;
}

.new-badge {
  position: absolute;
  top: 0;
  left: 0;
  font-size: 18rpx;
  font-weight: $fw-bold;
  color: #fff;
  background: $brand;
  border-radius: 20rpx 0 20rpx 0;
  padding: 4rpx 14rpx;
  letter-spacing: 1rpx;
}

.new-name {
  font-size: $fs-cap;
  color: $gray7;
  margin-top: 14rpx;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.new-price {
  font-size: $fs-cap;
  font-weight: $fw-bold;
  color: $brand;
  margin-top: 4rpx;
  display: block;
}

/* ==================== 状态与提示 ==================== */

.state-box {
  margin: 28rpx 24rpx 0;
  padding: 72rpx 32rpx;
  background: $surface;
  border-radius: $radius-lg;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: $shadow-card;
}

.state-emoji {
  font-size: 64rpx;
  margin-bottom: 16rpx;
}

.state-text {
  font-size: $fs-sub;
  color: $gray6;
}

.state-retry {
  margin-top: 24rpx;
  font-size: $fs-sub;
  color: $brand;
  border: 1rpx solid $brand-line;
  border-radius: $radius-pill;
  padding: 10rpx 40rpx;
}

.data-hint {
  padding: 24rpx 32rpx 0;
  text-align: center;
}

.data-hint-text {
  font-size: $fs-tag;
  color: $gray4;
  line-height: 32rpx;
}
</style>
