<template>
  <view class="dishes-page">
    <!-- ================= 顶部标题 ================= -->
    <view class="hero">
      <text class="hero-title">菜品管理</text>
      <text class="hero-sub">共 {{ total }} 道菜品 · 可搜索 / 筛选 / 编辑</text>
    </view>

    <!-- ================= 工具条 ================= -->
    <view class="toolbar">
      <view class="search-box">
        <Icon name="search" :size="30" />
        <input
          class="search-input"
          v-model="keyword"
          type="text"
          confirm-type="search"
          placeholder="搜索菜名"
          placeholder-class="ph"
          @input="onKeywordInput"
          @confirm="reload"
        />
        <view class="search-clear" v-if="keyword" @click="clearKeyword">
          <Icon name="close" :size="26" />
        </view>
      </view>

      <picker
        class="picker-box"
        mode="selector"
        :range="canteenRange"
        :value="canteenIndex"
        @change="onCanteenChange"
      >
        <view class="picker-inner">
          <text class="picker-text">{{ canteenRange[canteenIndex] }}</text>
          <Icon name="down" :size="24" />
        </view>
      </picker>
    </view>

    <!-- ================= 图片迁移到云存储 =================
         本机 static/ 图片合计 2.6MB，超过微信主包 2MB 上限；
         一键把菜品图传到云存储并写回 fileID，主包就能瘦下来。 -->
    <view class="migrate-bar" v-if="bagImageCount > 0 || migrating">
      <view class="migrate-text">
        <text class="migrate-title">菜品图还在小程序包里</text>
        <text class="migrate-sub">
          {{ migrating ? progressText : bagImageCount + ' 张图占本机包体，可一键转到云存储' }}
        </text>
      </view>
      <view class="migrate-btn" :class="{ disabled: migrating }" @click="onMigrateImages">
        <text class="migrate-btn-text">{{ migrating ? '迁移中…' : '转云存储' }}</text>
      </view>
    </view>

    <!-- ================= 加载中 ================= -->
    <view class="state-box" v-if="loading">
      <Icon name="clock" :size="72" />
      <text class="state-text">菜品加载中…</text>
    </view>

    <!-- ================= 加载失败 ================= -->
    <view class="state-box" v-else-if="error">
      <Icon name="warning" :size="72" />
      <text class="state-text">{{ error }}</text>
      <view class="retry-btn" @click="reload">重新加载</view>
    </view>

    <!-- ================= 空态 ================= -->
    <view class="state-box" v-else-if="!list.length">
      <Icon name="bowl" :size="72" />
      <text class="state-text">
        {{ keyword || currentCanteen() ? '没有符合条件的菜品，换个关键词试试' : '菜品库还是空的，点右下角 + 新增第一道菜' }}
      </text>
    </view>

    <!-- ================= 列表 ================= -->
    <view class="list" v-else>
      <view class="item" v-for="d in list" :key="dishId(d)">
        <DishImage :dish="d" :size="120" :radius="16" />

        <view class="item-main">
          <view class="item-title">
            <text class="item-name">{{ d.name }}</text>
            <text class="status-tag" :class="d.status === 1 ? 'on' : 'off'">
              {{ d.status === 1 ? '上架' : '下架' }}
            </text>
          </view>
          <text class="item-sub">{{ formatLocation(d) || '位置待完善' }}</text>
          <view class="item-meta">
            <text class="cat">{{ d.category || '其他' }}</text>
            <text class="price">{{ formatPrice(d.price) }}</text>
          </view>
        </view>

        <view class="item-ops">
          <view class="op-btn" @click="goEdit(dishId(d))">
            <Icon name="edit" :size="34" />
          </view>
          <view class="op-btn" @click="confirmRemove(d)">
            <Icon name="trash" :size="34" color="#d93a3a" />
          </view>
        </view>
      </view>

      <view class="load-tip" v-if="loadingMore">加载中…</view>
      <view class="load-tip" v-else-if="hasMore" @click="loadMore">上拉或点击加载更多</view>
      <view class="load-tip no-more" v-else>没有更多了</view>
    </view>

    <!-- ================= 悬浮新增按钮 ================= -->
    <view class="fab" @click="goEdit('')">
      <Icon name="plus" :size="48" color="#ffffff" />
    </view>
  </view>
</template>

<script setup>
/**
 * 菜品管理列表
 *
 * 数据链路：dishApi.list({ keyword, canteen, page, pageSize })
 * 分页为触底加载；编辑/新增跳转 dish-edit，删除二次确认后调 dishApi.remove。
 * 菜品缩略图统一由 DishImage 渲染（有图显示照片，无图回退 emoji 方块）。
 */
import { ref } from 'vue'
import { onLoad, onShow, onReachBottom, onPullDownRefresh } from '@dcloudio/uni-app'
import { dishApi } from '@/api/index.js'
import { formatPrice, ensureAdmin, formatLocation } from '@/common/utils.js'
import { migrateDishImagesToCloud, pickMigratable } from '@/common/cloud-images.js'
import DishImage from '@/components/DishImage/DishImage.vue'

const PAGE_SIZE = 10

const loading = ref(false)
const loadingMore = ref(false)
const error = ref('')
const list = ref([])
const total = ref(0)
const page = ref(1)
const hasMore = ref(false)
const keyword = ref('')
const canteenRange = ref(['全部食堂'])
const canteenIndex = ref(0)

/** 图片迁移到云存储的状态 */
const migrating = ref(false)
const progressText = ref('')
/**
 * 还有多少张菜品图存在小程序包内（大于 0 才显示迁移入口）
 *
 * 必须针对**全部**菜品统计：列表是分页的，只看当前这一页会算出错误的数字，
 * 更糟的是第一页恰好都迁完了就直接不显示入口。
 */
const bagImageCount = ref(0)

let denied = false
let inited = false
let searchTimer = null

/* ------------------------------ 小工具 ------------------------------ */

/** 云函数返回 _id、本地数据返回 id，这里统一取值 */
function dishId(d) {
  return d.id || d._id || ''
}

/** 当前选中的食堂（'' 表示全部） */
function currentCanteen() {
  return canteenIndex.value === 0 ? '' : canteenRange.value[canteenIndex.value]
}

function toast(title) {
  uni.showToast({ title, icon: 'none' })
}

/* ------------------------ 图片迁移到云存储 ------------------------ */

/**
 * 取全部菜品（自动翻页）
 *
 * 云函数对单页有上限（shiyu-dish 的 MAX_PAGE_SIZE = 100），
 * 传 pageSize: 999 会被截断成 100 —— 菜品超过 100 道时就会漏掉后面的，
 * 迁移和统计都会不完整。所以这里按页循环取完。
 */
async function fetchAllDishes() {
  const MAX_PAGES = 20 // 兜底上限，避免异常情况下死循环
  const all = []
  for (let p = 1; p <= MAX_PAGES; p++) {
    const res = await dishApi.list({ page: p, pageSize: 100 })
    const rows = (res && res.list) || []
    all.push(...rows)
    const more = res && typeof res.hasMore === 'boolean' ? res.hasMore : rows.length >= 100
    if (!more || !rows.length) break
  }
  return all
}

/** 统计还有多少张图在包内（打开页面时跑一次，用于决定是否显示迁移入口） */
async function refreshBagImageCount() {
  try {
    const all = await fetchAllDishes()
    bagImageCount.value = pickMigratable(all).length
  } catch (e) {
    // 统计失败不影响主流程，只是不显示迁移入口
    bagImageCount.value = 0
  }
}

/**
 * 一键把菜品图从「小程序包内 static/ 图片」迁到 uniCloud 云存储
 *
 * 为什么要做成一键：
 *   手工在控制台传 41 张图、再把 41 个 fileID 逐个填回菜品记录，既慢又容易错位。
 *   这里自动完成「逐张上传 → 收集 fileID → 一次性写回云端」。
 *
 * 为什么先弹确认：
 *   它会改写云端菜品的图片地址（虽然不动其它字段），属于写操作；
 *   而且原图仍留在 static/ 里，删不删由你决定，这一步本身不删任何东西。
 */
async function onMigrateImages() {
  if (migrating.value) return

  uni.showModal({
    title: '菜品图转到云存储',
    content: '会把菜品图上传到 uniCloud 云存储，并把云端菜品的图片地址改成云文件。\n\n本机 static/ 里的原图不会被删除，确认云端显示正常后你可以自己删掉来缩小主包。',
    confirmText: '开始迁移',
    success: async (res) => {
      if (res.confirm) await doMigrate()
    }
  })
}

async function doMigrate() {
  migrating.value = true
  progressText.value = '正在读取菜品列表…'
  try {
    // 迁移要针对全部菜品，不能只看当前这一页
    const dishes = await fetchAllDishes()
    const targets = pickMigratable(dishes)

    if (!targets.length) {
      progressText.value = ''
      bagImageCount.value = 0
      uni.showModal({
        title: '无需迁移',
        content: dishes.length
          ? '当前菜品的图片都已经是云存储地址（或没有图片），不需要迁移。'
          : '云端还没有菜品数据，请先在管理后台执行「数据初始化」。',
        showCancel: false
      })
      return
    }

    progressText.value = `正在上传 0/${targets.length}…`
    const result = await migrateDishImagesToCloud(dishes, {
      onProgress: (done, totalCount, name) => {
        progressText.value = name
          ? `正在上传 ${done + 1}/${totalCount}：${name}`
          : `已上传 ${done}/${totalCount}，正在写回云端…`
      }
    })

    let updated = 0
    let writeFailed = []
    if (result.uploaded.length) {
      const saved = await dishApi.setImages(
        result.uploaded.map((x) => ({ id: x.id, image: x.image }))
      )
      updated = Number((saved && saved.updated) || 0)
      writeFailed = ((saved && saved.failed) || []).map((f) => f.id + '：' + f.reason)
    }

    const lines = []
    lines.push(`上传成功 ${result.uploaded.length} 张，云端已更新 ${updated} 条。`)
    if (result.failed.length) {
      lines.push(`上传失败 ${result.failed.length} 张：`)
      result.failed.slice(0, 3).forEach((f) => lines.push('· ' + f.name + '：' + f.reason))
      if (result.failed.length > 3) lines.push('（其余失败项见云函数日志）')
    }
    if (writeFailed.length) {
      lines.push(`写回失败 ${writeFailed.length} 条：`)
      writeFailed.slice(0, 3).forEach((l) => lines.push('· ' + l))
    }
    if (!result.failed.length && !writeFailed.length) {
      lines.push('')
      lines.push('下一步：确认云端图片显示正常后，可以删掉 static/dishes 里的图片来缩小小程序包体。')
    }

    uni.showModal({
      title: '迁移完成',
      content: lines.join('\n'),
      showCancel: false
    })
    progressText.value = ''
    await reload()
    // 迁移后重新统计，把「还有 N 张在包内」更新成实际值（通常变成 0，入口自动收起）
    await refreshBagImageCount()
  } catch (e) {
    progressText.value = ''
    uni.showModal({
      title: '迁移失败',
      content: (e && e.message) || '未知错误',
      showCancel: false
    })
  } finally {
    migrating.value = false
  }
}

/* ------------------------------ 数据加载 ------------------------------ */

/** 拉取食堂筛选项 */
async function loadCanteens() {
  try {
    const res = await dishApi.canteens()
    const raw = (res && res.list) || []
    const names = raw
      .map((c) => (typeof c === 'string' ? c : c && (c.name || c.canteen)))
      .filter((n) => !!n)
    canteenRange.value = ['全部食堂', ...names]
    if (canteenIndex.value > names.length) canteenIndex.value = 0
  } catch (e) {
    // 食堂列表失败不影响搜索与列表，保持「全部食堂」
    canteenRange.value = ['全部食堂']
    canteenIndex.value = 0
  }
}

/** 请求序号：用于丢弃过期响应，避免慢的旧请求覆盖新搜索结果 */
let seq = 0

/** 加载第 targetPage 页数据 */
async function fetchPage(targetPage, append) {
  const mySeq = ++seq
  if (append) loadingMore.value = true
  else loading.value = true
  error.value = ''

  try {
    const res = await dishApi.list({
      keyword: keyword.value.trim(),
      canteen: currentCanteen(),
      page: targetPage,
      pageSize: PAGE_SIZE
    })

    // 已有更新的请求发出（例如用户又改了关键词）→ 本次结果作废
    if (mySeq !== seq) return

    // 接口为了搜到东西可能自动放开了食堂筛选（见 api/index.js 的 searchFallback），
    // picker 必须跟着回到「全部食堂」，否则显示的筛选条件和列表内容对不上
    if (res && res.relaxedFilters && canteenIndex.value !== 0) {
      canteenIndex.value = 0
      toast('该食堂下没搜到，已放开食堂筛选')
    }

    const rows = (res && res.list) || []
    list.value = append ? [...list.value, ...rows] : rows
    total.value = Number((res && res.total) || list.value.length)
    page.value = targetPage

    if (typeof res.hasMore === 'boolean') {
      hasMore.value = res.hasMore
    } else {
      hasMore.value = list.value.length < total.value
    }
  } catch (e) {
    if (mySeq !== seq) return
    const msg = (e && e.message) || '菜品加载失败'
    if (append) {
      toast('加载更多失败：' + msg)
    } else {
      error.value = msg
      list.value = []
      toast('菜品加载失败')
    }
  } finally {
    if (mySeq === seq) {
      loading.value = false
      loadingMore.value = false
    }
  }
}

/** 回到第一页重新加载 */
async function reload() {
  if (denied) return
  const canteen = currentCanteen()
  // 选中的食堂不在最新列表里时回落到「全部食堂」
  if (canteen && !canteenRange.value.includes(canteen)) canteenIndex.value = 0
  await fetchPage(1, false)
}

/** 触底加载下一页 */
function loadMore() {
  if (denied || loading.value || loadingMore.value || !hasMore.value) return
  fetchPage(page.value + 1, true)
}

/* ------------------------------ 交互 ------------------------------ */

/** 搜索输入防抖，避免每敲一个字都请求 */
function onKeywordInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchTimer = null
    fetchPage(1, false)
  }, 400)
}

function clearKeyword() {
  keyword.value = ''
  if (searchTimer) {
    clearTimeout(searchTimer)
    searchTimer = null
  }
  fetchPage(1, false)
}

function onCanteenChange(e) {
  canteenIndex.value = Number(e.detail.value) || 0
  fetchPage(1, false)
}

function goEdit(id) {
  const url = id ? `/pages/admin/dish-edit?id=${id}` : '/pages/admin/dish-edit'
  uni.navigateTo({ url })
}

/** 删除：二次确认后才调用接口 */
function confirmRemove(d) {
  const id = dishId(d)
  if (!id) {
    toast('该菜品缺少 id，无法删除')
    return
  }
  uni.showModal({
    title: '删除菜品',
    content: `确定删除「${d.name}」吗？删除后同学将无法再看到这道菜`,
    confirmColor: '#d93a3a',
    success: async (res) => {
      if (!res.confirm) return
      try {
        await dishApi.remove(id)
        list.value = list.value.filter((item) => dishId(item) !== id)
        total.value = Math.max(total.value - 1, 0)
        uni.showToast({ title: '已删除', icon: 'success' })
      } catch (e) {
        toast('删除失败：' + ((e && e.message) || '请检查云端配置'))
      }
    }
  })
}

/* ------------------------------ 生命周期 ------------------------------ */

onLoad(async () => {
  // 服务端验签把守（凭证过期 / 口令已改都会被拒），不能只看本机 role
  if (!(await ensureAdmin())) {
    denied = true
    return
  }
  loadCanteens()
  fetchPage(1, false)
  // 统计包内图片数量，决定是否显示「转云存储」入口
  refreshBagImageCount()
})

onShow(() => {
  // 从 dish-edit 返回后刷新，新增/编辑结果立刻可见
  if (!inited) {
    inited = true
    return
  }
  if (!denied) {
    fetchPage(1, false)
    refreshBagImageCount()
  }
})

onReachBottom(() => {
  loadMore()
})

onPullDownRefresh(() => {
  const done = () => uni.stopPullDownRefresh()
  if (denied) {
    done()
    return
  }
  Promise.all([loadCanteens(), fetchPage(1, false)]).then(done).catch(done)
})
</script>

<style lang="scss" scoped>
@import '@/common/tokens.scss';
.dishes-page {
  min-height: 100vh;
  background: $canvas;
  padding: $gap-page;
  padding-bottom: 200rpx;
  box-sizing: border-box;
}

/* ---------------- 顶部 ---------------- */
.hero {
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
  padding: $gap-card;
  box-shadow: $shadow-card;
}

.hero-title {
  display: block;
  font-size: $fs-title;
  font-weight: $fw-bold;
  color: $ink;
}

.hero-sub {
  display: block;
  margin-top: $gap-sm;
  font-size: $fs-cap;
  color: $gray6;
}

/* ---------------- 工具条 ---------------- */
.toolbar {
  display: flex;
  align-items: center;
  margin-top: $gap;
}

/* ---------------- 图片迁移提示条 ---------------- */
.migrate-bar {
  display: flex;
  align-items: center;
  margin-top: $gap;
  padding: 20rpx $gap-card;
  background: $warning-soft;
  border: 1rpx solid $warning-soft;
  border-radius: $radius-card;
}

.migrate-text {
  flex: 1;
  min-width: 0;
}

.migrate-title {
  display: block;
  font-size: $fs-sub;
  font-weight: $fw-medium;
  color: $warning;
}

.migrate-sub {
  display: block;
  font-size: $fs-tag;
  color: $gray6;
  margin-top: 6rpx;
}

.migrate-btn {
  flex-shrink: 0;
  margin-left: $gap;
  height: $h-btn-sm;
  padding: 0 28rpx;
  border-radius: $radius-pill;
  background: linear-gradient(135deg, $brand 0%, $brand-dark 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.migrate-btn.disabled {
  background: $line-strong;
}

.migrate-btn-text {
  font-size: $fs-cap;
  font-weight: $fw-bold;
  color: #fff;
}

.search-box {
  flex: 1;
  display: flex;
  align-items: center;
  height: $h-btn-sm;
  background: $surface-sunken;
  border-radius: $radius-pill;
  padding: 0 $gap;
  color: $gray6;
}

.search-input {
  flex: 1;
  height: $h-btn-sm;
  margin-left: $gap-sm;
  font-size: $fs-body;
  color: $ink;
}

.ph {
  color: $gray4;
  font-size: $fs-body;
}

.search-clear {
  padding: 0 4rpx 0 $gap-sm;
  color: $gray4;
}

.picker-box {
  width: 220rpx;
  margin-left: $gap-sm;
}

.picker-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  height: $h-btn-sm;
  padding: 0 16rpx;
  background: $surface-sunken;
  border-radius: $radius-pill;
  color: $gray6;
}

.picker-text {
  font-size: $fs-cap;
  color: $gray7;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-right: 8rpx;
}

/* ---------------- 状态 ---------------- */
.state-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: $gap;
  padding: 120rpx $gap-page;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
  box-shadow: $shadow-card;
  color: $gray4;
}

.state-text {
  margin-top: $gap;
  font-size: $fs-sub;
  color: $gray6;
  text-align: center;
  line-height: 1.6;
}

.retry-btn {
  margin-top: $gap-lg;
  height: $h-btn-sm;
  line-height: $h-btn-sm;
  padding: 0 48rpx;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-pill;
  font-size: $fs-sub;
  color: $gray7;
}

/* ---------------- 列表 ---------------- */
.list {
  display: flex;
  flex-direction: column;
  margin-top: $gap;
}

.item {
  display: flex;
  align-items: center;
  margin-bottom: $gap-sm;
  padding: $gap-card;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
  box-shadow: $shadow-card;
}

.item-main {
  flex: 1;
  min-width: 0;
  margin-left: $gap;
}

.item-title {
  display: flex;
  align-items: center;
}

.item-name {
  font-size: $fs-body;
  font-weight: $fw-medium;
  color: $ink;
  max-width: 280rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-tag {
  height: 44rpx;
  line-height: 44rpx;
  padding: 0 18rpx;
  margin-left: $gap-sm;
  border-radius: $radius-pill;
  font-size: $fs-tag;
  flex-shrink: 0;
}

.status-tag.on {
  background: $success-soft;
  color: $success;
}

.status-tag.off {
  background: $danger-soft;
  color: $danger;
}

.item-sub {
  display: block;
  margin-top: 8rpx;
  font-size: $fs-cap;
  color: $gray6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-meta {
  display: flex;
  align-items: center;
  margin-top: $gap-sm;
}

.cat {
  height: 40rpx;
  line-height: 40rpx;
  padding: 0 16rpx;
  margin-right: $gap-sm;
  background: $surface-sunken;
  border-radius: $radius-pill;
  font-size: $fs-tag;
  color: $gray6;
}

.price {
  font-size: $fs-body;
  font-weight: $fw-bold;
  color: $brand;
}

/* ---------------- 操作按钮 ---------------- */
.item-ops {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  margin-left: $gap-sm;
}

.op-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  background: $surface-sunken;
  color: $gray7;
}

.op-btn + .op-btn {
  margin-left: $gap-sm;
}

/* ---------------- 加载更多 ---------------- */
.load-tip {
  padding: 24rpx 0;
  text-align: center;
  font-size: $fs-cap;
  color: $gray6;
}

.load-tip.no-more {
  color: $gray4;
}

/* ---------------- 悬浮按钮 ---------------- */
.fab {
  position: fixed;
  right: 40rpx;
  bottom: 70rpx;
  width: 104rpx;
  height: 104rpx;
  border-radius: 50%;
  background: $brand;
  box-shadow: $shadow-brand;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
}
</style>
