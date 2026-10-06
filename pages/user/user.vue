<template>
  <view class="user-page">
    <!-- ==================== 顶部：橙色品牌渐变 + 身份 + 偏好标签 ==================== -->
    <view class="hero">
      <view class="hero-halo"></view>

      <!-- 已登录 -->
      <template v-if="isLogin">
        <view class="hero-row">
          <view class="avatar">
            <!-- 头像有两种：登录页随机挑的 emoji，或云存储/网络图片地址。
                 只有真正的地址才能交给 <image>，否则小程序会把 emoji 当路径加载，头像变成空白 -->
            <image
              v-if="profile.avatar && avatarIsImage"
              class="avatar-img"
              :src="profile.avatar"
              mode="aspectFill"
            />
            <text v-else class="avatar-emoji">{{ profile.avatar || '😋' }}</text>
          </view>

          <view class="hero-info">
            <view class="name-row">
              <text class="nickname">{{ profile.nickname || '同学' }}</text>
              <text class="role-tag" :class="{ 'role-admin': isAdminRole }">{{ roleLabel }}</text>
            </view>
            <view class="explorer-row">
              <Icon name="sparkle" :size="24" color="#ffffff" />
              <text class="explorer-text">{{ explorer.title }}</text>
            </view>
            <text class="uid">ID: {{ uidText }}</text>
          </view>

          <view class="edit-entry" @click="goEditProfile">
            <Icon name="edit" :size="28" color="#ffffff" />
            <text class="edit-text">编辑资料</text>
          </view>
        </view>

        <!-- 校园美食探索者：进度条（由收藏 / 评价 / 推荐次数共同决定） -->
        <view class="explorer-bar">
          <view class="explorer-track">
            <view class="explorer-fill" :style="{ width: explorer.percent + '%' }"></view>
          </view>
          <text class="explorer-hint">{{ explorer.hint }}</text>
        </view>

        <!-- 饮食偏好标签 -->
        <view class="taste-tags" v-if="prefChips.length">
          <text class="taste-tag" v-for="c in prefChips" :key="c">{{ c }}</text>
        </view>
        <view class="taste-tags" v-else>
          <text class="taste-tag taste-tag-empty" @click="goRecommend">还没设置口味偏好，去设置</text>
        </view>
      </template>

      <!-- 未登录：不强制跳转，点击按钮才去登录页 -->
      <view class="hero-row" v-else>
        <view class="avatar">
          <Icon name="user" :size="56" color="#ff5a36" />
        </view>
        <view class="hero-info">
          <text class="nickname">未登录</text>
          <text class="uid">登录后可保存昵称、口味与收藏</text>
        </view>
        <view class="login-btn" @click="goLogin">
          <text class="login-btn-text">点击登录</text>
        </view>
      </view>
    </view>

    <!-- ==================== 数据统计 ==================== -->
    <view class="stats" v-if="isLogin">
      <view class="stat" @click="goFavorites">
        <text class="stat-num">{{ favCount }}</text>
        <text class="stat-label">收藏菜品</text>
      </view>
      <view class="stat-line"></view>
      <view class="stat" @click="goRecommend">
        <text class="stat-num">{{ recommendCount }}</text>
        <text class="stat-label">AI 推荐</text>
      </view>
      <view class="stat-line"></view>
      <view class="stat" @click="toggleReviews">
        <text class="stat-num">{{ reviewTotal }}</text>
        <text class="stat-label">我的评价</text>
      </view>
    </view>

    <!-- ==================== AI 饮食画像 ==================== -->
    <view class="card">
      <view class="card-head">
        <view class="card-title">
          <Icon name="sparkle" :size="32" color="#ff5a36" />
          <text class="card-title-text">AI 饮食画像</text>
        </view>
        <view class="card-more" @click="goRecommend">
          <text class="card-more-text">去推荐</text>
          <Icon name="right" :size="22" color="#8a8580" />
        </view>
      </view>

      <view class="portrait">
        <view class="portrait-row">
          <view class="portrait-icon"><Icon name="fire" :size="28" color="#ff5a36" /></view>
          <text class="portrait-label">喜欢口味</text>
          <text class="portrait-value">{{ portrait.taste }}</text>
        </view>
        <view class="portrait-row">
          <view class="portrait-icon"><Icon name="location" :size="28" color="#ff5a36" /></view>
          <text class="portrait-label">常去食堂</text>
          <text class="portrait-value">{{ portrait.canteen }}</text>
        </view>
        <view class="portrait-row">
          <view class="portrait-icon"><Icon name="wallet" :size="28" color="#ff5a36" /></view>
          <text class="portrait-label">消费预算</text>
          <text class="portrait-value">{{ portrait.budget }}</text>
        </view>
        <view class="portrait-row portrait-row-note">
          <view class="portrait-icon"><Icon name="info" :size="28" color="#ff5a36" /></view>
          <text class="portrait-label">推荐依据</text>
          <text class="portrait-value">{{ portrait.basis }}</text>
        </view>
      </view>

      <view class="portrait-foot" v-if="pref">
        <text class="clear-btn" @click.stop="clearPref">清除口味档案</text>
      </view>
    </view>

    <!-- ==================== 功能列表 ==================== -->
    <view class="card menu-card">
      <!-- 我的收藏 -->
      <view class="menu-item" @click="goFavorites">
        <view class="menu-icon"><Icon name="heart" :size="32" color="#ff5a36" /></view>
        <text class="menu-text">我的收藏</text>
        <text class="menu-ext" v-if="favCount">{{ favCount }} 道</text>
        <Icon name="right" :size="24" color="#b8b2aa" />
      </view>

      <!-- 我的评价 -->
      <view class="menu-item" @click="toggleReviews">
        <view class="menu-icon"><Icon name="clipboard" :size="32" color="#ff5a36" /></view>
        <text class="menu-text">我的评价</text>
        <text class="menu-ext" v-if="reviewTotal">{{ reviewTotal }} 条</text>
        <Icon :name="showReviews ? 'up' : 'down'" :size="24" color="#b8b2aa" />
      </view>

      <!-- 我的评价：就地展开 -->
      <view class="panel" v-if="showReviews">
        <view class="panel-loading" v-if="loadingReviews">
          <text class="panel-tip">正在加载评价…</text>
        </view>
        <template v-else-if="reviews.length">
          <view class="review-item" v-for="r in reviews" :key="r._id || r.id">
            <view class="review-head">
              <text class="review-nick">{{ r.nickname || '匿名同学' }}</text>
              <text class="review-status" v-if="r.status === 0">审核中</text>
              <text class="review-time">{{ formatTime(r.create_date) }}</text>
            </view>
            <view class="review-stars">
              <text class="stars">{{ stars(r.rating) }}</text>
              <text class="score">{{ formatRating(r.rating) }} 分</text>
            </view>
            <text class="review-content">{{ r.content }}</text>
          </view>
        </template>
        <text class="panel-tip" v-else>还没有发表过评价</text>
      </view>

      <!-- AI 推荐历史 -->
      <view class="menu-item" @click="toggleHistory">
        <view class="menu-icon"><Icon name="clock" :size="32" color="#ff5a36" /></view>
        <text class="menu-text">AI 推荐历史</text>
        <text class="menu-ext" v-if="history.length">最近 {{ history.length }} 条</text>
        <Icon :name="showHistory ? 'up' : 'down'" :size="24" color="#b8b2aa" />
      </view>

      <!-- AI 推荐历史：就地展开 -->
      <view class="panel" v-if="showHistory">
        <template v-if="history.length">
          <view class="history-item" v-for="(h, i) in history" :key="i">
            <view class="history-head">
              <text class="history-label">{{ historyLabel(h) }}</text>
              <text class="history-time">{{ formatTime(h.time) }}</text>
            </view>
            <text class="history-summary" v-if="h.summary">{{ h.summary }}</text>
          </view>
          <view class="panel-foot">
            <text class="clear-btn" @click.stop="clearHistory">清空历史</text>
          </view>
        </template>
        <text class="panel-tip" v-else>还没有推荐记录，去 AI 推荐页试试吧</text>
      </view>

      <!-- 美食足迹 -->
      <view class="menu-item" @click="toggleFootprint">
        <view class="menu-icon"><Icon name="location" :size="32" color="#ff5a36" /></view>
        <text class="menu-text">美食足迹</text>
        <text class="menu-ext" v-if="footprint.total">{{ footprint.total }} 道</text>
        <Icon :name="showFootprint ? 'up' : 'down'" :size="24" color="#b8b2aa" />
      </view>

      <!-- 美食足迹：就地展开（按食堂聚合「评价过 + 收藏过」的菜品） -->
      <view class="panel" v-if="showFootprint">
        <template v-if="footprint.total">
          <text class="panel-tip">统计口径：你评价过和收藏过的菜品，按所在食堂聚合</text>
          <view class="foot-row" v-for="f in footprint.bars" :key="f.name">
            <text class="foot-name">{{ f.name }}</text>
            <view class="foot-track">
              <view class="foot-fill" :style="{ width: f.percent + '%' }"></view>
            </view>
            <text class="foot-count">{{ f.count }} 道</text>
          </view>
        </template>
        <text class="panel-tip" v-else>还没有足迹：去菜单收藏几道菜、或者给吃过的菜写个评价吧</text>
      </view>

      <!-- 设置 -->
      <view class="menu-item" @click="toggleSettings">
        <view class="menu-icon"><Icon name="settings" :size="32" color="#ff5a36" /></view>
        <text class="menu-text">设置</text>
        <Icon :name="showSettings ? 'up' : 'down'" :size="24" color="#b8b2aa" />
      </view>

      <!-- 设置：就地展开（把散落的账户与偏好操作归拢到一起） -->
      <view class="panel" v-if="showSettings">
        <text class="panel-tip">口味档案与推荐历史只存在本机，清空后无法恢复</text>
        <view class="menu-item menu-item-sub" @click="clearPref" v-if="pref">
          <text class="menu-text">清除口味档案</text>
          <Icon name="right" :size="24" color="#b8b2aa" />
        </view>
        <view class="menu-item menu-item-sub" @click="clearHistory" v-if="history.length">
          <text class="menu-text">清空推荐历史</text>
          <Icon name="right" :size="24" color="#b8b2aa" />
        </view>
        <view class="menu-item menu-item-sub" @click="goAdmin" v-if="isAdminRole">
          <text class="menu-text">管理后台</text>
          <Icon name="right" :size="24" color="#b8b2aa" />
        </view>
        <view class="menu-item menu-item-sub" @click="logout" v-if="isLogin">
          <text class="menu-text danger-text">退出登录</text>
          <Icon name="right" :size="24" color="#b8b2aa" />
        </view>
      </view>

      <!-- 关于项目 -->
      <view class="menu-item" @click="showAbout">
        <view class="menu-icon"><Icon name="info" :size="32" color="#ff5a36" /></view>
        <text class="menu-text">关于项目</text>
        <Icon name="right" :size="24" color="#b8b2aa" />
      </view>
    </view>
  </view>
</template>

<script setup>
/**
 * 我的（食遇校园）
 *
 * 说明：登录态以本地资料（userApi.getProfile()，储存键 userInfo）为准，
 *      全程只调用 @/api/index.js，不直接触碰 uniCloud。
 *      未登录不强制跳转，只有用户主动点击才进登录页。
 */
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { userApi, recommendApi, reviewApi, buildPrefLabel, buildPrefSentence, getRecommendCount } from '@/api/index.js'
import { clearAuth, formatTime, renderStars } from '@/common/utils.js'
import { countFavorites, getFavorites } from '@/common/favorites.js'
import { LOCAL_DISHES } from '@/common/local-dishes.js'
import Icon from '@/components/Icon/Icon.vue'

/* -------------------------------- 页面状态 -------------------------------- */

const profile = ref(null)
const uid = ref('')
const pref = ref(null)
const history = ref([])
const reviews = ref([])
const showReviews = ref(false)
const showHistory = ref(false)
const showFootprint = ref(false)
const showSettings = ref(false)
const loadingReviews = ref(false)
/** 收藏数量（本机存储，onShow 时刷新，从收藏页返回后数字会跟着变） */
const favCount = ref(0)
/** 收藏的菜品 id（本机存储，画像与美食足迹要用它推食堂） */
const favoriteIds = ref([])
/** 累计 AI 推荐次数（api 层的累计计数器，不是最近 20 条历史的长度） */
const recommendCount = ref(0)
/** 我发表过的评价总数（云端 mine 返回的 total，用于统计卡） */
const reviewTotal = ref(0)

/* -------------------------------- 计算属性 -------------------------------- */

const isLogin = computed(() => !!profile.value)

const isAdminRole = computed(() => !!profile.value && profile.value.role === 'admin')

const roleLabel = computed(() => (isAdminRole.value ? '管理员' : '普通同学'))

/**
 * 头像是否为「可加载的图片地址」
 *
 * 登录页保存的 avatar 是 emoji（'😋' 之类），把它塞进 <image :src> 会加载失败，
 * 头像呈现空白。这里只有识别为真实地址时才走 <image>，否则用 <text> 直接渲染 emoji。
 */
const avatarIsImage = computed(() => {
  const a = String((profile.value && profile.value.avatar) || '')
  return /^(https?:\/\/|cloud:\/\/|wxfile:\/\/|data:image\/|\/|static\/)/.test(a)
})

/** uid 后 6 位，展示成 ID: xxxxxx */
const uidText = computed(() => {
  const id = String(uid.value || '')
  return id ? id.slice(-6) : '------'
})

/** 上次偏好的一句话标签（与推荐历史同一套风格） */
const prefLabel = computed(() => {
  const p = pref.value
  if (!p) return ''
  try {
    return buildPrefLabel(p)
  } catch (e) {
    return '已保存口味偏好'
  }
})

/** 偏好拆成小标签：口味 / 忌口 / 预算 / 食堂 / 补充 */
const prefChips = computed(() => {
  const p = pref.value || {}
  const chips = []
  if (p.meal_type) chips.push(p.meal_type)
  if (p.taste && p.taste.length) chips.push('爱' + p.taste.join('·'))
  if (p.allergies && p.allergies.length) chips.push('忌' + p.allergies.join('·'))
  if (p.budget) chips.push(p.budget + ' 元内')
  if (p.canteen) chips.push(p.canteen)
  if (p.extra) chips.push(String(p.extra))
  return chips
})

/* ------------------------ 校园美食探索者 / AI 画像 ------------------------ */

/**
 * 菜品 id → 食堂
 *
 * 本机菜谱里每道菜都带 canteen，而评价记录里存的是 dish_id、收藏存的也是 id，
 * 所以「常去食堂 / 美食足迹」可以由真实数据推出来，不用编。
 * 云端菜品是同一份种子数据（id 一致），因此这个映射对云端数据同样成立。
 */
function canteenOfDish(dishId) {
  const id = String(dishId || '').trim()
  if (!id) return ''
  const hit = LOCAL_DISHES.find((d) => String(d.id) === id || String(d._id) === id)
  return (hit && hit.canteen) || ''
}

/**
 * 校园美食探索者等级
 *
 * 由三个**真实计数**合成活跃度：收藏 + 评价 + 推荐次数。
 * 等级只是把活跃度分段，不引入任何虚构数据；未登录时不计。
 */
const explorer = computed(() => {
  if (!isLogin.value) {
    return { title: '未登录', hint: '登录后开始你的美食探索', percent: 0 }
  }
  const score = favCount.value + reviewTotal.value + recommendCount.value
  const levels = [
    { min: 0, title: '初来乍到' },
    { min: 3, title: '校园美食探索者' },
    { min: 10, title: '资深食客' },
    { min: 25, title: '食堂活地图' }
  ]
  let idx = 0
  for (let i = 0; i < levels.length; i++) {
    if (score >= levels[i].min) idx = i
  }
  const current = levels[idx]
  const next = levels[idx + 1]
  const percent = next
    ? Math.max(6, Math.min(100, Math.round(((score - current.min) / (next.min - current.min)) * 100)))
    : 100
  return {
    title: current.title,
    hint: next
      ? `活跃度 ${score} · 再攒 ${next.min - score} 点升到「${next.title}」`
      : `活跃度 ${score} · 已到最高等级`,
    percent
  }
})

/** AI 饮食画像：喜欢口味 / 常去食堂 / 消费预算 / 推荐依据 */
const portrait = computed(() => {
  const p = pref.value || {}

  const taste = p.taste && p.taste.length ? p.taste.join(' · ') : '还没记录，去推荐页说一句口味'

  // 常去食堂：评价过的菜 + 收藏的菜，按食堂计数取最多的那个（真实数据，不猜）
  const counter = {}
  const bump = (name) => {
    if (!name) return
    counter[name] = (counter[name] || 0) + 1
  }
  reviews.value.forEach((r) => bump(canteenOfDish(r.dish_id)))
  favoriteIds.value.forEach((id) => bump(canteenOfDish(id)))
  let topName = ''
  let topCount = 0
  Object.keys(counter).forEach((name) => {
    if (counter[name] > topCount) {
      topCount = counter[name]
      topName = name
    }
  })
  const canteen = topName
    ? `${topName}（${topCount} 道）`
    : p.canteen || '还没有数据，收藏或评价几道菜试试'

  const budget = p.budget ? `${p.budget} 元以内` : '还没设置预算'

  let basis = ''
  try {
    basis = buildPrefSentence(p) || ''
  } catch (e) {
    basis = ''
  }
  if (!basis) basis = '按口味、预算、忌口与食堂热度综合排序'

  return { taste, canteen, budget, basis }
})

/** 美食足迹：评价过 + 收藏过的菜品按食堂聚合 */
const footprint = computed(() => {
  const seen = new Set()
  const counter = {}
  const add = (dishId) => {
    const id = String(dishId || '').trim()
    if (!id || seen.has(id)) return
    const name = canteenOfDish(id)
    if (!name) return
    seen.add(id)
    counter[name] = (counter[name] || 0) + 1
  }
  reviews.value.forEach((r) => add(r.dish_id))
  favoriteIds.value.forEach((id) => add(id))

  const rows = Object.keys(counter)
    .map((name) => ({ name, count: counter[name] }))
    .sort((a, b) => b.count - a.count)
  const max = rows.length ? rows[0].count : 0
  return {
    total: seen.size,
    bars: rows.map((r) => ({ ...r, percent: max ? Math.round((r.count / max) * 100) : 0 }))
  }
})

/* -------------------------------- 数据加载 -------------------------------- */

function load() {
  try {
    profile.value = userApi.getProfile()
    uid.value = userApi.getUid() || ''
    pref.value = recommendApi.getSavedPref() || null
    history.value = (recommendApi.getHistory() || []).slice(0, 5)
    recommendCount.value = getRecommendCount()
    favoriteIds.value = getFavorites()
    favCount.value = favoriteIds.value.length
  } catch (e) {
    // 本地读取异常时保持空态，不白屏
    pref.value = null
    history.value = []
    favoriteIds.value = []
  }
  if (showReviews.value) loadReviews()
}

/**
 * 只取评价**条数**用于统计卡
 *
 * pageSize 传 1：云端仍会返回 total，不需要把 20 条数据拉下来。
 * 失败就保持 0，不打扰用户（统计数字不该弹报错）。
 */
async function loadReviewTotal() {
  try {
    const res = await reviewApi.mine({ page: 1, pageSize: 1 })
    reviewTotal.value = Number((res && res.total) || 0)
  } catch (e) {
    reviewTotal.value = 0
  }
}

async function loadReviews() {
  loadingReviews.value = true
  try {
    const res = await reviewApi.mine({ page: 1, pageSize: 20 })
    reviews.value = (res && res.list) || []
    // 顺手把总数校准一次（展开时拿到的是精确值）
    reviewTotal.value = Number((res && res.total) || reviews.value.length)
  } catch (e) {
    reviews.value = []
    uni.showToast({ title: '评价加载失败，请稍后重试', icon: 'none' })
  } finally {
    loadingReviews.value = false
  }
}

// tabBar 页：onShow 覆盖首次进入与从其它页面返回
onShow(() => {
  load()
  loadReviewTotal()
})

/* -------------------------------- 交互逻辑 -------------------------------- */

/** 进入我的收藏（普通页面，用 navigateTo） */
function goFavorites() {
  uni.navigateTo({ url: '/pages/favorites/favorites' })
}

function toggleReviews() {
  if (!isLogin.value) {
    uni.showToast({ title: '登录后可查看我的评价', icon: 'none' })
    setTimeout(() => goLogin(), 600)
    return
  }
  showReviews.value = !showReviews.value
  if (showReviews.value) loadReviews()
}

function toggleHistory() {
  showHistory.value = !showHistory.value
  if (showHistory.value) history.value = (recommendApi.getHistory() || []).slice(0, 5)
}

/** 美食足迹：展开时确保评价数据已加载（足迹要按评价的菜品聚合） */
function toggleFootprint() {
  showFootprint.value = !showFootprint.value
  if (showFootprint.value && !reviews.value.length) loadReviews()
}

/** 设置：就地展开，把账户与偏好相关的操作归拢到一起 */
function toggleSettings() {
  showSettings.value = !showSettings.value
}

function clearPref() {
  uni.showModal({
    title: '提示',
    content: '确定清除口味档案吗？下次推荐将不再自动回填。',
    success: (res) => {
      if (!res.confirm) return
      try {
        // savePref(null) 后部分端会留下 'null' 字符串，直接移除储存键最稳妥
        uni.removeStorageSync('shiyu_pref')
      } catch (e) {
        // 忽略存储异常
      }
      pref.value = null
      uni.showToast({ title: '已清除口味档案', icon: 'none' })
    }
  })
}

function clearHistory() {
  uni.showModal({
    title: '提示',
    content: '确定清空推荐历史吗？',
    success: (res) => {
      if (!res.confirm) return
      try {
        recommendApi.clearHistory()
      } catch (e) {
        // 忽略
      }
      history.value = []
      uni.showToast({ title: '已清空推荐历史', icon: 'none' })
    }
  })
}

function showAbout() {
  uni.showModal({
    title: '关于食遇校园',
    content:
      '食遇校园 · AI 智能食堂推荐\n\n用 AI 解决「每天不知道吃啥」：说口味、报预算、填忌口，即可得到食堂菜品推荐。\n\n技术说明：uni-app (Vue3) + uniCloud 云函数 + 大模型 API；云端不可用时自动降级为本地规则引擎，离线也能完整演示。',
    showCancel: false,
    confirmText: '知道了'
  })
}

function logout() {
  uni.showModal({
    title: '提示',
    content: '确定退出登录吗？',
    success: (res) => {
      if (!res.confirm) return
      try {
        userApi.clear()
        clearAuth()
      } catch (e) {
        // 忽略
      }
      reviews.value = []
      showReviews.value = false
      load()
      uni.showToast({ title: '已退出登录', icon: 'none' })
    }
  })
}

function goLogin() {
  uni.navigateTo({ url: '/pages/login/login' })
}

function goEditProfile() {
  // 身份信息保存在本机，修改昵称/头像/身份统一在登录页完成
  uni.navigateTo({ url: '/pages/login/login?mode=edit' })
}

function goRecommend() {
  uni.switchTab({ url: '/pages/recommend/recommend' })
}

function goAdmin() {
  uni.navigateTo({ url: '/pages/admin/index' })
}

/* -------------------------------- 展示辅助 -------------------------------- */

function stars(rating) {
  return renderStars(Number(rating) || 0)
}

function formatRating(rating) {
  const n = Number(rating)
  return Number.isFinite(n) ? n.toFixed(1) : '—'
}

/** 历史记录标签：优先用记录自带的 label，否则按偏好现算一次 */
function historyLabel(item) {
  if (!item) return '无特殊偏好'
  if (item.label) return item.label
  try {
    return buildPrefLabel(item.pref || {})
  } catch (e) {
    return '无特殊偏好'
  }
}
</script>

<style lang="scss" scoped>
@import '@/common/tokens.scss';
/**
 * 个人中心样式
 *
 * 全部使用 common/tokens.scss 的设计令牌（uni.scss 已自动注入）。
 * 改造前这页写死了 $brand / $canvas / 20rpx，还拿 emoji 当菜单图标。
 */

.user-page {
  min-height: 100vh;
  background: $canvas;
  padding-bottom: 60rpx;
}

/* ==================== 顶部：橙色品牌渐变 ==================== */

.hero {
  position: relative;
  margin: 20rpx 24rpx 0;
  padding: 36rpx 32rpx 40rpx;
  border-radius: $radius-lg;
  /**
   * 深色段必须覆盖**整块文字**（昵称 + 身份 + 探索者进度 + 偏好标签，约占头部 88%）。
   * 这里比首页 Banner 压得更深更长：个人中心的文字块更高，会伸到渐变浅段去。
   * 实测第一版（浅段从 68% 开始）小字只有 3.24:1，达不到 4.5:1。
   */
  background: linear-gradient(196deg, $brand-dark 0%, $brand-dark 88%, $brand 100%);
  overflow: hidden;
  box-shadow: 0 12rpx 32rpx rgba(255, 90, 54, 0.2);
}

.hero-halo {
  position: absolute;
  top: -130rpx;
  right: -110rpx;
  width: 300rpx;
  height: 300rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
}

.hero-row {
  position: relative;
  display: flex;
  align-items: center;
}

.avatar {
  width: 128rpx;
  height: 128rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.94);
  border: 4rpx solid rgba(255, 255, 255, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.avatar-img {
  width: 128rpx;
  height: 128rpx;
}

.avatar-emoji {
  font-size: 68rpx;
}

.hero-info {
  flex: 1;
  margin-left: 24rpx;
  overflow: hidden;
  min-width: 0;
}

.name-row {
  display: flex;
  align-items: center;
}

.nickname {
  font-size: 38rpx;
  font-weight: $fw-bold;
  color: #fff;
  text-shadow: 0 2rpx 10rpx rgba(150, 45, 10, 0.3);
}

/**
 * 身份标签：白底 + 深色字
 *
 * 文字不用品牌橙：实测 $brand 压在白底上只有 3.09:1，11pt 小字达不到 4.5:1。
 * 品牌感由头部的橙色渐变和图标承担。
 */
.role-tag {
  font-size: $fs-tag;
  color: $ink;
  background: rgba(255, 255, 255, 0.95);
  border-radius: $radius-pill;
  padding: 4rpx 18rpx;
  margin-left: 16rpx;
  flex-shrink: 0;
}

.role-tag.role-admin {
  color: #fff;
  background: rgba(20, 17, 15, 0.45);
}

/* 校园美食探索者 */
.explorer-row {
  display: flex;
  align-items: center;
  margin-top: 12rpx;
}

.explorer-text {
  font-size: $fs-cap;
  font-weight: $fw-medium;
  color: rgba(255, 255, 255, 0.96);
  margin-left: 8rpx;
}

.uid {
  font-size: $fs-tag;
  /* 半透明白会拉低对比度，小字一律用 0.92 以上 */
  color: rgba(255, 255, 255, 0.92);
  margin-top: 8rpx;
  display: block;
}

/* 编辑资料：深色半透明胶囊（白色半透明压在橙底上，白字会糊） */
.edit-entry {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  padding: 10rpx 20rpx;
  border-radius: $radius-pill;
  background: rgba(20, 17, 15, 0.3);
}

.edit-text {
  font-size: $fs-tag;
  color: #fff;
  margin-left: 6rpx;
}

/* 探索者进度条 */
.explorer-bar {
  position: relative;
  margin-top: 26rpx;
}

.explorer-track {
  height: 10rpx;
  border-radius: $radius-pill;
  background: rgba(255, 255, 255, 0.28);
  overflow: hidden;
}

.explorer-fill {
  height: 100%;
  border-radius: $radius-pill;
  background: #fff;
}

.explorer-hint {
  display: block;
  font-size: $fs-tag;
  /* 进度说明是小字，纯白而不是半透明白 */
  color: #fff;
  margin-top: 14rpx;
}

/* 饮食偏好标签：深色半透明胶囊 + 白字
   （原来的白色半透明胶囊会把底下的橙提亮，白字只有 3.2:1） */
.taste-tags {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  margin-top: 20rpx;
}

.taste-tag {
  font-size: $fs-tag;
  color: #fff;
  background: rgba(20, 17, 15, 0.3);
  border-radius: $radius-pill;
  padding: 8rpx 22rpx;
  margin: 0 14rpx 14rpx 0;
}

/* 未设置偏好时是个「去设置」的入口：白底 + 深色字（橙字压白底只有 3.09:1） */
.taste-tag-empty {
  background: rgba(255, 255, 255, 0.95);
  color: $ink;
}

.login-btn {
  border: 2rpx solid rgba(255, 255, 255, 0.9);
  border-radius: $radius-pill;
  padding: 14rpx 36rpx;
  flex-shrink: 0;
}

.login-btn-text {
  font-size: $fs-sub;
  color: #fff;
}

/* ==================== 数据统计 ==================== */

.stats {
  display: flex;
  align-items: center;
  margin: 24rpx 24rpx 0;
  padding: 28rpx 0;
  background: $surface;
  border-radius: $radius-card;
  box-shadow: $shadow-card;
}

.stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-num {
  font-size: $fs-title;
  font-weight: $fw-bold;
  color: $brand;
}

.stat-label {
  font-size: $fs-tag;
  color: $gray6;
  margin-top: 8rpx;
}

.stat-line {
  width: 1rpx;
  height: 48rpx;
  background: $line;
}

/* ==================== 通用卡片 ==================== */

.card {
  margin: 24rpx 24rpx 0;
  background: $surface;
  border-radius: $radius-card;
  padding: 28rpx 24rpx;
  box-shadow: $shadow-card;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-title {
  display: flex;
  align-items: center;
}

.card-title-text {
  font-size: $fs-card;
  font-weight: $fw-bold;
  color: $ink;
  margin-left: 12rpx;
}

.card-more {
  display: flex;
  align-items: center;
}

.card-more-text {
  font-size: $fs-cap;
  color: $gray6;
  margin-right: 4rpx;
}

/* ==================== AI 饮食画像 ==================== */

.portrait {
  margin-top: 20rpx;
}

.portrait-row {
  display: flex;
  align-items: center;
  padding: 20rpx 0;
  border-bottom: 1rpx solid $line;
}

.portrait-row:last-child {
  border-bottom: none;
}

.portrait-icon {
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  background: $brand-soft;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.portrait-label {
  font-size: $fs-sub;
  color: $gray6;
  margin-left: 18rpx;
  flex-shrink: 0;
}

.portrait-value {
  flex: 1;
  text-align: right;
  font-size: $fs-sub;
  font-weight: $fw-medium;
  color: $ink;
  margin-left: 18rpx;
  line-height: 1.5;
}

/* 推荐依据通常是完整一句话，左上对齐更好读 */
.portrait-row-note {
  align-items: flex-start;
}

.portrait-row-note .portrait-value {
  font-weight: $fw-normal;
  color: $gray7;
}

.portrait-foot {
  margin-top: 16rpx;
  display: flex;
  justify-content: flex-end;
}

.clear-btn {
  font-size: $fs-cap;
  color: $gray6;
  border: 1rpx solid $line-strong;
  border-radius: $radius-pill;
  padding: 10rpx 30rpx;
}

/* ==================== 功能列表 ==================== */

.menu-card {
  padding: 0 24rpx;
}

.menu-item {
  display: flex;
  align-items: center;
  padding: 30rpx 0;
  border-bottom: 1rpx solid $line;
}

.menu-item:last-child {
  border-bottom: none;
}

.menu-icon {
  width: 60rpx;
  height: 60rpx;
  border-radius: 50%;
  background: $brand-soft;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 20rpx;
  flex-shrink: 0;
}

.menu-text {
  flex: 1;
  font-size: $fs-body;
  color: $ink;
}

.menu-text.danger-text {
  color: $danger;
}

.menu-ext {
  font-size: $fs-tag;
  color: $gray4;
  margin-right: 12rpx;
}

/* 设置面板里的子项：不需要图标，缩进一级 */
.menu-item-sub {
  padding: 24rpx 0 24rpx 80rpx;
}

/* ==================== 展开面板 ==================== */

.panel {
  padding: 12rpx 0 24rpx;
  border-bottom: 1rpx solid $line;
}

.panel-tip {
  font-size: $fs-tag;
  color: $gray4;
  display: block;
  padding: 16rpx 0;
  line-height: 1.5;
}

.panel-loading {
  padding: 16rpx 0;
}

.panel-foot {
  margin-top: 12rpx;
  display: flex;
  justify-content: flex-end;
}

/* 我的评价 */

.review-item {
  background: $canvas;
  border-radius: $radius;
  padding: 22rpx;
  margin-bottom: 16rpx;
}

.review-item:last-child {
  margin-bottom: 0;
}

.review-head {
  display: flex;
  align-items: center;
}

.review-nick {
  font-size: $fs-sub;
  font-weight: $fw-medium;
  color: $ink;
}

.review-status {
  font-size: $fs-tag;
  color: $warning;
  background: $warning-soft;
  border-radius: $radius-sm;
  padding: 2rpx 12rpx;
  margin-left: 12rpx;
}

.review-time {
  flex: 1;
  text-align: right;
  font-size: $fs-tag;
  color: $gray4;
}

.review-stars {
  margin-top: 10rpx;
  display: flex;
  align-items: center;
}

.stars {
  font-size: $fs-cap;
  color: $warning;
}

.score {
  font-size: $fs-tag;
  color: $gray6;
  margin-left: 12rpx;
}

.review-content {
  font-size: $fs-sub;
  color: $gray7;
  margin-top: 12rpx;
  display: block;
  line-height: 1.5;
}

/* AI 推荐历史 */

.history-item {
  background: $canvas;
  border-radius: $radius;
  padding: 20rpx;
  margin-bottom: 16rpx;
}

.history-item:last-child {
  margin-bottom: 0;
}

.history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.history-label {
  flex: 1;
  font-size: $fs-sub;
  font-weight: $fw-medium;
  color: $ink;
}

.history-time {
  font-size: $fs-tag;
  color: $gray4;
  margin-left: 16rpx;
}

.history-summary {
  font-size: $fs-tag;
  color: $gray7;
  margin-top: 10rpx;
  display: block;
  line-height: 1.5;
}

/* 美食足迹：按食堂聚合的条形 */

.foot-row {
  display: flex;
  align-items: center;
  padding: 14rpx 0;
}

.foot-name {
  width: 150rpx;
  font-size: $fs-cap;
  color: $gray7;
  flex-shrink: 0;
}

.foot-track {
  flex: 1;
  height: 16rpx;
  border-radius: $radius-pill;
  background: $surface-sunken;
  overflow: hidden;
}

.foot-fill {
  height: 100%;
  border-radius: $radius-pill;
  background: linear-gradient(90deg, $brand 0%, $brand-dark 100%);
}

.foot-count {
  width: 90rpx;
  text-align: right;
  font-size: $fs-tag;
  color: $gray6;
  flex-shrink: 0;
}
</style>
