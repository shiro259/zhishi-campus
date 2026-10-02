<template>
  <view class="login-page">
    <!-- ================= 品牌区 ================= -->
    <view class="brand">
      <view class="brand-logo">🍜</view>
      <text class="brand-name">食遇校园</text>
      <text class="brand-slogan">AI 智能食堂，治好你的选择困难</text>
    </view>

    <!-- ================= 昵称 ================= -->
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

    <!-- ================= 头像 ================= -->
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

    <!-- ================= 身份 ================= -->
    <view class="card">
      <text class="card-label">我的身份</text>
      <view class="role-row">
        <view class="role-chip" :class="{ active: role === 'user' }" @click="role = 'user'">
          <text class="role-name">普通同学</text>
          <text class="role-desc">推荐 · 收藏 · 评价</text>
        </view>
        <view class="role-chip" :class="{ active: role === 'admin' }" @click="role = 'admin'">
          <text class="role-name">管理员</text>
          <text class="role-desc">看板 · 审核 · 配置</text>
        </view>
      </view>
      <text class="hint">管理员可进入 AI 配置后台</text>
    </view>

    <!-- ================= 操作 ================= -->
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
      本项目身份信息保存在本机，仅用于收藏与评价归属，无需账号密码，也不会上传任何个人信息
    </text>
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
import { userApi } from '@/api/index.js'

/** 可选头像（纯 emoji，项目菜品/头像都不使用图片资源） */
const AVATARS = ['😋', '🍚', '🌶️', '🥗', '🍜', '🍱', '🐱', '🐼']

const nickname = ref('')
const avatar = ref(randomAvatar())
const role = ref('user')
const submitting = ref(false)
const wxLoading = ref(false)
/** 编辑模式（从「我的 → 编辑资料」进入）：保存后返回上一页而不是跳首页 */
const isEditMode = ref(false)

/** 随机挑一个头像作为默认值 */
function randomAvatar() {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)]
}

function toast(title) {
  uni.showToast({ title, icon: 'none' })
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
      if (profile.role) role.value = profile.role
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
    const saved = userApi.saveProfile({
      nickname: name,
      avatar: avatar.value,
      role: role.value
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

    const saved = userApi.saveProfile({ nickname: name, avatar: av, role: role.value })
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
