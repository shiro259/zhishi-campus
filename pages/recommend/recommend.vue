<template>
  <view class="page">
    <!-- ==================== 输入区 ==================== -->
    <view class="hero">
      <view class="hero-title">今天想吃点什么？</view>
      <view class="hero-sub">说一句话，或者勾选偏好，让 AI 帮你从食堂里挑</view>

      <view class="nl">
        <textarea
          class="nl-input"
          v-model="nlText"
          placeholder="想吃辣的，20 块以内，不要香菜"
          placeholder-class="nl-ph"
          maxlength="80"
          auto-height
          :disabled="loading"
        />
        <view class="nl-foot">
          <view class="nl-parsed" v-if="parsedChips.length">
            <text class="parsed-chip" v-for="c in parsedChips" :key="c">{{ c }}</text>
          </view>
          <text class="nl-tip" v-else>支持"不吃香菜""15 元以内"这类口语描述</text>
        </view>
      </view>

      <!-- 口味快捷选择 -->
      <view class="quick">
        <text class="quick-label">口味</text>
        <view class="quick-chips">
          <view
            class="chip"
            v-for="t in TASTE_OPTIONS"
            :key="t"
            :class="{ 'chip-on': form.taste.includes(t) }"
            @click="toggle('taste', t)"
          >{{ t }}</view>
        </view>
      </view>

      <!-- 忌口快捷选择 -->
      <view class="quick">
        <text class="quick-label">不吃</text>
        <view class="quick-chips">
          <view
            class="chip chip-avoid"
            v-for="a in ALLERGY_OPTIONS"
            :key="a"
            :class="{ 'chip-avoid-on': form.allergies.includes(a) }"
            @click="toggle('allergies', a)"
          >{{ a }}</view>
        </view>
      </view>

      <!-- 预算 -->
      <view class="quick">
        <text class="quick-label">预算</text>
        <view class="quick-chips">
          <view
            class="chip"
            v-for="b in BUDGET_PRESETS"
            :key="b.label"
            :class="{ 'chip-on': budgetPreset === b.value }"
            @click="setBudget(b.value)"
          >{{ b.label }}</view>
        </view>
      </view>

      <view class="hero-actions">
        <view class="btn-primary" :class="{ 'is-loading': loading }" @click="doRecommend">
          <Icon name="sparkle" :size="34" color="#FFFFFF" />
          <text class="btn-text">{{ loading ? '正在为你挑选…' : '生成推荐' }}</text>
        </view>
        <view class="btn-ghost" @click="showMore = !showMore">
          <Icon name="filter" :size="32" color="#4A443F" />
          <text class="btn-text-ghost">{{ showMore ? '收起' : '更多条件' }}</text>
        </view>
      </view>
    </view>

    <!-- ==================== 更多条件 ==================== -->
    <view class="card" v-if="showMore && !loading">
      <view class="row">
        <text class="row-label">用餐时段</text>
        <view class="row-chips">
          <view
            class="chip chip-sm"
            v-for="m in MEAL_TYPES"
            :key="m"
            :class="{ 'chip-on': form.meal_type === m }"
            @click="form.meal_type = m"
          >{{ m }}</view>
        </view>
      </view>

      <view class="divider" />

      <view class="row">
        <text class="row-label">食堂</text>
        <picker mode="selector" :range="canteenRange" @change="onCanteenChange">
          <view class="select">
            <text class="select-text">{{ form.canteen || '不限' }}</text>
            <Icon name="down" :size="28" color="#B8B2AA" />
          </view>
        </picker>
      </view>

      <view class="divider" />

      <view class="row row-column">
        <text class="row-label">其他要求</text>
        <input
          class="input"
          v-model="form.extra"
          placeholder="例如：分量大一点、不要太油"
          placeholder-class="nl-ph"
          maxlength="50"
        />
      </view>

      <view class="divider" />

      <view class="row">
        <text class="row-label">预算上限</text>
        <view class="slider-wrap">
          <slider
            class="slider"
            :value="form.budget || 0"
            :min="0"
            :max="40"
            :step="1"
            activeColor="#FF5A36"
            backgroundColor="#EEECE7"
            block-size="18"
            @changing="onSlider"
            @change="onSlider"
          />
          <text class="slider-value">{{ form.budget ? '¥' + form.budget : '不限' }}</text>
        </view>
      </view>
    </view>

    <!-- ==================== 加载态 ==================== -->
    <view class="card loading-card" v-if="loading">
      <view class="spinner" />
      <text class="loading-text">AI 正在翻食堂菜单…</text>
      <text class="loading-sub">正在比对口味、忌口与预算</text>
    </view>

    <!-- ==================== 结果区 ==================== -->
    <template v-if="result && !loading">
      <view class="summary">
        <view class="summary-head">
          <text class="summary-text">{{ result.summary }}</text>
        </view>
        <view class="summary-foot">
          <view class="engine" :class="result.engine === 'ai' ? 'engine-ai' : 'engine-rule'">
            <Icon :name="result.engine === 'ai' ? 'sparkle' : 'settings'" :size="24"
                  :color="result.engine === 'ai' ? '#FF5A36' : '#8A8580'" />
            <text class="engine-text">{{ engineLabel }}</text>
          </view>
          <text class="summary-meta" v-if="result.recommendations && result.recommendations.length">
            {{ result.recommendations.length }} 道 · 人均 ¥{{ avgPrice }}
          </text>
        </view>
      </view>

      <view class="notice" v-if="result.notice">
        <Icon name="info" :size="28" color="#C98A1B" />
        <text class="notice-text">{{ result.notice }}</text>
      </view>

      <view
        class="rec"
        v-for="(r, idx) in result.recommendations"
        :key="r.dish_id"
      >
        <view class="rec-top" @click="goDetail(r.dish_id)">
          <view class="rec-img">
            <DishImage :dish="r" :size="160" :radius="20" />
            <view class="rec-rank" :class="{ 'rec-rank-top': idx === 0 }">{{ idx + 1 }}</view>
          </view>

          <view class="rec-body">
            <view class="rec-title">
              <text class="rec-name">{{ r.name }}</text>
              <text class="rec-price">¥{{ r.price }}</text>
            </view>

            <view class="rec-loc">
              <Icon name="location" :size="24" color="#B8B2AA" />
              <text class="rec-loc-text">{{ r.canteen }} · {{ r.window }}</text>
            </view>

            <view class="rec-stats">
              <view class="score">
                <view class="score-bar">
                  <view class="score-fill" :style="{ width: r.match_score + '%' }" />
                </view>
                <text class="score-text">匹配 {{ r.match_score }}%</text>
              </view>
              <view class="rating">
                <Icon name="star" :size="24" color="#FF5A36" />
                <text class="rating-text">{{ r.rating }}</text>
              </view>
            </view>
          </view>
        </view>

        <view class="reason">
          <text class="reason-tag">推荐理由</text>
          <text class="reason-text">{{ r.reason }}</text>
        </view>

        <view class="rec-actions">
          <view class="act" @click="goReview(r)">
            <Icon name="edit" :size="28" color="#4A443F" />
            <text class="act-text">写评价</text>
          </view>
          <view class="act act-primary" @click="pickOne(r)">
            <Icon name="check" :size="28" color="#FFFFFF" />
            <text class="act-text act-text-primary">就吃这个</text>
          </view>
        </view>
      </view>

      <view class="empty" v-if="!result.recommendations || !result.recommendations.length">
        <Icon name="search" :size="72" color="#D8D3CB" />
        <text class="empty-title">没有完全符合的菜品</text>
        <text class="empty-sub">{{ result.summary || '试试放宽预算或换个食堂' }}</text>
      </view>

      <view class="foot-actions">
        <view class="foot-btn" @click="reset">
          <Icon name="refresh" :size="30" color="#4A443F" />
          <text class="foot-text">换一批</text>
        </view>
        <view class="foot-btn" @click="scrollTop">
          <Icon name="up" :size="30" color="#4A443F" />
          <text class="foot-text">改条件</text>
        </view>
      </view>
    </template>

    <!-- ==================== 推荐历史 ==================== -->
    <view class="card history" v-if="!result && !loading && history.length">
      <view class="history-head">
        <text class="card-title">最近推荐</text>
        <text class="history-clear" @click="clearHistory">清空</text>
      </view>
      <view class="history-item" v-for="(h, i) in history" :key="i">
        <view class="history-dot" />
        <view class="history-main">
          <text class="history-label">{{ h.label }}</text>
          <text class="history-summary">{{ h.summary }}</text>
        </view>
      </view>
    </view>

    <view class="source">
      <Icon name="info" :size="24" color="#B8B2AA" />
      <text class="source-text">{{ sourceText }}</text>
    </view>
  </view>
</template>

<script setup>
/**
 * AI 智能推荐页
 *
 * 交互链路：用户输入（一句话 + 快捷偏好）→ shiyu-recommend 云函数
 *   → 云函数读取 AI 配置、构建 Prompt、调用大模型、严格校验输出
 *   → 未配置 Key / 调用失败 / 校验不通过 → 本地规则引擎兜底
 * 页面上用「匹配度进度条 + 引擎标识」把这条链路透明地展示给用户。
 */
import { ref, computed, onMounted } from 'vue'
import { recommendApi, dishApi, configApi } from '@/api/index.js'
import {
  MEAL_TYPES,
  TASTE_OPTIONS,
  ALLERGY_OPTIONS,
  BUDGET_PRESETS
} from '@/common/constants.js'

const loading = ref(false)
const result = ref(null)
const showMore = ref(false)
const nlText = ref('')
const history = ref([])
const canteenRange = ref(['不限', '第一食堂', '第二食堂', '第三食堂'])
const budgetPreset = ref(0)
const aiConfigured = ref(false)
const aiStatusKnown = ref(false)

const form = ref({
  meal_type: '午餐',
  taste: [],
  allergies: [],
  budget: null,
  canteen: '',
  extra: ''
})

/* -------------------------------- 计算属性 -------------------------------- */

const parsedChips = computed(() => {
  if (!nlText.value.trim()) return []
  const p = recommendApi.parseText(nlText.value)
  const chips = []
  if (p.meal_type) chips.push(p.meal_type)
  p.taste.forEach((t) => chips.push('爱' + t))
  p.allergies.forEach((a) => chips.push('不吃' + a))
  if (p.budget) chips.push(p.budget + ' 元内')
  return chips
})

const avgPrice = computed(() => {
  const list = (result.value && result.value.recommendations) || []
  if (!list.length) return '0.0'
  return (list.reduce((s, r) => s + Number(r.price || 0), 0) / list.length).toFixed(1)
})

const engineLabel = computed(() => {
  const r = result.value || {}
  if (r.engine === 'ai') return '大模型 ' + (r.model || '')
  if (r.engine === 'local') return '本地规则引擎'
  return '云端规则引擎'
})

const sourceText = computed(() => {
  const r = result.value
  if (r && r.engine === 'ai') return '本次结果由大模型生成，已通过忌口与预算校验'
  if (!aiStatusKnown.value) return '正在检测 AI 服务状态…'
  if (!aiConfigured.value) return '尚未配置大模型 API Key，当前使用本地智能规则'
  return '大模型调用未成功，本次已自动降级为本地规则推荐'
})

/* -------------------------------- 交互逻辑 -------------------------------- */

function toggle(field, value) {
  const arr = form.value[field]
  const i = arr.indexOf(value)
  if (i > -1) arr.splice(i, 1)
  else arr.push(value)
}

function setBudget(v) {
  budgetPreset.value = v
  form.value.budget = v > 0 ? v : null
}

function onSlider(e) {
  const v = e.detail.value
  form.value.budget = v > 0 ? v : null
  budgetPreset.value = BUDGET_PRESETS.some((b) => b.value === v) ? v : 0
}

function onCanteenChange(e) {
  const val = canteenRange.value[e.detail.value]
  form.value.canteen = val === '不限' ? '' : val
}

async function doRecommend() {
  if (loading.value) return
  loading.value = true
  result.value = null

  recommendApi.savePref({ ...form.value })

  try {
    const data = await recommendApi.recommend({ ...form.value }, nlText.value)
    result.value = data
    if (!data.recommendations || !data.recommendations.length) {
      uni.showToast({ title: '没有完全符合条件的菜品', icon: 'none' })
    }
  } catch (e) {
    uni.showToast({ title: (e && e.message) || '推荐失败，请重试', icon: 'none' })
  } finally {
    loading.value = false
  }
}

function reset() {
  result.value = null
  doRecommend()
}

function pickOne(r) {
  uni.showModal({
    title: r.name,
    content: `${r.canteen} · ${r.window}\n¥${r.price}\n\n${r.reason}`,
    confirmText: '看详情',
    cancelText: '知道了',
    success: (res) => {
      if (res.confirm) goDetail(r.dish_id)
    }
  })
}

function goDetail(id) {
  if (!id) return
  uni.navigateTo({ url: `/pages/dish/dish?id=${id}` })
}

function goReview(r) {
  uni.navigateTo({
    url: `/pages/review/review?dish_id=${r.dish_id}&dish_name=${encodeURIComponent(r.name)}`
  })
}

function clearHistory() {
  recommendApi.clearHistory()
  history.value = []
}

function scrollTop() {
  try {
    uni.pageScrollTo({ scrollTop: 0, duration: 240 })
  } catch (e) {
    // 忽略
  }
}

/* -------------------------------- 初始化 -------------------------------- */

onMounted(async () => {
  history.value = recommendApi.getHistory()

  const saved = recommendApi.getSavedPref()
  if (saved) {
    form.value = { ...form.value, ...saved }
    if (saved.budget && BUDGET_PRESETS.some((b) => b.value === saved.budget)) {
      budgetPreset.value = saved.budget
    }
  }

  try {
    const res = await dishApi.canteens()
    const list = res.list || []
    if (list.length) canteenRange.value = ['不限', ...list]
  } catch (e) {
    // 使用默认食堂列表
  }

  try {
    const cfg = await configApi.get()
    aiConfigured.value = !!cfg.configured
  } catch (e) {
    aiConfigured.value = false
  } finally {
    aiStatusKnown.value = true
  }
})
</script>

<style lang="scss" scoped>
@import '@/common/tokens.scss';
.page {
  min-height: 100vh;
  background: $canvas;
  padding: $gap-page $gap-page 80rpx;
}

/* ==================== 输入区 ==================== */
.hero {
  padding-top: $gap-sm;
}

.hero-title {
  font-size: $fs-title;
  font-weight: $fw-bold;
  color: $ink;
  letter-spacing: -0.6rpx;
}

.hero-sub {
  margin-top: 10rpx;
  font-size: $fs-sub;
  color: $gray6;
}

.nl {
  margin-top: $gap-lg;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
  padding: $gap-card;
}

.nl-input {
  width: 100%;
  min-height: 76rpx;
  font-size: $fs-body;
  color: $ink;
  line-height: 1.6;
}

.nl-ph {
  color: $gray4;
  font-size: $fs-body;
}

.nl-foot {
  margin-top: $gap-sm;
}

.nl-tip {
  font-size: $fs-cap;
  color: $gray4;
}

.nl-parsed {
  display: flex;
  flex-wrap: wrap;
}

.parsed-chip {
  font-size: $fs-tag;
  color: $brand;
  background: $brand-soft;
  padding: 4rpx 16rpx;
  border-radius: $radius-pill;
  margin: 0 10rpx 8rpx 0;
}

/* 快捷偏好 */
.quick {
  display: flex;
  margin-top: $gap-lg;
}

.quick-label {
  width: 76rpx;
  flex-shrink: 0;
  font-size: $fs-sub;
  color: $gray6;
  line-height: 60rpx;
}

.quick-chips {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
}

.chip {
  padding: 0 24rpx;
  height: 60rpx;
  line-height: 60rpx;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-pill;
  font-size: $fs-sub;
  color: $gray7;
  margin: 0 14rpx 14rpx 0;
}

.chip-on {
  background: $brand-soft;
  border-color: $brand-line;
  color: $brand;
  font-weight: $fw-medium;
}

/* 忌口用中性灰选中，避免与"口味"抢主色 */
.chip-avoid-on {
  background: $surface-sunken;
  border-color: $gray4;
  color: $ink;
  font-weight: $fw-medium;
}

.hero-actions {
  display: flex;
  margin-top: $gap-lg;
}

.btn-primary {
  flex: 1;
  height: $h-btn;
  background: $brand;
  border-radius: $radius-pill;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: $shadow-brand;
}

.btn-primary.is-loading {
  opacity: 0.65;
}

.btn-text {
  margin-left: 10rpx;
  color: #fff;
  font-size: $fs-card;
  font-weight: $fw-medium;
}

.btn-ghost {
  margin-left: $gap;
  padding: 0 30rpx;
  height: $h-btn;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-pill;
  display: flex;
  align-items: center;
}

.btn-text-ghost {
  margin-left: 8rpx;
  font-size: $fs-sub;
  color: $gray7;
}

/* ==================== 更多条件卡片 ==================== */
.card {
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
  padding: $gap-card;
  margin-top: $gap-lg;
  box-shadow: $shadow-card;
}

.card-title {
  font-size: $fs-card;
  font-weight: $fw-bold;
  color: $ink;
}

.row {
  display: flex;
  align-items: center;
}

.row-column {
  display: block;
}

.row-label {
  width: 140rpx;
  flex-shrink: 0;
  font-size: $fs-sub;
  color: $gray6;
}

.row-chips {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
}

.chip-sm {
  height: 56rpx;
  line-height: 56rpx;
  padding: 0 20rpx;
  font-size: $fs-cap;
  margin-bottom: 10rpx;
}

.divider {
  height: 2rpx;
  background: $line;
  margin: $gap 0;
}

.select {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 72rpx;
  padding: 0 22rpx;
  background: $surface-sunken;
  border-radius: $radius;
  min-width: 300rpx;
}

.select-text {
  font-size: $fs-sub;
  color: $ink;
}

.input {
  margin-top: 12rpx;
  height: $h-input;
  padding: 0 22rpx;
  background: $surface-sunken;
  border-radius: $radius;
  font-size: $fs-sub;
  color: $ink;
}

.slider-wrap {
  flex: 1;
  display: flex;
  align-items: center;
}

.slider {
  flex: 1;
  margin: 0 16rpx;
}

.slider-value {
  width: 110rpx;
  text-align: right;
  font-size: $fs-sub;
  color: $brand;
  font-weight: $fw-medium;
}

/* ==================== 加载态 ==================== */
.loading-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 72rpx $gap-card;
}

.spinner {
  width: 44rpx;
  height: 44rpx;
  border: 4rpx solid $line;
  border-top-color: $brand;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-text {
  margin-top: $gap;
  font-size: $fs-sub;
  color: $gray7;
}

.loading-sub {
  margin-top: 6rpx;
  font-size: $fs-cap;
  color: $gray4;
}

/* ==================== 结果摘要 ==================== */
.summary {
  margin-top: $gap-lg;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
  padding: $gap-card;
  box-shadow: $shadow-card;
}

.summary-text {
  font-size: $fs-body;
  color: $ink;
  line-height: 1.6;
  font-weight: $fw-medium;
}

.summary-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: $gap;
  padding-top: $gap-sm;
  border-top: 2rpx solid $line;
}

.engine {
  display: flex;
  align-items: center;
  padding: 6rpx 16rpx;
  border-radius: $radius-pill;
}

.engine-ai {
  background: $brand-soft;
}

.engine-rule {
  background: $surface-sunken;
}

.engine-text {
  margin-left: 8rpx;
  font-size: $fs-cap;
  color: $gray7;
}

.summary-meta {
  font-size: $fs-cap;
  color: $gray6;
}

.notice {
  display: flex;
  align-items: flex-start;
  margin-top: $gap;
  padding: 20rpx 24rpx;
  background: $warning-soft;
  border-radius: $radius;
}

.notice-text {
  flex: 1;
  margin-left: 12rpx;
  font-size: $fs-cap;
  color: $warning;
  line-height: 1.55;
}

/* ==================== 推荐卡片 ==================== */
.rec {
  margin-top: $gap;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
  padding: $gap-card;
  box-shadow: $shadow-card;
}

.rec-top {
  display: flex;
}

.rec-img {
  position: relative;
  margin-right: 24rpx;
  flex-shrink: 0;
}

.rec-rank {
  position: absolute;
  top: -8rpx;
  left: -8rpx;
  min-width: 40rpx;
  height: 40rpx;
  padding: 0 10rpx;
  border-radius: $radius-pill;
  background: $ink;
  color: #fff;
  font-size: $fs-tag;
  font-weight: $fw-bold;
  text-align: center;
  line-height: 40rpx;
}

.rec-rank-top {
  background: $brand;
}

.rec-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.rec-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.rec-name {
  font-size: $fs-card;
  font-weight: $fw-bold;
  color: $ink;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.rec-price {
  margin-left: 16rpx;
  font-size: $fs-card;
  font-weight: $fw-bold;
  color: $brand;
}

.rec-loc {
  display: flex;
  align-items: center;
  margin-top: 10rpx;
}

.rec-loc-text {
  margin-left: 6rpx;
  font-size: $fs-cap;
  color: $gray6;
}

.rec-stats {
  display: flex;
  align-items: center;
  margin-top: auto;
  padding-top: 16rpx;
}

.score {
  flex: 1;
  display: flex;
  align-items: center;
}

.score-bar {
  flex: 1;
  height: 8rpx;
  background: $surface-sunken;
  border-radius: $radius-pill;
  overflow: hidden;
}

.score-fill {
  height: 100%;
  background: $brand;
  border-radius: $radius-pill;
}

.score-text {
  margin-left: 12rpx;
  font-size: $fs-tag;
  color: $gray6;
}

.rating {
  display: flex;
  align-items: center;
  margin-left: 16rpx;
}

.rating-text {
  margin-left: 4rpx;
  font-size: $fs-cap;
  color: $gray7;
  font-weight: $fw-medium;
}

.reason {
  margin-top: $gap;
  padding: 18rpx 20rpx;
  background: $surface-sunken;
  border-radius: $radius;
}

.reason-tag {
  font-size: $fs-tag;
  color: $gray6;
}

.reason-text {
  display: block;
  margin-top: 6rpx;
  font-size: $fs-cap;
  color: $gray7;
  line-height: 1.6;
}

.rec-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: $gap;
}

.act {
  display: flex;
  align-items: center;
  height: $h-btn-sm;
  padding: 0 26rpx;
  border: 2rpx solid $line-strong;
  border-radius: $radius-pill;
  margin-left: 16rpx;
}

.act-primary {
  background: $brand;
  border-color: $brand;
}

.act-text {
  margin-left: 8rpx;
  font-size: $fs-cap;
  color: $gray7;
}

.act-text-primary {
  color: #fff;
  font-weight: $fw-medium;
}

/* ==================== 空态 ==================== */
.empty {
  margin-top: $gap-lg;
  padding: 80rpx $gap-card;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.empty-title {
  margin-top: $gap;
  font-size: $fs-body;
  color: $ink;
  font-weight: $fw-medium;
}

.empty-sub {
  margin-top: 8rpx;
  font-size: $fs-cap;
  color: $gray6;
  text-align: center;
}

/* ==================== 底部操作 ==================== */
.foot-actions {
  display: flex;
  margin-top: $gap-lg;
}

.foot-btn {
  flex: 1;
  height: $h-btn;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-pill;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 8rpx;
}

.foot-text {
  margin-left: 8rpx;
  font-size: $fs-sub;
  color: $gray7;
}

/* ==================== 历史 ==================== */
.history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.history-clear {
  font-size: $fs-cap;
  color: $gray4;
}

.history-item {
  display: flex;
  align-items: flex-start;
  margin-top: $gap;
}

.history-dot {
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  background: $brand-line;
  margin: 16rpx 16rpx 0 0;
  flex-shrink: 0;
}

.history-main {
  flex: 1;
  min-width: 0;
}

.history-label {
  display: block;
  font-size: $fs-sub;
  color: $gray7;
}

.history-summary {
  display: block;
  margin-top: 4rpx;
  font-size: $fs-cap;
  color: $gray4;
}

/* ==================== 数据来源 ==================== */
.source {
  display: flex;
  align-items: flex-start;
  margin-top: $gap-lg;
  padding: 0 8rpx;
}

.source-text {
  flex: 1;
  margin-left: 10rpx;
  font-size: $fs-tag;
  color: $gray4;
  line-height: 1.6;
}
</style>
