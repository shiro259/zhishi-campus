<template>
  <view class="edit-page">
    <!-- ================= 顶部标题 ================= -->
    <view class="hero">
      <text class="hero-title">{{ isEdit ? '编辑菜品' : '新增菜品' }}</text>
      <text class="hero-sub">
        {{ isEdit ? '修改后立即同步到菜品库与推荐结果' : '填好信息后即可被 AI 推荐命中' }}
      </text>
    </view>

    <!-- ================= 加载中 / 加载失败 ================= -->
    <view class="state-box" v-if="loading">
      <Icon name="clock" :size="72" />
      <text class="state-text">菜品信息加载中…</text>
    </view>

    <view class="state-box" v-else-if="loadError">
      <Icon name="warning" :size="72" />
      <text class="state-text">{{ loadError }}</text>
      <view class="retry-btn" @click="loadDetail">重新加载</view>
    </view>

    <!-- ================= 表单 ================= -->
    <block v-else>
      <!-- 基本信息 -->
      <view class="card">
        <view class="card-head">
          <text class="card-title">基本信息</text>
          <text class="card-desc">菜名、价格、食堂与分类</text>
        </view>

        <view class="field">
          <text class="field-label">菜品名称 <text class="req">*</text></text>
          <input
            class="input"
            v-model="form.name"
            type="text"
            maxlength="20"
            placeholder="例如：宫保鸡丁"
            placeholder-class="ph"
          />
        </view>

        <view class="field">
          <text class="field-label">价格（元） <text class="req">*</text></text>
          <input
            class="input"
            v-model="form.price"
            type="digit"
            placeholder="例如：12.5"
            placeholder-class="ph"
          />
        </view>

        <view class="field">
          <text class="field-label">所属食堂 <text class="req">*</text></text>
          <picker
            mode="selector"
            :range="canteenRange"
            :value="canteenIndex"
            @change="onCanteenChange"
          >
            <view class="picker-value">
              <text class="picker-text">{{ form.canteen || '请选择食堂' }}</text>
              <Icon name="down" :size="24" />
            </view>
          </picker>
          <input
            v-if="manualCanteen"
            class="input input-gap"
            v-model="form.canteen"
            type="text"
            maxlength="20"
            placeholder="请输入新食堂名称"
            placeholder-class="ph"
          />
          <text class="hint" v-else>列表里没有？选最后一项「手动输入新食堂」可自己填</text>
        </view>

        <view class="field">
          <text class="field-label">所属窗口 <text class="req">*</text></text>
          <input
            class="input"
            v-model="form.window"
            type="text"
            maxlength="20"
            placeholder="例如：川味窗口"
            placeholder-class="ph"
          />
        </view>

        <view class="field field-last">
          <text class="field-label">菜品分类 <text class="req">*</text></text>
          <picker
            mode="selector"
            :range="categoryRange"
            :value="categoryIndex"
            @change="onCategoryChange"
          >
            <view class="picker-value">
              <text class="picker-text">{{ form.category || '请选择分类' }}</text>
              <Icon name="down" :size="24" />
            </view>
          </picker>
          <input
            v-if="manualCategory"
            class="input input-gap"
            v-model="form.category"
            type="text"
            maxlength="10"
            placeholder="请输入分类名称"
            placeholder-class="ph"
          />
        </view>
      </view>

      <!-- 口味 / 食材标签 -->
      <view class="card">
        <view class="card-head">
          <text class="card-title">口味与食材标签</text>
          <text class="card-desc">可多选</text>
        </view>
        <text class="hint hint-block">
          忌口过滤依赖菜品标签里的食材名：同学勾选「不吃花生」时，系统是靠这里的「花生」标签把菜排除掉的，
          所以口味词（辣、清淡）和食材词（花生、香菜）都要打上。
        </text>
        <view class="chip-group">
          <view
            class="chip"
            v-for="t in tagOptions"
            :key="t"
            :class="{ active: form.tags.includes(t), warn: allergyList.includes(t) }"
            @click="toggleTag(t)"
          >{{ t }}</view>
        </view>
        <text class="hint">已选 {{ form.tags.length }} 个标签</text>
      </view>

      <!-- 菜品图片 -->
      <view class="card">
        <view class="card-head">
          <text class="card-title">菜品图片</text>
          <text class="card-desc">实时预览</text>
        </view>
        <text class="hint hint-block">
          留空则自动使用 static/dishes/ 下与菜名对应的本地图片；都没有时回退为 emoji 方块。
          也可填写云存储图片地址（uniCloud 云存储域名已在小程序白名单内）。
        </text>

        <view class="img-row">
          <DishImage :dish="{ id: form.id, image: form.image, emoji: form.emoji, category: form.category }" :size="160" :radius="16" />
          <view class="img-side">
            <input
              class="input"
              v-model="form.image"
              placeholder="图片地址，如 static/dishes/d001.jpg"
              placeholder-class="ph"
            />
            <text class="hint">当前：{{ form.image || '未配置，使用 emoji 占位' }}</text>
          </view>
        </view>
      </view>

      <!-- 备用 emoji（菜品内容占位，不是界面图标） -->
      <view class="card">
        <view class="card-head">
          <text class="card-title">备用图标</text>
          <text class="card-desc">emoji 占位</text>
        </view>
        <text class="hint hint-block">没有图片时，列表与详情用这个 emoji 渲染成占位方块</text>
        <view class="emoji-row">
          <view
            class="emoji-item"
            v-for="e in EMOJI_CANDIDATES"
            :key="e"
            :class="{ active: form.emoji === e }"
            @click="pickEmoji(e)"
          >{{ e }}</view>
        </view>
      </view>

      <!-- 描述 -->
      <view class="card">
        <view class="card-head">
          <text class="card-title">菜品描述</text>
          <text class="card-desc">{{ (form.description || '').length }}/60</text>
        </view>
        <textarea
          class="textarea"
          v-model="form.description"
          maxlength="60"
          placeholder="20~30 字介绍，例如：鸡丁配花生米，微辣下饭，川味窗口招牌"
          placeholder-class="ph"
        />
      </view>
    </block>

    <!-- ================= 底部操作条 ================= -->
    <view class="op-bar" v-if="!loading && !loadError">
      <view class="btn-ghost" @click="cancel">取消</view>
      <view class="btn-primary" :class="{ 'is-disabled': submitting }" @click="save">
        {{ submitting ? '保存中…' : isEdit ? '保存修改' : '创建菜品' }}
      </view>
    </view>
  </view>
</template>

<script setup>
/**
 * 菜品新增 / 编辑表单
 *
 * onLoad 读取 id：有 id → dishApi.detail(id) 回填（编辑模式）；无 id → 新增模式。
 * 保存统一走 dishApi.save(data)，由 api 层决定走云函数还是本地兜底。
 * 分类与 emoji 均来自 constants.js 的 EMOJI_MAP，保证与推荐页/列表页视觉一致。
 */
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { dishApi } from '@/api/index.js'
import { EMOJI_MAP, TASTE_OPTIONS, ALLERGY_OPTIONS } from '@/common/constants.js'
import DishImage from '@/components/DishImage/DishImage.vue'

/** constants 缺失单项时的兜底，保证页面永远可用 */
const FALLBACK_TASTE = ['辣', '麻辣', '清淡', '酸甜', '咸香', '重油', '下饭', '低卡']
const FALLBACK_ALLERGY = ['花生', '香菜', '牛肉', '猪肉', '鸡肉', '鸡蛋', '海鲜', '内脏', '葱', '蒜']
const FALLBACK_CATEGORY = ['川菜', '家常菜', '快餐', '面食', '小吃', '轻食', '素菜', '地方菜', '粤菜', '其他']

const EMOJI_CANDIDATES = [
  '🍽️', '🍚', '🍜', '🍛', '🍲', '🥘', '🍗', '🥗', '🌶️', '🍱', '🥟', '🍢', '🍰', '🧋'
]

const MANUAL_CANTEEN = '手动输入新食堂…'
const MANUAL_CATEGORY = '手动输入分类…'

/** 口味标签 = 口味词 + 食材词（后者用于忌口硬过滤） */
const tasteList = Array.isArray(TASTE_OPTIONS) && TASTE_OPTIONS.length ? TASTE_OPTIONS : FALLBACK_TASTE
const allergyList = Array.isArray(ALLERGY_OPTIONS) && ALLERGY_OPTIONS.length ? ALLERGY_OPTIONS : FALLBACK_ALLERGY
const tagOptions = [...new Set([...tasteList, ...allergyList])]

/** 分类选项：优先用 EMOJI_MAP 的 key，保证与图标映射一一对应 */
function resolveCategories() {
  if (Array.isArray(EMOJI_MAP)) {
    return EMOJI_MAP.map((item) => (typeof item === 'string' ? item : item && (item.category || item.label || item.value))).filter(Boolean)
  }
  if (EMOJI_MAP && typeof EMOJI_MAP === 'object') {
    const keys = Object.keys(EMOJI_MAP)
    if (keys.length) return keys
  }
  return FALLBACK_CATEGORY
}

/** 分类候选：以 EMOJI_MAP 的 key 为主，onLoad 时再与 dishApi.categories() 合并 */
const categoryKeys = ref(resolveCategories())
const categoryRange = computed(() => [...categoryKeys.value, MANUAL_CATEGORY])
const canteenRange = ref([MANUAL_CANTEEN])

const isEdit = ref(false)
const dishId = ref('')
const loading = ref(false)
const loadError = ref('')
const submitting = ref(false)
const manualCanteen = ref(false)
const canteenIndex = ref(0)
const emojiTouched = ref(false)

const form = ref({
  id: '',
  name: '',
  price: '',
  canteen: '',
  window: '',
  category: '',
  tags: [],
  emoji: '🍽️',
  image: '',
  description: '',
  status: 1
})

/** 分类 picker 的选中索引；分类不在候选里（例如内置分类表未收录）就落到「手动输入」项 */
const categoryIndex = computed(() => {
  const i = categoryKeys.value.indexOf(form.value.category)
  if (i > -1) return i
  return form.value.category ? categoryKeys.value.length : 0
})

/** 当前分类属于「手动输入」时才显示额外输入框 */
const manualCategory = computed(
  () => !!form.value.category && !categoryKeys.value.includes(form.value.category)
)

const canteenNames = computed(() => canteenRange.value.slice(0, -1))

function toast(title) {
  uni.showToast({ title, icon: 'none' })
}

/* ------------------------------ 分类 / emoji ------------------------------ */

/** 选中分类时自动带出对应 emoji（用户手动选过就不再覆盖） */
function onCategoryChange(e) {
  const idx = Number(e.detail.value) || 0
  if (idx >= categoryKeys.value.length) {
    // 切到「手动输入」：原来的值若来自候选列表就清空，交给用户自己填
    if (categoryKeys.value.includes(form.value.category)) form.value.category = ''
    return
  }
  form.value.category = categoryKeys.value[idx]
  if (!emojiTouched.value) {
    form.value.emoji = (EMOJI_MAP && EMOJI_MAP[form.value.category]) || '🍽️'
  }
}

/** 把内置分类与菜品库真实分类合并，保证编辑历史数据时也能选到原分类 */
async function loadCategories() {
  try {
    const res = await dishApi.categories()
    const raw = (res && res.list) || []
    const names = raw
      .map((c) => (typeof c === 'string' ? c : c && (c.name || c.category)))
      .filter((n) => !!n)
    if (names.length) {
      categoryKeys.value = [...new Set([...categoryKeys.value, ...names])]
    }
  } catch (e) {
    // 拿不到就沿用 EMOJI_MAP 的分类
  }
}

function pickEmoji(e) {
  emojiTouched.value = true
  form.value.emoji = e
}

function toggleTag(t) {
  const tags = form.value.tags
  const idx = tags.indexOf(t)
  if (idx > -1) tags.splice(idx, 1)
  else tags.push(t)
}

/* ------------------------------ 食堂 ------------------------------ */

function onCanteenChange(e) {
  const idx = Number(e.detail.value) || 0
  canteenIndex.value = idx
  if (idx >= canteenNames.value.length) {
    manualCanteen.value = true
    form.value.canteen = ''
    return
  }
  manualCanteen.value = false
  form.value.canteen = canteenNames.value[idx]
}

async function loadCanteens() {
  try {
    const res = await dishApi.canteens()
    const raw = (res && res.list) || []
    const names = raw
      .map((c) => (typeof c === 'string' ? c : c && (c.name || c.canteen)))
      .filter((n) => !!n)
    canteenRange.value = [...names, MANUAL_CANTEEN]

    // 编辑模式下把已填食堂对齐到 picker 索引；不在列表中则转为手动输入
    const cur = form.value.canteen
    if (cur) {
      const idx = names.indexOf(cur)
      if (idx > -1) {
        canteenIndex.value = idx
        manualCanteen.value = false
      } else {
        canteenIndex.value = names.length
        manualCanteen.value = true
      }
    }
  } catch (e) {
    // 食堂列表拿不到就只保留手动输入
    canteenRange.value = [MANUAL_CANTEEN]
    manualCanteen.value = true
  }
}

/* ------------------------------ 详情回填 ------------------------------ */

async function loadDetail() {
  if (!dishId.value) return
  loading.value = true
  loadError.value = ''
  try {
    const dish = await dishApi.detail(dishId.value)
    if (!dish) throw new Error('菜品不存在或已被删除')

    emojiTouched.value = true // 回填的 emoji 视为已确定，不再被分类联动覆盖
    form.value = {
      id: dishId.value || dish.id || '',
      name: dish.name || '',
      price: dish.price === undefined || dish.price === null ? '' : String(dish.price),
      canteen: dish.canteen || '',
      window: dish.window || '',
      category: dish.category || '',
      tags: Array.isArray(dish.tags) ? [...dish.tags] : [],
      emoji: dish.emoji || '🍽️',
      image: dish.image || '',
      description: dish.description || '',
      status: dish.status === 0 ? 0 : 1
    }

    // 分类 picker 的索引由 categoryIndex 计算属性自动推导，无需手动对齐：
    // 历史数据里的分类若不在候选中，会自动落到「手动输入」项并保留原值
  } catch (e) {
    loadError.value = (e && e.message) || '菜品信息加载失败'
    toast('菜品信息加载失败')
  } finally {
    loading.value = false
  }
}

/* ------------------------------ 保存 ------------------------------ */

/** 逐项校验，明确指出缺哪个字段 */
function validate() {
  const f = form.value
  const name = String(f.name || '').trim()
  if (!name) return '请填写菜品名称'
  if (name.length < 2) return '菜品名称至少 2 个字'

  const price = Number(f.price)
  if (String(f.price === undefined || f.price === null ? '' : f.price).trim() === '') {
    return '请填写价格'
  }
  if (isNaN(price) || price <= 0) return '价格必须大于 0'
  if (price > 999) return '价格看起来不太对（超过 999 元）'

  if (!String(f.canteen || '').trim()) return '请选择或填写所属食堂'
  if (!String(f.window || '').trim()) return '请填写所属窗口'
  if (!String(f.category || '').trim()) return '请选择菜品分类'
  if (!f.tags || !f.tags.length) return '请至少选择 1 个口味/食材标签'

  return ''
}

async function cancel() {
  uni.navigateBack()
}

async function save() {
  if (submitting.value) return

  const err = validate()
  if (err) {
    toast(err)
    return
  }

  submitting.value = true
  try {
    const f = form.value
    const payload = {
      name: String(f.name).trim(),
      price: Number(Number(f.price).toFixed(1)),
      canteen: String(f.canteen).trim(),
      window: String(f.window).trim(),
      category: String(f.category).trim(),
      tags: [...f.tags],
      emoji: f.emoji || '🍽️',
      image: String(f.image || '').trim(),
      description: String(f.description || '').trim(),
      // 保留原上架状态，避免编辑时把已下架的菜默默上架
      status: f.status === 0 ? 0 : 1
    }
    if (isEdit.value && dishId.value) payload.id = dishId.value

    await dishApi.save(payload)

    uni.showToast({ title: isEdit.value ? '保存成功' : '新增成功', icon: 'success' })
    setTimeout(() => uni.navigateBack(), 800)
  } catch (e) {
    toast('保存失败：' + ((e && e.message) || '请检查云端配置'))
  } finally {
    submitting.value = false
  }
}

/* ------------------------------ 生命周期 ------------------------------ */

onLoad((options) => {
  const id = (options && options.id) || ''
  if (id) {
    isEdit.value = true
    dishId.value = id
    loadDetail()
  } else {
    // pages.json 里默认标题是「编辑菜品」，新增模式改一下更准确
    uni.setNavigationBarTitle({ title: '新增菜品' })
  }
  loadCanteens()
  loadCategories()
})
</script>

<style lang="scss" scoped>
@import '@/common/tokens.scss';
.edit-page {
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

/* ---------------- 表单卡片 ---------------- */
.card {
  margin-top: $gap;
  padding: $gap-card;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
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

.card-desc {
  font-size: $fs-cap;
  color: $gray6;
}

.field {
  margin-bottom: 24rpx;
}

.field-last {
  margin-bottom: 0;
}

.field-label {
  display: block;
  margin-bottom: $gap-sm;
  font-size: $fs-sub;
  font-weight: $fw-medium;
  color: $gray7;
}

.req {
  color: $danger;
}

.input {
  width: 100%;
  height: $h-input;
  box-sizing: border-box;
  padding: 0 $gap;
  background: $surface-sunken;
  border-radius: $radius;
  font-size: $fs-body;
  color: $ink;
}

.input-gap {
  margin-top: $gap-sm;
}

.ph {
  color: $gray4;
  font-size: $fs-body;
}

.picker-value {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: $h-input;
  padding: 0 $gap;
  background: $surface-sunken;
  border-radius: $radius;
  color: $gray6;
}

.picker-text {
  font-size: $fs-body;
  color: $ink;
}

.hint {
  display: block;
  margin-top: $gap-sm;
  font-size: $fs-cap;
  color: $gray6;
  line-height: 1.6;
}

.hint-block {
  margin-top: 0;
  margin-bottom: $gap;
}

/* ---------------- 标签 chips ---------------- */
.chip-group {
  display: flex;
  flex-wrap: wrap;
  gap: $gap-sm;
}

.chip {
  height: 64rpx;
  line-height: 60rpx;
  padding: 0 26rpx;
  box-sizing: border-box;
  background: $surface-sunken;
  border: 2rpx solid $surface-sunken;
  border-radius: $radius-pill;
  font-size: $fs-sub;
  color: $gray7;
}

.chip.warn {
  background: $warning-soft;
  border-color: $warning-soft;
  color: $warning;
}

.chip.active {
  background: $brand-soft;
  border-color: $brand;
  color: $brand;
  font-weight: $fw-medium;
}

/* ---------------- 菜品图片 ---------------- */
.img-row {
  display: flex;
  align-items: flex-start;
}

.img-side {
  flex: 1;
  min-width: 0;
  margin-left: $gap;
}

/* ---------------- emoji 占位（菜品内容，非界面图标） ---------------- */
.emoji-row {
  display: flex;
  flex-wrap: wrap;
  gap: $gap-sm;
}

.emoji-item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 88rpx;
  height: 88rpx;
  box-sizing: border-box;
  background: $surface-sunken;
  border: 4rpx solid transparent;
  border-radius: $radius;
  font-size: 44rpx;
}

.emoji-item.active {
  border-color: $brand;
  background: $brand-soft;
}

/* ---------------- textarea ---------------- */
.textarea {
  width: 100%;
  height: 180rpx;
  box-sizing: border-box;
  padding: $gap;
  background: $surface-sunken;
  border-radius: $radius;
  font-size: $fs-body;
  color: $ink;
  line-height: 1.6;
}

/* ---------------- 底部操作条 ---------------- */
.op-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  padding: $gap $gap-page;
  padding-bottom: 48rpx;
  background: $surface;
  border-top: 2rpx solid $line;
  z-index: 20;
}

.btn-ghost {
  width: 220rpx;
  height: $h-btn;
  line-height: $h-btn;
  text-align: center;
  font-size: $fs-body;
  font-weight: $fw-medium;
  color: $gray7;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-pill;
}

.btn-primary {
  flex: 1;
  height: $h-btn;
  line-height: $h-btn;
  margin-left: $gap;
  text-align: center;
  font-size: $fs-body;
  font-weight: $fw-medium;
  color: #fff;
  background: $brand;
  border-radius: $radius-pill;
  box-shadow: $shadow-brand;
}

.btn-primary.is-disabled {
  opacity: 0.6;
  box-shadow: none;
}
</style>
