<script>
  export default {
    onLaunch: function() {
      console.log('知食校园 App Launch')
    },
    onShow: function() {
      console.log('App Show')
    },
    onHide: function() {
      console.log('App Hide')
    }
  }
</script>

<style lang="scss">@import '@/common/tokens.scss';

  /* 全局样式 */
  /*   */
  view {
    box-sizing: border-box;
  }
  page {
    background-color: $canvas;
    font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  }
</style>