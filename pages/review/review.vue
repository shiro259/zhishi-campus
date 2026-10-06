<template>
  <view class="review-page">
    <!-- ==================== 菜品信息 ==================== -->
    <view class="dish-card" v-if="hasBrief">
      <DishImage :dish="dishInfo" :size="120" :radius="20" />
      <view class="dish-info">
        <text class="dish-name">{{ briefName }}</text>
        <text class="dish-loc" v-if="briefLoc">{{ briefLoc }}</text>
        <text class="dish-loading" v-if="dishLoading">菜品信息加载中…</text>
        <text class="dish-price" v-if="briefPrice">{{ briefPrice }}</text>
      </view>
    </view>

    <!-- 菜品信息缺失 / 加载中 -->
    <view class="notice" v-else-if="dishLoading">
      <Icon name="refresh" :size="30" color="#8A8580" />
      <text class="notice-text">菜品信息加载中，请稍候</text>
    </view>
    <view class="notice" v-else>
      <Icon name="warning" :size="30" color="#C98A1B" />
      <text class="notice-text">未获取到菜品信息，评价将无法关联菜品</text>
    </view>

    <!-- ==================== 星级评分 ==================== -->
    <view class="card">
      <view class="card-head">
        <text class="card-title">这道菜怎么样</text>
      </view>
      <view class="stars">
        <view class="star" v-for="n in 5" :key="n" @click="setRating(n)">
          <Icon name="star" :size="64" :color="n <= rating ? '#FF5A36' : '#B8B2AA'" />
        </view>
      </view>
      <text class="rating-text">{{ ratingText }}</text>
    </view>

    <!-- ==================== 评价内容 ==================== -->
    <view class="card">
      <view class="card-head">
        <text class="card-title">评价内容</text>
        <text class="card-hint">至少 5 个字</text>
      </view>
      <view class="ta-wrap">
        <textarea
          class="ta"
          v-model="content"
          placeholder="说说这道菜的味道、分量、性价比吧"
          placeholder-class="ph"
          maxlength="200"
        />
        <text class="ta-count">{{ content.length }}/200</text>
      </view>
      <text class="hint">评价将在审核通过后展示</text>
    </view>

    <!-- ==================== 快捷标签 ==================== -->
    <view class="card">
      <view class="card-head">
        <text class="card-title">快捷标签</text>
        <text class="card-hint">点击追加到评价内容</text>
      </view>
      <view class="tag-row">
        <view class="tag" v-for="t in quickTags" :key="t" @click="appendTag(t)">{{ t }}</view>
      </view>
    </view>

    <!-- ==================== 提交 ==================== -->
    <view class="submit-bar">
      <view class="submit-btn" :class="{ 'is-disabled': submitting || submitted }" @click="submit">
        <text class="submit-text">{{ submitText }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { dishApi, reviewApi } from '@/api/index.js'
import { getUserInfo, formatLocation } from '@/common/utils.js'

const RATING_TEXT = {
  1: '很差',
  2: '一般',
  3: '不错',
  4: '好吃',
  5: '超赞'
}

const quickTags = ['分量足', '味道好', '性价比高', '排队快', '有点油']

/** 菜品详情还没回来时的空对象，保持 DishImage 的 props 稳定 */
const EMPTY_DISH = {}

const dishId = ref('')
const dishName = ref('')
const dish = ref(null)
const dishLoading = ref(false)

const rating = ref(5)
const content = ref('')
const submitting = ref(false)
const submitted = ref(false)
const loaded = ref(false)

const ratingText = computed(() => RATING_TEXT[rating.value] || '')
const dishInfo = computed(() => dish.value || EMPTY_DISH)
const briefName = computed(() => (dish.value && dish.value.name) || dishName.value || '菜品')
/** 只有真正拿到菜名（详情或参数）才展示菜品卡，否则提示信息缺失 */
const hasBrief = computed(() => !!((dish.value && dish.value.name) || dishName.value))
const briefLoc = computed(() => {
  if (!dish.value) return ''
  return formatLocation(dish.value)
})
const briefPrice = computed(() => {
  const n = Number(dish.value && dish.value.price)
  if (!isFinite(n)) return ''
  return `¥${n % 1 === 0 ? n : n.toFixed(1)}`
})
const submitText = computed(() => {
  if (submitted.value) return '已提交，审核后展示'
  if (submitting.value) return '提交中...'
  return '提交评价'
})

onLoad((options) => {
  const opt = options || {}
  dishId.value = opt.dish_id || opt.id || ''
  dishName.value = safeDecode(opt.dish_name)

  if (!getUserInfo()) {
    uni.showToast({ title: '请先登录后再评价', icon: 'none' })
    setTimeout(() => {
      uni.navigateTo({ url: '/pages/login/login' })
    }, 1200)
    return
  }

  if (!dishId.value) {
    uni.showToast({ title: '缺少菜品信息', icon: 'none' })
    return
  }

  loaded.value = true
  loadDish()
})

async function loadDish() {
  dishLoading.value = true
  try {
    const data = await dishApi.detail(dishId.value)
    if (data) {
      dish.value = data
      if (data.name) dishName.value = data.name
    }
  } catch (e) {
    // 菜品详情失败不阻塞评价（dish_id / dish_name 已从参数带入）
    uni.showToast({ title: '菜品信息加载失败', icon: 'none' })
  } finally {
    dishLoading.value = false
  }
}

function setRating(n) {
  if (submitting.value || submitted.value) return
  rating.value = n
}

function appendTag(t) {
  if (submitting.value || submitted.value) return
  if (content.value.includes(t)) {
    uni.showToast({ title: '已添加过该标签', icon: 'none' })
    return
  }
  const next = content.value ? `${content.value}，${t}` : t
  content.value = next.slice(0, 200)
}

async function submit() {
  if (submitting.value || submitted.value) return

  if (!getUserInfo()) {
    uni.showToast({ title: '请先登录后再评价', icon: 'none' })
    setTimeout(() => {
      uni.navigateTo({ url: '/pages/login/login' })
    }, 1200)
    return
  }

  if (!loaded.value || !dishId.value) {
    uni.showToast({ title: '缺少菜品信息', icon: 'none' })
    return
  }

  const text = content.value.trim()
  if (text.length < 5) {
    uni.showToast({ title: '评价内容至少 5 个字', icon: 'none' })
    return
  }
  if (text.length > 200) {
    uni.showToast({ title: '评价内容最多 200 字', icon: 'none' })
    return
  }

  submitting.value = true
  try {
    await reviewApi.create({
      dish_id: dishId.value,
      dish_name: briefName.value,
      rating: rating.value,
      content: text,
      images: []
    })
    submitted.value = true
    submitting.value = false
    uni.showToast({ title: '评价已提交，审核后展示', icon: 'none' })
    setTimeout(() => {
      uni.navigateBack()
    }, 1500)
  } catch (e) {
    submitting.value = false
    uni.showToast({ title: errorMessage(e, '评价提交失败，请稍后重试'), icon: 'none' })
  }
}

/* ===== 工具 ===== */
function errorMessage(e, fallback) {
  if (e && typeof e === 'object') {
    return e.message || e.errMsg || e.msg || fallback
  }
  return typeof e === 'string' && e ? e : fallback
}

function safeDecode(value) {
  if (!value) return ''
  try {
    return decodeURIComponent(String(value))
  } catch (e) {
    return String(value)
  }
}
</script>

<style lang="scss" scoped>
@import '@/common/tokens.scss';
/* ==================== 页面 ==================== */
.review-page {
  min-height: 100vh;
  box-sizing: border-box;
  background: $canvas;
  padding: $gap-page $gap-page 180rpx;
}

/* ==================== 通用卡片 ==================== */
.card {
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
  padding: $gap-card;
  box-shadow: $shadow-card;
  margin-bottom: $gap;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: $gap;
}

.card-title {
  font-size: $fs-card;
  font-weight: $fw-bold;
  color: $ink;
}

.card-hint {
  font-size: $fs-tag;
  color: $gray4;
}

/* ==================== 菜品信息 ==================== */
.dish-card {
  display: flex;
  align-items: center;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
  padding: $gap-card;
  box-shadow: $shadow-card;
  margin-bottom: $gap;
}

.dish-info {
  flex: 1;
  min-width: 0;
  margin-left: $gap;
}

.dish-name {
  display: block;
  font-size: $fs-card;
  font-weight: $fw-bold;
  color: $ink;
}

.dish-loc {
  display: block;
  margin-top: 8rpx;
  font-size: $fs-cap;
  color: $gray6;
}

.dish-loading {
  display: block;
  margin-top: 8rpx;
  font-size: $fs-tag;
  color: $gray4;
}

.dish-price {
  display: block;
  margin-top: 8rpx;
  font-size: $fs-sub;
  font-weight: $fw-medium;
  color: $brand;
}

/* 信息缺失 / 加载中提示 */
.notice {
  display: flex;
  align-items: center;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
  padding: $gap $gap-card;
  box-shadow: $shadow-card;
  margin-bottom: $gap;
}

.notice-text {
  margin-left: $gap-sm;
  font-size: $fs-sub;
  color: $gray7;
}

/* ==================== 星级 ==================== */
.stars {
  display: flex;
  align-items: center;
}

.star {
  margin-right: $gap;
}

.star:last-child {
  margin-right: 0;
}

.rating-text {
  display: block;
  margin-top: $gap-sm;
  font-size: $fs-sub;
  color: $gray6;
}

/* ==================== 内容输入 ==================== */
.ta-wrap {
  position: relative;
  background: $surface-sunken;
  border-radius: $radius;
  padding: $gap-card;
  min-height: 280rpx;
  box-sizing: border-box;
}

.ta {
  width: 100%;
  height: 200rpx;
  font-size: $fs-body;
  color: $ink;
  line-height: 1.6;
  background: transparent;
}

.ph {
  color: $gray4;
  font-size: $fs-sub;
}

.ta-count {
  position: absolute;
  right: $gap-card;
  bottom: $gap-sm;
  font-size: $fs-tag;
  color: $gray4;
}

.hint {
  display: block;
  margin-top: $gap-sm;
  font-size: $fs-tag;
  color: $gray4;
}

/* ==================== 快捷标签 ==================== */
.tag-row {
  display: flex;
  flex-wrap: wrap;
}

.tag {
  height: 56rpx;
  line-height: 56rpx;
  padding: 0 24rpx;
  margin: 0 $gap-sm $gap-sm 0;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-pill;
  font-size: $fs-cap;
  color: $gray7;
}

/* ==================== 提交条 ==================== */
.submit-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: $gap $gap-page 160rpx;
  background: $surface;
  border-top: 2rpx solid $line;
}

.submit-btn {
  height: $h-btn;
  background: $brand;
  border-radius: $radius-pill;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: $shadow-brand;
}

.submit-btn.is-disabled {
  opacity: 0.6;
}

.submit-text {
  color: #fff;
  font-size: $fs-card;
  font-weight: $fw-medium;
}
</style>
