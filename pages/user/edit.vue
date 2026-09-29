<template>
  <view class="edit-page">
    <view class="section">
      <text class="label">昵称</text>
      <input class="input" v-model="form.nickname" placeholder="请输入昵称" />
    </view>

    <view class="section">
      <text class="label">学号</text>
      <input class="input" v-model="form.student_id" placeholder="请输入学号（选填）" />
    </view>

    <view class="section">
      <text class="label">口味偏好（可多选）</text>
      <view class="chip-group">
        <view class="chip" v-for="t in tasteOptions" :key="t"
              :class="{ active: form.taste_pref.includes(t) }"
              @click="toggleTaste(t)">{{ t }}</view>
      </view>
    </view>

    <view class="section">
      <text class="label">忌口食材（可多选）</text>
      <view class="chip-group">
        <view class="chip" v-for="a in allergyOptions" :key="a"
              :class="{ active: form.allergies.includes(a) }"
              @click="toggleAllergy(a)">{{ a }}</view>
      </view>
    </view>

    <view class="save-btn" @click="save">保存</view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { authApi } from '@/api/index.js'
import { getUserInfo, saveUserInfo } from '@/common/utils.js'

const tasteOptions = ['辣', '不辣', '清淡', '重油', '甜', '酸']
const allergyOptions = ['香菜', '葱', '蒜', '花生', '海鲜', '牛肉', '羊肉']

const form = ref({
  nickname: '',
  student_id: '',
  taste_pref: [],
  allergies: []
})

onMounted(() => {
  const user = getUserInfo()
  if (user) {
    form.value.nickname = user.nickname || ''
    form.value.student_id = user.student_id || ''
    form.value.taste_pref = user.taste_pref || []
    form.value.allergies = user.allergies || []
  }
})

function toggleTaste(t) {
  const idx = form.value.taste_pref.indexOf(t)
  if (idx > -1) form.value.taste_pref.splice(idx, 1)
  else form.value.taste_pref.push(t)
}

function toggleAllergy(a) {
  const idx = form.value.allergies.indexOf(a)
  if (idx > -1) form.value.allergies.splice(idx, 1)
  else form.value.allergies.push(a)
}

async function save() {
  try {
    uni.showLoading({ title: '保存中...' })
    const updated = await authApi.updateMyInfo(form.value)
    saveUserInfo(updated)
    uni.hideLoading()
    uni.showToast({ title: '保存成功', icon: 'success' })
    setTimeout(() => uni.navigateBack(), 800)
  } catch (e) {
    uni.hideLoading()
  }
}
</script>

<style scoped>
.edit-page {
  padding: 24rpx;
  background: #f5f5f5;
  min-height: 100vh;
  box-sizing: border-box;
}

.section {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.label {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
  margin-bottom: 16rpx;
  display: block;
}

.input {
  width: 100%;
  height: 80rpx;
  padding: 0 16rpx;
  background: #f5f5f5;
  border-radius: 12rpx;
  font-size: 28rpx;
  box-sizing: border-box;
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
}

.chip.active {
  background: #FFF0EB;
  color: #FF6B35;
}

.save-btn {
  margin-top: 30rpx;
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
