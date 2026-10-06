<template>
  <view class="admin-index">
    <!-- 欢迎卡片 -->
    <view class="welcome-card">
      <view class="welcome-left">
        <text class="welcome-title">你好，{{ nickname }}</text>
        <text class="welcome-sub">食遇校园 · 运营管理后台</text>
      </view>
      <text class="welcome-icon">🛠️</text>
    </view>

    <!-- 待审核提醒 -->
    <view class="notice" v-if="pendingCount > 0" @click="go('/pages/admin/reviews')">
      <text class="notice-icon">🔔</text>
      <text class="notice-text">有 {{ pendingCount }} 条评价等待审核</text>
      <text class="notice-arrow">›</text>
    </view>

    <!-- 功能宫格 -->
    <view class="menu-grid">
      <view class="menu-item" v-for="m in menus" :key="m.key" @click="go(m.url)">
        <text class="menu-icon">{{ m.icon }}</text>
        <text class="menu-label">{{ m.label }}</text>
        <text class="menu-desc">{{ m.desc }}</text>
        <text class="menu-badge" v-if="m.key === 'reviews' && pendingCount > 0">{{ pendingCount }}</text>
      </view>

      <!-- 数据初始化 -->
      <view class="menu-item" :class="{ busy: syncing }" @click="onSeedSync">
        <text class="menu-icon">📦</text>
        <text class="menu-label">{{ syncing ? '同步中...' : '数据初始化' }}</text>
        <text class="menu-desc">同步内置菜品库</text>
      </view>

      <!-- 重置菜品库 -->
      <view class="menu-item danger" :class="{ busy: resetting }" @click="onSeedReset">
        <text class="menu-icon">⚠️</text>
        <text class="menu-label">{{ resetting ? '重置中...' : '重置菜品库' }}</text>
        <text class="menu-desc">清空并重新写入</text>
      </view>
    </view>

    <!-- 同步结果 -->
    <view class="seed-tip" v-if="seedTip">
      <text>{{ seedTip }}</text>
    </view>

    <!-- 说明 -->
    <view class="tip-card">
      <text class="tip-title">📌 使用说明</text>
      <text class="tip-line">· 菜品库为空时，先点「数据初始化」同步内置菜品。</text>
      <text class="tip-line">· 「AI 配置」页需要填写大模型 API Key 才能启用 AI 推荐。</text>
      <text class="tip-line">· API Key 保存在云端，只有云函数可读写，不会下发到客户端。</text>
      <text class="tip-line">· 「重置菜品库」会清空现有菜品数据，请谨慎操作。</text>
      <text class="tip-line">· 管理员身份不影响使用学生端：可照常浏览菜品、用 AI 推荐、发评价。</text>
    </view>

    <!--
      管理员身份仍然有效时随时可以回学生端查看。
      这里刻意用 switchTab 而不是退出登录 —— 看学生视角不需要放弃管理员认证。
    -->
    <view class="front-entry" @click="goStudentSide">
      <text class="front-entry-icon">🍜</text>
      <text class="front-entry-text">返回学生端查看</text>
      <text class="front-entry-arrow">›</text>
    </view>

    <view class="logout" @click="onLogout">退出登录</view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { configApi, dishApi, reviewApi, userApi } from '@/api/index.js'
import { getUserInfo, clearAuth, ensureAdmin } from '@/common/utils.js'

const menus = [
  { key: 'dashboard', icon: '📊', label: '数据看板', desc: '运营数据总览', url: '/pages/admin/dashboard' },
  { key: 'dishes', icon: '🍜', label: '菜品管理', desc: '新增 / 编辑 / 下架', url: '/pages/admin/dishes' },
  { key: 'reviews', icon: '📝', label: '评价审核', desc: '通过或拒绝学生评价', url: '/pages/admin/reviews' },
  { key: 'users', icon: '👥', label: '用户管理', desc: '查看与管理用户', url: '/pages/admin/users' },
  { key: 'ai', icon: '🤖', label: 'AI 配置', desc: '大模型 API Key', url: '/pages/admin/ai-config' }
]

const nickname = ref('同学')
const pendingCount = ref(0)
const syncing = ref(false)
const resetting = ref(false)
const seedTip = ref('')

onShow(async () => {
  // 用服务端验签把守：凭证过期、或管理员刚改过口令，这里都会被拒绝。
  // 只看本机 role 是不够的 —— 它无法反映凭证此刻是否仍然有效。
  if (!(await ensureAdmin())) return
  const info = getUserInfo() || {}
  nickname.value = info.nickname || info.username || '管理员'
  loadPending()
})

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
    confirmColor: '#FF6B35',
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
    confirmColor: '#FF4D4F',
    success: (res) => {
      if (!res.confirm) return
      uni.showModal({
        title: '再次确认',
        content: '确定要重置菜品库吗？',
        confirmText: '确定重置',
        confirmColor: '#FF4D4F',
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
        confirmColor: '#FF6B35'
      })
    } else {
      seedTip.value = `菜品库已重置，共 ${total} 道菜品`
      uni.showModal({
        title: '重置完成',
        content: `菜品库已重置，共 ${total} 道菜品`,
        showCancel: false,
        confirmColor: '#FF6B35'
      })
    }
  } catch (e) {
    uni.showToast({ title: errorMessage(e, '操作失败，请稍后重试'), icon: 'none' })
  } finally {
    flag.value = false
  }
}

/**
 * 回学生端
 *
 * 只切换视角，保留管理员登录状态 —— 管理员查看学生端效果是常态需求，
 * 不该为此退出登录再重新认证。回到后台走「我的 → 管理后台」即可。
 */
function goStudentSide() {
  uni.switchTab({ url: '/pages/index/index' })
}

/** 退出登录：清掉本机身份与管理员凭证，需要重新认证才能再进后台 */
async function onLogout() {
  uni.showModal({
    title: '退出登录',
    content: '确定退出登录吗？退出后需要重新认证才能进入管理后台。',
    success: async (res) => {
      if (!res.confirm) return
      try {
        await userApi.clear()
      } catch (e) {
        // 本地身份清理失败不阻塞退出
      }
      try {
        // clearAuth 会一并清掉管理员凭证 shiyu_admin_token，
        // 否则退出后本机还留着一张可用的后台通行证
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

<style lang="scss" scoped>@import '@/common/tokens.scss';

.admin-index {
  min-height: 100vh;
  padding: 30rpx;
  background: $canvas;
  box-sizing: border-box;
}

/* 欢迎卡片 */
.welcome-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 40rpx;
  margin-bottom: 24rpx;
  border-radius: 20rpx;
  background: linear-gradient(135deg, $ink, $gray7);
}

.welcome-title {
  display: block;
  font-size: 38rpx;
  font-weight: bold;
  color: #fff;
}

.welcome-sub {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.65);
}

.welcome-icon {
  font-size: 64rpx;
}

/* 待审核提醒 */
.notice {
  display: flex;
  align-items: center;
  padding: 24rpx 28rpx;
  margin-bottom: 24rpx;
  background: $brand-soft;
  border-radius: 16rpx;
}

.notice-icon {
  font-size: 32rpx;
  margin-right: 14rpx;
}

.notice-text {
  flex: 1;
  font-size: 26rpx;
  color: $brand;
}

.notice-arrow {
  font-size: 34rpx;
  color: $brand;
}

/* 宫格 */
.menu-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 20rpx;
}

.menu-item {
  position: relative;
  width: calc(50% - 10rpx);
  box-sizing: border-box;
  padding: 36rpx 24rpx;
  border-radius: 20rpx;
  background: $ink;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.menu-item.busy {
  opacity: 0.6;
}

.menu-item.danger {
  background: $ink;
}

.menu-icon {
  font-size: 56rpx;
  line-height: 56rpx;
}

.menu-label {
  margin-top: 18rpx;
  font-size: 28rpx;
  font-weight: 500;
  color: #fff;
}

.menu-desc {
  margin-top: 10rpx;
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.55);
  text-align: center;
}

.menu-badge {
  position: absolute;
  top: 20rpx;
  right: 24rpx;
  min-width: 36rpx;
  height: 36rpx;
  padding: 0 10rpx;
  box-sizing: border-box;
  border-radius: 18rpx;
  background: $brand;
  color: #fff;
  font-size: 22rpx;
  line-height: 36rpx;
  text-align: center;
}

.menu-item.danger .menu-label {
  color: $danger;
}

/* 同步结果 */
.seed-tip {
  margin-top: 24rpx;
  padding: 22rpx 28rpx;
  background: #fff;
  border-radius: 16rpx;
  font-size: 24rpx;
  color: $gray7;
}

/* 说明 */
.tip-card {
  margin-top: 24rpx;
  padding: 28rpx;
  background: #fff;
  border-radius: 20rpx;
}

.tip-title {
  display: block;
  font-size: 28rpx;
  font-weight: bold;
  color: $ink;
  margin-bottom: 16rpx;
}

.tip-line {
  display: block;
  font-size: 24rpx;
  color: $gray6;
  line-height: 1.9;
}

/* 回学生端入口：与「退出登录」刻意分开，一个换视角、一个放弃认证 */
.front-entry {
  display: flex;
  align-items: center;
  margin-top: 24rpx;
  padding: 30rpx 28rpx;
  background: #fff;
  border-radius: 20rpx;
}

.front-entry-icon {
  font-size: 40rpx;
  margin-right: 20rpx;
}

.front-entry-text {
  flex: 1;
  font-size: 30rpx;
  font-weight: 500;
  color: $ink;
}

.front-entry-arrow {
  font-size: 36rpx;
  color: $gray4;
}

.logout {
  margin: 40rpx 0 30rpx;
  text-align: center;
  font-size: 28rpx;
  color: $danger;
}
</style>
