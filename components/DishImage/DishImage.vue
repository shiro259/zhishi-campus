<template>
  <view class="dish-image" :style="{ width: size + 'rpx', height: size + 'rpx', borderRadius: radius + 'rpx' }">
    <image
      v-if="showImage"
      :src="resolvedSrc"
      mode="aspectFill"
      class="img"
      :style="{ borderRadius: radius + 'rpx' }"
      @error="onImgError"
    />
    <view v-else class="placeholder" :style="{ borderRadius: radius + 'rpx' }">
      <text class="placeholder-text">{{ placeholder }}</text>
    </view>
    <view v-if="dish.is_new" class="badge-new">新品</view>
  </view>
</template>

<script setup>
/**
 * 菜品图片
 *
 * 两种来源：
 *   1. 后台填的普通地址（static/... 或 https://...）—— 直接交给 <image>
 *   2. 后台在「菜品管理 → 编辑」里上传到 uniCloud 云存储的图，存的是 fileID（cloud:// 开头）
 *
 * 关键：fileID **不能**直接塞进 <image src>，必须先换成临时地址。
 * DCloud 自己的 uni-id-pages/components/cloud-image.vue 就是这么做的
 * （uniCloud.getTempFileURL），这里沿用同一套做法并加了缓存 ——
 * 否则同一张图在首页榜单里出现三次就会解析三次。
 */
import { ref, computed, watch } from 'vue'

const props = defineProps({
  dish: { type: Object, default: () => ({}) },
  size: { type: Number, default: 120 },
  radius: { type: Number, default: 12 }
})

/** 模块级缓存：跨组件实例共享，避免列表里重复请求同一个 fileID */
const urlCache = new Map()
const inflight = new Map()

const resolvedSrc = ref('')
const broken = ref(false)

function rawImage() {
  const img = props.dish && props.dish.image
  return img && typeof img === 'string' ? img.trim() : ''
}

/** fileID → 临时地址；云空间不可用或解析失败时返回空串，由占位图兜底 */
function resolveCloudFile(fileID) {
  if (urlCache.has(fileID)) return Promise.resolve(urlCache.get(fileID))
  if (inflight.has(fileID)) return inflight.get(fileID)

  const task = new Promise((resolve) => {
    if (typeof uniCloud === 'undefined' || !uniCloud || !uniCloud.getTempFileURL) {
      resolve('')
      return
    }
    uniCloud
      .getTempFileURL({ fileList: [fileID] })
      .then((res) => {
        const item = res && res.fileList && res.fileList[0]
        const url = item && item.tempFileURL
        if (url) urlCache.set(fileID, url)
        resolve(url || '')
      })
      .catch(() => resolve(''))
  })

  inflight.set(fileID, task)
  return task
}

async function refresh() {
  broken.value = false
  const raw = rawImage()
  if (!raw) {
    resolvedSrc.value = ''
    return
  }
  if (raw.indexOf('cloud://') === 0) {
    resolvedSrc.value = await resolveCloudFile(raw)
  } else {
    resolvedSrc.value = raw
  }
}

watch(() => props.dish && props.dish.image, refresh, { immediate: true })

const showImage = computed(() => !!resolvedSrc.value && !broken.value)

/** 没图时的占位：优先菜品自带 emoji，其次取菜名前两字 */
const placeholder = computed(() => {
  const d = props.dish || {}
  if (d.emoji) return d.emoji
  return d.name ? String(d.name).slice(0, 2) : '🍽️'
})

/** 加载失败（地址失效 / 文件被删）→ 退回占位图，不留破图 */
function onImgError() {
  broken.value = true
}
</script>

<style scoped>
.dish-image { position: relative; overflow: hidden; flex-shrink: 0; }
.img { width: 100%; height: 100%; }
.placeholder {
  width: 100%; height: 100%;
  background: linear-gradient(135deg, #ff9a56, #ff6b35);
  display: flex; align-items: center; justify-content: center;
}
.placeholder-text { font-size: 32rpx; color: #fff; font-weight: 700; }
.badge-new {
  position: absolute; top: 0; right: 0;
  background: #ff3b30; color: #fff;
  font-size: 20rpx; padding: 4rpx 12rpx;
  border-radius: 0 0 0 12rpx;
}
</style>
