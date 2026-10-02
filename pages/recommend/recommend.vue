<template>
  <view class="rec-page">
    <!-- ============ 一句话描述（口语化输入，最贴近“每天不知道吃啥”的场景） ============ -->
    <view class="hero">
      <view class="hero-title">
        <text class="hero-emoji">🤖</text>
        <text class="hero-text">今天想吃点什么？</text>
      </view>
      <view class="hero-sub">说句人话就行，AI 帮你从食堂里挑</view>

      <view class="nl-box">
        <textarea
          class="nl-input"
          v-model="nlText"
          placeholder="例如：想吃辣的，20块以内，不要香菜"
          placeholder-class="nl-placeholder"
          maxlength="80"
          auto-height
          :disabled="loading"
        />
        <view class="nl-parsed" v-if="parsedChips.length">
          <text class="parsed-label">已识别</text>
          <text class="parsed-chip" v-for="c in parsedChips" :key="c">{{ c }}</text>
        </view>
      </view>

      <view class="hero-actions">
        <view class="btn-primary" :class="{ disabled: loading }" @click="doRecommend">
          <text v-if="!loading">✨ 生成推荐</text>
          <text v-else>AI 正在挑选…</text>
        </view>
        <view class="btn-ghost" @click="showForm = !showForm">
          {{ showForm ? '收起精细筛选' : '精细筛选' }}
        </view>
      </view>
    </view>

    <!-- ============ 精细筛选（口味 / 忌口 / 预算 / 食堂） ============ -->
    <view class="form-card" v-show="showForm && !loading">
      <view class="form-group">
        <text class="group-label">用餐时段</text>
        <view class="chip-group">
          <view
            class="chip"
            v-for="m in MEAL_TYPES"
            :key="m"
            :class="{ active: form.meal_type === m }"
            @click="form.meal_type = m"
          >{{ m }}</view>
        </view>
      </view>

      <view class="form-group">
        <text class="group-label">口味偏好（可多选）</text>
        <view class="chip-group">
          <view
            class="chip"
            v-for="t in TASTE_OPTIONS"
            :key="t"
            :class="{ active: form.taste.includes(t) }"
            @click="toggle('taste', t)"
          >{{ t }}</view>
        </view>
      </view>

      <view class="form-group">
        <text class="group-label">
          不吃什么（可多选）
          <text class="group-tip">选中的食材绝不会出现在推荐里</text>
        </text>
        <view class="chip-group">
          <view
            class="chip chip-warn"
            v-for="a in ALLERGY_OPTIONS"
            :key="a"
            :class="{ active: form.allergies.includes(a) }"
            @click="toggle('allergies', a)"
          >{{ a }}</view>
        </view>
      </view>

      <view class="form-group">
        <text class="group-label">预算：{{ form.budget ? '¥' + form.budget + ' 以内' : '不限' }}</text>
        <view class="chip-group budget-chips">
          <view
            class="chip"
            v-for="b in BUDGET_PRESETS"
            :key="b.label"
            :class="{ active: budgetPreset === b.value }"
            @click="setBudget(b.value)"
          >{{ b.label }}</view>
        </view>
        <slider
          class="budget-slider"
          :value="form.budget || 0"
          :min="0"
          :max="40"
          :step="1"
          activeColor="#FF6B35"
          block-size="20"
          @changing="onSlider"
          @change="onSlider"
        />
      </view>

      <view class="form-group">
        <text class="group-label">食堂范围</text>
        <picker mode="selector" :range="canteenRange" @change="onCanteenChange">
          <view class="picker">
            <text>{{ form.canteen || '所有食堂任选' }}</text>
            <text class="picker-arrow">›</text>
          </view>
        </picker>
      </view>

      <view class="form-group">
        <text class="group-label">其他要求（选填）</text>
        <input
          class="input"
          v-model="form.extra"
          placeholder="例如：分量大一点、不要太油"
          maxlength="50"
        />
      </view>
    </view>

    <!-- ============ 加载态 ============ -->
    <view class="loading-card" v-if="loading">
      <text class="loading-emoji">🍳</text>
      <text class="loading-text">AI 正在翻遍 {{ canteenRange.length - 1 }} 个食堂的菜单…</text>
      <view class="loading-dots">
        <text class="dot" v-for="i in 3" :key="i" :style="{ animationDelay: i * 0.2 + 's' }" />
      </view>
    </view>

    <!-- ============ 推荐结果 ============ -->
    <view class="result" v-if="result && !loading">
      <view class="summary-card">
        <text class="summary-text">{{ result.summary }}</text>
        <view class="summary-meta">
          <text class="engine-tag" :class="engineClass">{{ engineLabel }}</text>
          <text class="summary-count" v-if="result.recommendations && result.recommendations.length">
            {{ result.recommendations.length }} 道 · 人均 ¥{{ avgPrice }}
          </text>
        </view>
      </view>

      <view class="notice" v-if="result.notice">
        <text class="notice-icon">ℹ️</text>
        <text class="notice-text">{{ result.notice }}</text>
      </view>

      <view
        class="rec-card"
        v-for="(r, idx) in result.recommendations"
        :key="r.dish_id"
      >
        <view class="rank-badge" :class="'rank-' + (idx + 1)">{{ idx + 1 }}</view>

        <view class="rec-main" @click="goDetail(r.dish_id)">
          <view class="rec-img-wrap">
            <DishImage :dish="r" :size="140" :radius="16" />
          </view>
          <view class="rec-body">
            <view class="rec-head">
              <text class="rec-name">{{ r.name }}</text>
              <text class="rec-price">¥{{ r.price }}</text>
            </view>
            <text class="rec-loc">{{ r.canteen }} · {{ r.window }}</text>
            <view class="rec-tags">
              <text class="tag" v-for="t in (r.tags || []).slice(0, 3)" :key="t">{{ t }}</text>
            </view>
            <view class="rec-stars">
              <text class="stars">⭐ {{ r.rating }}</text>
              <view class="score-bar">
                <view class="score-fill" :style="{ width: r.match_score + '%' }" />
              </view>
              <text class="score-num">匹配 {{ r.match_score }}%</text>
            </view>
          </view>
        </view>

        <view class="rec-reason">
          <text class="reason-badge">AI 理由</text>
          <text class="reason-text">{{ r.reason }}</text>
        </view>

        <view class="rec-actions">
          <view class="mini-btn" @click="goDetail(r.dish_id)">看详情</view>
          <view class="mini-btn" @click="goReview(r)">写评价</view>
          <view class="mini-btn mini-btn-primary" @click="pickOne(r)">就吃这个</view>
        </view>
      </view>

      <view class="empty-card" v-if="!result.recommendations || !result.recommendations.length">
        <text class="empty-emoji">🥲</text>
        <text class="empty-text">{{ result.summary || '没有找到符合条件的菜品' }}</text>
        <text class="empty-tip">试试放宽预算、换个食堂，或者减少忌口</text>
      </view>

      <view class="result-footer">
        <view class="foot-btn" @click="reset">🔄 换一批</view>
        <view class="foot-btn" @click="showForm = true; scrollToForm()">⚙️ 调条件</view>
      </view>
    </view>

    <!-- ============ 推荐历史 ============ -->
    <view class="history-card" v-if="!result && !loading && history.length">
      <view class="history-head">
        <text class="history-title">最近推荐</text>
        <text class="history-clear" @click="clearHistory">清空</text>
      </view>
      <view class="history-item" v-for="(h, i) in history" :key="i">
        <text class="history-label">{{ h.label }}</text>
        <text class="history-summary">{{ h.summary }}</text>
      </view>
    </view>

    <!-- ============ 数据来源提示 ============ -->
    <view class="source-tip">
      <text class="source-text">{{ sourceText }}</text>
    </view>
  </view>
</template>

<script setup>
/**
 * AI 智能推荐页
 *
 * 流程：用户输入（自然语言 + 精细筛选）→ 云端 shiyu-recommend 云函数
 *      → 云函数读取 AI 配置、构建 Prompt、调用大模型、严格校验输出
 *      → 校验不通过 / 未配置 Key / 云函数不可用 → 本地规则引擎兜底
 */
import { ref, computed, onMounted } from 'vue'
import { recommendApi, dishApi, configApi } from '@/api/index.js'
import DishImage from '@/components/DishImage/DishImage.vue'
import {
  MEAL_TYPES,
  TASTE_OPTIONS,
  ALLERGY_OPTIONS,
  BUDGET_PRESETS
} from '@/common/constants.js'

const loading = ref(false)
const result = ref(null)
const showForm = ref(false)
const nlText = ref('')
const history = ref([])
const canteenRange = ref(['所有食堂'])
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

/** 一句话里实时识别出的偏好，给用户即时反馈 */
const parsedChips = computed(() => {
  if (!nlText.value.trim()) return []
  const p = recommendApi.parseText(nlText.value)
  const chips = []
  if (p.meal_type) chips.push(p.meal_type)
  p.taste.forEach((t) => chips.push('爱' + t))
  p.allergies.forEach((a) => chips.push('不吃' + a))
  if (p.budget) chips.push(p.budget + '元内')
  return chips
})

const avgPrice = computed(() => {
  const list = (result.value && result.value.recommendations) || []
  if (!list.length) return '0'
  return (list.reduce((s, r) => s + Number(r.price || 0), 0) / list.length).toFixed(1)
})

/** 引擎标签：区分「真·大模型」和「规则兜底」，答辩时一眼能看出调用链路 */
const engineLabel = computed(() => {
  const r = result.value || {}
  if (r.engine === 'ai') return '大模型 ' + (r.model || 'LLM')
  if (r.engine === 'local') return '本地规则引擎'
  if (r.engine === 'cloud') return '云端规则引擎'
  return '智能推荐'
})

const engineClass = computed(() => {
  const r = result.value || {}
  return r.engine === 'ai' ? 'engine-ai' : 'engine-fallback'
})

const sourceText = computed(() => {
  const r = result.value
  if (r && r.engine === 'ai') {
    return '本次结果由大模型生成，已通过忌口与预算校验'
  }
  if (!aiStatusKnown.value) return '正在检测 AI 服务状态…'
  if (!aiConfigured.value) {
    return '⚠️ 尚未配置大模型 API Key，当前使用本地智能规则；管理员可在「管理后台 → AI 配置」中设置'
  }
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
  const hit = BUDGET_PRESETS.find((b) => b.value === v)
  budgetPreset.value = hit ? v : 0
}

function onCanteenChange(e) {
  const val = canteenRange.value[e.detail.value]
  form.value.canteen = val === '所有食堂' ? '' : val
}

async function doRecommend() {
  if (loading.value) return
  loading.value = true
  result.value = null
  showForm.value = false

  // 记住本次偏好，下次进来自动回填
  recommendApi.savePref({ ...form.value })

  try {
    const data = await recommendApi.recommend({ ...form.value }, nlText.value)
    result.value = data
    if (!data.recommendations || !data.recommendations.length) {
      uni.showToast({ title: '没找到完全符合的菜品', icon: 'none' })
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
    title: '就吃这个！',
    content: `${r.name}\n${r.canteen} · ${r.window}\n¥${r.price}`,
    confirmText: '看详情',
    cancelText: '好的',
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

function scrollToForm() {
  // 收起状态展开后滚动到表单（H5/小程序均安全）
  try {
    uni.pageScrollTo({ scrollTop: 300, duration: 200 })
  } catch (e) {
    // 忽略
  }
}

/* -------------------------------- 初始化 -------------------------------- */

onMounted(async () => {
  history.value = recommendApi.getHistory()

  // 回填上次偏好
  const saved = recommendApi.getSavedPref()
  if (saved) {
    form.value = { ...form.value, ...saved }
    if (saved.budget) budgetPreset.value = saved.budget
  }

  // 食堂列表
  try {
    const res = await dishApi.canteens()
    const list = res.list || []
    if (list.length) canteenRange.value = ['所有食堂', ...list]
  } catch (e) {
    // 使用默认「所有食堂」
  }

  // AI 配置状态（仅用于底部提示，失败不影响使用）
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

<style scoped>
.rec-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 24rpx 24rpx 60rpx;
  box-sizing: border-box;
}

/* ---------- 顶部一句话输入 ---------- */
.hero {
  background: linear-gradient(135deg, #667eea, #764ba2);
  border-radius: 24rpx;
  padding: 32rpx;
  box-shadow: 0 12rpx 30rpx rgba(102, 126, 234, 0.25);
}

.hero-title {
  display: flex;
  align-items: center;
}

.hero-emoji {
  font-size: 40rpx;
  margin-right: 12rpx;
}

.hero-text {
  color: #fff;
  font-size: 36rpx;
  font-weight: bold;
}

.hero-sub {
  color: rgba(255, 255, 255, 0.8);
  font-size: 24rpx;
  margin-top: 10rpx;
}

.nl-box {
  margin-top: 26rpx;
  background: rgba(255, 255, 255, 0.96);
  border-radius: 16rpx;
  padding: 20rpx 22rpx;
}

.nl-input {
  width: 100%;
  min-height: 76rpx;
  font-size: 28rpx;
  color: #333;
  line-height: 1.5;
}

.nl-placeholder {
  color: #bbb;
  font-size: 28rpx;
}

.nl-parsed {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 12rpx;
  padding-top: 12rpx;
  border-top: 1rpx dashed #eee;
}

.parsed-label {
  font-size: 22rpx;
  color: #999;
  margin-right: 10rpx;
}

.parsed-chip {
  font-size: 22rpx;
  color: #764ba2;
  background: #f0ecff;
  padding: 4rpx 14rpx;
  border-radius: 20rpx;
  margin: 4rpx 8rpx 4rpx 0;
}

.hero-actions {
  display: flex;
  align-items: center;
  margin-top: 26rpx;
}

.btn-primary {
  flex: 1;
  height: 84rpx;
  background: #FF6B35;
  border-radius: 42rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 30rpx;
  font-weight: 500;
  box-shadow: 0 8rpx 18rpx rgba(255, 107, 53, 0.35);
}

.btn-primary.disabled {
  opacity: 0.7;
}

.btn-ghost {
  margin-left: 20rpx;
  height: 84rpx;
  padding: 0 28rpx;
  border-radius: 42rpx;
  border: 2rpx solid rgba(255, 255, 255, 0.7);
  color: #fff;
  font-size: 26rpx;
  display: flex;
  align-items: center;
}

/* ---------- 精细筛选表单 ---------- */
.form-card {
  background: #fff;
  border-radius: 20rpx;
  padding: 30rpx;
  margin-top: 24rpx;
}

.form-group {
  margin-bottom: 32rpx;
}

.form-group:last-child {
  margin-bottom: 0;
}

.group-label {
  font-size: 27rpx;
  color: #333;
  font-weight: 500;
  display: block;
  margin-bottom: 18rpx;
}

.group-tip {
  font-size: 21rpx;
  color: #bbb;
  font-weight: normal;
  margin-left: 10rpx;
}

.chip-group {
  display: flex;
  flex-wrap: wrap;
}

.chip {
  padding: 12rpx 26rpx;
  background: #f5f5f5;
  border-radius: 30rpx;
  font-size: 26rpx;
  color: #666;
  border: 2rpx solid transparent;
  margin: 0 16rpx 16rpx 0;
}

.chip.active {
  background: #fff0eb;
  color: #FF6B35;
  border-color: #FF6B35;
}

.chip-warn.active {
  background: #ffeded;
  color: #e64340;
  border-color: #e64340;
}

.budget-chips {
  margin-bottom: 6rpx;
}

.budget-slider {
  margin: 10rpx 8rpx 0;
}

.picker {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 22rpx;
  background: #f5f5f5;
  border-radius: 12rpx;
  font-size: 28rpx;
  color: #333;
}

.picker-arrow {
  color: #999;
  font-size: 32rpx;
}

.input {
  height: 84rpx;
  padding: 0 22rpx;
  background: #f5f5f5;
  border-radius: 12rpx;
  font-size: 28rpx;
  box-sizing: border-box;
}

/* ---------- 加载态 ---------- */
.loading-card {
  background: #fff;
  border-radius: 20rpx;
  padding: 80rpx 30rpx;
  margin-top: 24rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.loading-emoji {
  font-size: 90rpx;
  animation: bounce 1s infinite;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-18rpx); }
}

.loading-text {
  margin-top: 26rpx;
  font-size: 27rpx;
  color: #999;
}

.loading-dots {
  display: flex;
  margin-top: 20rpx;
}

.dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: #FF6B35;
  margin: 0 6rpx;
  animation: blink 1s infinite;
}

@keyframes blink {
  0%, 100% { opacity: 0.25; }
  50% { opacity: 1; }
}

/* ---------- 结果区 ---------- */
.result {
  margin-top: 24rpx;
}

.summary-card {
  background: linear-gradient(135deg, #FF6B35, #FF8C5A);
  border-radius: 20rpx;
  padding: 26rpx 28rpx;
  box-shadow: 0 10rpx 24rpx rgba(255, 107, 53, 0.22);
}

.summary-text {
  color: #fff;
  font-size: 29rpx;
  line-height: 1.5;
  display: block;
}

.summary-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16rpx;
}

.engine-tag {
  font-size: 21rpx;
  padding: 4rpx 14rpx;
  border-radius: 18rpx;
}

.engine-ai {
  background: rgba(255, 255, 255, 0.95);
  color: #764ba2;
}

.engine-fallback {
  background: rgba(255, 255, 255, 0.28);
  color: #fff;
}

.summary-count {
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.9);
}

.notice {
  display: flex;
  align-items: flex-start;
  background: #fffbe6;
  border-radius: 14rpx;
  padding: 18rpx 22rpx;
  margin-top: 18rpx;
}

.notice-icon {
  font-size: 24rpx;
  margin-right: 10rpx;
}

.notice-text {
  flex: 1;
  font-size: 23rpx;
  color: #a86b00;
  line-height: 1.5;
}

.rec-card {
  background: #fff;
  border-radius: 20rpx;
  padding: 26rpx;
  margin-top: 22rpx;
  position: relative;
}

.rank-badge {
  position: absolute;
  top: 0;
  left: 0;
  width: 56rpx;
  height: 44rpx;
  border-radius: 20rpx 0 20rpx 0;
  background: #ccc;
  color: #fff;
  font-size: 24rpx;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
}

.rank-1 { background: #FF6B35; }
.rank-2 { background: #ff9f45; }
.rank-3 { background: #ffc069; }

.rec-main {
  display: flex;
  margin-top: 26rpx;
}

.rec-img-wrap {
  margin-right: 22rpx;
  flex-shrink: 0;
}

.rec-body {
  flex: 1;
  min-width: 0;
}

.rec-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.rec-name {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.rec-price {
  font-size: 32rpx;
  color: #FF6B35;
  font-weight: bold;
  margin-left: 12rpx;
}

.rec-loc {
  display: block;
  font-size: 23rpx;
  color: #999;
  margin-top: 8rpx;
}

.rec-tags {
  margin-top: 10rpx;
}

.tag {
  display: inline-block;
  font-size: 20rpx;
  color: #FF6B35;
  background: #fff0eb;
  padding: 2rpx 12rpx;
  border-radius: 8rpx;
  margin-right: 8rpx;
}

.rec-stars {
  display: flex;
  align-items: center;
  margin-top: 12rpx;
}

.stars {
  font-size: 22rpx;
  color: #FF9800;
  margin-right: 12rpx;
}

.score-bar {
  flex: 1;
  height: 10rpx;
  background: #f0f0f0;
  border-radius: 6rpx;
  overflow: hidden;
}

.score-fill {
  height: 100%;
  background: linear-gradient(90deg, #FF6B35, #ffb37a);
  border-radius: 6rpx;
}

.score-num {
  font-size: 21rpx;
  color: #FF6B35;
  margin-left: 12rpx;
}

.rec-reason {
  display: flex;
  align-items: flex-start;
  background: #f8f9ff;
  border-radius: 12rpx;
  padding: 16rpx 18rpx;
  margin-top: 20rpx;
}

.reason-badge {
  font-size: 20rpx;
  color: #fff;
  background: #667eea;
  padding: 3rpx 12rpx;
  border-radius: 8rpx;
  margin-right: 12rpx;
  flex-shrink: 0;
}

.reason-text {
  flex: 1;
  font-size: 24rpx;
  color: #555;
  line-height: 1.5;
}

.rec-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 20rpx;
}

.mini-btn {
  font-size: 24rpx;
  color: #666;
  border: 2rpx solid #e5e5e5;
  padding: 10rpx 24rpx;
  border-radius: 30rpx;
  margin-left: 16rpx;
}

.mini-btn-primary {
  background: #FF6B35;
  border-color: #FF6B35;
  color: #fff;
}

.empty-card {
  background: #fff;
  border-radius: 20rpx;
  padding: 70rpx 30rpx;
  margin-top: 22rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.empty-emoji {
  font-size: 80rpx;
}

.empty-text {
  margin-top: 20rpx;
  font-size: 28rpx;
  color: #666;
  text-align: center;
}

.empty-tip {
  margin-top: 12rpx;
  font-size: 23rpx;
  color: #bbb;
}

.result-footer {
  display: flex;
  margin-top: 30rpx;
}

.foot-btn {
  flex: 1;
  height: 80rpx;
  background: #fff;
  border-radius: 40rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 27rpx;
  color: #FF6B35;
  margin: 0 10rpx;
}

/* ---------- 历史 ---------- */
.history-card {
  background: #fff;
  border-radius: 20rpx;
  padding: 26rpx 28rpx;
  margin-top: 24rpx;
}

.history-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
}

.history-title {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
}

.history-clear {
  font-size: 23rpx;
  color: #999;
}

.history-item {
  padding: 16rpx 0;
  border-bottom: 1rpx solid #f5f5f5;
}

.history-item:last-child {
  border-bottom: none;
}

.history-label {
  display: block;
  font-size: 25rpx;
  color: #FF6B35;
}

.history-summary {
  display: block;
  font-size: 23rpx;
  color: #999;
  margin-top: 6rpx;
}

/* ---------- 数据来源 ---------- */
.source-tip {
  margin-top: 34rpx;
  padding: 0 10rpx;
}

.source-text {
  font-size: 21rpx;
  color: #aaa;
  line-height: 1.6;
}
</style>
