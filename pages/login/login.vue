<template>
  <view class="login-page">
    <!-- ================= 品牌区 ================= -->
    <view class="brand">
      <view class="brand-logo">🍜</view>
      <text class="brand-name">食遇校园</text>
      <text class="brand-slogan">AI 智能食堂，治好你的选择困难</text>
    </view>

    <!-- ================= 身份入口（仅用于选择入口，不再直接授予管理员身份） ================= -->
    <view class="card">
      <text class="card-label">我是</text>
      <view class="role-row">
        <view class="role-chip" :class="{ active: mode === 'student' }" @click="switchMode('student')">
          <text class="role-name">普通同学</text>
          <text class="role-desc">推荐 · 收藏 · 评价</text>
        </view>
        <view class="role-chip" :class="{ active: mode === 'admin' }" @click="switchMode('admin')">
          <text class="role-name">管理员</text>
          <text class="role-desc">需账号口令校验</text>
        </view>
      </view>
      <text class="hint">管理员身份必须通过账号口令认证，不能自行选择</text>
    </view>

    <!-- ================= 学生：昵称 / 头像 ================= -->
    <template v-if="mode === 'student'">
      <view class="card">
        <text class="card-label">
          我的昵称
          <text class="required">*</text>
        </text>
        <input
          class="input"
          v-model="nickname"
          type="text"
          maxlength="12"
          placeholder="2~12 个字，例如：干饭王小食"
          placeholder-class="ph"
          @confirm="submit"
        />
        <text class="hint">用于评价、收藏的署名展示</text>
      </view>

      <view class="card">
        <text class="card-label">挑一个头像</text>
        <view class="avatar-row">
          <view
            class="avatar-item"
            v-for="a in AVATARS"
            :key="a"
            :class="{ active: avatar === a }"
            @click="avatar = a"
          >{{ a }}</view>
        </view>
      </view>

      <button
        class="submit-btn"
        :class="{ 'is-disabled': submitting }"
        :disabled="submitting"
        @click="submit"
      >
        {{ submitting ? '正在进入…' : '进入食遇校园' }}
      </button>

      <view class="wechat-btn" :class="{ disabled: wxLoading }" @click="wxLogin">
        <text class="wechat-icon">💬</text>
        <text class="wechat-text">{{ wxLoading ? '正在尝试微信登录…' : '微信一键登录' }}</text>
      </view>

      <text class="footer">
        同学身份保存在本机，仅用于收藏与评价归属，无需注册账号，也不会上传任何个人信息
      </text>
    </template>

    <!-- ================= 管理员：账号 + 口令 ================= -->
    <template v-else>
      <view class="card">
        <text class="card-label">管理员账号</text>
        <input
          class="input"
          v-model="adminUsername"
          type="text"
          placeholder="请输入管理员账号"
          placeholder-class="ph"
        />
        <text class="card-label admin-pwd-label">管理员口令</text>
        <input
          class="input"
          v-model="adminPassword"
          password
          placeholder="请输入管理员口令"
          placeholder-class="ph"
          @confirm="adminLogin"
        />
        <text class="hint">
          首次使用默认账号 admin、口令 admin123，登录后请尽快到「AI 配置」页修改
        </text>
      </view>

      <button
        class="submit-btn"
        :class="{ 'is-disabled': adminSubmitting }"
        :disabled="adminSubmitting"
        @click="adminLogin"
      >
        {{ adminSubmitting ? '正在校验…' : '管理员登录' }}
      </button>

      <text class="footer">
        管理员凭证由云函数校验账号口令后签发并保存在本机，7 天后过期，口令不会上传
      </text>
    </template>
  </view>
</template>

<script setup>
/**
 * 本地身份登录页
 *
 * 迁移到 uniCloud 架构后不再有「后端登录接口」：
 * 身份 = 本机随机 uid + 本机保存的昵称/头像/角色（uni.storage），
 * 评价与收藏都以此 uid 作为归属依据，因此无需密码、无需服务端会话。
 * 微信一键登录为可选增强能力，未关联云空间/非微信端时静默降级为手动填写。
 */
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { userApi, adminAuthApi } from '@/api/index.js'

/** 可选头像（纯 emoji，项目菜品/头像都不使用图片资源） */
const AVATARS = ['😋', '🍚', '🌶️', '🥗', '🍜', '🍱', '🐱', '🐼']

/** 入口模式：student = 同学（本地身份，无需注册）/ admin = 管理员（必须账号口令认证） */
const mode = ref('student')

const nickname = ref('')
const avatar = ref(randomAvatar())
const submitting = ref(false)
const wxLoading = ref(false)
/** 编辑模式（从「我的 → 编辑资料」进入）：保存后返回上一页而不是跳首页 */
const isEditMode = ref(false)

/** 管理员登录表单 */
const adminUsername = ref('admin')
const adminPassword = ref('')
const adminSubmitting = ref(false)

/** 随机挑一个头像作为默认值 */
function randomAvatar() {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)]
}

function toast(title) {
  uni.showToast({ title, icon: 'none' })
}

/** 切换入口：管理员只是切到表单，并不会因此获得管理员身份 */
function switchMode(m) {
  mode.value = m
  if (m === 'admin') adminPassword.value = ''
}

/**
 * 同学入口要写入的角色
 *
 * 同学表单里没有角色选项，所以这里永远不可能是管理员 —— 无法自行提权。
 * 但本机若已经是管理员（此前通过账号口令认证过），就必须保持管理员：
 * 管理员也要能用普通功能（浏览、AI 推荐、评价），
 * 让他编辑一下昵称或点一次微信登录就被降权，是明显的 bug。
 */
function studentRole() {
  try {
    const p = userApi.getProfile()
    return p && p.role === 'admin' ? 'admin' : 'user'
  } catch (e) {
    return 'user'
  }
}

/**
 * 管理员登录
 *
 * 身份不再由前端自己决定：必须把账号口令交给云函数校验，
 * 通过后才拿到 HMAC 签名的凭证，并据此写入 role: 'admin'。
 * 校验失败就什么也不改，避免出现「点一下就是管理员」。
 */
async function adminLogin() {
  if (adminSubmitting.value) return

  const name = String(adminUsername.value || '').trim()
  const pwd = String(adminPassword.value || '')
  if (!name) return toast('请输入管理员账号')
  if (!pwd) return toast('请输入管理员口令')

  adminSubmitting.value = true
  try {
    const res = await adminAuthApi.login(name, pwd)
    adminPassword.value = ''

    if (res && res.using_default_password) {
      uni.showModal({
        title: '登录成功',
        content: '当前仍在使用默认口令 admin123。可到「管理后台 → AI 配置 → 管理员口令」修改。',
        confirmText: '去修改',
        cancelText: '稍后再说',
        success: (m) => {
          // 用 reLaunch：登录页的历史不该留在后台页面后面，
          // 否则在后台按返回会回到登录页，看起来像被踢出去了
          uni.reLaunch({ url: m && m.confirm ? '/pages/admin/ai-config' : '/pages/admin/index' })
        }
      })
    } else {
      uni.showToast({ title: '管理员登录成功', icon: 'success' })
      setTimeout(() => uni.reLaunch({ url: '/pages/admin/index' }), 700)
    }
  } catch (e) {
    // 账号口令错误 / 云函数未上传 / 云空间未关联，都原样提示，便于定位
    toast((e && e.message) || '管理员登录失败')
  } finally {
    adminSubmitting.value = false
  }
}

onLoad((options) => {
  // 从「我的 → 编辑资料」进入时为编辑模式，保存后返回上一页
  isEditMode.value = !!(options && options.mode === 'edit')

  // 已有本地身份时回填，方便同学改昵称 / 切身份
  try {
    const profile = userApi.getProfile()
    if (profile) {
      if (profile.nickname) nickname.value = profile.nickname
      if (profile.avatar) avatar.value = profile.avatar
    }
  } catch (e) {
    // 读取失败不阻塞填写
  }
})

/** 校验昵称，返回错误文案；通过则返回空串 */
function validateNickname(name) {
  if (!name) return '请先填写昵称'
  if (name.length < 2) return '昵称至少 2 个字'
  if (name.length > 12) return '昵称最多 12 个字'
  return ''
}

/** 进入主页面：优先 switchTab，失败退栈，最后兜底 reLaunch */
function goHome() {
  // 从「我的 → 编辑资料」进来时只改资料，保存后应该退回来而不是跳首页
  if (isEditMode.value) {
    uni.navigateBack({
      fail: () => {
        uni.switchTab({ url: '/pages/index/index' })
      }
    })
    return
  }

  uni.switchTab({
    url: '/pages/index/index',
    fail: () => {
      uni.navigateBack({
        fail: () => {
          uni.reLaunch({ url: '/pages/index/index' })
        }
      })
    }
  })
}

/** 保存本地身份并进入首页 */
async function submit() {
  if (submitting.value) return

  const name = String(nickname.value || '').trim()
  const err = validateNickname(name)
  if (err) {
    toast(err)
    return
  }

  submitting.value = true
  try {
    // 角色由 studentRole() 决定：普通同学固定为 'user'（表单里没有角色选项，
    // 所以无法自行提权）；但如果本机已经是管理员就不能降级 —— 管理员也要能用
    // 普通功能，改个昵称就把自己降权显然不对。
    const saved = userApi.saveProfile({
      nickname: name,
      avatar: avatar.value,
      role: studentRole()
    })
    if (!saved) throw new Error('本机存储不可用')

    uni.showToast({ title: '欢迎，' + name, icon: 'none' })
    setTimeout(goHome, 700)
  } catch (e) {
    toast((e && e.message) || '身份保存失败，请重试')
  } finally {
    submitting.value = false
  }
}

/** 微信一键登录：任何失败都静默降级，绝不卡死流程 */
async function wxLogin() {
  if (wxLoading.value) return
  wxLoading.value = true
  try {
    const res = await userApi.wechatLogin()
    const info = res || {}
    // 拿不到微信昵称/头像时用兜底值，保证流程能走完
    const name = String(info.nickName || info.nickname || '微信同学').slice(0, 12)
    const av = info.avatarUrl || info.avatar || randomAvatar()

    nickname.value = name
    avatar.value = av

    // 微信一键登录只是拿到 openid 作为本机 uid，属于「身份」而非「认证」，
    // 所以它不会授予管理员；但同样不能把已是管理员的身份降级
    const saved = userApi.saveProfile({ nickname: name, avatar: av, role: studentRole() })
    if (!saved) throw new Error('本机存储不可用')

    uni.showToast({ title: '微信登录成功', icon: 'none' })
    setTimeout(goHome, 700)
  } catch (e) {
    // 非微信端 / 未关联服务空间 / 用户取消 → 统一降级提示
    uni.showToast({ title: '当前环境不支持微信登录，请手动填写', icon: 'none' })
  } finally {
    wxLoading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  padding: 60rpx 40rpx 40rpx;
  background: linear-gradient(180deg, #fff3ed 0%, #f5f5f5 340rpx);
  box-sizing: border-box;
}

/* ---------------- 品牌区 ---------------- */
.brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 50rpx;
}

.brand-logo {
  width: 150rpx;
  height: 150rpx;
  border-radius: 40rpx;
  background: linear-gradient(135deg, #fff3ed, #ffe4d6);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 84rpx;
  box-shadow: 0 8rpx 24rpx rgba(255, 107, 53, 0.18);
}

.brand-name {
  font-size: 46rpx;
  font-weight: bold;
  color: #333;
  margin-top: 24rpx;
}

.brand-slogan {
  font-size: 25rpx;
  color: #999;
  margin-top: 10rpx;
}

/* ---------------- 卡片 ---------------- */
.card {
  background: #fff;
  border-radius: 24rpx;
  padding: 28rpx 30rpx;
  margin-bottom: 24rpx;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.03);
}

.card-label {
  display: block;
  font-size: 27rpx;
  color: #333;
  font-weight: 500;
  margin-bottom: 18rpx;
}

.required {
  color: #ff4d4f;
  font-size: 26rpx;
}

/* 管理员表单里第二个字段标签，需要与上方输入框拉开距离 */
.admin-pwd-label {
  margin-top: 26rpx;
}

.input {
  width: 100%;
  height: 84rpx;
  background: #f8f8f8;
  border-radius: 16rpx;
  padding: 0 24rpx;
  font-size: 28rpx;
  color: #333;
  box-sizing: border-box;
}

.ph {
  color: #bbb;
  font-size: 26rpx;
}

.hint {
  display: block;
  font-size: 21rpx;
  color: #aaa;
  margin-top: 14rpx;
  line-height: 1.5;
}

/* ---------------- 头像 ---------------- */
.avatar-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.avatar-item {
  width: 88rpx;
  height: 88rpx;
  border-radius: 24rpx;
  background: linear-gradient(135deg, #fff3ed, #ffe4d6);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 44rpx;
  border: 4rpx solid transparent;
  box-sizing: border-box;
}

.avatar-item.active {
  border-color: #ff6b35;
  box-shadow: 0 4rpx 14rpx rgba(255, 107, 53, 0.3);
}

/* ---------------- 身份 ---------------- */
.role-row {
  display: flex;
  gap: 20rpx;
}

.role-chip {
  flex: 1;
  border-radius: 18rpx;
  border: 2rpx solid #eee;
  padding: 20rpx 16rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #fafafa;
}

.role-chip.active {
  border-color: #ff6b35;
  background: #fff3ed;
}

.role-name {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
}

.role-chip.active .role-name {
  color: #ff6b35;
}

.role-desc {
  font-size: 20rpx;
  color: #aaa;
  margin-top: 8rpx;
}

/* ---------------- 按钮 ---------------- */
.submit-btn {
  margin-top: 40rpx;
  height: 92rpx;
  line-height: 92rpx;
  border-radius: 46rpx;
  background: linear-gradient(135deg, #ff8c5a, #ff6b35);
  color: #fff;
  font-size: 31rpx;
  font-weight: 500;
  border: none;
  box-shadow: 0 10rpx 24rpx rgba(255, 107, 53, 0.3);
}

.submit-btn[disabled],
.submit-btn.is-disabled {
  background: #ffc7ae;
  color: #fff;
  box-shadow: none;
}

.wechat-btn {
  margin-top: 28rpx;
  height: 88rpx;
  border-radius: 44rpx;
  background: #fff;
  border: 2rpx solid #e8e8e8;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  color: #333;
}

.wechat-btn.disabled {
  opacity: 0.6;
}

.wechat-icon {
  font-size: 32rpx;
  margin-right: 12rpx;
}

.footer {
  display: block;
  font-size: 21rpx;
  color: #bbb;
  text-align: center;
  line-height: 1.7;
  margin-top: 50rpx;
  padding: 0 20rpx;
}
</style>
