<template>
  <view class="edit-page">
    <!-- ================= 顶部标题 ================= -->
    <view class="hero">
      <text class="hero-title">{{ isEdit ? '✏️ 编辑菜品' : '➕ 新增菜品' }}</text>
      <text class="hero-sub">
        {{ isEdit ? '修改后立即同步到菜品库与推荐结果' : '填好信息后即可被 AI 推荐命中' }}
      </text>
    </view>

    <!-- ================= 加载中 / 加载失败 ================= -->
    <view class="state-box" v-if="loading">
      <text class="state-emoji">⏳</text>
      <text class="state-text">菜品信息加载中…</text>
    </view>

    <view class="state-box" v-else-if="loadError">
      <text class="state-emoji">😵</text>
      <text class="state-text">{{ loadError }}</text>
      <view class="retry-btn" @click="loadDetail">重新加载</view>
    </view>

    <!-- ================= 表单 ================= -->
    <block v-else>
      <!-- 基本信息 -->
      <view class="card">
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
              <text class="picker-arrow">▾</text>
            </view>
          </picker>
          <text class="hint" v-if="!form.canteen">选完食堂才会出现楼层选项</text>
        </view>

        <view class="field" v-if="floorRange.length">
          <text class="field-label">所属楼层 <text class="req">*</text></text>
          <picker
            mode="selector"
            :range="floorRange"
            :value="floorIndex"
            @change="onFloorChange"
          >
            <view class="picker-value">
              <text class="picker-text">{{ form.floor ? form.floor + '楼' : '请选择楼层' }}</text>
              <text class="picker-arrow">▾</text>
            </view>
          </picker>
          <text class="hint">{{ form.canteen }}共 {{ floorRange.length }} 层</text>
        </view>

        <view class="field field-last">
          <text class="field-label">所属窗口 <text class="req">*</text></text>
          <picker
            mode="selector"
            :range="windowRange"
            :value="windowIndex"
            @change="onWindowChange"
          >
            <view class="picker-value">
              <text class="picker-text">{{ windowDisplay }}</text>
              <text class="picker-arrow">▾</text>
            </view>
          </picker>
          <input
            v-if="manualWindow"
            class="input input-gap"
            v-model="form.window"
            type="text"
            maxlength="20"
            placeholder="例如：滋士客汉堡 / 自选餐"
            placeholder-class="ph"
          />
          <text class="hint" v-else>每层都有 1~10 号窗口；不属于编号窗口的档口（如「滋士客汉堡」）选最后一项自定义</text>
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
              <text class="picker-arrow">▾</text>
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
        <text class="field-label">口味与食材标签（可多选）</text>
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
        <text class="field-label">菜品图片</text>
        <text class="hint hint-block">
          可以直接从相册选图 / 拍照上传（存到 uniCloud 云存储），也可以手填图片地址。
          留空则回退为 emoji 方块。
        </text>

        <view class="img-row">
          <DishImage :dish="{ id: form.id, image: form.image, emoji: form.emoji, category: form.category }" :size="160" :radius="16" />
          <view class="img-side">
            <view class="img-btns">
              <view class="img-btn img-btn-main" :class="{ busy: uploading }" @click="pickAndUpload">
                <text>{{ uploading ? '上传中…' : '📷 上传图片' }}</text>
              </view>
              <view class="img-btn" v-if="form.image" @click="clearImage">
                <text>清除</text>
              </view>
            </view>
            <input
              class="input"
              v-model="form.image"
              placeholder="或手填图片地址"
              placeholder-class="ph"
            />
            <view class="img-tips">
              <text class="hint">当前：{{ form.image || '未配置，使用 emoji 占位' }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- emoji -->
      <view class="card">
        <text class="field-label">备用图标（emoji）</text>
        <text class="hint hint-block">没有图片时，列表与详情用这个 emoji 渲染成渐变方块</text>
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
        <text class="field-label">菜品描述</text>
        <textarea
          class="textarea"
          v-model="form.description"
          maxlength="60"
          placeholder="20~30 字介绍，例如：鸡丁配花生米，微辣下饭，川味窗口招牌"
          placeholder-class="ph"
        />
        <text class="hint">{{ (form.description || '').length }}/60</text>
      </view>

      <!-- 提交 -->
      <button
        class="save-btn"
        :class="{ 'is-disabled': submitting }"
        :disabled="submitting"
        @click="save"
      >
        {{ submitting ? '保存中…' : isEdit ? '保存修改' : '创建菜品' }}
      </button>
    </block>
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
import { ensureAdmin } from '@/common/utils.js'
import { EMOJI_MAP, TASTE_OPTIONS, ALLERGY_OPTIONS, CANTEENS, floorOptions, windowOptions, isNumberedWindow } from '@/common/constants.js'
import DishImage from '@/components/DishImage/DishImage.vue'

/** constants 缺失单项时的兜底，保证页面永远可用 */
const FALLBACK_TASTE = ['辣', '麻辣', '清淡', '酸甜', '咸香', '重油', '下饭', '低卡']
const FALLBACK_ALLERGY = ['花生', '香菜', '牛肉', '猪肉', '鸡肉', '鸡蛋', '海鲜', '内脏', '葱', '蒜']
const FALLBACK_CATEGORY = ['川菜', '家常菜', '快餐', '面食', '小吃', '轻食', '素菜', '地方菜', '粤菜', '其他']

const EMOJI_CANDIDATES = [
  '🍽️', '🍚', '🍜', '🍛', '🍲', '🥘', '🍗', '🥗', '🌶️', '🍱', '🥟', '🍢', '🍰', '🧋'
]

/** 窗口 picker 的最后一项：不在 1~10 号窗口内的自定义档口 */
const MANUAL_WINDOW = '自定义窗口…'
const MANUAL_CATEGORY = '手动输入分类…'

/**
 * 把 constants 里的选项数组转成纯中文字符串标签
 *
 * TASTE_OPTIONS / ALLERGY_OPTIONS 的元素是 { label, value, selected } 对象，
 * 而菜品 tags 存的必须是纯词（'辣' / '香菜'）：下游 recommend-engine.js 与
 * shiyu-recommend 云函数都按字符串比对（如 tags.includes('辣')）做忌口硬过滤。
 * 直接把对象塞进 tagOptions 会让标签渲染成 [object Object]、并把对象写进菜品库，
 * 导致忌口过滤和标签统计全部失效。
 *
 * @param {Array} options constants 中的选项数组
 * @param {Array<string>} fallback 选项缺失时的兜底词表
 * @returns {Array<string>} 纯文本标签词
 */
function toTagWords(options, fallback) {
  if (!Array.isArray(options) || !options.length) return fallback
  const words = options
    .map((item) => (typeof item === 'string' ? item : item && (item.label || item.value)))
    .filter((s) => typeof s === 'string' && s)
    // 忌口项的 label 形如「不吃香菜」，标签本身只该存食材名「香菜」
    .map((s) => s.replace(/^不吃/, ''))
  return words.length ? words : fallback
}

/** 口味标签 = 口味词 + 食材词（后者用于忌口硬过滤） */
const tasteList = toTagWords(TASTE_OPTIONS, FALLBACK_TASTE)
const allergyList = toTagWords(ALLERGY_OPTIONS, FALLBACK_ALLERGY)
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
/** 食堂候选（真实值在 loadCanteens 里按 constants + 云端结果填充） */
const canteenRange = ref(CANTEENS.slice(0))

const isEdit = ref(false)
const dishId = ref('')
const loading = ref(false)
const loadError = ref('')
const submitting = ref(false)
const canteenIndex = ref(0)
const emojiTouched = ref(false)
/** 图片上传中：防止连点重复上传 */
const uploading = ref(false)

const form = ref({
  id: '',
  name: '',
  price: '',
  canteen: '',
  // 位置：食堂 + 楼层 + 窗口。窗口要么是「3号窗口」，要么是自定义档口名
  floor: null,
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

/* ------------------------------ 菜品图片 ------------------------------ */

/** Promise 化 chooseImage：用户取消时 reject，调用方静默忽略 */
function chooseLocalImage() {
  return new Promise((resolve, reject) => {
    uni.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => resolve((res && res.tempFilePaths) || []),
      fail: (err) => reject(new Error((err && err.errMsg) || '未选择图片'))
    })
  })
}

/**
 * 上传到 uniCloud 云存储，返回 fileID
 *
 * 用回调式写法（而不是 await）以保证各端一致；cloudPath 必须唯一，
 * 否则同名文件会被当作同一个资源覆盖掉。
 */
function uploadToCloud(filePath) {
  return new Promise((resolve, reject) => {
    if (typeof uniCloud === 'undefined' || !uniCloud || !uniCloud.uploadFile) {
      reject(new Error('云存储不可用：本项目还没关联 uniCloud 服务空间，请在 HBuilderX 中右键 uniCloud-aliyun → 关联云服务空间'))
      return
    }
    var matched = String(filePath).match(/\.(\w+)$/)
    var ext = matched ? matched[1] : 'jpg'
    var cloudPath = 'dishes/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext

    uniCloud.uploadFile({
      filePath: filePath,
      cloudPath: cloudPath,
      success: (res) => {
        if (res && res.fileID) resolve(res.fileID)
        else reject(new Error('云存储没有返回 fileID'))
      },
      fail: (err) => reject(new Error((err && (err.errMsg || err.message)) || '上传失败'))
    })
  })
}

/** 选图 → 上传 → 把 fileID 写回 form.image */
async function pickAndUpload() {
  if (uploading.value) return

  let paths = []
  try {
    paths = await chooseLocalImage()
  } catch (e) {
    return // 用户取消，不打扰
  }
  const filePath = paths[0]
  if (!filePath) return

  uploading.value = true
  uni.showLoading({ title: '上传中…' })
  try {
    const fileID = await uploadToCloud(filePath)
    form.value.image = fileID
    uni.showToast({ title: '图片已上传', icon: 'success' })
  } catch (e) {
    // 真机上最常见的是 uploadFile 合法域名没配（它和 request 合法域名是两个列表）
    uni.showModal({
      title: '图片上传失败',
      content: (e && e.message) || '未知错误',
      showCancel: false
    })
  } finally {
    uni.hideLoading()
    uploading.value = false
  }
}

/** 清除已选图片，回到 emoji 占位 */
function clearImage() {
  form.value.image = ''
}

function toggleTag(t) {
  const tags = form.value.tags
  const idx = tags.indexOf(t)
  if (idx > -1) tags.splice(idx, 1)
  else tags.push(t)
}

/* ------------------------------ 位置：食堂 / 楼层 / 窗口 ------------------------------ */

/**
 * 食堂列表
 *
 * 以 constants 的 CANTEEN_FLOORS 为准 —— 楼层数量是靠它查的，
 * 必须和云端返回的食堂名对得上，否则楼层选项会空掉。
 * 云端若报了 constants 里没有的食堂（历史数据），也一并列出来，
 * 只是这种食堂查不到楼层数，需要管理员补进 CANTEEN_FLOORS。
 */
async function loadCanteens() {
  const configured = CANTEENS.slice(0)
  let names = configured
  try {
    const res = await dishApi.canteens()
    const raw = (res && res.list) || []
    const fromCloud = raw
      .map((c) => (typeof c === 'string' ? c : c && (c.name || c.canteen)))
      .filter((n) => !!n)
    if (fromCloud.length) {
      // 配置顺序优先，云端多出来的追加在后面
      names = [...configured.filter((c) => fromCloud.indexOf(c) > -1),
        ...fromCloud.filter((c) => configured.indexOf(c) < 0)]
      if (!names.length) names = configured
    }
  } catch (e) {
    // 拿不到云端列表就用 constants 里的配置
  }
  canteenRange.value = names.length ? names : configured

  const cur = String(form.value.canteen || '').trim()
  canteenIndex.value = Math.max(0, canteenRange.value.indexOf(cur))
}

/** 某食堂的楼层候选（来自 CANTEEN_FLOORS）；未配置的食堂为空 */
const floorRange = computed(() => floorOptions(form.value.canteen))

const floorIndex = computed(() => {
  const i = floorRange.value.indexOf(Number(form.value.floor))
  return i > -1 ? i : 0
})

function onCanteenChange(e) {
  const idx = Number(e.detail.value) || 0
  canteenIndex.value = idx
  const picked = canteenRange.value[idx] || ''
  if (picked !== form.value.canteen) {
    // 换食堂后原来的楼层可能越界（第三食堂只有 2 层），清掉让用户重选
    form.value.canteen = picked
    if (!floorOptions(picked).includes(Number(form.value.floor))) {
      form.value.floor = null
    }
  }
}

function onFloorChange(e) {
  const idx = Number(e.detail.value) || 0
  form.value.floor = floorRange.value[idx] || null
}

/** 窗口候选：每层的 1~10 号窗口 + 自定义 */
const windowRange = computed(() => [...windowOptions(), MANUAL_WINDOW])

const manualWindow = ref(false)

/** 编辑模式下回填：已有窗口名不在 1~10 号里，就当自定义档口 */
function syncWindowState() {
  const win = String(form.value.window || '').trim()
  if (!win) {
    manualWindow.value = false
    return
  }
  manualWindow.value = !isNumberedWindow(win)
}

const windowIndex = computed(() => {
  const win = String(form.value.window || '').trim()
  if (!win) return 0
  const i = windowOptions().indexOf(win)
  return i > -1 ? i : windowOptions().length // 自定义那一项
})

const windowDisplay = computed(() => {
  const win = String(form.value.window || '').trim()
  if (manualWindow.value) return win ? '自定义：' + win : '自定义窗口'
  return win || '请选择窗口'
})

function onWindowChange(e) {
  const idx = Number(e.detail.value) || 0
  const list = windowOptions()
  if (idx >= list.length) {
    // 选了「自定义窗口」：清空让用户自己填（原本就是自定义的话保留已填内容）
    manualWindow.value = true
    if (isNumberedWindow(form.value.window)) form.value.window = ''
    return
  }
  manualWindow.value = false
  form.value.window = list[idx]
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
      floor: Number(dish.floor) > 0 ? Number(dish.floor) : null,
      window: dish.window || '',
      category: dish.category || '',
      tags: Array.isArray(dish.tags) ? [...dish.tags] : [],
      emoji: dish.emoji || '🍽️',
      image: dish.image || '',
      description: dish.description || '',
      status: dish.status === 0 ? 0 : 1
    }

    // 窗口名不在 1~10 号里 → 视为自定义档口，展开输入框
    syncWindowState()

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

  if (!String(f.canteen || '').trim()) return '请选择所属食堂'
  if (!(Number(f.floor) > 0)) return '请选择所属楼层'
  if (!String(f.window || '').trim()) return '请选择窗口，或自定义一个窗口名'
  if (!String(f.category || '').trim()) return '请选择菜品分类'
  if (!f.tags || !f.tags.length) return '请至少选择 1 个口味/食材标签'

  return ''
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
      floor: Number(f.floor),
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

onLoad(async (options) => {
  // 这一页原先完全没有管理员守卫：任何能跳到本页的人都能新增/编辑菜品。
  // 保存动作虽然后端会验签，但至少不该先把编辑表单渲染出来。
  if (!(await ensureAdmin())) return

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

<style scoped>
.edit-page {
  padding: 24rpx;
  padding-bottom: 80rpx;
  background: #f5f5f5;
  min-height: 100vh;
  box-sizing: border-box;
}

/* ---------------- 顶部 ---------------- */
.hero {
  background: linear-gradient(135deg, #333333, #4d4d4d);
  border-radius: 24rpx;
  padding: 30rpx;
  margin-bottom: 20rpx;
}

.hero-title {
  display: block;
  font-size: 36rpx;
  font-weight: bold;
  color: #fff;
}

.hero-sub {
  display: block;
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.65);
  margin-top: 8rpx;
}

/* ---------------- 状态 ---------------- */
.state-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 140rpx 40rpx;
  background: #fff;
  border-radius: 24rpx;
}

.state-emoji {
  font-size: 76rpx;
}

.state-text {
  font-size: 26rpx;
  color: #999;
  margin-top: 18rpx;
  text-align: center;
  line-height: 1.6;
}

.retry-btn {
  margin-top: 30rpx;
  padding: 16rpx 48rpx;
  background: #ff6b35;
  color: #fff;
  border-radius: 40rpx;
  font-size: 26rpx;
}

/* ---------------- 表单 ---------------- */
.card {
  background: #fff;
  border-radius: 22rpx;
  padding: 26rpx 24rpx;
  margin-bottom: 20rpx;
}

.field {
  margin-bottom: 26rpx;
}

.field-last {
  margin-bottom: 0;
}

.field-label {
  display: block;
  font-size: 27rpx;
  color: #333;
  font-weight: 500;
  margin-bottom: 16rpx;
}

.req {
  color: #ff4d4f;
}

.input {
  width: 100%;
  height: 80rpx;
  background: #f8f8f8;
  border-radius: 14rpx;
  padding: 0 20rpx;
  font-size: 27rpx;
  color: #333;
  box-sizing: border-box;
}

.input-gap {
  margin-top: 14rpx;
}

.ph {
  color: #bbb;
  font-size: 26rpx;
}

.picker-value {
  height: 80rpx;
  background: #f8f8f8;
  border-radius: 14rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20rpx;
}

.picker-text {
  font-size: 27rpx;
  color: #333;
}

.picker-arrow {
  font-size: 22rpx;
  color: #999;
}

.hint {
  display: block;
  font-size: 21rpx;
  color: #aaa;
  margin-top: 12rpx;
  line-height: 1.6;
}

.hint-block {
  margin-bottom: 18rpx;
  margin-top: 0;
}

/* ---------------- 标签 chips ---------------- */
.chip-group {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
}

.chip {
  padding: 12rpx 26rpx;
  background: #f5f5f5;
  border-radius: 26rpx;
  font-size: 25rpx;
  color: #666;
  border: 2rpx solid transparent;
}

.chip.warn {
  color: #a86b00;
  background: #fffbe6;
}

.chip.active {
  background: #fff3ed;
  color: #ff6b35;
  border-color: #ff6b35;
  font-weight: 500;
}

/* ---------------- 菜品图片 ---------------- */
.img-row {
  display: flex;
  align-items: flex-start;
  gap: 22rpx;
}

.img-side {
  flex: 1;
  min-width: 0;
}

.img-btns {
  display: flex;
  gap: 16rpx;
  margin-bottom: 16rpx;
}

.img-btn {
  padding: 14rpx 24rpx;
  border-radius: 12rpx;
  border: 2rpx solid #ff6b35;
  font-size: 26rpx;
  color: #ff6b35;
  text-align: center;
}

.img-btn-main {
  background: #ff6b35;
  color: #fff;
  flex: 1;
}

.img-btn.busy {
  opacity: 0.6;
}

.img-tips {
  margin-top: 10rpx;
}

/* ---------------- emoji ---------------- */
.emoji-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.emoji-item {
  width: 88rpx;
  height: 88rpx;
  border-radius: 22rpx;
  background: linear-gradient(135deg, #fff3ed, #ffe4d6);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 44rpx;
  border: 4rpx solid transparent;
  box-sizing: border-box;
}

.emoji-item.active {
  border-color: #ff6b35;
  box-shadow: 0 4rpx 14rpx rgba(255, 107, 53, 0.3);
}

/* ---------------- textarea ---------------- */
.textarea {
  width: 100%;
  height: 170rpx;
  background: #f8f8f8;
  border-radius: 14rpx;
  padding: 18rpx 20rpx;
  font-size: 27rpx;
  color: #333;
  box-sizing: border-box;
}

/* ---------------- 保存 ---------------- */
.save-btn {
  margin-top: 30rpx;
  height: 92rpx;
  line-height: 92rpx;
  border-radius: 46rpx;
  background: linear-gradient(135deg, #ff8c5a, #ff6b35);
  color: #fff;
  font-size: 30rpx;
  font-weight: 500;
  border: none;
  box-shadow: 0 10rpx 24rpx rgba(255, 107, 53, 0.3);
}

.save-btn[disabled],
.save-btn.is-disabled {
  background: #ffc7ae;
  box-shadow: none;
}
</style>
