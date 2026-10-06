<template>
  <view class="admin-index">
    <!-- 顶部欢迎卡 -->
    <view class="welcome-card">
      <view class="welcome-main">
        <text class="welcome-title">管理后台</text>
        <text class="welcome-sub">食遇校园运营管理</text>
      </view>
      <view class="welcome-user">
        <Icon name="user" :size="26" />
        <text class="welcome-user-text">{{ nickname }}</text>
      </view>
    </view>

    <!-- 待审核提醒 -->
    <view class="notice" v-if="pendingCount > 0" @click="go('/pages/admin/reviews')">
      <Icon name="info" :size="32" />
      <text class="notice-text">有 {{ pendingCount }} 条评价等待审核</text>
      <Icon name="right" :size="28" />
    </view>

    <!-- 功能宫格 -->
    <view class="menu-grid">
      <view class="menu-item" v-for="m in menus" :key="m.key" @click="go(m.url)">
        <view class="menu-icon">
          <Icon :name="m.icon" :size="36" />
        </view>
        <text class="menu-label">{{ m.label }}</text>
        <text class="menu-desc">{{ m.desc }}</text>
        <text class="menu-badge" v-if="m.key === 'reviews' && pendingCount > 0">{{ pendingCount }}</text>
      </view>
    </view>

    <!-- 数据初始化 -->
    <view class="seed-card">
      <view class="card-head">
        <Icon name="refresh" :size="32" />
        <text class="card-title">数据初始化</text>
      </view>
      <text class="seed-desc">
        把内置菜品库同步到云数据库，用于首次部署或菜品数据异常时修复。重置会清空现有菜品后重新写入。
      </text>

      <view class="seed-ops">
        <view class="btn-ghost" :class="{ busy: syncing }" @click="onSeedSync">
          {{ syncing ? '同步中…' : '同步菜品库' }}
        </view>
        <view class="btn-link-danger" :class="{ busy: resetting }" @click="onSeedReset">
          {{ resetting ? '重置中…' : '重置菜品库' }}
        </view>
      </view>

      <view class="seed-tip" v-if="seedTip">{{ seedTip }}</view>
    </view>

    <!-- 说明 -->
    <view class="tip-card">
      <view class="card-head">
        <Icon name="list" :size="32" />
        <text class="card-title">使用说明</text>
      </view>
      <text class="tip-line">· 菜品库为空时，先点「同步菜品库」写入内置菜品。</text>
      <text class="tip-line">· 「AI 配置」页需要填写大模型 API Key 才能启用 AI 推荐。</text>
      <text class="tip-line">· API Key 保存在云端，只有云函数可读写，不会下发到客户端。</text>
      <text class="tip-line">· 「重置菜品库」会清空现有菜品数据，请谨慎操作。</text>
    </view>

    <view class="logout" @click="onLogout">退出管理后台</view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { configApi, dishApi, reviewApi, userApi } from '@/api/index.js'
import { getUserInfo, clearAuth } from '@/common/utils.js'

const menus = [
  { key: 'dashboard', icon: 'chart', label: '数据看板', desc: '运营数据总览', url: '/pages/admin/dashboard' },
  { key: 'dishes', icon: 'bowl', label: '菜品管理', desc: '新增 / 编辑 / 下架', url: '/pages/admin/dishes' },
  { key: 'reviews', icon: 'edit', label: '评价审核', desc: '通过或拒绝学生评价', url: '/pages/admin/reviews' },
  { key: 'users', icon: 'clipboard', label: '评价数据', desc: '全站评价汇总分析', url: '/pages/admin/users' },
  { key: 'ai', icon: 'settings', label: 'AI 配置', desc: '大模型 API Key', url: '/pages/admin/ai-config' }
]

const nickname = ref('同学')
const pendingCount = ref(0)
const syncing = ref(false)
const resetting = ref(false)
const seedTip = ref('')

onShow(() => {
  const info = getUserInfo()
  if ((info?.role) !== 'admin') {
    uni.showToast({ title: '需要管理员权限', icon: 'none' })
    setTimeout(() => {
      leaveAdmin()
    }, 1200)
    return
  }
  nickname.value = info.nickname || info.username || '管理员'
  loadPending()
})

// 无上级页面时（例如直接进入管理后台）退回首页，避免 navigateBack 失败卡住
function leaveAdmin() {
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
  if (pages && pages.length > 1) {
    uni.navigateBack()
  } else {
    uni.reLaunch({ url: '/pages/index/index' })
  }
}

async function loadPending() {
  try {
    const res = await reviewApi.pending({ page: 1, pageSize: 1 })
    if (res && typeof res.total === 'number') {
      pendingCount.value = res.total
    } else {
      pendingCount.value = (res && res.list && res.list.length) || 0
    }
  } catch (e) {
    // 待审核数量拿不到不影响主流程
    pendingCount.value = 0
  }
}

function go(url) {
  if (!url) return
  uni.navigateTo({ url })
}

function onSeedSync() {
  if (syncing.value) return
  uni.showModal({
    title: '数据初始化',
    content: '将把内置菜品库同步到云数据库（已存在的菜品不会重复写入），确定继续吗？',
    confirmColor: '#ff5a36',
    success: (res) => {
      if (res.confirm) doSeed('sync')
    }
  })
}

function onSeedReset() {
  if (resetting.value) return
  // 二次确认，避免误清库
  uni.showModal({
    title: '重置菜品库',
    content: '重置会清空云端现有菜品数据，并按内置菜品库重新写入。此操作不可撤销！',
    confirmText: '继续',
    confirmColor: '#d93a3a',
    success: (res) => {
      if (!res.confirm) return
      uni.showModal({
        title: '再次确认',
        content: '确定要重置菜品库吗？',
        confirmText: '确定重置',
        confirmColor: '#d93a3a',
        success: (res2) => {
          if (res2.confirm) doSeed('reset')
        }
      })
    }
  })
}

async function doSeed(action) {
  const flag = action === 'sync' ? syncing : resetting
  if (flag.value) return
  flag.value = true
  try {
    const res = await configApi.seed(action)
    const total = res && typeof res.total === 'number' ? res.total : 0
    const repaired = res && typeof res.repaired === 'number' ? res.repaired : 0

    // 初始化后解除「离线数据源锁定」，让菜品列表立刻改读云端最新数据
    if (typeof dishApi.resetSource === 'function') dishApi.resetSource()

    const detail = repaired > 0
      ? `已同步 ${total} 道菜品，并修复 ${repaired} 条旧数据的上架状态`
      : `已同步 ${total} 道菜品`

    if (action === 'sync') {
      seedTip.value = `上次同步：共 ${total} 道菜品`
      uni.showModal({
        title: '同步完成',
        content: detail,
        showCancel: false,
        confirmColor: '#ff5a36'
      })
    } else {
      seedTip.value = `菜品库已重置，共 ${total} 道菜品`
      uni.showModal({
        title: '重置完成',
        content: `菜品库已重置，共 ${total} 道菜品`,
        showCancel: false,
        confirmColor: '#ff5a36'
      })
    }
  } catch (e) {
    uni.showToast({ title: errorMessage(e, '操作失败，请稍后重试'), icon: 'none' })
  } finally {
    flag.value = false
  }
}

async function onLogout() {
  uni.showModal({
    title: '提示',
    content: '确定退出管理后台吗？',
    success: async (res) => {
      if (!res.confirm) return
      try {
        await userApi.clear()
      } catch (e) {
        // 本地身份清理失败不阻塞退出
      }
      try {
        clearAuth()
      } catch (e) {
        // 忽略
      }
      uni.reLaunch({ url: '/pages/login/login' })
    }
  })
}

function errorMessage(e, fallback) {
  if (e && typeof e === 'object') {
    return e.message || e.errMsg || e.msg || fallback
  }
  return typeof e === 'string' && e ? e : fallback
}
</script>

<style lang="scss" scoped>
@import '@/common/tokens.scss';
.admin-index {
  min-height: 100vh;
  background: $canvas;
  padding: $gap-page;
  box-sizing: border-box;
}

/* ---------------- 欢迎卡 ---------------- */
.welcome-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
  padding: $gap-card;
  box-shadow: $shadow-card;
}

.welcome-main {
  flex: 1;
  min-width: 0;
}

.welcome-title {
  display: block;
  font-size: $fs-title;
  font-weight: $fw-bold;
  color: $ink;
}

.welcome-sub {
  display: block;
  margin-top: $gap-sm;
  font-size: $fs-cap;
  color: $gray6;
}

.welcome-user {
  display: flex;
  align-items: center;
  height: 44rpx;
  padding: 0 18rpx;
  border-radius: $radius-pill;
  background: $surface-sunken;
  color: $gray7;
  flex-shrink: 0;
}

.welcome-user-text {
  margin-left: 8rpx;
  font-size: $fs-tag;
  color: $gray7;
  max-width: 180rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---------------- 待审核提醒 ---------------- */
.notice {
  display: flex;
  align-items: center;
  margin-top: $gap;
  padding: 22rpx $gap-card;
  background: $brand-soft;
  border-radius: $radius;
  color: $brand;
}

.notice-text {
  flex: 1;
  margin: 0 $gap-sm;
  font-size: $fs-sub;
  color: $brand;
}

/* ---------------- 功能宫格 ---------------- */
.menu-grid {
  display: flex;
  flex-wrap: wrap;
  gap: $gap;
  margin-top: $gap;
}

.menu-item {
  position: relative;
  width: calc(50% - 10rpx);
  min-height: 180rpx;
  box-sizing: border-box;
  padding: $gap-card;
  display: flex;
  flex-direction: column;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
  box-shadow: $shadow-card;
}

.menu-icon {
  font-size: 36rpx;
  color: $brand;
}

.menu-label {
  margin-top: $gap;
  font-size: $fs-body;
  font-weight: $fw-medium;
  color: $ink;
}

.menu-desc {
  margin-top: 8rpx;
  font-size: $fs-tag;
  color: $gray6;
  line-height: 1.4;
}

.menu-badge {
  position: absolute;
  top: $gap;
  right: $gap;
  min-width: 36rpx;
  height: 36rpx;
  padding: 0 10rpx;
  box-sizing: border-box;
  border-radius: $radius-pill;
  background: $brand;
  color: #fff;
  font-size: $fs-tag;
  line-height: 36rpx;
  text-align: center;
}

/* ---------------- 数据初始化 ---------------- */
.seed-card {
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
  color: $brand;
}

.card-title {
  margin-left: $gap-sm;
  font-size: $fs-card;
  font-weight: $fw-bold;
  color: $ink;
}

.seed-desc {
  display: block;
  margin-top: $gap-sm;
  font-size: $fs-cap;
  color: $gray6;
  line-height: 1.7;
}

.seed-ops {
  display: flex;
  align-items: center;
  margin-top: $gap;
}

.btn-ghost {
  flex: 1;
  height: $h-btn;
  line-height: $h-btn;
  text-align: center;
  font-size: $fs-body;
  font-weight: $fw-medium;
  color: $gray7;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-pill;
}

.btn-link-danger {
  flex: 1;
  height: $h-btn;
  line-height: $h-btn;
  margin-left: $gap;
  text-align: center;
  font-size: $fs-body;
  font-weight: $fw-medium;
  color: $danger;
  background: transparent;
  border: none;
}

.btn-ghost.busy,
.btn-link-danger.busy {
  opacity: 0.6;
}

.seed-tip {
  margin-top: $gap;
  padding: 20rpx $gap;
  background: $surface-sunken;
  border-radius: $radius;
  font-size: $fs-cap;
  color: $gray7;
}

/* ---------------- 说明 ---------------- */
.tip-card {
  margin-top: $gap;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
  padding: $gap-card;
  box-shadow: $shadow-card;
}

.tip-line {
  display: block;
  margin-top: $gap-sm;
  font-size: $fs-cap;
  color: $gray6;
  line-height: 1.8;
}

/* ---------------- 退出 ---------------- */
.logout {
  margin: $gap-lg 0 $gap;
  text-align: center;
  font-size: $fs-sub;
  color: $danger;
}
</style>
