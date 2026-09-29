<template>
  <view class="recommend-page">
    <!-- 偏好输入表单 -->
    <view class="form-card" v-if="!loading && !result">
      <view class="form-title">
        <text class="title-icon">🤖</text>
        <text>告诉 AI 你的喜好</text>
      </view>

      <!-- 用餐类型 -->
      <view class="form-group">
        <text class="group-label">用餐类型</text>
        <view class="chip-group">
          <view class="chip" v-for="m in mealTypes" :key="m"
                :class="{ active: form.meal_type === m }"
                @click="form.meal_type = m">{{ m }}</view>
        </view>
      </view>

      <!-- 口味偏好 -->
      <view class="form-group">
        <text class="group-label">口味偏好（可多选）</text>
        <view class="chip-group">
          <view class="chip" v-for="t in tasteOptions" :key="t"
                :class="{ active: form.taste.includes(t) }"
                @click="toggleTaste(t)">{{ t }}</view>
        </view>
      </view>

      <!-- 忌口 -->
      <view class="form-group">
        <text class="group-label">忌口食材（可多选）</text>
        <view class="chip-group">
          <view class="chip" v-for="a in allergyOptions" :key="a"
                :class="{ active: form.allergies.includes(a) }"
                @click="toggleAllergy(a)">{{ a }}</view>
        </view>
      </view>

      <!-- 预算 -->
      <view class="form-group">
        <text class="group-label">预算上限：¥{{ form.budget || '不限' }}</text>
        <slider :value="form.budget || 0" :min="0" :max="50" :step="1"
                activeColor="#FF6B35" @change="onBudgetChange" />
      </view>

      <!-- 食堂范围 -->
      <view class="form-group">
        <text class="group-label">食堂范围</text>
        <picker mode="selector" :range="canteenOptions" @change="onCanteenChange">
          <view class="picker">
            <text>{{ form.canteen || '所有食堂' }}</text>
            <text class="picker-arrow">›</text>
          </view>
        </picker>
      </view>

      <!-- 额外要求 -->
      <view class="form-group">
        <text class="group-label">额外要求（选填）</text>
        <textarea class="textarea" v-model="form.extra" placeholder="例如：分量大一点、不要太油..."
                  maxlength="100" />
      </view>

      <view class="submit-btn" @click="doRecommend">
        <text>✨ 生成推荐</text>
      </view>
    </view>

    <!-- 加载中 -->
    <view class="loading" v-if="loading">
      <view class="loading-icon">🍳</view>
      <text class="loading-text">AI 正在为你精心挑选...</text>
    </view>

    <!-- 推荐结果 -->
    <view class="result" v-if="result && !loading">
      <view class="result-summary">
        <text class="summary-icon">🎯</text>
        <text class="summary-text">{{ result.summary }}</text>
      </view>

      <view class="rec-card" v-for="(r, idx) in result.recommendations" :key="r.dish_id">
        <view class="rec-rank">{{ idx + 1 }}</view>
        <image class="rec-img" :src="r.image || defaultImg" mode="aspectFill" @click="goDetail(r.dish_id)" />
        <view class="rec-info" @click="goDetail(r.dish_id)">
          <view class="rec-header">
            <text class="rec-name">{{ r.name }}</text>
            <text class="rec-score">匹配度 {{ r.match_score }}%</text>
          </view>
          <text class="rec-loc">{{ r.canteen }} · {{ r.window }}</text>
          <view class="rec-meta">
            <text class="rec-price">¥{{ r.price }}</text>
            <text class="rec-rating">⭐ {{ r.rating }}</text>
          </view>
          <view class="rec-reason">
            <text class="reason-label">推荐理由：</text>
            <text class="reason-text">{{ r.reason }}</text>
          </view>
        </view>
        <view class="rec-action" @click="goReview(r.dish_id)">评价</view>
      </view>

      <view class="result-footer">
        <view class="retry-btn" @click="reset">🔄 重新推荐</view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { recommendApi, dishApi } from '@/api/index.js'

const defaultImg = '/static/jian.png'
const loading = ref(false)
const result = ref(null)
const canteenOptions = ref(['所有食堂'])

const mealTypes = ['早餐', '午餐', '晚餐', '夜宵']
const tasteOptions = ['辣', '不辣', '清淡', '重油', '甜', '酸']
const allergyOptions = ['香菜', '葱', '蒜', '花生', '海鲜', '牛肉', '羊肉']

const form = ref({
  meal_type: '午餐',
  taste: [],
  allergies: [],
  budget: null,
  canteen: '',
  extra: ''
})

onMounted(async () => {
  try {
    const list = await dishApi.canteens()
    if (list && list.length) {
      canteenOptions.value = ['所有食堂', ...list]
    }
  } catch (e) {}
})

function toggleTaste(t) {
  const idx = form.value.taste.indexOf(t)
  if (idx > -1) form.value.taste.splice(idx, 1)
  else form.value.taste.push(t)
}

function toggleAllergy(a) {
  const idx = form.value.allergies.indexOf(a)
  if (idx > -1) form.value.allergies.splice(idx, 1)
  else form.value.allergies.push(a)
}

function onBudgetChange(e) {
  form.value.budget = e.detail.value > 0 ? e.detail.value : null
}

function onCanteenChange(e) {
  const val = canteenOptions.value[e.detail.value]
  form.value.canteen = val === '所有食堂' ? '' : val
}

async function doRecommend() {
  loading.value = true
  result.value = null
  try {
    const data = await recommendApi.recommend(form.value)
    result.value = data
    if (!data.recommendations || data.recommendations.length === 0) {
      uni.showToast({ title: '暂无符合条件的菜品', icon: 'none' })
    }
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

function reset() {
  result.value = null
}

function goDetail(id) {
  uni.navigateTo({ url: `/pages/dish/dish?id=${id}` })
}

function goReview(id) {
  uni.navigateTo({ url: `/pages/review/review?dish_id=${id}` })
}
</script>

<style scoped>
.recommend-page {
  padding: 30rpx;
  background: #f5f5f5;
  min-height: 100vh;
  box-sizing: border-box;
}

.form-card {
  background: #fff;
  border-radius: 20rpx;
  padding: 30rpx;
}

.form-title {
  display: flex;
  align-items: center;
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 30rpx;
}

.title-icon {
  margin-right: 12rpx;
}

.form-group {
  margin-bottom: 30rpx;
}

.group-label {
  font-size: 28rpx;
  color: #666;
  margin-bottom: 16rpx;
  display: block;
}

.chip-group {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.chip {
  padding: 12rpx 28rpx;
  background: #f5f5f5;
  border-radius: 30rpx;
  font-size: 26rpx;
  color: #666;
  border: 2rpx solid transparent;
}

.chip.active {
  background: #FFF0EB;
  color: #FF6B35;
  border-color: #FF6B35;
}

.picker {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx;
  background: #f5f5f5;
  border-radius: 12rpx;
  font-size: 28rpx;
  color: #333;
}

.picker-arrow {
  color: #999;
}

.textarea {
  width: 100%;
  height: 140rpx;
  padding: 20rpx;
  background: #f5f5f5;
  border-radius: 12rpx;
  font-size: 28rpx;
  box-sizing: border-box;
}

.submit-btn {
  height: 88rpx;
  background: linear-gradient(135deg, #FF6B35, #FF8C5A);
  border-radius: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 32rpx;
  font-weight: 500;
  margin-top: 20rpx;
  box-shadow: 0 8rpx 20rpx rgba(255, 107, 53, 0.3);
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 200rpx 0;
}

.loading-icon {
  font-size: 100rpx;
  animation: bounce 1s infinite;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-20rpx); }
}

.loading-text {
  margin-top: 30rpx;
  font-size: 28rpx;
  color: #999;
}

.result-summary {
  background: linear-gradient(135deg, #667eea, #764ba2);
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
  display: flex;
  align-items: center;
}

.summary-icon {
  font-size: 36rpx;
  margin-right: 12rpx;
}

.summary-text {
  color: #fff;
  font-size: 28rpx;
  flex: 1;
}

.rec-card {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
  display: flex;
  position: relative;
}

.rec-rank {
  position: absolute;
  top: 24rpx;
  left: 24rpx;
  width: 48rpx;
  height: 48rpx;
  background: #FF6B35;
  color: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26rpx;
  font-weight: bold;
  z-index: 2;
}

.rec-img {
  width: 160rpx;
  height: 160rpx;
  border-radius: 12rpx;
  margin-right: 20rpx;
  background: #f0f0f0;
}

.rec-info {
  flex: 1;
}

.rec-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.rec-name {
  font-size: 30rpx;
  font-weight: bold;
  color: #333;
}

.rec-score {
  font-size: 22rpx;
  color: #FF6B35;
  background: #FFF0EB;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
}

.rec-loc {
  font-size: 22rpx;
  color: #999;
  margin-top: 8rpx;
  display: block;
}

.rec-meta {
  display: flex;
  gap: 20rpx;
  margin-top: 8rpx;
}

.rec-price {
  font-size: 28rpx;
  color: #FF6B35;
  font-weight: bold;
}

.rec-rating {
  font-size: 24rpx;
  color: #FF9800;
}

.rec-reason {
  margin-top: 12rpx;
  padding: 12rpx;
  background: #FFF8F5;
  border-radius: 8rpx;
}

.reason-label {
  font-size: 22rpx;
  color: #FF6B35;
  font-weight: 500;
}

.reason-text {
  font-size: 24rpx;
  color: #666;
}

.rec-action {
  position: absolute;
  bottom: 24rpx;
  right: 24rpx;
  padding: 8rpx 20rpx;
  background: #FF6B35;
  color: #fff;
  font-size: 22rpx;
  border-radius: 20rpx;
}

.result-footer {
  padding: 30rpx 0;
}

.retry-btn {
  text-align: center;
  font-size: 28rpx;
  color: #FF6B35;
  padding: 20rpx;
  background: #fff;
  border-radius: 40rpx;
}
</style>
