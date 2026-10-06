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
        <!--
          微信小程序里用 type="nickname"：键盘上方会出现「使用微信昵称」的提示，
          点一下即可填入真实微信昵称。
          为什么不让程序自动填：微信从 2022-10-25 起，getUserProfile 返回的是
          匿名数据（昵称「微信用户」+ 灰色默认头像），必须由用户主动确认才能拿到。
        -->
        <input
          class="input"
          v-model="nickname"
          :type="nicknameInputType"
          maxlength="12"
          placeholder="2~12 个字，例如：干饭王小食"
          placeholder-class="ph"
          @confirm="submit"
        />
        <text class="hint">
          <template v-if="isWeixin">点输入框上方弹出的「使用微信昵称」即可一键填入</template>
          <template v-else>用于评价、收藏的署名展示</template>
        </text>
      </view>

      <view class="card">
        <text class="card-label">我的头像</text>

        <!--
          微信头像只能由用户主动选择（微信官方「头像昵称填写能力」）：
          open-type="chooseAvatar" 会拉起微信头像选择器
          （里面有「用微信头像 / 从相册选择 / 拍照」）。
          选完拿到的是临时文件路径，必须上传到云存储才能长期使用。
        -->
        <!-- #ifdef MP-WEIXIN -->
        <button
          class="avatar-pick"
          open-type="chooseAvatar"
          @chooseavatar="onChooseAvatar"
        >
          <image
            v-if="avatarIsImage"
            class="avatar-preview"
            :src="avatar"
            mode="aspectFill"
          />
          <text v-else class="avatar-preview-emoji">{{ avatar }}</text>
        </button>
        <text class="hint">
          {{ avatarUploading ? '头像上传中…' : '点上面的头像可直接用微信头像' }}
        </text>
        <!-- #endif -->

        <!-- 不想用微信头像也没关系：所有端都能从下面挑一个 emoji -->
        <text class="avatar-or">{{ isWeixin ? '或者从下面挑一个 emoji' : '挑一个头像' }}</text>
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

      <!--
        微信一键登录只在微信小程序端有意义：
        H5 / App 端 uni.login 拿不到微信授权码，按钮点了必然失败，
        所以用条件编译直接不渲染（而不是渲染出来再报错）。
      -->
      <!-- #ifdef MP-WEIXIN -->
      <view class="wechat-btn" :class="{ disabled: wxLoading }" @click="wxLogin">
        <text class="wechat-icon">💬</text>
        <text class="wechat-text">{{ wxLoading ? '正在尝试微信登录…' : '微信一键登录' }}</text>
      </view>
      <!-- #endif -->

      <text class="footer">
        同学身份保存在本机，仅用于收藏与评价归属，无需注册账号，也不会上传任何个人信息
      </text>
    </template>

    <!-- ================= 管理员：管理口令 ================= -->
    <template v-else>
      <view class="card">
        <text class="card-label">管理口令</text>
        <input
          class="input"
          v-model="adminPassword"
          password
          placeholder="请输入管理口令"
          placeholder-class="ph"
          @confirm="adminLogin"
        />
      </view>

      <button
        class="submit-btn"
        :class="{ 'is-disabled': adminSubmitting }"
        :disabled="adminSubmitting"
        @click="adminLogin"
      >
        {{ adminSubmitting ? '正在校验…' : '管理员登录' }}
      </button>
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
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { userApi, adminAuthApi, explainCloudError, configApi } from '@/api/index.js'

/** 可选头像（纯 emoji，项目菜品/头像都不使用图片资源） */
const AVATARS = ['😋', '🍚', '🌶️', '🥗', '🍜', '🍱', '🐱', '🐼']

/** 入口模式：student = 同学（本地身份，无需注册）/ admin = 管理员（必须账号口令认证） */
const mode = ref('student')

const nickname = ref('')
const avatar = ref(randomAvatar())
const submitting = ref(false)
const wxLoading = ref(false)
/** 微信头像上传中（上传期间禁用重复点击） */
const avatarUploading = ref(false)
/** 编辑模式（从「我的 → 编辑资料」进入）：保存后返回上一页而不是跳首页 */
const isEditMode = ref(false)

/**
 * 昵称输入框类型
 *
 * 微信小程序用 'nickname' 才会在键盘上方出现「使用微信昵称」的一键填入；
 * 其它端（H5 / App）没有这个类型，用普通 text，否则可能被当成未知类型。
 */
const nicknameInputType = ref('text')
// #ifdef MP-WEIXIN
nicknameInputType.value = 'nickname'
// #endif

/** 当前是否运行在微信小程序里（决定要不要显示微信相关文案与控件） */
const isWeixin = ref(false)
// #ifdef MP-WEIXIN
isWeixin.value = true
// #endif

/**
 * 头像是「可直接交给 <image> 的地址」还是 emoji
 *
 * 微信头像选择器给的是临时文件路径（wxfile:// 或 http://tmp/…），
 * 上传成功后变成 cloud:// 的 fileID —— 两种都能直接显示；
 * emoji 走 <text> 渲染，塞进 <image> 会加载失败。
 */
const avatarIsImage = computed(() =>
  /^(https?:\/\/|cloud:\/\/|wxfile:\/\/|data:image\/)/.test(String(avatar.value || ''))
)

/** 管理员登录表单 */
const adminPassword = ref('')
const adminSubmitting = ref(false)

/** 随机挑一个头像作为默认值 */
function randomAvatar() {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)]
}

/**
 * 把微信选中的头像上传到云存储
 *
 * 为什么必须上传：chooseAvatar 给的是**临时文件路径**（wxfile:// 或 http://tmp/…），
 * 小程序重启后就失效了，直接存下来会变成一个「加载不出来的头像」。
 * 上传后拿到 cloud:// 的 fileID，长期有效，且各端都能显示。
 *
 * @param {string} tempPath 微信头像选择器返回的临时路径
 * @returns {Promise<string>} 云存储 fileID
 */
function uploadAvatar(tempPath) {
  return new Promise((resolve, reject) => {
    if (typeof uniCloud === 'undefined' || !uniCloud || !uniCloud.uploadFile) {
      reject(new Error('云存储不可用：请先在 HBuilderX 中关联 uniCloud 服务空间'))
      return
    }
    const matched = String(tempPath).match(/\.(\w+)$/)
    const ext = matched ? matched[1] : 'png'
    // cloudPath 必须唯一，否则同名会互相覆盖
    const cloudPath = 'avatars/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext

    uniCloud.uploadFile({
      filePath: tempPath,
      cloudPath: cloudPath,
      success: (res) => {
        if (res && res.fileID) resolve(res.fileID)
        else reject(new Error('云存储没有返回 fileID'))
      },
      fail: (err) => reject(new Error((err && (err.errMsg || err.message)) || '上传失败'))
    })
  })
}

/** 微信头像选择器的回调 */
async function onChooseAvatar(e) {
  if (avatarUploading.value) return
  const tempPath = e && e.detail && e.detail.avatarUrl
  if (!tempPath) return

  // 先本地预览，上传成功后替换成云文件 id，交互上不卡顿
  avatar.value = tempPath
  avatarUploading.value = true
  try {
    const fileID = await uploadAvatar(tempPath)
    avatar.value = fileID
    uni.showToast({ title: '头像已设置', icon: 'none' })
  } catch (err) {
    // 上传失败就退回 emoji：临时路径留着重启后会变成坏头像，不如不用
    avatar.value = randomAvatar()
    uni.showModal({
      title: '头像上传失败',
      content:
        ((err && err.message) || '未知错误') +
        '\n\n可以先从下面挑一个 emoji 头像，不影响使用。\n' +
        '（真机上还需要在微信公众平台配置 uploadFile 合法域名）',
      showCancel: false
    })
  } finally {
    avatarUploading.value = false
  }
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
 * 身份不由前端自己决定：必须把管理口令交给云函数校验
 * （云端存的是 SHA-256 摘要），通过后才写入 role: 'admin'。
 * 校验失败就什么也不改，避免出现「点一下就是管理员」。
 */
async function adminLogin() {
  const pwd = String(adminPassword.value || '')
  if (!pwd) return toast('请输入管理口令')
  await doAdminLogin(pwd)
}

/**
 * 执行管理员登录
 * @param {string} pwd 要提交的管理口令
 */
async function doAdminLogin(pwd) {
  if (adminSubmitting.value) return

  adminSubmitting.value = true
  try {
    const res = await adminAuthApi.login(pwd)
    // 无论成功失败都清空输入框，别让口令留在界面上
    adminPassword.value = ''

    if (res && res.initialized) {
      uni.showModal({
        title: '已设置初始口令',
        content: '云端此前没有管理口令，你刚才输入的口令已成为初始口令。请记牢，之后进入管理后台都要用它。',
        confirmText: '知道了',
        showCancel: false,
        success: () => uni.reLaunch({ url: '/pages/admin/index' })
      })
    } else {
      uni.showToast({ title: '管理员登录成功', icon: 'success' })
      // 用 reLaunch：登录页的历史不该留在后台页面后面，
      // 否则在后台按返回会回到登录页，看起来像被踢出去了
      setTimeout(() => uni.reLaunch({ url: '/pages/admin/index' }), 700)
    }
  } catch (e) {
    const reason = (e && e.message) || '管理员登录失败'
    // 口令类失败最容易变成「反复猜」的死循环（本次就踩了：
    // 改了 admin_token 却没生效，因为集合里可能有多条记录，代码只读第一条）。
    // 所以这里顺手查一次云端状态，把「到底还有没有口令」直接摆出来。
    if (/口令/.test(reason)) {
      await diagnosePassphrase(reason, pwd)
      return
    }
    // 云函数未上传 / 云空间未关联 / 域名被拦，都原样提示，便于定位
    toast(explainCloudError(reason))
  } finally {
    adminSubmitting.value = false
  }
}

/**
 * 口令校验失败时的具体诊断
 *
 * `shiyu-config` 的 get 动作不需要口令，所以能安全地查一次云端状态：
 * has_admin_token = 云端到底还存不存管理口令。
 * 这能一眼区分两种完全不同的原因：
 *   · 仍然有口令 → 你清掉的字段没生效（最常见：集合里有多条记录，
 *     而云函数固定读 .limit(1) 的第一条，你改的是另一条）
 *   · 已经没有口令 → 那问题在别处（云函数版本 / 网络），需要看原文
 *
 * @param {string} reason 云函数返回的原因
 * @param {string} sent 本次提交的口令（只做掩码展示，方便你确认自己输的是哪个）
 */
async function diagnosePassphrase(reason, sent) {
  let hasCloudToken = null
  try {
    const data = await configApi.get()
    hasCloudToken = !!(data && data.has_admin_token)
  } catch (e) {
    hasCloudToken = null
  }

  const text = String(sent || '')
  const masked = text
    ? text.slice(0, 3) + '****' + text.slice(-3) + '（' + text.length + ' 位）'
    : '（空）'

  let body
  if (hasCloudToken === true) {
    body = '云端【仍然】存着管理口令 —— 说明 admin_token 没被清掉。\n' +
      '最常见的原因：shiyu-config 集合里有【多条记录】，云函数只读第一条（.limit(1)），\n' +
      '你在控制台改的可能不是它。\n\n' +
      '最省事的解决：把 shiyu-config 集合的记录【全部删除】，\n' +
      '然后回本页输入新口令 —— 会自动完成初始化。\n' +
      '（API Key 会一起没掉，去「AI 配置」页重新填一次即可）'
  } else if (hasCloudToken === false) {
    body = '云端【已经没有】管理口令了，但仍报校验失败，这不合常理。\n' +
      '请把这段弹窗原文发给我，并确认 shiyu-config 云函数确实重新上传过。'
  } else {
    body = '读不到云端状态（云函数未上传 / 云空间未关联 / 网络异常）。\n' +
      '请检查 shiyu-config 是否已上传部署。'
  }

  uni.showModal({
    title: '管理口令校验失败',
    content: '云端原文：' + reason + '\n\n本次提交的口令：' + masked + '\n\n' + body,
    showCancel: false,
    confirmText: '知道了'
  })
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

/**
 * 微信一键登录失败后的配置自检
 *
 * 让云函数回答「AppID / Secret 配了没有」（不需要真实 code）：
 *   · configured === false → 自检结论本身就是完整解释（缺哪个变量、去哪配、要重新部署）
 *   · configured === true  → 配置没问题，失败原因看微信错误码（自检会给出对照表）
 *   · configured === null  → 连自检都调不通，那本身就是结论（云函数没上传 / 云空间没关联）
 * 这样用户不用把报错发给我也能自己定位。
 */
async function diagnoseWechat() {
  try {
    const st = await userApi.checkWechatLogin()
    return {
      configured: !!(st && st.configured),
      hint: (st && st.hint) || ''
    }
  } catch (e) {
    return {
      configured: null,
      hint: '（配置自检也调不通：说明 wechat-login 云函数还没上传部署，或云服务空间未关联）'
    }
  }
}

/**
 * 微信一键登录
 *
 * 失败时把**真实原因 + 配置自检结论**一起展示（用弹窗，因为内容是一整段操作指引），
 * 而不是像以前那样不管什么原因都说「当前环境不支持微信登录」——
 * 那句话把「不是小程序端」「取消授权」「云函数没上传」「没配 AppSecret」
 * 混成一件事，谁也排查不了。手动填写昵称的路径始终可用。
 */
async function wxLogin() {
  if (wxLoading.value) return
  wxLoading.value = true
  try {
    const res = await userApi.wechatLogin()
    const info = res || {}
    /**
     * 微信登录只返回 openid（云函数用它换 openid），**拿不到昵称和头像**。
     *
     * 这不是配置问题：微信从 2022-10-25 起，getUserProfile / getUserInfo
     * 对未主动授权的调用只返回匿名数据（昵称「微信用户」+ 灰色默认头像）。
     * 合规的做法是上面的「头像昵称填写能力」（chooseAvatar + type="nickname"），
     * 由用户自己确认一次。
     */
    const fromWx = String(info.nickName || info.nickname || '').trim()
    const wxAvatar = info.avatarUrl || info.avatar || ''

    // 关键：本机若已有用户自己设置过的昵称/头像，绝不能被占位值覆盖掉
    // （否则每次点「微信一键登录」都会把昵称重置回「微信同学」）
    const existing = userApi.getProfile() || {}
    const existingName = String(existing.nickname || '').trim()
    const hasOwnName = existingName && existingName !== '微信同学'
    const hasOwnAvatar = !!existing.avatar && avatarIsImage.value === false

    const name = (fromWx || (hasOwnName ? existingName : '微信同学')).slice(0, 12)
    const av = wxAvatar || (hasOwnAvatar ? existing.avatar : avatar.value || randomAvatar())

    nickname.value = name
    avatar.value = av

    // 微信一键登录只是拿到 openid 作为本机 uid，属于「身份」而非「认证」，
    // 所以它不会授予管理员；但同样不能把已是管理员的身份降级
    const saved = userApi.saveProfile({ nickname: name, avatar: av, role: studentRole() })
    if (!saved) throw new Error('本机存储不可用')

    if (name === '微信同学') {
      // 昵称还是占位值 → 引导用户用微信官方的头像/昵称填写能力补上
      uni.showModal({
        title: '已用微信身份登录',
        content:
          '微信已不允许小程序自动获取昵称和头像，需要你自己确认一次：\n\n' +
          '· 点上面的头像 → 可直接选「用微信头像」\n' +
          '· 点昵称输入框 → 键盘上方会出现「使用微信昵称」',
        cancelText: '先逛逛',
        confirmText: '去设置',
        success: (r) => {
          if (!r.confirm) goHome()
        }
      })
    } else {
      uni.showToast({ title: '微信登录成功', icon: 'none' })
      setTimeout(goHome, 700)
    }
  } catch (e) {
    const reason = ((e && e.message) || '微信登录失败').split('\n').filter(Boolean).join('\n')
    const diag = await diagnoseWechat()

    const parts = []
    if (diag.configured === false) {
      // 配置没到位：自检结论已经把话说全，不再重复那句「缺少环境变量 X」
      if (diag.hint) parts.push(diag.hint)
      else parts.push(reason)
    } else {
      parts.push(reason)
      if (diag.hint) parts.push(diag.hint)
    }
    parts.push('可以先在下面手动填写昵称进入，功能完全一样。')

    uni.showModal({
      title: '微信一键登录没成功',
      content: parts.join('\n\n'),
      showCancel: false,
      confirmText: '手动填写'
    })
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

/**
 * 微信头像选择按钮（open-type="chooseAvatar"）
 *
 * 小程序里 <button> 自带边框与内边距，要清掉才能当一个圆形头像预览用。
 */
.avatar-pick {
  width: 132rpx;
  height: 132rpx;
  padding: 0;
  margin: 0;
  border-radius: 50%;
  background: linear-gradient(135deg, #fff3ed, #ffe4d6);
  border: 4rpx solid #ffd9cc;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  line-height: normal;
}

.avatar-pick::after {
  border: none;
}

.avatar-preview {
  width: 100%;
  height: 100%;
}

.avatar-preview-emoji {
  font-size: 64rpx;
}

.avatar-or {
  display: block;
  font-size: 21rpx;
  color: #aaa;
  margin: 20rpx 0 14rpx;
}

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
