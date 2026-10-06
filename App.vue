<script>
  export default {
    onLaunch: function () {
      // 主题色统一走 uni.scss 的设计令牌，这里不再做运行时换肤，保持克制
      console.log('食遇校园 App Launch')
    },
    onShow: function () {},
    onHide: function () {}
  }
</script>

<style lang="scss">
@import '@/common/tokens.scss';
/**
 * 全局基础样式
 *
 * 只做三件事：页面底色与字体基线、盒模型统一、文本选中与滚动条观感。
 * 具体视觉一律由页面按 common/tokens.scss 的令牌实现，这里不放业务样式。
 */

page {
  background-color: $canvas;
  color: $ink;
  font-size: $fs-body;
  line-height: 1.55;
  font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC',
    'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  /* 中文正文用系统字体即可，数字统一等宽以便价格对齐 */
  font-variant-numeric: tabular-nums;
  -webkit-font-smoothing: antialiased;
}

view,
text,
image,
scroll-view,
button,
input,
textarea {
  box-sizing: border-box;
}

/* 去掉原生 button 的默认边框与背景，统一由组件自己控制外观 */
button {
  padding: 0;
  margin: 0;
  background: transparent;
  line-height: normal;
  font-size: inherit;

  &::after {
    border: none;
  }
}

/* 数字型文本统一用等宽数字，价格、评分右对齐更整齐 */
.num {
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum';
}
</style>
