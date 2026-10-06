<template>
  <view class="ai-config-page">
    <!-- 顶部说明 -->
    <view class="note-card">
      <text class="note-title">🔐 配置前先看三点</text>
      <text class="note-line">① API Key 保存在云端数据库，只有云函数可读写，绝不会下发到客户端页面。</text>
      <text class="note-line">② 未配置密钥时，智能推荐会自动降级为本地规则引擎，功能依然可完整演示。</text>
      <text class="note-line">③ 支持 OpenAI 兼容协议的任意大模型服务（DeepSeek / 通义 / 智谱 / 自建中转均可）。</text>
      <text class="note-line">写入配置需要在下方填写管理口令（admin_token）。</text>
    </view>

    <!-- 当前状态 -->
    <view class="card">
      <view class="card-head">
        <text class="card-title">当前状态</text>
        <text class="card-action" v-if="!loading" @click="loadConfig">刷新</text>
      </view>

      <view class="card-state" v-if="loading">
        <text class="state-icon">⏳</text>
        <text class="state-text">读取配置中...</text>
      </view>

      <view class="card-state" v-else-if="loadError">
        <text class="state-icon">😵</text>
        <text class="state-text">{{ loadError }}</text>
        <view class="state-btn" @click="loadConfig">重新读取</view>
      </view>

      <view v-else>
        <view class="status-row">
          <text class="status-label">配置状态</text>
          <text class="status-value" :class="configured ? 'ok' : 'warn'">
            {{ configured ? '已配置' : '未配置' }}
          </text>
        </view>
        <view class="status-row">
          <text class="status-label">服务商</text>
          <text class="status-value">{{ statusProvider }}</text>
        </view>
        <view class="status-row">
          <text class="status-label">base_url</text>
          <text class="status-value">{{ statusBaseUrl }}</text>
        </view>
        <view class="status-row">
          <text class="status-label">model</text>
          <text class="status-value">{{ statusModel }}</text>
        </view>
        <view class="status-row">
          <text class="status-label">API Key</text>
          <text class="status-value">{{ apiKeyText }}</text>
        </view>
        <view class="status-notice" v-if="statusNotice">
          <text>{{ statusNotice }}</text>
        </view>
      </view>
    </view>

    <!-- 配置表单 -->
    <view class="card">
      <view class="card-head">
        <text class="card-title">AI 配置</text>
      </view>

      <view class="form-row">
        <text class="form-label">服务商</text>
        <picker
          class="form-control"
          mode="selector"
          :range="providerLabels"
          :value="providerIndex"
          @change="onProviderChange"
        >
          <view class="picker-box">
            <text class="picker-text">{{ providerLabel }}</text>
            <text class="picker-arrow">▾</text>
          </view>
        </picker>
      </view>

      <view class="form-row">
        <text class="form-label">base_url</text>
        <input
          class="form-control form-input"
          type="text"
          v-model="form.base_url"
          placeholder="https://api.deepseek.com/v1"
          placeholder-style="color:#B8B2AA;font-size:26rpx"
        />
      </view>

      <view class="form-row">
        <text class="form-label">model</text>
        <input
          class="form-control form-input"
          type="text"
          v-model="form.model"
          placeholder="deepseek-chat"
          placeholder-style="color:#B8B2AA;font-size:26rpx"
        />
      </view>

      <view class="form-row">
        <text class="form-label">api_key</text>
        <view class="form-control key-box">
          <input
            class="key-input"
            type="text"
            :password="!showKey"
            v-model="form.api_key"
            :placeholder="apiKeyPlaceholder"
            placeholder-style="color:#B8B2AA;font-size:26rpx"
          />
          <text class="key-toggle" @click="toggleShowKey">{{ showKey ? '隐藏' : '显示' }}</text>
        </view>
      </view>
      <text class="form-tip">留空表示不修改云端已保存的 Key；保存成功后输入框会清空，不会回显明文。</text>

      <!-- ==================== 微信登录配置（可选） ====================
           登录页的「微信一键登录」需要小程序的 AppID 与 AppSecret。
           填在这里就能用，不必进 uniCloud 控制台配环境变量。 -->
      <view class="section-split">
        <text class="split-title">微信登录配置（可选）</text>
        <text class="split-desc">
          只影响登录页的「微信一键登录」。不配也能用手动填昵称的方式进入，功能完全一样。
        </text>
      </view>

      <view class="form-row">
        <text class="form-label">微信 AppID</text>
        <input
          class="form-control form-input"
          type="text"
          v-model="form.wechat_appid"
          :placeholder="wechatAppidPlaceholder"
          placeholder-style="color:#B8B2AA;font-size:26rpx"
        />
      </view>
      <text class="form-tip">
        AppID 不是密钥（它本来就打包在小程序里），所以会回显出来便于核对。
        应与 manifest.json 里 mp-weixin.appid 一致。
      </text>

      <view class="form-row">
        <text class="form-label">微信 AppSecret</text>
        <view class="form-control key-box">
          <input
            class="key-input"
            type="text"
            :password="!showSecret"
            v-model="form.wechat_secret"
            :placeholder="wechatSecretPlaceholder"
            placeholder-style="color:#B8B2AA;font-size:26rpx"
          />
          <text class="key-toggle" @click="toggleShowSecret">{{ showSecret ? '隐藏' : '显示' }}</text>
        </view>
      </view>
      <text class="form-tip">
        在微信公众平台 → 开发管理 → 开发设置 里获取（生成后只显示一次，请先复制保存）。
        留空表示不修改云端已保存的值，也<b>绝不会回显明文</b>。
      </text>

      <!-- 管理口令只在「云端还没有口令」时才需要填。
           进了本页说明 ensureAdmin 已用本机口令校验通过，保存直接复用它即可，
           再让用户手填只会造成「保存时口令校验失败」。 -->
      <view class="form-row" v-if="!cloudHasToken">
        <text class="form-label">管理口令</text>
        <input
          class="form-control form-input"
          type="text"
          v-model="adminToken"
          placeholder="自己设一个，记住它"
          placeholder-style="color:#B8B2AA;font-size:26rpx"
        />
      </view>
      <text class="form-tip">
        <template v-if="cloudHasToken">
          云端已有管理口令，保存时会自动使用你登录时通过校验的那个，无需重复填写。
        </template>
        <template v-else>
          云端还没有口令，<text class="form-tip-strong">必须在这里设一个</text>（记住它，
          它就是你以后进管理后台的凭据）。
        </template>
      </text>

      <text class="form-tip" v-if="isCustom">已选择「自定义」，请手动填写 base_url 与 model。</text>
    </view>

    <!-- 测试结果 -->
    <view class="result-card" :class="testResult.ok ? 'ok' : 'fail'" v-if="testResult">
      <text class="result-text" v-if="testResult.ok">
        ✅ 连接正常 · 模型 {{ testResult.model || '—' }} · 耗时 {{ testResult.elapsed }}ms
      </text>
      <text class="result-text" v-else>❌ {{ testResult.message || '连接失败' }}</text>
    </view>

    <!-- 常见错误提示 -->
    <view class="card tip-card">
      <text class="card-title">🧭 常见错误对照</text>
      <text class="tip-line" :class="{ hit: testResult && testResult.hit === 'auth' }">
        · 401 / invalid api key → API Key 无效
      </text>
      <text class="tip-line" :class="{ hit: testResult && testResult.hit === 'notfound' }">
        · 404 / model not found → base_url 或 model 错误
      </text>
      <text class="tip-line" :class="{ hit: testResult && testResult.hit === 'timeout' }">
        · 超时 / fetch failed → 网络或中转地址问题
      </text>
      <text class="tip-line">· 测试会使用「已保存」的配置，请先保存再测试</text>
    </view>

    <!-- 初始化菜品数据 -->
    <view class="card seed-card">
      <text class="card-title">🍚 初始化菜品数据</text>
      <text class="form-tip">
        把内置菜品库写入云数据库：同步只补齐缺失的菜品，重置会清空现有菜品后重新写入。
      </text>

      <view class="seed-btns">
        <view class="seed-btn seed-sync" :class="{ disabled: seeding }" @click="seed('sync')">
          <text class="seed-title">{{ seeding ? '处理中…' : '同步菜品库' }}</text>
          <text class="seed-desc">补齐缺失，不覆盖已有</text>
        </view>
        <view class="seed-btn seed-reset" :class="{ disabled: seeding }" @click="confirmReset">
          <text class="seed-title">重置菜品库</text>
          <text class="seed-desc">清空后全量重写</text>
        </view>
      </view>

      <view class="seed-result" v-if="seedResult">
        <text class="seed-result-text">{{ seedResult }}</text>
      </view>
    </view>

    <!-- 底部按钮 -->
    <view class="action-bar">
      <view class="btn-ghost" :class="{ disabled: testing || saving }" @click="onTest">
        <text>{{ testing ? '测试中...' : '测试连接' }}</text>
      </view>
      <view class="btn-primary" :class="{ disabled: saving || testing }" @click="onSave">
        <text>{{ saving ? '保存中...' : '保存配置' }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { configApi, getAdminToken, saveAdminToken } from '@/api/index.js'
import { AI_PROVIDERS } from '@/common/constants.js'

// 若 constants.js 的 AI_PROVIDERS 为空或结构不识别，退回到这份内置清单
const FALLBACK_PROVIDERS = [
  { key: 'deepseek', label: 'DeepSeek', base_url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { key: 'openai', label: 'OpenAI', base_url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { key: 'dashscope', label: '阿里云百炼（通义千问）', base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { key: 'zhipu', label: '智谱 GLM', base_url: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { key: 'moonshot', label: '月之暗面 Kimi', base_url: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { key: 'custom', label: '自定义', base_url: '', model: '' }
]

const loading = ref(true)
const loadError = ref('')
const saving = ref(false)
const testing = ref(false)
const seeding = ref(false)
const testResult = ref(null)
const seedResult = ref('')
const status = ref(null)
const adminToken = ref('')
const showKey = ref(false)
/** 本机自动生成的管理口令，admin_token 留空时用它 */
const localToken = ref('')

const form = ref({
  provider: 'custom',
  base_url: '',
  model: '',
  api_key: '',
  // 微信登录配置（可选）：留空表示不修改云端已保存的值
  wechat_appid: '',
  wechat_secret: ''
})

/** AppSecret 默认打码，点「显示」才亮出来（和 api_key 一样） */
const showSecret = ref(false)

function toggleShowSecret() {
  showSecret.value = !showSecret.value
}

// 云端已配置但不在 AI_PROVIDERS 里的服务商，临时补进下拉列表，保证可以正确回显
const extraProvider = ref(null)

const providers = computed(() => {
  const base = normalizeProviders(AI_PROVIDERS)
  const extra = extraProvider.value
  if (extra && extra.key && !base.some((p) => p.key === extra.key)) {
    return [...base, extra]
  }
  return base
})

const providerLabels = computed(() => providers.value.map((p) => p.label))

const providerIndex = computed(() => {
  const i = providers.value.findIndex((p) => p.key === form.value.provider)
  return i > -1 ? i : 0
})

const providerLabel = computed(() => {
  const hit = providers.value.find((p) => p.key === form.value.provider)
  return (hit && hit.label) || form.value.provider || '自定义'
})

const selectedProvider = computed(() => providers.value.find((p) => p.key === form.value.provider) || null)

// 没有预置 base_url 的服务商（自定义）允许手填
const isCustom = computed(() => {
  const p = selectedProvider.value
  return !p || !p.base_url
})

const configured = computed(() => !!(status.value && status.value.configured))
/** 云端是否已经设过管理口令（决定「管理口令」输入框是否显示） */
const cloudHasToken = computed(() => !!(status.value && status.value.has_admin_token))
const statusProvider = computed(() => (status.value && status.value.provider) || '未配置')
const statusBaseUrl = computed(() => (status.value && status.value.base_url) || '未配置')
const statusModel = computed(() => (status.value && status.value.model) || '未配置')
const apiKeyText = computed(() => {
  const has = !!(status.value && status.value.has_key)
  return has ? '已配置（不显示明文）' : '未配置'
})
const apiKeyPlaceholder = computed(() =>
  status.value && status.value.has_key ? '已配置（不显示明文），留空则不修改' : 'sk-xxxxxxxx（仅保存在云端）'
)

/** 微信 AppID：不是密钥，回显出来便于和小程序 manifest 对照 */
const wechatAppidPlaceholder = computed(() => {
  const saved = (status.value && status.value.wechat_appid) || ''
  return saved || 'wx 开头共 18 位，例如 wx77b975b02cb7f1aa'
})
/** 微信 AppSecret：只回「配没配」与来源，绝不回显明文 */
const wechatSecretPlaceholder = computed(() => {
  const has = !!(status.value && status.value.has_wechat_secret)
  return has ? '已配置（不显示明文），留空则不修改' : '微信公众平台 → 开发管理 → 开发设置'
})
// api/index.js 在云端不可用时会带回 notice（例如未关联服务空间）
const statusNotice = computed(() => (status.value && status.value.notice) || '')

onLoad(() => {
  // 与其它后台页保持一致：仅管理员可进入
  let user = null
  try {
    user = uni.getStorageSync('userInfo') || null
  } catch (e) {
    user = null
  }
  if (!user || user.role !== 'admin') {
    uni.showToast({ title: '仅管理员可访问 AI 配置', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 1200)
    return
  }

  try {
    localToken.value = getAdminToken() || '未生成'
  } catch (e) {
    localToken.value = '未生成'
  }

  loadConfig()
})

async function loadConfig() {
  if (loading.value && status.value) return
  loading.value = true
  loadError.value = ''
  try {
    const data = await configApi.get()
    status.value = data || null
    if (data) fillForm(data)
  } catch (e) {
    loadError.value = errorMessage(e, '配置读取失败，请确认云函数已部署')
    uni.showToast({ title: '配置读取失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

function fillForm(data) {
  if (data.provider) {
    form.value.provider = data.provider
    const hit = providers.value.some((p) => p.key === data.provider)
    if (!hit) {
      extraProvider.value = {
        key: data.provider,
        label: data.provider,
        base_url: data.base_url || '',
        model: data.model || ''
      }
    }
  }
  form.value.base_url = data.base_url || ''
  form.value.model = data.model || ''
  // 微信 AppID 可以回显（不是密钥）；Secret 只回「配没配」，输入框始终留空
  form.value.wechat_appid = data.wechat_appid || ''
  form.value.wechat_secret = ''
}

function onProviderChange(e) {
  const idx = Number(e.detail.value)
  const p = providers.value[idx]
  if (!p) return
  form.value.provider = p.key
  // 选中后自动带出 baseUrl 与 model；自定义项留空，允许手填
  if (p.base_url) form.value.base_url = p.base_url
  if (p.model) form.value.model = p.model
  testResult.value = null
}

function toggleShowKey() {
  showKey.value = !showKey.value
}

function validate() {
  const baseUrl = form.value.base_url.trim()
  const model = form.value.model.trim()
  if (!baseUrl) return '请填写 base_url'
  if (!/^https?:\/\//i.test(baseUrl)) return 'base_url 必须以 http:// 或 https:// 开头'
  if (!model) return 'model 不能为空'
  return ''
}

async function onSave() {
  if (saving.value || testing.value) return

  const msg = validate()
  if (msg) {
    uni.showToast({ title: msg, icon: 'none' })
    return
  }

  saving.value = true
  testResult.value = null
  try {
    const payload = {
      provider: form.value.provider,
      base_url: form.value.base_url.trim(),
      model: form.value.model.trim()
    }
    // 留空表示不修改云端已保存的 Key
    const key = form.value.api_key.trim()
    if (key) payload.api_key = key
    // 微信登录配置：同样「留空不修改」，避免只想改模型时把 Secret 清掉
    const wxAppid = form.value.wechat_appid.trim()
    const wxSecret = form.value.wechat_secret.trim()
    if (wxAppid) payload.wechat_appid = wxAppid
    if (wxSecret) payload.wechat_secret = wxSecret
    // 管理口令怎么取：
    //
    // 云端**已有**口令时 —— 用本机那个。进了本页说明 ensureAdmin 已经拿它校验通过了，
    //   所以它一定能通过 save，不需要也不应该再让用户重填。
    //   （原来写的是 `typedToken || getAdminToken()`：用户在框里随手填了别的内容
    //     就会覆盖掉已验证的口令，于是保存时必然报「口令校验失败」。）
    //
    // 云端**没有**口令时 —— 必须用用户这次填的，因为 verifyAdminToken 会把本次传入的
    //   口令当作初始口令落库。这里绝不能回退到本机那串随机生成的值，
    //   否则云端口令会变成一个没人知道的随机串，管理员从此登不进去。
    const typedToken = adminToken.value.trim()
    let token = ''
    if (cloudHasToken.value) {
      token = getAdminToken() || typedToken
    } else {
      if (!typedToken) {
        uni.hideLoading()
        return uni.showModal({
          title: '请先设置管理口令',
          content: '云端还没有管理口令。请在上面「管理口令」里自己设一个（记住它），再点保存 —— 这个口令会成为进入管理后台的凭据。',
          showCancel: false
        })
      }
      token = typedToken
    }
    if (token) payload.token = token

    await configApi.save(payload)

    // 初始口令落库成功后才持久化到本机：评价审核、菜品管理等页面共用它
    if (!cloudHasToken.value && typedToken) {
      saveAdminToken(typedToken)
      localToken.value = typedToken
    }

    form.value.api_key = ''
    form.value.wechat_secret = ''
    adminToken.value = ''
    showKey.value = false
    showSecret.value = false
    uni.showToast({ title: '配置已保存', icon: 'success' })

    // 重新拉取状态（只回显是否已配置，不含明文 Key）
    try {
      const data = await configApi.get()
      status.value = data || null
      if (data) fillForm(data)
    } catch (e) {
      // 状态刷新失败不影响保存结果
    }
  } catch (e) {
    uni.showToast({ title: errorMessage(e, '保存失败，请检查管理口令'), icon: 'none' })
  } finally {
    saving.value = false
  }
}

async function onTest() {
  if (testing.value || saving.value) return

  // 测试使用的是「云端已保存」的配置，因此不强制要求先填完表单
  testing.value = true
  testResult.value = null
  try {
    const res = await configApi.test()
    const ok = !!(res && res.ok)
    const model = (res && res.model) || form.value.model
    const elapsed = res && res.elapsed !== undefined && res.elapsed !== null ? res.elapsed : 0
    if (ok) {
      testResult.value = { ok: true, model, elapsed, message: '', hit: '' }
    } else {
      const reason = (res && res.message) || '未知原因'
      testResult.value = {
        ok: false,
        model,
        elapsed,
        message: reason + hintFor(reason),
        hit: detectHit(reason)
      }
    }
  } catch (e) {
    const reason = errorMessage(e, '网络异常')
    testResult.value = {
      ok: false,
      model: form.value.model,
      elapsed: 0,
      message: reason + hintFor(reason),
      hit: detectHit(reason)
    }
    uni.showToast({ title: '测试失败', icon: 'none' })
  } finally {
    testing.value = false
  }
}

/* ===== 菜品库初始化 ===== */

async function seed(action) {
  if (seeding.value) return
  seeding.value = true
  seedResult.value = ''
  try {
    const res = await configApi.seed(action)
    const total = Number((res && res.total) || 0)
    const existed = Number((res && res.existed) || 0)
    const removed = Number((res && res.removed) || 0)
    seedResult.value =
      action === 'reset'
        ? `✅ 重置完成：清空 ${removed} 条，重新写入 ${total} 条`
        : `✅ 同步完成：新写入 ${total} 条${existed ? `，已存在 ${existed} 条` : ''}`
    uni.showToast({ title: '操作成功', icon: 'success' })
  } catch (e) {
    seedResult.value =
      '❌ 操作失败：' + errorMessage(e, '请确认已关联 uniCloud 服务空间并上传 shiyu-seed')
    uni.showToast({ title: '菜品库操作失败', icon: 'none' })
  } finally {
    seeding.value = false
  }
}

/** 重置不可撤销，必须二次确认 */
function confirmReset() {
  if (seeding.value) return
  uni.showModal({
    title: '重置菜品库',
    content:
      '将清空云端 dishes 集合中的全部现有菜品（包括你手动新增的菜），再重新写入内置菜品库。此操作不可撤销，确定继续吗？',
    confirmText: '确认重置',
    confirmColor: '#FF5A36',
    success: (res) => {
      if (res.confirm) seed('reset')
    }
  })
}

/* ===== 工具 ===== */

/** 根据报错内容判断最可能的排查方向，用于高亮对照表 */
function detectHit(message) {
  const text = String(message || '').toLowerCase()
  if (text.indexOf('401') > -1 || text.indexOf('unauthorized') > -1 || text.indexOf('invalid api key') > -1 || text.indexOf('密钥') > -1) {
    return 'auth'
  }
  if (text.indexOf('404') > -1 || text.indexOf('not found') > -1) {
    return 'notfound'
  }
  if (
    text.indexOf('timeout') > -1 ||
    text.indexOf('timed out') > -1 ||
    text.indexOf('超时') > -1 ||
    text.indexOf('econnaborted') > -1 ||
    text.indexOf('fetch failed') > -1 ||
    text.indexOf('网络') > -1
  ) {
    return 'timeout'
  }
  return ''
}
function hintFor(message) {
  const text = String(message || '').toLowerCase()
  if (text.indexOf('401') > -1 || text.indexOf('unauthorized') > -1 || text.indexOf('invalid api key') > -1) {
    return '（可能原因：API Key 无效）'
  }
  if (text.indexOf('404') > -1 || text.indexOf('not found') > -1) {
    return '（可能原因：base_url 或 model 错误）'
  }
  if (text.indexOf('timeout') > -1 || text.indexOf('timed out') > -1 || text.indexOf('超时') > -1 || text.indexOf('econnaborted') > -1 || text.indexOf('fetch failed') > -1) {
    return '（可能原因：网络或中转地址问题）'
  }
  return ''
}

function normalizeProviders(raw) {
  const out = []
  const push = (key, item) => {
    const obj = typeof item === 'string' ? { label: item } : (item || {})
    const k = String(obj.key || obj.value || obj.id || key || '').trim()
    const label = String(obj.label || obj.name || obj.title || k).trim()
    if (!k && !label) return
    out.push({
      key: k || label,
      label: label || k,
      base_url: obj.base_url || obj.baseUrl || obj.url || '',
      model: obj.model || obj.default_model || obj.defaultModel || ''
    })
  }

  if (Array.isArray(raw)) {
    raw.forEach((item) => {
      if (typeof item === 'string') push(item, item)
      else push(item && (item.key || item.value || item.id || item.name), item)
    })
  } else if (raw && typeof raw === 'object') {
    Object.keys(raw).forEach((k) => push(k, raw[k]))
  }

  const list = out.length ? out : [...FALLBACK_PROVIDERS]
  if (!list.some((p) => p.key === 'custom')) {
    list.push({ key: 'custom', label: '自定义', base_url: '', model: '' })
  }
  return list
}

function errorMessage(e, fallback) {
  if (e && typeof e === 'object') {
    return e.message || e.errMsg || e.msg || fallback
  }
  return typeof e === 'string' && e ? e : fallback
}
</script>

<style lang="scss" scoped>
@import '@/common/tokens.scss';
.ai-config-page {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 24rpx 24rpx 180rpx;
  background: $canvas;
}

/* 说明 */
.note-card {
  padding: $gap-card;
  margin-bottom: $gap;
  border-radius: $radius-card;
  background: linear-gradient(135deg, $ink, $gray7);
}

.note-title {
  display: block;
  font-size: $fs-card;
  font-weight: $fw-bold;
  color: $surface;
  margin-bottom: 16rpx;
}

.note-line {
  display: block;
  font-size: $fs-cap;
  color: rgba(255, 255, 255, 0.75);
  line-height: 1.8;
}

/* 卡片 */
.card {
  padding: $gap-card;
  margin-bottom: $gap;
  border-radius: $radius-card;
  background: $surface;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: $gap;
}

.card-title {
  font-size: $fs-card;
  font-weight: $fw-bold;
  color: $ink;
}

.card-action {
  font-size: $fs-sub;
  color: $brand;
}

.card-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40rpx 0;
}

.state-icon {
  font-size: 60rpx;
  margin-bottom: 16rpx;
}

.state-text {
  font-size: $fs-sub;
  color: $gray6;
  text-align: center;
  line-height: 1.6;
}

.state-btn {
  margin-top: 24rpx;
  padding: 12rpx 40rpx;
  font-size: $fs-sub;
  color: $brand;
  border: 2rpx solid $brand;
  border-radius: 30rpx;
}

/* 状态行 */
.status-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 14rpx 0;
  border-bottom: 1rpx solid $canvas;
}

.status-row:last-child {
  border-bottom: none;
}

.status-label {
  font-size: $fs-sub;
  color: $gray6;
  flex-shrink: 0;
  margin-right: 20rpx;
}

.status-value {
  flex: 1;
  font-size: $fs-sub;
  color: $ink;
  text-align: right;
  word-break: break-all;
}

.status-value.ok {
  color: $success;
}

.status-value.warn {
  color: $brand;
}

.status-notice {
  margin-top: 18rpx;
  padding: 18rpx 20rpx;
  background: $warning-soft;
  border-radius: $radius;
  font-size: $fs-tag;
  color: $warning;
  line-height: 1.7;
}

/* 表单 */
.form-row {
  display: flex;
  align-items: center;
  padding: 16rpx 0;
}

.form-label {
  width: 180rpx;
  font-size: $fs-sub;
  color: $gray7;
  flex-shrink: 0;
}

.form-control {
  flex: 1;
  min-width: 0;
}

.form-input {
  height: 76rpx;
  box-sizing: border-box;
  padding: 0 20rpx;
  background: $canvas;
  border-radius: $radius-card;
  font-size: $fs-sub;
  color: $ink;
}

.picker-box {
  height: 76rpx;
  padding: 0 20rpx;
  background: $canvas;
  border-radius: $radius-card;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.picker-text {
  font-size: $fs-sub;
  color: $ink;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.picker-arrow {
  font-size: $fs-tag;
  color: $gray4;
  margin-left: 12rpx;
}

.key-box {
  display: flex;
  align-items: center;
  height: 76rpx;
  padding: 0 20rpx;
  background: $canvas;
  border-radius: $radius-card;
}

.key-input {
  flex: 1;
  height: 76rpx;
  font-size: $fs-sub;
  color: $ink;
}

.key-toggle {
  font-size: $fs-cap;
  color: $brand;
  padding-left: 20rpx;
  flex-shrink: 0;
}

.form-tip {
  display: block;
  margin: 8rpx 0 0 180rpx;
  font-size: $fs-tag;
  color: $gray4;
  line-height: 1.6;
}

/* 表单里的分组标题（例如「微信登录配置」） */
.section-split {
  margin: 32rpx 0 20rpx;
  padding-top: 28rpx;
  border-top: 1rpx solid $line;
}

.split-title {
  display: block;
  font-size: $fs-sub;
  font-weight: $fw-bold;
  color: $ink;
}

.split-desc {
  display: block;
  font-size: $fs-tag;
  color: $gray6;
  margin-top: 8rpx;
  line-height: 1.6;
}

/* 测试结果 */
.result-card {
  padding: 26rpx 28rpx;
  margin-bottom: $gap;
  border-radius: $radius-card;
}

.result-card.ok {
  background: $success-soft;
}

.result-card.fail {
  background: $danger-soft;
}

.result-text {
  font-size: $fs-sub;
  line-height: 1.7;
}

.result-card.ok .result-text {
  color: $success;
}

.result-card.fail .result-text {
  color: $danger;
}

/* 常见错误 */
.tip-card .card-title {
  display: block;
  margin-bottom: 16rpx;
}

.tip-line {
  display: block;
  font-size: $fs-cap;
  color: $gray6;
  line-height: 1.9;
}

/* 命中排查方向时高亮该行 */
.tip-line.hit {
  color: $brand;
  font-weight: 500;
}

/* 菜品库初始化 */
.seed-card .card-title {
  display: block;
  margin-bottom: 12rpx;
}

.seed-btns {
  display: flex;
  gap: 20rpx;
  margin-top: 24rpx;
}

.seed-btn {
  flex: 1;
  padding: 24rpx 20rpx;
  border-radius: 18rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
}

.seed-sync {
  background: $surface-sunken;
}

.seed-reset {
  background: $danger-soft;
}

.seed-btn.disabled {
  opacity: 0.5;
}

.seed-title {
  font-size: $fs-body;
  font-weight: $fw-medium;
}

.seed-sync .seed-title {
  color: $gray7;
}

.seed-reset .seed-title {
  color: $danger;
}

.seed-desc {
  font-size: 20rpx;
  color: $gray6;
  margin-top: 8rpx;
}

.seed-result {
  margin-top: 22rpx;
  padding: 18rpx 20rpx;
  border-radius: 14rpx;
  background: $surface-sunken;
}

.seed-result-text {
  font-size: 23rpx;
  color: $gray7;
  line-height: 1.6;
}

/* 底部按钮 */
.action-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  gap: 20rpx;
  padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom));
  background: $surface;
  box-shadow: 0 -4rpx 16rpx rgba(0, 0, 0, 0.05);
}

.btn-ghost,
.btn-primary {
  flex: 1;
  height: 88rpx;
  border-radius: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: $fs-card;
}

.btn-ghost {
  color: $brand;
  border: 2rpx solid $brand;
}

.btn-primary {
  color: $surface;
  font-weight: 500;
  background: linear-gradient(135deg, $brand, $brand-dark);
}

.btn-ghost.disabled,
.btn-primary.disabled {
  opacity: 0.6;
}
</style>
