<template>
  <view class="login-page">
    <!-- ================= 品牌区 ================= -->
    <view class="brand">
      <view class="brand-logo">
        <Icon name="bowl" :size="72" color="#FF5A36" />
      </view>
      <text class="brand-name">{{ isEditMode ? '编辑资料' : '食遇校园' }}</text>
      <text class="brand-slogan">AI 智能食堂 · 治好选择困难</text>
    </view>

    <!-- ================= 表单卡片 ================= -->
    <view class="card">
      <text class="field-label is-first">昵称</text>
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

      <text class="field-label">选择头像</text>
      <view class="avatar-row">
        <view
          class="avatar-item"
          v-for="a in AVATARS"
          :key="a"
          :class="{ active: avatar === a }"
          @click="avatar = a"
        >{{ a }}</view>
      </view>

      <text class="field-label">进入身份</text>
      <view class="role-row">
        <view class="role-card" :class="{ active: role === 'user' }" @click="role = 'user'">
          <text class="role-name">普通同学</text>
          <text class="role-desc">可以推荐、评价</text>
          <view v-if="role === 'user'" class="role-check">
            <Icon name="check" :size="28" color="#FF5A36" />
          </view>
        </view>
        <view class="role-card" :class="{ active: role === 'admin' }" @click="role = 'admin'">
          <text class="role-name">管理员</text>
          <text class="role-desc">可进入管理后台</text>
          <view v-if="role === 'admin'" class="role-check">
            <Icon name="check" :size="28" color="#FF5A36" />
          </view>
        </view>
      </view>
    </view>

    <!-- ================= 操作 ================= -->
    <button
      class="submit-btn"
      :class="{ 'is-disabled': submitting }"
      :disabled="submitting"
      @click="submit"
    >{{ submitText }}</button>

    <view class="divider">
      <view class="divider-line" />
      <text class="divider-text">或</text>
      <view class="divider-line" />
    </view>

    <view class="wechat-btn" :class="{ disabled: wxLoading }" @click="wxLogin">
      <view class="wechat-icon">
        <Icon name="user" :size="32" color="#4A443F" />
      </view>
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
import { computed, ref } from 'vue'
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

/** 主按钮文案：编辑模式为「保存」，首次进入为「进入食遇校园」 */
const submitText = computed(() => {
  if (submitting.value) return isEditMode.value ? '正在保存…' : '正在进入…'
  return isEditMode.value ? '保存' : '进入食遇校园'
})

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

<style lang="scss" scoped>
@import '@/common/tokens.scss';
.login-page {
  min-height: 100vh;
  padding: 100rpx $gap-page 60rpx;
  background: $canvas;
  box-sizing: border-box;
}

/* ---------------- 品牌区 ---------------- */
.brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 48rpx;
}

.brand-logo {
  width: 128rpx;
  height: 128rpx;
  border-radius: $radius-lg;
  background: $brand-soft;
  display: flex;
  align-items: center;
  justify-content: center;
}

.brand-name {
  font-size: $fs-title;
  font-weight: $fw-bold;
  color: $ink;
  letter-spacing: -0.6rpx;
  margin-top: $gap-lg;
}

.brand-slogan {
  font-size: $fs-cap;
  color: $gray6;
  margin-top: $gap-sm;
}

/* ---------------- 表单卡片 ---------------- */
.card {
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius-card;
  padding: $gap-card;
  box-shadow: $shadow-card;
}

.field-label {
  display: block;
  font-size: $fs-cap;
  color: $gray6;
  margin-top: $gap-lg;
}

.field-label.is-first {
  margin-top: 0;
}

.input {
  width: 100%;
  height: $h-input;
  background: $surface-sunken;
  border-radius: $radius;
  padding: 0 24rpx;
  font-size: $fs-body;
  color: $ink;
  box-sizing: border-box;
}

.ph {
  color: $gray4;
  font-size: $fs-body;
}

.hint {
  display: block;
  font-size: $fs-tag;
  color: $gray4;
  margin-top: $gap-sm;
  line-height: 1.6;
}

/* ---------------- 头像（emoji 属于用户内容，保留） ---------------- */
.avatar-row {
  display: flex;
  flex-wrap: wrap;
  gap: $gap-sm;
}

.avatar-item {
  width: 88rpx;
  height: 88rpx;
  border-radius: $radius;
  background: $surface-sunken;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40rpx;
  border: 4rpx solid transparent;
  box-sizing: border-box;
}

.avatar-item.active {
  background: $brand-soft;
  border-color: $brand;
}

/* ---------------- 身份 ---------------- */
.role-row {
  display: flex;
  gap: $gap;
}

.role-card {
  position: relative;
  flex: 1;
  min-width: 0;
  background: $surface;
  border: 2rpx solid $line;
  border-radius: $radius;
  padding: $gap;
  box-sizing: border-box;
}

.role-card.active {
  background: $brand-soft;
  border-color: $brand-line;
}

.role-name {
  display: block;
  font-size: $fs-body;
  font-weight: $fw-medium;
  color: $ink;
}

.role-desc {
  display: block;
  font-size: $fs-tag;
  color: $gray6;
  margin-top: 6rpx;
}

.role-check {
  position: absolute;
  top: 16rpx;
  right: 16rpx;
}

/* ---------------- 操作 ---------------- */
.submit-btn {
  margin-top: 48rpx;
  height: $h-btn;
  line-height: $h-btn;
  border-radius: $radius-pill;
  background: $brand;
  color: #fff;
  font-size: $fs-card;
  font-weight: $fw-medium;
  border: none;
  box-shadow: $shadow-brand;
}

.submit-btn.is-disabled {
  opacity: 0.6;
  box-shadow: none;
}

.divider {
  display: flex;
  align-items: center;
  margin-top: $gap-lg;
}

.divider-line {
  flex: 1;
  height: 2rpx;
  background: $line;
}

.divider-text {
  font-size: $fs-tag;
  color: $gray4;
  padding: 0 $gap;
}

.wechat-btn {
  margin-top: $gap-lg;
  height: $h-btn;
  border-radius: $radius-pill;
  background: $surface;
  border: 2rpx solid $line;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.wechat-btn.disabled {
  opacity: 0.6;
}

.wechat-icon {
  margin-right: $gap-sm;
}

.wechat-text {
  font-size: $fs-body;
  color: $gray7;
}

.footer {
  display: block;
  font-size: $fs-tag;
  color: $gray4;
  text-align: center;
  line-height: 1.6;
  margin-top: 48rpx;
  padding: 0 $gap;
}
</style>
