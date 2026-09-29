<template>
  <view class="dish-edit">
    <view class="form-group">
      <text class="label">菜品名称 *</text>
      <input class="input" v-model="form.name" placeholder="如：麻婆豆腐" />
    </view>

    <view class="form-group">
      <text class="label">价格（元）*</text>
      <input class="input" type="digit" v-model="form.price" placeholder="如：8.0" />
    </view>

    <view class="form-group">
      <text class="label">所属食堂 *</text>
      <input class="input" v-model="form.canteen" placeholder="如：第一食堂" />
    </view>

    <view class="form-group">
      <text class="label">所属窗口 *</text>
      <input class="input" v-model="form.window" placeholder="如：川味窗口" />
    </view>

    <view class="form-group">
      <text class="label">分类</text>
      <input class="input" v-model="form.category" placeholder="如：川菜、面食、快餐" />
    </view>

    <view class="form-group">
      <text class="label">口味标签</text>
      <view class="chip-group">
        <view class="chip" v-for="t in tagOptions" :key="t"
              :class="{ active: form.tags.includes(t) }"
              @click="toggleTag(t)">{{ t }}</view>
      </view>
    </view>

    <view class="form-group">
      <text class="label">菜品图片URL</text>
      <input class="input" v-model="form.image" placeholder="图片URL（可留空）" />
    </view>

    <view class="form-group">
      <text class="label">菜品描述</text>
      <textarea class="textarea" v-model="form.description" placeholder="菜品介绍" />
    </view>

    <view class="form-group">
      <text class="label">是否新品</text>
      <switch :checked="form.is_new" @change="form.is_new = $event.detail.value" color="#FF6B35" />
    </view>

    <view class="form-group">
      <text class="label">上架状态</text>
      <switch :checked="form.status === 1" @change="form.status = $event.detail.value ? 1 : 0" color="#FF6B35" />
    </view>

    <view class="submit-btn" @click="save">
      <text>{{ isEdit ? '保存修改' : '创建菜品' }}</text>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { dishApi } from '@/api/index.js'

const tagOptions = ['辣', '清淡', '重油', '甜', '酸', '下饭', '咸香', '健康']
const isEdit = ref(false)
const editId = ref('')

const form = ref({
  name: '',
  price: '',
  canteen: '',
  window: '',
  category: '其他',
  tags: [],
  image: '',
  description: '',
  is_new: false,
  status: 1
})

onLoad(async (options) => {
  const id = options.id
  if (id) {
    editId.value = id
    isEdit.value = true
    try {
      const dish = await dishApi.detail(id)
      form.value = {
        name: dish.name,
        price: String(dish.price),
        canteen: dish.canteen,
        window: dish.window,
        category: dish.category,
        tags: dish.tags || [],
        image: dish.image,
        description: dish.description,
        is_new: dish.is_new,
        status: dish.status
      }
    } catch (e) {}
  }
})

function toggleTag(t) {
  const idx = form.value.tags.indexOf(t)
  if (idx > -1) form.value.tags.splice(idx, 1)
  else form.value.tags.push(t)
}

async function save() {
  if (!form.value.name || !form.value.price || !form.value.canteen || !form.value.window) {
    uni.showToast({ title: '请填写必填项', icon: 'none' })
    return
  }
  try {
    uni.showLoading({ title: '保存中...' })
    const data = { ...form.value, price: parseFloat(form.value.price) }
    if (editId.value) {
      await dishApi.update(editId.value, data)
    } else {
      await dishApi.create(data)
    }
    uni.hideLoading()
    uni.showToast({ title: '保存成功', icon: 'success' })
    setTimeout(() => uni.navigateBack(), 800)
  } catch (e) {
    uni.hideLoading()
  }
}
</script>

<style scoped>
.dish-edit {
  padding: 24rpx;
  background: #f5f5f5;
  min-height: 100vh;
  box-sizing: border-box;
}

.form-group {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 16rpx;
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

.textarea {
  width: 100%;
  height: 160rpx;
  padding: 16rpx;
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
  padding: 12rpx 24rpx;
  background: #f5f5f5;
  border-radius: 24rpx;
  font-size: 26rpx;
  color: #666;
}

.chip.active {
  background: #FFF0EB;
  color: #FF6B35;
}

.submit-btn {
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
