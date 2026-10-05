<template>
  <view class="page">
    <view class="header">
      <text class="title">AI 推荐配置</text>
      <text class="subtitle">配置大模型 API 参数</text>
    </view>

    <view class="form">
      <view class="form-item">
        <text class="label">AI 服务商</text>
        <picker :range="providers" :value="providerIndex" @change="onProviderChange">
          <view class="picker-value">{{ providers[providerIndex] }}</view>
        </picker>
      </view>

      <view class="form-item">
        <text class="label">API Key</text>
        <!-- 云函数只回传掩码，拿不到明文，所以留空表示「沿用云端已有的 Key」 -->
        <text class="key-state" :class="{ 'key-state-ok': hasKey }">
          {{ hasKey ? '当前已配置：' + maskedKey : '当前未配置，请填写后保存' }}
        </text>
        <input
          class="input"
          v-model="form.api_key"
          :placeholder="hasKey ? '留空则沿用已有 Key（修改模型/温度无需重填）' : '请输入大模型 API Key'"
          password
        />
      </view>

      <view class="form-item">
        <text class="label">模型名称</text>
        <input
          class="input"
          v-model="form.model"
          placeholder="如：deepseek-chat / qwen-turbo"
        />
      </view>

      <view class="form-item">
        <text class="label">API 地址</text>
        <input
          class="input"
          v-model="form.base_url"
          placeholder="https://api.deepseek.com/v1"
        />
      </view>

      <view class="form-item">
        <text class="label">温度 (Temperature)</text>
        <slider
          :value="form.temperature"
          :min="0"
          :max="2"
          :step="0.1"
          show-value
          @change="onTempChange"
        />
      </view>
    </view>

    <view class="section">
      <text class="section-title">Prompt 模板预览</text>
      <view class="prompt-box">
        <text class="prompt-text">{{ promptPreview }}</text>
      </view>
    </view>

    <view class="actions">
      <button class="btn-save" @click="save">保存配置</button>
      <button class="btn-test" @click="testConnection">测试连接</button>
    </view>

    <!-- ================= 管理员口令 ================= -->
    <view class="section">
      <text class="section-title">管理员口令</text>
      <view class="card-box">
        <text class="pwd-state" :class="{ 'pwd-state-warn': usingDefaultPassword }">
          {{ usingDefaultPassword
            ? '⚠️ 当前仍在使用默认口令 admin123，建议立即修改'
            : '当前管理员账号：' + (adminUsername || 'admin') }}
        </text>
        <input
          class="input pwd-input"
          v-model="pwdForm.oldPwd"
          password
          placeholder="原口令"
        />
        <input
          class="input pwd-input"
          v-model="pwdForm.newPwd"
          password
          placeholder="新口令（至少 6 位）"
        />
        <input
          class="input pwd-input"
          v-model="pwdForm.newPwd2"
          password
          placeholder="再次输入新口令"
        />
        <button class="btn-pwd" :disabled="pwdSubmitting" @click="changePassword">
          {{ pwdSubmitting ? '提交中…' : '修改口令' }}
        </button>
        <text class="pwd-hint">
          口令以 SHA-256 哈希保存在云端，不存明文。修改成功后旧登录凭证会立即失效，
          需要用新口令重新登录。
        </text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { getAdminToken, clearAdminToken, explainCloudError } from '@/api/index.js'
import { ensureAdmin } from '@/common/utils.js'

const providers = ['通义千问', 'DeepSeek', '智谱GLM', 'Kimi']

const providerIndex = ref(0)
const form = ref({
  api_key: '',
  model: 'qwen-turbo',
  base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  temperature: 0.7
})

const hasKey = ref(false)
const maskedKey = ref('')
/** 云函数回传的当前管理员账号 / 是否仍在用默认口令 */
const adminUsername = ref('')
const usingDefaultPassword = ref(false)

/** 修改口令表单 */
const pwdForm = ref({ oldPwd: '', newPwd: '', newPwd2: '' })
const pwdSubmitting = ref(false)

const promptPreview = computed(() => {
  return `你是校园食堂美食推荐专家"食遇AI"。
学生可以和你聊天，问你想吃什么、要推荐。
你会根据学生的口味偏好、忌口、预算，从菜品库中推荐最合适的菜。`
})

onLoad(async () => {
  // 这一页原先完全没有守卫；而且它读写的东西（API Key、base_url）最敏感
  if (!(await ensureAdmin())) return
  loadConfig()
})

/** 云函数统一从这里取凭证；过期/未登录都会被服务端拒绝 */
function authToken() {
  return getAdminToken()
}

function loadConfig() {
  uniCloud.callFunction({
    name: 'shiyu-config',
    data: { action: 'get', token: authToken() },
    success: (res) => {
      if (res.result && res.result.code === 0 && res.result.data) {
        var cfg = res.result.data
        hasKey.value = cfg.has_key || false
        maskedKey.value = cfg.api_key || ''
        adminUsername.value = cfg.admin_username || ''
        usingDefaultPassword.value = !!cfg.using_default_password
        form.value.model = cfg.model || 'qwen-turbo'
        form.value.base_url = cfg.base_url || 'https://dashscope.aliyuncs.com/compatible-mode/v1'
        if (typeof cfg.temperature === 'number') form.value.temperature = cfg.temperature
        var providerConfigs = [
          { model: 'qwen-turbo', index: 0 },
          { model: 'deepseek-chat', index: 1 },
          { model: 'glm-4-flash', index: 2 },
          { model: 'moonshot-v1-8k', index: 3 }
        ]
        var match = providerConfigs.find(function(p) { return cfg.model === p.model })
        if (match) providerIndex.value = match.index
      } else {
        // 凭证过期 / 未登录：云函数会明确告诉我们，别再静默忽略
        uni.showToast({
          title: (res.result && res.result.message) || '读取配置失败',
          icon: 'none',
          duration: 2500
        })
      }
    },
    fail: (err) => {
      showCloudError(err, '读取配置失败')
    }
  })
}

/**
 * 云函数调用失败时把真实原因完整展示出来
 *
 * explainCloudError 会区分「域名不在白名单 / 云函数没上传 / 超时 / 云空间未关联」，
 * 而这些说明是多行的，toast 装不下，所以用 showModal。
 */
function showCloudError(err, title) {
  const msg = explainCloudError((err && (err.errMsg || err.message)) || '未知错误')
  uni.showModal({ title: title || '云函数调用失败', content: msg, showCancel: false })
}

function onProviderChange(e) {
  providerIndex.value = e.detail.value
  var configs = [
    { model: 'qwen-turbo', base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
    { model: 'deepseek-chat', base_url: 'https://api.deepseek.com/v1' },
    { model: 'glm-4-flash', base_url: 'https://open.bigmodel.cn/api/paas/v4' },
    { model: 'moonshot-v1-8k', base_url: 'https://api.moonshot.cn/v1' }
  ]
  var cfg = configs[e.detail.value]
  form.value.model = cfg.model
  form.value.base_url = cfg.base_url
}

function onTempChange(e) {
  form.value.temperature = e.detail.value
}

function save() {
  // 云端已经存过 Key 时允许留空（表示沿用），只有从未配置过才强制填写。
  // 因为云函数只回传掩码，明文不可能回填到输入框里。
  if (!form.value.api_key && !hasKey.value) {
    uni.showToast({ title: '请先填写 API Key', icon: 'none' })
    return
  }
  uni.showLoading({ title: '保存中...' })
  // token 来自云函数 admin-login 签发的凭证（存在 shiyu_admin_token）。
  // 服务端会用 HMAC 验签 + 过期时间 + 口令摘要来判定，客户端无法伪造。
  // 老版本这里读的是从未写入过的 admin_token / userInfo.is_admin，
  // 而云函数又只判断「token 非空」，于是既存不进 Key、又人人可改配置。
  uniCloud.callFunction({
    name: 'shiyu-config',
    data: {
      action: 'save',
      token: authToken(),
      api_key: form.value.api_key,
      provider: form.value.model.indexOf('qwen') >= 0 ? 'qwen' : 'other',
      model: form.value.model,
      base_url: form.value.base_url,
      temperature: form.value.temperature
    },
    success: (res) => {
      uni.hideLoading()
      if (res.result && res.result.code === 0) {
        uni.showToast({ title: '配置已保存到云端', icon: 'success' })
        setTimeout(function() { uni.navigateBack() }, 1000)
      } else {
        uni.showToast({ title: res.result.message || '保存失败', icon: 'none' })
      }
    },
    fail: (err) => {
      uni.hideLoading()
      showCloudError(err, '保存失败')
    }
  })
}

function testConnection() {
  uni.showLoading({ title: '测试连接中...' })
  uniCloud.callFunction({
    name: 'shiyu-config',
    data: { action: 'test', token: authToken() },
    success: (res) => {
      uni.hideLoading()
      if (res.result && res.result.code === 0) {
        uni.showToast({ title: '连接成功', icon: 'success' })
      } else {
        uni.showToast({ title: res.result.message || '连接失败', icon: 'none', duration: 3000 })
      }
    },
    fail: (err) => {
      uni.hideLoading()
      showCloudError(err, '测试连接失败')
    }
  })
}

/**
 * 修改管理员口令
 *
 * 校验在服务端做（要比对原口令、要求新口令长度）。
 * 因为 token 签名里掺了口令哈希摘要，改完口令旧凭证会立即全部失效，
 * 所以这里成功后直接清本地凭证并把人送回登录页。
 */
function changePassword() {
  if (pwdSubmitting.value) return
  var oldPwd = String(pwdForm.value.oldPwd || '')
  var newPwd = String(pwdForm.value.newPwd || '')
  var newPwd2 = String(pwdForm.value.newPwd2 || '')

  if (!oldPwd) return uni.showToast({ title: '请输入原口令', icon: 'none' })
  if (newPwd.length < 6) return uni.showToast({ title: '新口令至少 6 位', icon: 'none' })
  if (newPwd !== newPwd2) return uni.showToast({ title: '两次输入的新口令不一致', icon: 'none' })

  pwdSubmitting.value = true
  uni.showLoading({ title: '提交中...' })
  uniCloud.callFunction({
    name: 'shiyu-config',
    data: {
      action: 'change-password',
      token: authToken(),
      old_password: oldPwd,
      new_password: newPwd
    },
    success: (res) => {
      uni.hideLoading()
      pwdSubmitting.value = false
      if (res.result && res.result.code === 0) {
        clearAdminToken()
        pwdForm.value = { oldPwd: '', newPwd: '', newPwd2: '' }
        uni.showModal({
          title: '口令已修改',
          content: res.result.message || '请用新口令重新登录',
          showCancel: false,
          success: function() {
            uni.reLaunch({ url: '/pages/login/login' })
          }
        })
      } else {
        uni.showToast({ title: (res.result && res.result.message) || '修改失败', icon: 'none', duration: 2500 })
      }
    },
    fail: (err) => {
      uni.hideLoading()
      pwdSubmitting.value = false
      showCloudError(err, '修改口令失败')
    }
  })
}
</script>

<style scoped>
.page { min-height: 100vh; background: #f5f5f5; }
.header { padding: 40rpx 30rpx 20rpx; }
.title { font-size: 40rpx; font-weight: 700; color: #333; display: block; }
.subtitle { font-size: 26rpx; color: #999; margin-top: 8rpx; display: block; }
.form { background: #fff; margin: 20rpx; border-radius: 16rpx; padding: 10rpx 30rpx; }
.form-item { padding: 24rpx 0; border-bottom: 1rpx solid #f0f0f0; }
.form-item:last-child { border-bottom: none; }
.label { font-size: 28rpx; color: #333; font-weight: 500; display: block; margin-bottom: 16rpx; }
.key-state { font-size: 24rpx; color: #FF4D4F; display: block; margin-bottom: 12rpx; }
.key-state-ok { color: #52C41A; }
.input { height: 80rpx; background: #f8f8f8; border-radius: 12rpx; padding: 0 20rpx; font-size: 28rpx; }
.picker-value { height: 80rpx; line-height: 80rpx; background: #f8f8f8; border-radius: 12rpx; padding: 0 20rpx; font-size: 28rpx; }
.section { margin: 30rpx; }
.section-title { font-size: 30rpx; font-weight: 600; color: #333; display: block; margin-bottom: 16rpx; }
.prompt-box { background: #fff; border-radius: 16rpx; padding: 24rpx; }
.prompt-text { font-size: 24rpx; color: #666; line-height: 1.8; }
.actions { padding: 30rpx; display: flex; gap: 20rpx; }
.btn-save { flex: 1; background: #ff6b35; color: #fff; border: none; border-radius: 12rpx; font-size: 30rpx; }
.btn-test { flex: 1; background: #fff; color: #ff6b35; border: 2rpx solid #ff6b35; border-radius: 12rpx; font-size: 30rpx; }

/* 管理员口令 */
.card-box { background: #fff; border-radius: 16rpx; padding: 24rpx; }
.pwd-state { font-size: 24rpx; color: #666; display: block; margin-bottom: 20rpx; }
.pwd-state-warn { color: #FF4D4F; }
.pwd-input { margin-bottom: 16rpx; }
.btn-pwd { background: #333; color: #fff; border: none; border-radius: 12rpx; font-size: 28rpx; margin-top: 8rpx; }
.pwd-hint { font-size: 22rpx; color: #999; line-height: 1.7; display: block; margin-top: 16rpx; }
</style>
