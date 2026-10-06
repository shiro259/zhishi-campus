<template>
  <!--
    菜品图片展示组件（统一入口）

    菜品图缺失时自动回退到 emoji 渐变方块，因此：
      · 还没配图 → 显示 emoji，界面不塌
      · 配了图   → 显示照片
      · 图片加载失败 → 运行时也能回退到 emoji
    两种形态的尺寸由父组件通过 size / radius 控制，保证各页面视觉一致。
  -->
  <view
    class="dish-image"
    :class="{ 'is-emoji': !showImage }"
    :style="boxStyle"
  >
    <image
      v-if="showImage"
      class="dish-image__img"
      :src="src"
      :mode="mode"
      :style="boxStyle"
      @error="onError"
    />
    <text v-else class="dish-image__emoji" :style="{ fontSize: emojiSize }">{{ emoji }}</text>
  </view>
</template>

<script setup>
/**
 * 菜品图片 / emoji 占位
 * 用法：<DishImage :dish="d" :size="140" />
 */
import { ref, computed, watch } from 'vue'
import { dishImageSrc, dishEmoji } from '@/common/utils.js'

const props = defineProps({
  /** 菜品对象（含 id / image / emoji / category） */
  dish: { type: Object, default: () => ({}) },
  /** 展示区边长（px） */
  size: { type: [Number, String], default: 140 },
  /** 圆角（px） */
  radius: { type: [Number, String], default: 16 },
  /** image 的 mode */
  mode: { type: String, default: 'aspectFill' }
})

/** 记录加载失败的图片地址，避免死循环回退 */
const failedSrc = ref('')

const src = computed(() => dishImageSrc(props.dish))
const showImage = computed(() => !!src.value && src.value !== failedSrc.value)
const emoji = computed(() => dishEmoji(props.dish))

/** 图片地址变化时清空失败标记，便于后台换图后立即生效 */
watch(src, () => {
  failedSrc.value = ''
})

const boxStyle = computed(() => ({
  width: props.size + 'rpx',
  height: props.size + 'rpx',
  borderRadius: props.radius + 'rpx'
}))

const emojiSize = computed(() => Math.round(Number(props.size) * 0.52) + 'rpx')

function onError() {
  failedSrc.value = src.value
}
</script>

<style lang="scss" scoped>
@import '@/common/tokens.scss';
.dish-image {
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
  background: $surface-sunken;
}

/* emoji 占位形态：暖色浅底（不用渐变，保持全局视觉克制） */
.dish-image.is-emoji {
  background: $brand-soft;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dish-image__img {
  display: block;
}

.dish-image__emoji {
  line-height: 1;
}
</style>
