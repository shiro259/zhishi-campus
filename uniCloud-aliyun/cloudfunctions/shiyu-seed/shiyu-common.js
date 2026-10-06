'use strict';

/**
 * 食遇校园 - 云函数公共库
 *
 * 供 shiyu-config / shiyu-review / shiyu-dish / shiyu-seed 复用，避免各处重复实现
 * 「管理口令校验」与「AI 配置读取」这两段安全相关的逻辑。
 *
 * ⚠️ 本文件是唯一副本源头，会被逐字节复制到每个云函数的同目录下（<云函数>/shiyu-common.js）。
 * 为什么要复制：uniCloud 上传云函数时**只上传该函数自己的目录**，
 *   云端既没有兄弟目录 ../common/ ，
 *   公共模块名 require('shiyu-common') 能否被打包也取决于工具链。
 *   只有同目录副本是随函数一起上传、100% 存在的。
 * 改这里之后，记得把 4 份副本一起刷新（scripts 里有对应的同步/校验测试），
 * 否则线上各云函数行为会不一致。
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

/**
 * 读取微信小程序配置（登录用），返回 AppID / AppSecret。
 *
 * 与 loadAiConfig 同一套优先级：**数据库优先，环境变量兜底**。
 * 这样管理员既可以在「AI 配置」页里填（不用进 uniCloud 控制台），
 * 也可以用云函数环境变量配（更符合「密钥不进数据库」的习惯）。
 *
 * ⚠️ AppSecret 只允许在云函数侧使用，绝不能返回给客户端。
 *
 * @param {Object} db
 * @returns {Promise<{appid:string, secret:string, source:string}>}
 *   source: database | env | mixed | none
 */
async function loadWechatConfig(db) {
  const cfg = await loadConfig(db) || {};

  const dbAppid = String(cfg.wechat_appid || '').trim();
  const dbSecret = String(cfg.wechat_secret || '').trim();
  const envAppid = String(process.env.WECHAT_APPID || '').trim();
  const envSecret = String(process.env.WECHAT_SECRET || '').trim();

  // 优先用「成对」的配置：数据库一对 > 环境变量一对
  if (dbAppid && dbSecret) return { appid: dbAppid, secret: dbSecret, source: 'database' };
  if (envAppid && envSecret) return { appid: envAppid, secret: envSecret, source: 'env' };

  // 混搭（例如 AppID 填在后台、Secret 配在环境变量）：能用就用，并如实标明来源。
  // 不拒绝的原因是「能用」比「严格」重要；万一两处来自不同的小程序，
  // 微信会返回 40013，而那条错误信息本身就说明了「AppID 与小程序不一致」。
  const appid = dbAppid || envAppid;
  const secret = dbSecret || envSecret;
  if (appid && secret) return { appid: appid, secret: secret, source: 'mixed' };

  // 都没配齐：把已有的部分也带回去，便于自检说清「缺哪一半」
  return { appid: appid, secret: secret, source: 'none' };
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
  loadWechatConfig,
  ok,
  fail,
  normalizePaging,
  withId
};
