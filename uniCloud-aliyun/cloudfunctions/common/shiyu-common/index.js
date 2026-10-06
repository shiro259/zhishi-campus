'use strict';

/**
 * 食遇校园 - 云函数公共库
 *
 * 供 shiyu-config / shiyu-review / shiyu-dish / shiyu-seed 复用，避免各处重复实现
 * 「管理口令校验」与「AI 配置读取」这两段安全相关的逻辑。
 *
 * 注意：uniCloud 上传云函数时，会把所选云函数目录整体上传，
 * 因此这里通过相对路径 require 引用是可行的（本地调试与云端表现一致）。
 *
 * @module common/shiyu-common
 */

const crypto = require('crypto');

/** 配置文件所在的集合名（单文档集合） */
const CONFIG_COLLECTION = 'shiyu-config';

/**
 * 管理口令摘要
 *
 * 用 SHA-256 存储口令摘要而不是明文：`shiyu-config` 集合权限虽然全为 false，
 * 但按最小权限原则，即使数据被读到也不应直接泄露可用的口令。
 * @param {string} token
 * @returns {string} 十六进制摘要，token 为空时返回空串
 */
function hashToken(token) {
  if (!token || typeof token !== 'string') return '';
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * 读取配置文档（不存在时返回 null）
 * @param {Object} db uniCloud.database() 实例
 * @returns {Promise<Object|null>}
 */
async function loadConfig(db) {
  try {
    const res = await db.collection(CONFIG_COLLECTION).limit(1).get();
    const doc = res && res.data && res.data[0];
    return doc || null;
  } catch (e) {
    return null;
  }
}

/** 配置集合不存在时自动创建后再写入（首次部署常见场景） */
async function upsertConfig(db, data) {
  const current = await loadConfig(db);
  if (!current) {
    const addRes = await db.collection(CONFIG_COLLECTION).add({
      ...data,
      create_date: Date.now()
    });
    return addRes.id;
  }
  await db.collection(CONFIG_COLLECTION).doc(current._id).update({
    ...data,
    updated_at: Date.now()
  });
  return current._id;
}

/**
 * 校验管理口令
 *
 * 规则：
 * 1. 云端尚未设置口令（首次部署）→ 放行，并把本次传入的口令作为初始口令保存，
 *    这样管理员在后台页面上第一次保存配置时无需先手工去控制台写数据；
 * 2. 云端已设置口令 → 必须提供匹配的口令，否则拒绝。
 *
 * @param {Object} db
 * @param {string} token 客户端提交的口令
 * @returns {Promise<{ok:boolean, message?:string, initialized?:boolean}>}
 */
async function verifyAdminToken(db, token) {
  const cfg = await loadConfig(db);
  const stored = cfg && cfg.admin_token ? String(cfg.admin_token) : '';

  // 尚未初始化：以本次请求的口令作为初始口令
  if (!stored) {
    const hash = hashToken(token);
    if (!hash) {
      return { ok: false, message: '云端未初始化管理口令，请提交一个口令完成初始化' };
    }
    await upsertConfig(db, { admin_token: hash });
    return { ok: true, initialized: true };
  }

  if (hashToken(token) !== stored) {
    return { ok: false, message: '管理口令校验失败，请检查「AI 配置」页填写的管理口令' };
  }
  return { ok: true };
}

/**
 * 读取大模型配置，返回给推荐云函数使用。
 * 优先读云数据库配置，缺失时回退到云函数环境变量。
 * @param {Object} db
 * @returns {Promise<{apiKey:string, baseUrl:string, model:string, provider:string, source:string}>}
 */
async function loadAiConfig(db) {
  const cfg = await loadConfig(db) || {};

  const apiKey = cfg.api_key || process.env.AI_API_KEY || '';
  const baseUrl = cfg.base_url || process.env.AI_BASE_URL || 'https://api.deepseek.com/v1';
  const model = cfg.model || process.env.AI_MODEL || 'deepseek-chat';
  const provider = cfg.provider || process.env.AI_PROVIDER || 'deepseek';

  let source = 'none';
  if (cfg.api_key) source = 'database'
  else if (process.env.AI_API_KEY) source = 'env'

  return { apiKey, baseUrl, model, provider, source };
}

/** 统一成功响应 */
function ok(data, message) {
  return { code: 0, message: message || 'success', data: data === undefined ? null : data };
}

/** 统一失败响应 */
function fail(message, data) {
  return { code: -1, message: message || '操作失败', data: data === undefined ? null : data };
}

/** 页码/每页条数归一化，避免非法入参导致 skip 为负数 */
function normalizePaging(page, pageSize, maxPageSize) {
  const max = maxPageSize || 100;
  let p = parseInt(page, 10);
  let ps = parseInt(pageSize, 10);
  if (!p || p < 1) p = 1;
  if (!ps || ps < 1) ps = 20;
  if (ps > max) ps = max;
  return { page: p, pageSize: ps, skip: (p - 1) * ps };
}

/** 简单对象浅拷贝后追加 id 字段（前端统一用 id，云端存的是 _id） */
function withId(doc) {
  if (!doc) return doc;
  return Object.assign({}, doc, { id: doc._id });
}

module.exports = {
  CONFIG_COLLECTION,
  hashToken,
  loadConfig,
  upsertConfig,
  verifyAdminToken,
  loadAiConfig,
  ok,
  fail,
  normalizePaging,
  withId
};
