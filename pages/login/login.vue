<template>
  <view class="login-page">
    <view class="logo-area">
      <view class="logo">🍜</view>
      <text class="app-name">食遇校园</text>
      <text class="slogan">AI 智能食堂推荐 · 告别选择困难</text>
    </view>

    <view class="login-btn" @click="wechatLogin">
      <text class="wx-icon">💬</text>
      <text>微信一键登录</text>
    </view>

    <view class="admin-entry" @click="showAdminLogin = true">
      <text>管理员入口</text>
    </view>

    <!-- 管理员登录弹窗 -->
    <view class="modal" v-if="showAdminLogin" @click.self="showAdminLogin = false">
      <view class="modal-content">
        <text class="modal-title">管理员登录</text>
        <input class="input" v-model="adminForm.username" placeholder="账号" />
        <input class="input" v-model="adminForm.password" placeholder="密码" password="true" />
        <view class="modal-btns">
          <view class="btn-cancel" @click="showAdminLogin = false">取消</view>
          <view class="btn-confirm" @click="adminLogin">登录</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { authApi } from '@/api/index.js'
import { setToken } from '@/api/request.js'
import { saveUserInfo } from '@/common/utils.js'

const showAdminLogin = ref(false)
const adminForm = ref({ username: '', password: '' })

// 微信登录
function wechatLogin() {
  uni.login({
    provider: 'weixin',
    success: async (res) => {
      try {
        uni.showLoading({ title: '登录中...' })
        // 获取用户头像昵称（微信新版需用户主动授权）
        let nickname = '同学'
        let avatar = ''
        // #ifdef MP-WEIXIN
        const userProfile = await new Promise((resolve) => {
          uni.getUserProfile({
            desc: '用于完善用户资料',
            success: (r) => resolve(r.userInfo),
            fail: () => resolve(null)
          })
        })
        if (userProfile) {
          nickname = userProfile.nickName
          avatar = userProfile.avatarUrl
        }
        // #endif

        const data = await authApi.wechatLogin(res.code, nickname, avatar)
        setToken(data.access_token)
        saveUserInfo(data.user)
        uni.hideLoading()
        uni.showToast({ title: '登录成功', icon: 'success' })
        setTimeout(() => {
          uni.switchTab({ url: '/pages/index/index' })
        }, 1000)
      } catch (e) {
        uni.hideLoading()
      }
    },
    fail: () => {
      uni.showToast({ title: '微信登录失败', icon: 'none' })
    }
  })
}

// 管理员登录
async function adminLogin() {
  if (!adminForm.value.username || !adminForm.value.password) {
    uni.showToast({ title: '请输入账号密码', icon: 'none' })
    return
  }
  try {
    const data = await authApi.adminLogin(adminForm.value.username, adminForm.value.password)
    setToken(data.access_token)
    saveUserInfo(data.user)
    uni.showToast({ title: '登录成功', icon: 'success' })
    setTimeout(() => {
      uni.navigateTo({ url: '/pages/admin/index' })
    }, 1000)
  } catch (e) {
    // 错误已在 request 中提示
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #FF6B35 0%, #FF8C5A 50%, #FFF5F0 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 200rpx 60rpx 100rpx;
  box-sizing: border-box;
}

.logo-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 120rpx;
}

.logo {
  font-size: 140rpx;
  margin-bottom: 20rpx;
}

.app-name {
  font-size: 56rpx;
  font-weight: bold;
  color: #fff;
  margin-bottom: 12rpx;
}

.slogan {
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.85);
}

.login-btn {
  width: 100%;
  height: 96rpx;
  background: #fff;
  border-radius: 48rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32rpx;
  color: #07c160;
  font-weight: 500;
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.1);
}

.wx-icon {
  font-size: 36rpx;
  margin-right: 12rpx;
}

.admin-entry {
  margin-top: 40rpx;
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.8);
  text-decoration: underline;
}

.modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}

.modal-content {
  width: 600rpx;
  background: #fff;
  border-radius: 24rpx;
  padding: 40rpx;
  box-sizing: border-box;
}

.modal-title {
  font-size: 32rpx;
  font-weight: bold;
  text-align: center;
  margin-bottom: 30rpx;
}

.input {
  width: 100%;
  height: 80rpx;
  border: 1rpx solid #e0e0e0;
  border-radius: 12rpx;
  padding: 0 20rpx;
  margin-bottom: 20rpx;
  font-size: 28rpx;
  box-sizing: border-box;
}

.modal-btns {
  display: flex;
  gap: 20rpx;
  margin-top: 20rpx;
}

.btn-cancel,
.btn-confirm {
  flex: 1;
  height: 72rpx;
  border-radius: 36rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
}

.btn-cancel {
  background: #f0f0f0;
  color: #666;
}

.btn-confirm {
  background: #FF6B35;
  color: #fff;
}
</style>
