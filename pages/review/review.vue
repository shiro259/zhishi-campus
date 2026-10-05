<template>
  <view class="review-page">
    <!-- 菜品信息 -->
    <view class="dish-brief">
      <view class="brief-emoji">
        <text class="emoji-text">{{ briefEmoji }}</text>
      </view>
      <view class="brief-info">
        <text class="brief-name">{{ briefName }}</text>
        <text class="brief-loc" v-if="briefLoc">{{ briefLoc }}</text>
        <text class="brief-price" v-if="briefPrice">{{ briefPrice }}</text>
        <text class="brief-loading" v-if="dishLoading">菜品信息加载中...</text>
      </view>
    </view>

    <!-- 星级评分 -->
    <view class="section">
      <view class="section-head">
        <text class="section-label">评分</text>
        <text class="rating-text">{{ ratingText }}</text>
      </view>
      <view class="stars">
        <text
          class="star"
          v-for="n in 5"
          :key="n"
          :class="{ on: n <= rating }"
          @click="setRating(n)"
        >{{ n <= rating ? '★' : '☆' }}</text>
      </view>
    </view>

    <!-- 评价内容 -->
    <view class="section">
      <view class="section-head">
        <text class="section-label">评价内容</text>
        <text class="counter" :class="{ warn: content.length > 200 }">{{ content.length }}/200</text>
      </view>
      <textarea
        class="textarea"
        v-model="content"
        placeholder="说说这道菜的味道、分量、性价比吧（至少 5 个字）"
        placeholder-style="color:#bbb;font-size:26rpx"
        maxlength="200"
      />
      <text class="hint">至少 5 个字才能提交，评价将在审核通过后展示</text>
    </view>

    <!-- 快捷标签 -->
    <view class="section">
      <view class="section-head">
        <text class="section-label">快捷标签</text>
        <text class="counter">点击追加到评价内容</text>
      </view>
      <view class="tag-group">
        <view
          class="tag"
          v-for="t in quickTags"
          :key="t"
          :class="{ active: content.includes(t) }"
          @click="appendTag(t)"
        >{{ t }}</view>
      </view>
    </view>

    <!-- 提交 -->
    <view class="submit-bar">
      <view class="submit-btn" :class="{ disabled: submitting || submitted }" @click="submit">
        <text>{{ submitText }}</text>
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
const briefName = computed(() => (dish.value && dish.value.name) || dishName.value || '菜品')
const briefEmoji = computed(() => (dish.value && dish.value.emoji) || '🍽️')
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
  return '发布评价'
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

<style scoped>
.review-page {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 20rpx 24rpx 180rpx;
  background: #f5f5f5;
}

/* 菜品信息 */
.dish-brief {
  display: flex;
  align-items: center;
  background: #fff;
  border-radius: 20rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.brief-emoji {
  width: 120rpx;
  height: 120rpx;
  border-radius: 16rpx;
  background: #FFF0EB;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 24rpx;
  flex-shrink: 0;
}

.emoji-text {
  font-size: 56rpx;
  line-height: 56rpx;
}

.brief-info {
  flex: 1;
  min-width: 0;
}

.brief-name {
  display: block;
  font-size: 30rpx;
  font-weight: bold;
  color: #333;
}

.brief-loc {
  display: block;
  font-size: 24rpx;
  color: #999;
  margin-top: 8rpx;
}

.brief-price {
  display: block;
  font-size: 28rpx;
  font-weight: bold;
  color: #FF6B35;
  margin-top: 8rpx;
}

.brief-loading {
  display: block;
  font-size: 22rpx;
  color: #bbb;
  margin-top: 8rpx;
}

/* 区块 */
.section {
  background: #fff;
  border-radius: 20rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}

.section-label {
  font-size: 28rpx;
  font-weight: 500;
  color: #333;
}

.rating-text {
  font-size: 26rpx;
  color: #FF6B35;
  font-weight: 500;
}

.counter {
  font-size: 22rpx;
  color: #bbb;
}

.counter.warn {
  color: #FF4D4F;
}

/* 星星 */
.stars {
  display: flex;
  gap: 18rpx;
  padding: 6rpx 0;
}

.star {
  font-size: 56rpx;
  line-height: 56rpx;
  color: #ddd;
}

.star.on {
  color: #FF9800;
}

/* 文本域 */
.textarea {
  width: 100%;
  height: 200rpx;
  box-sizing: border-box;
  padding: 18rpx;
  background: #f5f5f5;
  border-radius: 16rpx;
  font-size: 28rpx;
  color: #333;
  line-height: 1.6;
}

.hint {
  display: block;
  margin-top: 14rpx;
  font-size: 22rpx;
  color: #bbb;
}

/* 标签 */
.tag-group {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.tag {
  padding: 12rpx 26rpx;
  background: #f5f5f5;
  border-radius: 26rpx;
  font-size: 26rpx;
  color: #666;
}

.tag.active {
  background: #FFF0EB;
  color: #FF6B35;
  font-weight: 500;
}

/* 提交 */
.submit-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom));
  background: #fff;
  box-shadow: 0 -4rpx 16rpx rgba(0, 0, 0, 0.05);
}

.submit-btn {
  height: 88rpx;
  border-radius: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 30rpx;
  font-weight: 500;
  background: linear-gradient(135deg, #FF6B35, #FF8C5A);
}

.submit-btn.disabled {
  opacity: 0.6;
}
</style>
