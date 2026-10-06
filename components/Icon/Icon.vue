<template>
  <!--
    线性图标组件
    用法：<Icon name="search" :size="32" color="#8A8580" />
    颜色默认继承父级 color，方便在按钮里直接用 currentColor 反白。
  -->
  <image
    v-if="d"
    class="icon"
    :src="dataUri"
    :style="style"
    mode="aspectFit"
  />
</template>

<script setup>
/**
 * 统一图标入口：内联 SVG（data URI），无需字体文件与第三方依赖。
 * 在微信小程序中 data:image/svg+xml 可被 <image> 正常渲染。
 */
import { computed } from 'vue'
import { ICONS } from '@/common/icons.js'

const props = defineProps({
  /** 图标名，见 common/icons.js 的 ICONS */
  name: { type: String, required: true },
  /** 边长（rpx） */
  size: { type: [Number, String], default: 36 },
  /** 描边颜色，留空则继承父级文字颜色 */
  color: { type: String, default: 'currentColor' },
  /** 描边粗细（相对 24 视口） */
  weight: { type: [Number, String], default: 1.8 }
})

const d = computed(() => ICONS[props.name] || '')

/** 描边宽度需要用绝对像素，因此按输出尺寸等比换算 */
const strokeWidth = computed(() => {
  const size = Number(props.size) || 36
  return (Number(props.weight) * (24 / size) * (size / 24)).toFixed(2)
})

const dataUri = computed(() => {
  const color = props.color || 'currentColor'
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" '
    + 'stroke="' + color + '" stroke-width="' + strokeWidth.value + '" '
    + 'stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="' + d.value + '"/></svg>'
  // 用 encodeURIComponent 而不是 base64：可读、体积更小、调试时能直接看
  return 'data:image/svg+xml,' + encodeURIComponent(svg)
})

const style = computed(() => ({
  width: (Number(props.size) || 36) + 'rpx',
  height: (Number(props.size) || 36) + 'rpx'
}))
</script>

<style scoped>
.icon {
  display: block;
  flex-shrink: 0;
}
</style>
