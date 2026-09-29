<template>
  <view class="review-page">
    <!-- 菜品信息 -->
    <view class="dish-brief" v-if="dish">
      <image class="brief-img" :src="dish.image || defaultImg" mode="aspectFill" />
      <view class="brief-info">
        <text class="brief-name">{{ dish.name }}</text>
        <text class="brief-loc">{{ dish.canteen }} · {{ dish.window }}</text>
        <text class="brief-price">¥{{ dish.price }}</text>
      </view>
    </view>

    <!-- 评分 -->
    <view class="section">
      <text class="section-label">评分</text>
      <view class="stars">
        <text v-for="n in 5" :key="n"
              :class="{ on: n <= form.rating }"
              @click="form.rating = n">{{ n <= form.rating ? '★' : '☆' }}</text>
      </view>
    </view>

    <!-- 文字评价 -->
    <view class="section">
      <text class="section-label">评价内容</text>
      <textarea class="textarea" v-model="form.content"
                placeholder="分享你的就餐体验（选填）" maxlength="200" />
    </view>

    <!-- 标签选择 -->
    <view class="section">
      <text class="section-label">添加标签</text>
      <view class="tag-group">
        <view class="tag" v-for="t in tagOptions" :key="t"
              :class="{ active: form.tags.includes(t) }"
              @click="toggleTag(t)">{{ t }}</view>
      </view>
    </view>

    <!-- 图片上传 -->
    <view class="section">
      <text class="section-label">实拍图片</text>
      <view class="upload-area">
        <view class="img-item" v-for="(img, i) in form.images" :key="i">
          <image :src="img" mode="aspectFill" class="upload-img" />
          <text class="img-del" @click="removeImg(i)">×</text>
        </view>
        <view class="upload-btn" v-if="form.images.length < 9" @click="chooseImage">
          <text class="plus">+</text>
          <text class="upload-text">添加图片</text>
        </view>
      </view>
    </view>

    <view class="submit-btn" @click="submit">
      <text>发布评价</text>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { dishApi, reviewApi } from '@/api/index.js'

const defaultImg = '/static/jian.png'

const dish = ref(null)
const tagOptions = ['分量足', '太咸了', '太淡了', '性价比高', '避雷', '味道好', '上菜快', '环境干净', '会回购']
const form = ref({
  dish_id: '',
  rating: 5,
  content: '',
  tags: [],
  images: []
})

onLoad(async (options) => {
  if (options.dish_id) {
    form.value.dish_id = options.dish_id
    dish.value = await dishApi.detail(options.dish_id)
  }
})

function toggleTag(t) {
  const idx = form.value.tags.indexOf(t)
  if (idx > -1) form.value.tags.splice(idx, 1)
  else form.value.tags.push(t)
}

function chooseImage() {
  uni.chooseImage({
    count: 9 - form.value.images.length,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: (res) => {
      // 实际项目中应上传到云存储，这里先使用本地临时路径
      form.value.images = [...form.value.images, ...res.tempFilePaths]
    }
  })
}

function removeImg(i) {
  form.value.images.splice(i, 1)
}

async function submit() {
  if (form.value.rating === 0) {
    uni.showToast({ title: '请先评分', icon: 'none' })
    return
  }
  try {
    uni.showLoading({ title: '发布中...' })
    await reviewApi.create(form.value)
    uni.hideLoading()
    uni.showToast({ title: '评价发布成功', icon: 'success' })
    setTimeout(() => {
      uni.navigateBack()
    }, 1000)
  } catch (e) {
    uni.hideLoading()
  }
}
</script>

<style scoped>
.review-page {
  padding: 20rpx 24rpx 140rpx;
  background: #f5f5f5;
  min-height: 100vh;
  box-sizing: border-box;
}

.dish-brief {
  display: flex;
  background: #fff;
  border-radius: 16rpx;
  padding: 20rpx;
  margin-bottom: 20rpx;
}

.brief-img {
  width: 120rpx;
  height: 120rpx;
  border-radius: 12rpx;
  margin-right: 20rpx;
  background: #f0f0f0;
}

.brief-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.brief-name {
  font-size: 30rpx;
  font-weight: bold;
  color: #333;
}

.brief-loc {
  font-size: 24rpx;
  color: #999;
  margin-top: 8rpx;
}

.brief-price {
  font-size: 28rpx;
  color: #FF6B35;
  font-weight: bold;
  margin-top: 8rpx;
}

.section {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.section-label {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
  margin-bottom: 16rpx;
  display: block;
}

.stars {
  display: flex;
  gap: 16rpx;
}

.stars text {
  font-size: 56rpx;
  color: #ddd;
}

.stars text.on {
  color: #FF9800;
}

.textarea {
  width: 100%;
  height: 180rpx;
  padding: 16rpx;
  background: #f5f5f5;
  border-radius: 12rpx;
  font-size: 28rpx;
  box-sizing: border-box;
}

.tag-group {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.tag {
  padding: 12rpx 24rpx;
  background: #f5f5f5;
  border-radius: 24rpx;
  font-size: 26rpx;
  color: #666;
}

.tag.active {
  background: #FFF0EB;
  color: #FF6B35;
}

.upload-area {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.img-item {
  position: relative;
  width: 180rpx;
  height: 180rpx;
}

.upload-img {
  width: 100%;
  height: 100%;
  border-radius: 12rpx;
}

.img-del {
  position: absolute;
  top: -10rpx;
  right: -10rpx;
  width: 36rpx;
  height: 36rpx;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24rpx;
}

.upload-btn {
  width: 180rpx;
  height: 180rpx;
  background: #f5f5f5;
  border-radius: 12rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 2rpx dashed #ddd;
}

.plus {
  font-size: 48rpx;
  color: #ccc;
}

.upload-text {
  font-size: 22rpx;
  color: #999;
  margin-top: 8rpx;
}

.submit-btn {
  position: fixed;
  bottom: 30rpx;
  left: 50%;
  transform: translateX(-50%);
  width: 90%;
  height: 88rpx;
  background: linear-gradient(135deg, #FF6B35, #FF8C5A);
  border-radius: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 30rpx;
  font-weight: 500;
}
</style>
