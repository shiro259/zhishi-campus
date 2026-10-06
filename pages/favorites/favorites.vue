<template>
  <view class="fav-page">
    <!-- ==================== 顶部说明 ==================== -->
    <view class="head">
      <view class="head-text">
        <text class="head-title">我的收藏</text>
        <text class="head-sub">
          {{ list.length ? '共 ' + list.length + ' 道 · 存在本机，换设备不会同步' : '点菜品卡片右上角的心形即可收藏' }}
        </text>
      </view>
      <view class="head-icon">
        <Icon name="heart" :size="40" color="#ffffff" />
      </view>
    </view>

    <!-- ==================== 加载中 ==================== -->
    <view class="state-box" v-if="loading">
      <view class="state-mark"><Icon name="clock" :size="56" color="#ff5a36" /></view>
      <text class="state-text">正在读取收藏…</text>
    </view>

    <!-- ==================== 空态 ==================== -->
    <view class="state-box" v-else-if="!list.length">
      <view class="state-mark"><Icon name="heart" :size="56" color="#ff5a36" /></view>
      <text class="state-text">还没有收藏的菜品\n逛菜单时点一下卡片右上角的心形，就会出现在这里</text>
      <view class="state-btn" @click="goMenu">去菜单看看</view>
    </view>

    <!-- ==================== 收藏列表 ==================== -->
    <view class="list" v-else>
      <view class="dish-card" v-for="d in list" :key="dishId(d)" @click="goDetail(d)">
        <view class="dish-img-wrap">
          <DishImage :dish="d" :size="220" :height="165" :radius="20" />
          <view class="fav-btn is-fav" @click.stop="removeOne(d)">
            <Icon name="heart" :size="30" color="#ffffff" />
          </view>
        </view>

        <view class="dish-main">
          <text class="dish-name">{{ d.name }}</text>

          <view class="dish-loc">
            <Icon name="location" :size="20" color="#b8b2aa" />
            <text class="dish-loc-text">{{ formatLocation(d) || '位置待完善' }}</text>
          </view>

          <view class="dish-tags" v-if="d.tags && d.tags.length">
            <text class="tag" v-for="(t, i) in d.tags.slice(0, 3)" :key="i">{{ t }}</text>
          </view>

          <view class="dish-bottom">
            <text class="dish-price">{{ formatPrice(d.price) }}</text>
            <view class="metric">
              <Icon name="star" :size="22" color="#ff5a36" />
              <text class="metric-text">{{ formatRating(d.rating) }}</text>
            </view>
          </view>
        </view>
      </view>

      <view class="list-foot">
        <text class="list-foot-text" @click="clearAll">清空收藏</text>
      </view>
    </view>
  </view>
</template>

<script setup>
/**
 * 我的收藏
 *
 * 收藏本身只是本机存储里的一串菜品 id（common/favorites.js），
 * 这个页面负责把 id 变成能看的菜品：一次 byIds 请求取回，保持收藏顺序。
 *
 * 几个刻意的处理：
 *   · onShow 而不是 onLoad：从菜品详情页返回时可能已经取消收藏，回来要立刻反映
 *   · 已下架/已删除的菜不会出现（byIds 只返回上架菜），对应的 id 顺手清掉
 *   · 取消收藏后**不整页重载**，只从本地列表里移除并同步存储，操作更跟手
 */
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { dishApi } from '@/api/index.js'
import { formatPrice, formatLocation } from '@/common/utils.js'
import { getFavorites, removeFavorite } from '@/common/favorites.js'
import DishImage from '@/components/DishImage/DishImage.vue'
import Icon from '@/components/Icon/Icon.vue'

const list = ref([])
const loading = ref(false)

function dishId(d) {
  return (d && (d.id || d._id)) || ''
}

function formatRating(r) {
  const n = Number(r)
  return Number.isFinite(n) ? n.toFixed(1) : '—'
}

async function load() {
  const ids = getFavorites()
  if (!ids.length) {
    list.value = []
    return
  }
  loading.value = true
  try {
    const res = await dishApi.byIds(ids)
    const rows = (res && res.list) || []
    list.value = rows

    // 取不到的 id（菜品被下架/删除）顺手清掉，免得收藏数一直虚高
    const alive = new Set(rows.map((d) => String(dishId(d))))
    ids.forEach((id) => {
      if (!alive.has(String(id))) removeFavorite(id)
    })
  } catch (e) {
    // 读取失败不打断页面：显示已存下来的部分（这里通常为空）与原因
    list.value = []
    uni.showToast({ title: '收藏加载失败，请稍后重试', icon: 'none' })
  } finally {
    loading.value = false
  }
}

/** 取消收藏：只动这一条，不整页重载 */
function removeOne(d) {
  const id = dishId(d)
  if (!id) return
  removeFavorite(id)
  list.value = list.value.filter((x) => String(dishId(x)) !== String(id))
  uni.showToast({ title: '已取消收藏', icon: 'none', duration: 1200 })
}

/** 清空收藏：二次确认 */
function clearAll() {
  uni.showModal({
    title: '清空收藏',
    content: '会取消全部收藏，确定吗？',
    confirmText: '清空',
    confirmColor: '#FF5A36',
    success: (res) => {
      if (!res.confirm) return
      getFavorites().forEach((id) => removeFavorite(id))
      list.value = []
      uni.showToast({ title: '已清空', icon: 'none' })
    }
  })
}

function goDetail(d) {
  const id = dishId(d)
  if (!id) return
  uni.navigateTo({ url: `/pages/dish/dish?id=${encodeURIComponent(id)}` })
}

/** 菜品列表是 tabBar 页，只能用 switchTab */
function goMenu() {
  uni.switchTab({ url: '/pages/dish-list/dish-list' })
}

onShow(() => {
  load()
})
</script>

<style lang="scss" scoped>
@import '@/common/tokens.scss';
.fav-page {
  min-height: 100vh;
  background: $canvas;
  padding-bottom: 40rpx;
}

/* ==================== 顶部说明 ==================== */

.head {
  display: flex;
  align-items: center;
  margin: 20rpx 24rpx 0;
  padding: 32rpx;
  border-radius: $radius-lg;
  background: linear-gradient(168deg, $brand-dark 0%, $brand-dark 68%, $brand 100%);
  box-shadow: 0 12rpx 32rpx rgba(255, 90, 54, 0.2);
}

.head-text {
  flex: 1;
  min-width: 0;
}

.head-title {
  display: block;
  font-size: $fs-title;
  font-weight: $fw-bold;
  color: #fff;
  text-shadow: 0 2rpx 10rpx rgba(150, 45, 10, 0.3);
}

.head-sub {
  display: block;
  font-size: $fs-tag;
  color: rgba(255, 255, 255, 0.95);
  margin-top: 10rpx;
  line-height: 1.5;
}

.head-icon {
  width: 76rpx;
  height: 76rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-left: $gap;
}

/* ==================== 列表 ==================== */

.list {
  padding: 28rpx 24rpx 0;
}

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

.fav-btn {
  position: absolute;
  top: 12rpx;
  right: 12rpx;
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  background: $brand;
  box-shadow: 0 4rpx 14rpx rgba(255, 90, 54, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
}

.dish-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.dish-name {
  font-size: 32rpx;
  font-weight: $fw-bold;
  color: $ink;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
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

.metric {
  display: flex;
  align-items: center;
}

.metric-text {
  font-size: $fs-cap;
  font-weight: $fw-medium;
  color: $gray7;
  margin-left: 4rpx;
}

.list-foot {
  text-align: center;
  padding: 8rpx 0 40rpx;
}

.list-foot-text {
  font-size: $fs-cap;
  color: $gray6;
  padding: 12rpx 40rpx;
  border: 1rpx solid $line-strong;
  border-radius: $radius-pill;
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
