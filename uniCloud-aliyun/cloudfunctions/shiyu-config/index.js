'use strict';

/**
 * shiyu-config —— AI 配置云函数
 *
 * 职责：
 *  - get   读取当前大模型配置状态（**永不返回 api_key 明文**）
 *  - save  保存配置（需要管理口令；云端未初始化口令时以本次口令完成初始化）
 *  - test  发起一次最小的大模型请求，验证 Key / base_url / model 是否可用
 *
 * 安全设计：
 *  1. api_key 只存云端（shiyu-config 集合 permission 全为 false），仅本云函数可读写；
 *  2. 管理口令以 SHA-256 摘要存储，客户端只提交明文口令、拿到的是校验结果；
 *  3. 对外只暴露 configured / has_key 这类布尔状态，方便后台页展示。
 *
 * 关联：被 ../common/shiyu-common 提供的口令校验与配置读写能力复用。
 */

const common = require('../common/shiyu-common/index.js');

const db = uniCloud.database();

/** 允许的服务商白名单，避免把任意值写进配置 */
const PROVIDERS = ['deepseek', 'qwen', 'kimi', 'zhipu', 'custom'];

exports.main = async (event) => {
  const action = event && event.action;

  try {
    switch (action) {
      case 'get':
        return await handleGet();
      case 'save':
        return await handleSave(event);
      case 'test':
        return await handleTest(event);
      case 'wx-login':
        return await handleWxLogin(event);
      default:
        return common.fail('未知的 action: ' + action);
    }
  } catch (e) {
    console.error('[shiyu-config] 执行异常', action, e);
    return common.fail('配置服务异常：' + (e && e.message ? e.message : '未知错误'));
  }
};

/**
 * 读取配置状态
 * 只返回「是否已配置」与展示用的非敏感字段，api_key 一律用 has_key 布尔值代替。
 */
async function handleGet() {
  const cfg = await common.loadConfig(db) || {};
  const { apiKey } = await common.loadAiConfig(db);

  let source = 'none';
  if (cfg.api_key) source = 'database';
  else if (process.env.AI_API_KEY) source = 'env';

  return common.ok({
    configured: !!apiKey,
    provider: cfg.provider || '',
    base_url: cfg.base_url || '',
    model: cfg.model || '',
    has_key: !!apiKey,
    key_source: source,
    has_admin_token: !!cfg.admin_token,
    updated_at: cfg.updated_at || cfg.create_date || null
  });
}

/**
 * 保存配置
 * 入参：{ provider, base_url, model, api_key, token, admin_token }
 * 注意：api_key 留空表示「保持原值不变」，避免管理员只想改模型时把 Key 清掉。
 */
async function handleSave(event) {
  // 兼容前端可能提交的两种字段名
  const token = event.token || event.admin_token || '';

  const provider = String(event.provider || '').trim();
  const baseUrl = String(event.base_url || '').trim();
  const model = String(event.model || '').trim();
  const apiKey = String(event.api_key || '').trim();

  if (baseUrl && !/^https?:\/\//i.test(baseUrl)) {
    return common.fail('base_url 必须以 http:// 或 https:// 开头');
  }
  if (!model) {
    return common.fail('model 不能为空');
  }
  if (provider && PROVIDERS.indexOf(provider) < 0) {
    return common.fail('不支持的 provider：' + provider);
  }

  // 管理口令校验（未初始化时用本次口令完成初始化）
  const auth = await common.verifyAdminToken(db, token);
  if (!auth.ok) return common.fail(auth.message);

  // 组装要写入的字段：api_key 为空则不动原值
  const data = {
    provider: provider || 'deepseek',
    base_url: baseUrl,
    model: model
  };
  if (apiKey) data.api_key = apiKey;

  await common.upsertConfig(db, data);

  // 保存后立刻做一次连通性验证，把结果一并返回，管理员不用再点一次「测试连接」
  let verify = { ok: false, message: '未发起验证' };
  try {
    verify = await testConnection();
  } catch (e) {
    verify = { ok: false, message: (e && e.message) || '验证失败' };
  }

  return common.ok({
    saved: true,
    initialized_token: !!auth.initialized,
    verify
  }, auth.initialized ? '配置已保存，并已初始化管理口令' : '配置已保存');
}

/** 测试连接：调用一次最小请求，不消耗多少 token */
async function handleTest() {
  const result = await testConnection();
  if (!result.ok) return common.fail(result.message, result);
  return common.ok(result);
}

/**
 * 连通性测试实现
 * 用固定短 prompt 请求一次对话接口，只要拿到 choices 就认为链路可用。
 */
async function testConnection() {
  const { apiKey, baseUrl, model } = await common.loadAiConfig(db);
  const start = Date.now();

  if (!apiKey) {
    return { ok: false, message: '尚未配置 API Key（数据库与云函数环境变量均为空）' };
  }

  const url = String(baseUrl).replace(/\/+$/, '') + '/chat/completions';

  const res = await uniCloud.httpclient.request(url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    data: {
      model,
      messages: [{ role: 'user', content: '回复两个字：正常' }],
      max_tokens: 16,
      temperature: 0
    },
    dataType: 'json',
    timeout: 20000
  });

  const status = res.status;
  const body = res.data || {};

  if (status !== 200) {
    return {
      ok: false,
      message: explainStatus(status, body),
      http_status: status,
      elapsed: Date.now() - start
    };
  }

  const content = body.choices && body.choices[0] && body.choices[0].message
    ? body.choices[0].message.content
    : '';

  if (!content) {
    return { ok: false, message: '模型返回内容为空，请检查 model 名称是否正确', elapsed: Date.now() - start };
  }

  return {
    ok: true,
    message: '模型响应正常',
    model,
    reply: String(content).slice(0, 20),
    elapsed: Date.now() - start
  };
}

/** 把常见 HTTP 状态码翻译成可直接展示的中文排查提示 */
function explainStatus(status, body) {
  const detail = body && (body.error && (body.error.message || body.error.code))
    ? '（' + (body.error.message || body.error.code) + '）'
    : '';
  if (status === 401 || status === 403) return 'API Key 无效或无权限' + detail;
  if (status === 404) return 'base_url 或 model 不存在，请检查地址是否带 /v1 这类版本路径' + detail;
  if (status === 429) return '请求过于频繁或额度已用尽' + detail;
  if (status >= 500) return '模型服务端异常，请稍后重试' + detail;
  return '调用失败，HTTP ' + status + detail;
}

/**
 * 微信登录（可选能力）
 *
 * 用 wx.login 拿到的 code 换 openid，作为跨设备稳定身份。
 * 未配置 WECHAT_APPID / WECHAT_SECRET 时直接返回未开启，由前端降级为手动填写昵称。
 */
async function handleWxLogin(event) {
  const appid = process.env.WECHAT_APPID || '';
  const secret = process.env.WECHAT_SECRET || '';
  const code = event.code || '';

  if (!appid || !secret) {
    return common.fail('未配置 WECHAT_APPID / WECHAT_SECRET，请使用手动身份');
  }
  if (!code) {
    return common.fail('缺少微信登录 code');
  }

  const url = 'https://api.weixin.qq.com/sns/jscode2session'
    + '?appid=' + encodeURIComponent(appid)
    + '&secret=' + encodeURIComponent(secret)
    + '&js_code=' + encodeURIComponent(code)
    + '&grant_type=authorization_code';

  const res = await uniCloud.httpclient.request(url, { method: 'GET', dataType: 'json', timeout: 10000 });
  const body = res.data || {};

  if (!body.openid) {
    return common.fail('微信登录失败：' + (body.errmsg || '未返回 openid'));
  }

  return common.ok({ openid: body.openid, session_key: body.session_key });
}
