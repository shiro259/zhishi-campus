/**
 * API 接口集合
 */
import { http } from './request.js'

// ===== 认证 =====
export const authApi = {
  wechatLogin: (code, nickname, avatar) => http.post('/auth/wechat-login', { code, nickname, avatar }),
  adminLogin: (username, password) => http.post('/auth/admin-login', { username, password }),
  getMyInfo: () => http.get('/auth/me'),
  updateMyInfo: (data) => http.put('/auth/me', data)
}

// ===== 菜品 =====
export const dishApi = {
  list: (params) => http.get('/dishes/list', params),
  detail: (id) => http.get(`/dishes/${id}`),
  hotRank: (limit = 10) => http.get('/dishes/rank/hot', { limit }),
  goodRank: (limit = 10) => http.get('/dishes/rank/good', { limit }),
  newDishes: (limit = 10) => http.get('/dishes/rank/new', { limit }),
  canteens: () => http.get('/dishes/canteens/list'),
  categories: () => http.get('/dishes/categories/list'),
  create: (data) => http.post('/dishes', data),
  update: (id, data) => http.put(`/dishes/${id}`, data),
  delete: (id) => http.delete(`/dishes/${id}`)
}

// ===== 评价 =====
export const reviewApi = {
  list: (params) => http.get('/reviews/list', params),
  create: (data) => http.post('/reviews', data),
  like: (id) => http.post(`/reviews/${id}/like`),
  mine: (params) => http.get('/reviews/mine', params),
  pending: (params) => http.get('/reviews/pending', params),
  audit: (data) => http.post('/reviews/audit', data),
  delete: (id) => http.delete(`/reviews/${id}`)
}

// ===== AI推荐 =====
export const recommendApi = {
  recommend: (data) => http.post('/recommend', data)
}

// ===== 管理后台 =====
export const adminApi = {
  userList: (params) => http.get('/admin/users', params),
  banUser: (id) => http.post(`/admin/users/${id}/ban`),
  allDishes: (params) => http.get('/admin/dishes/all', params),
  allReviews: (params) => http.get('/admin/reviews/all', params)
}

// ===== 数据统计 =====
export const statsApi = {
  overview: () => http.get('/stats/overview'),
  topDishes: (limit = 10) => http.get('/stats/top-dishes', { limit }),
  canteenStats: () => http.get('/stats/canteen-stats')
}
