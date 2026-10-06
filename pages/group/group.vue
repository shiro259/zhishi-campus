<template>
  <view class="page">
    <!-- ==================== 说明 ==================== -->
    <view class="intro">
      <text class="intro-title">几个人一起吃饭，怎么点？</text>
      <text class="intro-sub">填上每个人的口味和忌口，算出大家都能吃的菜，再给一个点菜方案</text>
    </view>

    <!-- ==================== 成员列表 ==================== -->
    <view class="members">
      <view class="member" v-for="(m, mi) in members" :key="mi">
        <view class="member-head">
          <view class="member-idx">{{ mi + 1 }}</view>
          <input
            class="member-name"
            v-model="m.name"
            :placeholder="'同学' + (mi + 1)"
            placeholder-class="ph"
            maxlength="8"
          />
          <view class="member-del" v-if="members.length > 1" @click="removeMember(mi)">
            <Icon name="trash" :size="28" color="#b8b2aa" />
          </view>
        </view>

        <!-- 口味 -->
        <view class="field">
          <text class="field-label">口味</text>
          <view class="chips">
            <view
              class="chip"
              v-for="t in TASTE_OPTIONS"
              :key="t"
              :class="{ 'chip-on': m.taste.includes(t) }"
              @click="toggle(mi, 'taste', t)"
            >{{ t }}</view>
          </view>
        </view>

        <!-- 忌口 -->
        <view class="field">
          <text class="field-label">不吃</text>
          <view class="chips">
            <view
              class="chip chip-avoid"
              v-for="a in FOOD_TAGS"
              :key="a"
              :class="{ 'chip-avoid-on': m.allergies.includes(a) }"
              @click="toggle(mi, 'allergies', a)"
            >{{ a }}</view>
          </view>
        </view>

        <!-- 特殊要求 -->
        <view class="field field-inline">
          <view
            class="switch-chip"
            :class="{ 'switch-on': m.vegetarian }"
            @click="m.vegetarian = !m.vegetarian"
          >
            <Icon name="check" :size="22" :color="m.vegetarian ? '#1f9d63' : '#b8b2aa'" />
            <text class="switch-text">吃素</text>
          </view>
          <view
            class="switch-chip"
            :class="{ 'switch-on': m.noFried }"
            @click="m.noFried = !m.noFried"
          >
            <Icon name="check" :size="22" :color="m.noFried ? '#1f9d63' : '#b8b2aa'" />
            <text class="switch-text">不吃重油</text>
          </view>
        </view>
      </view>

      <view class="add-member" v-if="members.length < 8" @click="addMember">
        <Icon name="plus" :size="30" color="#ff5a36" />
        <text class="add-text">加一位同学</text>
      </view>
    </view>

    <!-- ==================== 附加条件 ==================== -->
    <view class="card">
      <view class="row">
        <text class="row-label">人均预算</text>
        <view class="chips">
          <view
            class="chip"
            v-for="b in BUDGET_OPTIONS"
            :key="b.value"
            :class="{ 'chip-on': budget === b.value }"
            @click="budget = b.value"
          >{{ b.label }}</view>
        </view>
      </view>
      <view class="divider" />
      <view class="row">
        <text class="row-label">食堂</text>
        <picker mode="selector" :range="canteenRange" @change="onCanteenChange">
          <view class="select">
            <text class="select-text">{{ canteen || '不限' }}</text>
            <Icon name="down" :size="26" color="#b8b2aa" />
          </view>
        </picker>
      </view>
    </view>

    <!-- ==================== 计算按钮 ==================== -->
    <view class="submit" :class="{ 'is-loading': loading }" @click="calc">
      <Icon name="sparkle" :size="34" color="#FFFFFF" />
      <text class="submit-text">{{ loading ? '正在算…' : '算出怎么点' }}</text>
    </view>

    <!-- ==================== 结果 ==================== -->
    <template v-if="result">
      <!-- 总结 -->
      <view class="summary">
        <text class="summary-main">{{ result.summary }}</text>
        <view class="summary-stats" v-if="result.stats">
          <text class="stat">{{ result.stats.dishTotal }} 道候选</text>
          <text class="stat-dot">·</text>
          <text class="stat stat-good">{{ result.stats.sharedCount }} 道全员可吃</text>
          <text class="stat-dot">·</text>
          <text class="stat">{{ result.stats.partialCount }} 道有人不能吃</text>
        </view>
        <text class="summary-notice" v-if="result.notice">{{ result.notice }}</text>
      </view>

      <!-- 点菜方案 -->
      <view class="card" v-if="result.combo && result.combo.items.length">
        <view class="card-head">
          <text class="card-title">建议这么点</text>
          <text class="card-extra">合计 ¥{{ result.combo.totalPrice }} · 人均 ¥{{ result.combo.perPerson }}</text>
        </view>

        <view class="combo-item" v-for="(d, di) in result.combo.items" :key="d.dish_id">
          <view class="combo-kind" :class="d.kind === 'shared' ? 'kind-shared' : 'kind-partial'">
            {{ d.kind === 'shared' ? '全员' : '部分' }}
          </view>
          <DishImage :dish="d" :size="96" :radius="14" />
          <view class="combo-body" @click="goDetail(d.dish_id)">
            <view class="combo-title">
              <text class="combo-name">{{ d.name }}</text>
              <text class="combo-price">¥{{ d.price }}</text>
            </view>
            <text class="combo-loc">{{ d.canteen }} · {{ d.window }}</text>
            <text class="combo-who" v-if="d.blockers && d.blockers.length">
              {{ blockerText(d.blockers) }} 不能吃
            </text>
          </view>
        </view>

        <!-- 谁吃到什么 -->
        <view class="divider" />
        <text class="sub-title">每个人能吃到</text>
        <view class="per-member" v-for="pm in result.combo.perMember" :key="pm.memberIndex">
          <text class="pm-name">{{ memberName(pm.memberIndex) }}</text>
          <text class="pm-count" :class="{ 'pm-warn': pm.count === 0 }">{{ pm.count }} 道</text>
          <text class="pm-dishes">{{ pm.dishes.map((x) => x.name).join('、') || '一道都吃不上' }}</text>
        </view>

        <view class="warn" v-for="(w, wi) in result.combo.warnings" :key="wi">
          <Icon name="warning" :size="26" color="#c98a1b" />
          <text class="warn-text">{{ w }}</text>
        </view>
      </view>

      <!-- 洞察 -->
      <view class="card" v-if="result.insights && result.insights.length">
        <view class="card-head">
          <text class="card-title">几点提醒</text>
        </view>
        <view class="insight" v-for="(t, ti) in result.insights" :key="ti">
          <view class="insight-dot" />
          <text class="insight-text">{{ t }}</text>
        </view>
      </view>

      <!-- 全员可吃 -->
      <view class="card" v-if="result.shared && result.shared.length">
        <view class="card-head">
          <text class="card-title">大家都能吃</text>
          <text class="card-extra">{{ result.shared.length }} 道</text>
        </view>
        <view class="dish-row" v-for="d in result.shared.slice(0, 8)" :key="d.dish_id" @click="goDetail(d.dish_id)">
          <DishImage :dish="d" :size="88" :radius="12" />
          <view class="dish-body">
            <view class="dish-title">
              <text class="dish-name">{{ d.name }}</text>
              <text class="dish-price">¥{{ d.price }}</text>
            </view>
            <text class="dish-loc">{{ d.canteen }} · {{ d.window }}</text>
          </view>
          <view class="dish-score">
            <text class="score-num">{{ d.groupScore }}</text>
            <text class="score-label">契合</text>
          </view>
        </view>
      </view>

      <!-- 只有部分人能吃的 -->
      <view class="card" v-if="result.partial && result.partial.length">
        <view class="card-head">
          <text class="card-title">只有部分人能吃的</text>
          <text class="card-extra">{{ result.partial.length }} 道</text>
        </view>
        <view class="dish-row" v-for="d in result.partial.slice(0, 8)" :key="d.dish_id" @click="goDetail(d.dish_id)">
          <DishImage :dish="d" :size="88" :radius="12" />
          <view class="dish-body">
            <view class="dish-title">
              <text class="dish-name">{{ d.name }}</text>
              <text class="dish-price">¥{{ d.price }}</text>
            </view>
            <text class="dish-loc">{{ d.coverage }}% 的人能吃 · {{ blockerText(d.blockers) }} 不能吃</text>
          </view>
        </view>
        <text class="card-foot-tip">点这些菜时，记得给不能吃的同学单点一份</text>
      </view>
    </template>

    <!-- ==================== 空态 ==================== -->
    <view class="empty" v-if="!result && !loading">
      <Icon name="bowl" :size="72" color="#d8d3cb" />
      <text class="empty-title">填好上面的信息，点「算出怎么点」</text>
      <text class="empty-sub">会算出全员能吃的菜、只有部分人能吃的菜，以及一个点菜方案</text>
    </view>
  </view>
</template>

<script setup>
/**
 * 多人拼饭页
 *
 * 解决的问题：宿舍/同学一起吃饭时，各自口味和忌口不同，谁也不想将就。
 * 输出的不是"推荐一道菜"，而是三个层次的答案：
 *   ① 哪些菜全员可吃（拼桌安全区）
 *   ② 哪些菜只有部分人能碰、分别是谁（点菜时要照顾到）
 *   ③ 最终怎么点，才能让每个人都吃得上
 *
 * 计算走 groupApi → 云函数 shiyu-group；云端不可用时用本机菜谱跑同一份算法
 * （common/group-meal.js 与云函数的 lib/group-meal.js 由测试交叉验证保持一致）。
 *
 * 为什么这块用算法而不是大模型：忌口判断是安全问题，必须可解释、可复现。
 */
import { ref, onMounted } from 'vue'
import { groupApi, dishApi } from '@/api/index.js'
import { TASTE_OPTIONS } from '@/common/constants.js'
import { FOOD_TAGS } from '@/common/group-meal.js'
import DishImage from '@/components/DishImage/DishImage.vue'

const BUDGET_OPTIONS = [
  { label: '不限', value: 0 },
  { label: '10/人', value: 10 },
  { label: '15/人', value: 15 },
  { label: '20/人', value: 20 },
  { label: '30/人', value: 30 }
]

const members = ref([newMember()])
const budget = ref(0)
const canteen = ref('')
const canteenRange = ref(['不限', '第一食堂', '第二食堂', '第三食堂'])
const loading = ref(false)
const result = ref(null)

function newMember(name) {
  return { name: name || '', taste: [], allergies: [], vegetarian: false, noFried: false }
}

/* -------------------------------- 成员编辑 -------------------------------- */

function addMember() {
  if (members.value.length >= 8) return
  members.value.push(newMember())
}

function removeMember(i) {
  members.value.splice(i, 1)
}

function toggle(mi, field, value) {
  const arr = members.value[mi][field]
  const idx = arr.indexOf(value)
  if (idx > -1) arr.splice(idx, 1)
  else arr.push(value)
}

function onCanteenChange(e) {
  const val = canteenRange.value[e.detail.value]
  canteen.value = val === '不限' ? '' : val
}

/* -------------------------------- 展示辅助 -------------------------------- */

/** 界面上的成员名：没填名字就用「N 号」 */
function memberName(index) {
  const m = members.value[index - 1]
  return (m && m.name) || (index + ' 号')
}

/** 把"不能吃的人"整理成一句话 */
function blockerText(blockers) {
  if (!blockers || !blockers.length) return ''
  return blockers.map((b) => memberName(b.memberIndex)).join('、')
}

function goDetail(id) {
  if (!id) return
  uni.navigateTo({ url: `/pages/dish/dish?id=${encodeURIComponent(id)}` })
}

/* -------------------------------- 计算 -------------------------------- */

async function calc() {
  if (loading.value) return
  loading.value = true

  try {
    // 没填名字也要能算：云函数与本机算法都会用「第 N 人」兜底
    const payload = members.value.map((m, i) => ({
      name: m.name || (i + 1) + '号',
      taste: m.taste,
      allergies: m.allergies,
      vegetarian: m.vegetarian,
      noFried: m.noFried
    }))

    groupApi.saveMembers(payload)

    const data = await groupApi.plan(payload, {
      canteen: canteen.value,
      budgetPerPerson: budget.value,
      maxItems: 5
    })
    result.value = data

    if (!data.combo || !data.combo.items.length) {
      uni.showToast({ title: '没凑出方案，试试放宽忌口', icon: 'none' })
    }
  } catch (e) {
    uni.showToast({ title: (e && e.message) || '计算失败，请重试', icon: 'none' })
  } finally {
    loading.value = false
  }
}

/* -------------------------------- 初始化 -------------------------------- */

onMounted(async () => {
  // 复用上次填的成员，省得每次重填
  const saved = groupApi.getMembers()
  if (saved.length) {
    members.value = saved.map((m) => ({
      name: m.name || '',
      taste: Array.isArray(m.taste) ? m.taste : [],
      allergies: Array.isArray(m.allergies) ? m.allergies : [],
      vegetarian: !!m.vegetarian,
      noFried: !!m.noFried
    }))
  }

  try {
    const res = await dishApi.canteens()
    const list = (res && res.list) || []
    if (list.length) canteenRange.value = ['不限', ...list]
  } catch (e) {
    // 用默认食堂列表
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

/* ==================== 说明 ==================== */
.intro {
  margin-bottom: $gap-lg;
}

.intro-title {
  display: block;
  font-size: $fs-title;
  font-weight: $fw-bold;
  color: $ink;
  letter-spacing: -0.6rpx;
}

.intro-sub {
  display: block;
  margin-top: 10rpx;
  font-size: $fs-sub;
  color: $gray6;
  line-height: 1.6;
}

/* ==================== 成员卡片 ==================== */
.member {
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
  padding: $gap-card;
  margin-bottom: $gap;
  box-shadow: $shadow-card;
}

.member-head {
  display: flex;
  align-items: center;
  margin-bottom: $gap;
}

.member-idx {
  width: 44rpx;
  height: 44rpx;
  line-height: 44rpx;
  text-align: center;
  border-radius: 50%;
  background: $brand-soft;
  color: $brand;
  font-size: $fs-cap;
  font-weight: $fw-bold;
  flex-shrink: 0;
}

.member-name {
  flex: 1;
  margin-left: 16rpx;
  height: 68rpx;
  padding: 0 22rpx;
  background: $surface-sunken;
  border-radius: $radius;
  font-size: $fs-body;
  color: $ink;
}

.ph {
  color: $gray4;
}

.member-del {
  margin-left: 14rpx;
  padding: 10rpx;
}

.field {
  margin-top: $gap;
}

.field-inline {
  display: flex;
  align-items: center;
}

.field-label {
  display: block;
  font-size: $fs-cap;
  color: $gray6;
  margin-bottom: 12rpx;
}

.chips {
  display: flex;
  flex-wrap: wrap;
}

.chip {
  height: 56rpx;
  line-height: 56rpx;
  padding: 0 22rpx;
  margin: 0 12rpx 12rpx 0;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-pill;
  font-size: $fs-cap;
  color: $gray7;
}

.chip-on {
  background: $brand-soft;
  border-color: $brand-line;
  color: $brand;
  font-weight: $fw-medium;
}

/* 忌口用中性强调色，避免和口味抢主色；同时分量上更"重"，体现这是硬约束 */
.chip-avoid-on {
  background: $ink;
  border-color: $ink;
  color: #fff;
  font-weight: $fw-medium;
}

.switch-chip {
  display: flex;
  align-items: center;
  height: 56rpx;
  padding: 0 22rpx;
  margin-right: 14rpx;
  background: $surface-sunken;
  border-radius: $radius-pill;
}

.switch-on {
  background: $success-soft;
}

.switch-text {
  margin-left: 8rpx;
  font-size: $fs-cap;
  color: $gray7;
}

.add-member {
  display: flex;
  align-items: center;
  justify-content: center;
  height: $h-btn;
  border: 2rpx dashed $line-strong;
  border-radius: $radius-card;
  margin-bottom: $gap;
}

.add-text {
  margin-left: 10rpx;
  font-size: $fs-sub;
  color: $brand;
}

/* ==================== 通用卡片 ==================== */
.card {
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
  padding: $gap-card;
  margin-bottom: $gap;
  box-shadow: $shadow-card;
}

.card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: $gap;
}

.card-title {
  font-size: $fs-card;
  font-weight: $fw-bold;
  color: $ink;
}

.card-extra {
  font-size: $fs-cap;
  color: $gray6;
}

.card-foot-tip {
  display: block;
  margin-top: 12rpx;
  padding-top: 14rpx;
  border-top: 1rpx solid $line;
  font-size: $fs-tag;
  color: $gray4;
  line-height: 1.6;
}

.divider {
  height: 2rpx;
  background: $line;
  margin: $gap 0;
}

.row {
  display: flex;
  align-items: flex-start;
}

.row-label {
  width: 140rpx;
  flex-shrink: 0;
  font-size: $fs-sub;
  color: $gray6;
  line-height: 56rpx;
}

.select {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56rpx;
  padding: 0 22rpx;
  background: $surface-sunken;
  border-radius: $radius;
  min-width: 260rpx;
}

.select-text {
  font-size: $fs-cap;
  color: $ink;
}

/* ==================== 计算按钮 ==================== */
.submit {
  display: flex;
  align-items: center;
  justify-content: center;
  height: $h-btn;
  background: $brand;
  border-radius: $radius-pill;
  box-shadow: $shadow-brand;
  margin-bottom: $gap-lg;
}

.submit.is-loading {
  opacity: 0.65;
}

.submit-text {
  margin-left: 10rpx;
  color: #fff;
  font-size: $fs-card;
  font-weight: $fw-medium;
}

/* ==================== 结果：总结 ==================== */
.summary {
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
  padding: $gap-card;
  margin-bottom: $gap;
  box-shadow: $shadow-card;
}

.summary-main {
  display: block;
  font-size: $fs-body;
  font-weight: $fw-medium;
  color: $ink;
  line-height: 1.6;
}

.summary-stats {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 14rpx;
}

.stat {
  font-size: $fs-cap;
  color: $gray6;
}

.stat-good {
  color: $success;
}

.stat-dot {
  margin: 0 10rpx;
  font-size: $fs-cap;
  color: $gray4;
}

.summary-notice {
  display: block;
  margin-top: 12rpx;
  padding-top: 12rpx;
  border-top: 1rpx dashed $line;
  font-size: $fs-tag;
  color: $warning;
  line-height: 1.5;
}

/* ==================== 点菜方案 ==================== */
.combo-item {
  display: flex;
  align-items: center;
  padding: 16rpx 0;
  border-bottom: 1rpx solid $line;
}

.combo-kind {
  width: 64rpx;
  height: 36rpx;
  line-height: 36rpx;
  text-align: center;
  border-radius: $radius-sm;
  font-size: 20rpx;
  flex-shrink: 0;
  margin-right: 16rpx;
}

.kind-shared {
  background: $success-soft;
  color: $success;
}

.kind-partial {
  background: $warning-soft;
  color: $warning;
}

.combo-body {
  flex: 1;
  min-width: 0;
  margin-left: 18rpx;
}

.combo-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.combo-name {
  font-size: $fs-body;
  font-weight: $fw-medium;
  color: $ink;
}

.combo-price {
  font-size: $fs-body;
  font-weight: $fw-bold;
  color: $brand;
}

.combo-loc {
  display: block;
  margin-top: 6rpx;
  font-size: $fs-tag;
  color: $gray6;
}

.combo-who {
  display: block;
  margin-top: 6rpx;
  font-size: $fs-tag;
  color: $warning;
}

.sub-title {
  display: block;
  font-size: $fs-cap;
  color: $gray6;
  margin-bottom: 12rpx;
}

.per-member {
  display: flex;
  align-items: baseline;
  margin-bottom: 10rpx;
}

.pm-name {
  width: 120rpx;
  flex-shrink: 0;
  font-size: $fs-cap;
  color: $gray7;
}

.pm-count {
  width: 80rpx;
  flex-shrink: 0;
  font-size: $fs-cap;
  color: $success;
  font-weight: $fw-medium;
}

.pm-warn {
  color: $danger;
}

.pm-dishes {
  flex: 1;
  font-size: $fs-tag;
  color: $gray6;
  line-height: 1.5;
}

.warn {
  display: flex;
  align-items: flex-start;
  margin-top: 14rpx;
  padding: 16rpx 18rpx;
  background: $warning-soft;
  border-radius: $radius;
}

.warn-text {
  flex: 1;
  margin-left: 10rpx;
  font-size: $fs-tag;
  color: $warning;
  line-height: 1.6;
}

/* ==================== 洞察 ==================== */
.insight {
  display: flex;
  align-items: flex-start;
  margin-bottom: 14rpx;
}

.insight-dot {
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  background: $brand-line;
  margin: 14rpx 14rpx 0 0;
  flex-shrink: 0;
}

.insight-text {
  flex: 1;
  font-size: $fs-cap;
  color: $gray7;
  line-height: 1.6;
}

/* ==================== 菜品行 ==================== */
.dish-row {
  display: flex;
  align-items: center;
  padding: 14rpx 0;
  border-bottom: 1rpx solid $line;
}

.dish-body {
  flex: 1;
  min-width: 0;
  margin-left: 18rpx;
}

.dish-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.dish-name {
  font-size: $fs-body;
  color: $ink;
  font-weight: $fw-medium;
}

.dish-price {
  font-size: $fs-body;
  color: $brand;
  font-weight: $fw-bold;
}

.dish-loc {
  display: block;
  margin-top: 6rpx;
  font-size: $fs-tag;
  color: $gray6;
}

.dish-score {
  text-align: right;
  margin-left: 16rpx;
}

.score-num {
  display: block;
  font-size: $fs-body;
  font-weight: $fw-bold;
  color: $ink;
}

.score-label {
  display: block;
  font-size: 20rpx;
  color: $gray4;
}

/* ==================== 空态 ==================== */
.empty {
  padding: 100rpx $gap-card;
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
  margin-top: 10rpx;
  font-size: $fs-cap;
  color: $gray6;
  text-align: center;
  line-height: 1.6;
}
</style>
