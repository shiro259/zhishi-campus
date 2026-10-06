<template>
  <!--
    校园美食 AI 机器人形象

    为什么用内联 SVG 而不是图片：
      · 不用额外下图片资源，也不会增加小程序主包体积（主包已经 2.7MB 超限）
      · 矢量图在任何分辨率下都清晰，微信小程序 <image> 支持 data:image/svg+xml
      · 与 components/Icon/Icon.vue 保持同一套做法（内联 SVG data URI）
    颜色写死为品牌橙，因此不走 currentColor。
  -->
  <view class="mascot" :style="boxStyle">
    <view v-if="glow" class="mascot-glow" :style="glowStyle"></view>
    <image class="mascot-img" :class="{ 'is-float': float }" :src="dataUri" mode="aspectFit" />
  </view>
</template>

<script setup>
/**
 * AI 助手形象（可爱机器人）
 *
 * 造型：天线 + 圆角方头 + 白色面屏 + 圆眼睛（带高光）+ 微笑 + 腮红，
 * 面屏居中保证缩到 56rpx 当聊天头像时依然看得清五官。
 */
import { computed } from 'vue'

const props = defineProps({
  /** 边长（rpx） */
  size: { type: [Number, String], default: 120 },
  /** 是否在背后加一层柔和的品牌色光晕 */
  glow: { type: Boolean, default: false },
  /** 是否做轻微上下浮动（欢迎区用，聊天头像不用，避免整屏乱动） */
  float: { type: Boolean, default: false }
})

const BRAND = '#ff5a36'
const BRAND_LIGHT = '#ff8f6b'
const FACE = '#fffaf7'
const INK = '#2f2723'

/**
 * viewBox 96×96，所有坐标按这个画布来，改尺寸不影响比例。
 * 纵向坐标整体 +6：天线占掉了上方空间，把图形下移让「墨迹包围盒」居中，
 * 否则放进 <image aspectFit> 后整体偏上、下方留白过多。
 */
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" fill="none">' +
  '<defs>' +
  '<linearGradient id="aiHead" x1="0.15" y1="0" x2="0.85" y2="1">' +
  '<stop offset="0" stop-color="' + BRAND_LIGHT + '"/>' +
  '<stop offset="1" stop-color="' + BRAND + '"/>' +
  '</linearGradient>' +
  '</defs>' +
  // 天线
  '<path d="M48 28V19" stroke="' + BRAND + '" stroke-width="3.4" stroke-linecap="round"/>' +
  '<circle cx="48" cy="15" r="4.6" fill="' + BRAND_LIGHT + '"/>' +
  // 两侧耳朵
  '<rect x="6" y="48" width="9" height="17" rx="4.5" fill="' + BRAND + '"/>' +
  '<rect x="81" y="48" width="9" height="17" rx="4.5" fill="' + BRAND + '"/>' +
  // 头部
  '<rect x="15" y="26" width="66" height="60" rx="23" fill="url(#aiHead)"/>' +
  // 白色面屏
  '<rect x="25" y="37" width="46" height="38" rx="15" fill="' + FACE + '"/>' +
  // 眼睛 + 高光
  '<circle cx="40" cy="52" r="4.6" fill="' + INK + '"/>' +
  '<circle cx="56" cy="52" r="4.6" fill="' + INK + '"/>' +
  '<circle cx="41.6" cy="50.4" r="1.5" fill="#ffffff"/>' +
  '<circle cx="57.6" cy="50.4" r="1.5" fill="#ffffff"/>' +
  // 微笑
  '<path d="M42.5 62.5c3.6 3.4 7.4 3.4 11 0" stroke="' + INK + '" stroke-width="2.8" ' +
  'stroke-linecap="round"/>' +
  // 腮红
  '<ellipse cx="30.5" cy="59" rx="4" ry="2.4" fill="' + BRAND_LIGHT + '" opacity="0.5"/>' +
  '<ellipse cx="65.5" cy="59" rx="4" ry="2.4" fill="' + BRAND_LIGHT + '" opacity="0.5"/>' +
  '</svg>'

const dataUri = 'data:image/svg+xml,' + encodeURIComponent(svg)

const boxStyle = computed(() => {
  const s = Number(props.size) || 120
  return { width: s + 'rpx', height: s + 'rpx' }
})

const glowStyle = computed(() => {
  const s = Number(props.size) || 120
  const d = Math.round(s * 1.9)
  return {
    width: d + 'rpx',
    height: d + 'rpx',
    marginLeft: -Math.round((d - s) / 2) + 'rpx',
    marginTop: -Math.round((d - s) / 2) + 'rpx'
  }
})
</script>

<style lang="scss" scoped>
@import '@/common/tokens.scss';
.mascot {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 品牌色光晕：让形象「亮」起来，但不用重阴影砸画面 */
.mascot-glow {
  position: absolute;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 90, 54, 0.22) 0%, rgba(255, 90, 54, 0) 70%);
}

.mascot-img {
  position: relative;
  width: 100%;
  height: 100%;
}

/* 轻微浮动，给静态页面一点生命感 */
.mascot-img.is-float {
  animation: mascot-float 3.4s ease-in-out infinite;
}

@keyframes mascot-float {
  0%,
  100% {
    transform: translateY(-4rpx);
  }
  50% {
    transform: translateY(6rpx);
  }
}
</style>
