/**
 * API 请求封装
 * 统一处理请求、响应、Token、错误
 */

// 后端服务地址（开发环境用本地，生产改为服务器地址）
const BASE_URL = 'http://localhost:8000/api'

/**
 * 获取 Token
 */
export function getToken() {
  return uni.getStorageSync('token') || ''
}

/**
 * 保存 Token
 */
export function setToken(token) {
  uni.setStorageSync('token', token)
}

/**
 * 清除登录信息
 */
export function clearAuth() {
  uni.removeStorageSync('token')
  uni.removeStorageSync('userInfo')
}

/**
 * 统一请求方法
 */
export function request(options) {
  return new Promise((resolve, reject) => {
    const token = getToken()
    uni.request({
      url: BASE_URL + options.url,
      method: options.method || 'GET',
      data: options.data || {},
      header: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      success: (res) => {
        if (res.statusCode === 401) {
          clearAuth()
          uni.showToast({ title: '请先登录', icon: 'none' })
          uni.navigateTo({ url: '/pages/login/login' })
          reject(res)
          return
        }
        const data = res.data
        if (data.code === 0) {
          resolve(data.data)
        } else {
          uni.showToast({ title: data.message || '请求失败', icon: 'none' })
          reject(data)
        }
      },
      fail: (err) => {
        uni.showToast({ title: '网络异常，请检查后端服务', icon: 'none' })
        reject(err)
      }
    })
  })
}

// 封装常用方法
export const http = {
  get: (url, data) => request({ url, method: 'GET', data }),
  post: (url, data) => request({ url, method: 'POST', data }),
  put: (url, data) => request({ url, method: 'PUT', data }),
  delete: (url) => request({ url, method: 'DELETE' })
}

export default {
  BASE_URL,
  request,
  getToken,
  setToken,
  clearAuth
}
