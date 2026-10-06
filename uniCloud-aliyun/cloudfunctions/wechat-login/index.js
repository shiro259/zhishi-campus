'use strict';
/**
 * 微信登录云函数：用小程序 wx.login 拿到的 code 换取 openid
 *
 * ---------------------------------------------------------------------------
 * AppID / AppSecret 有两种配法，**配任意一种即可**（都不需要改代码）：
 *
 *   ① 管理后台 → AI 配置 → 微信登录配置（推荐，不用进控制台）
 *      值存在云数据库 shiyu-config 里，只有云函数能读到
 *   ② uniCloud 控制台 → 云函数 → wechat-login → 环境变量
 *      WECHAT_APPID / WECHAT_SECRET，配完**必须重新部署该云函数**
 *
 * 两者都配了时以数据库为准（与 AI Key 的优先级一致），
 * 且 AppID 与 Secret 必须成对来自同一处 —— 不能一个来自数据库、一个来自环境变量。
 * ---------------------------------------------------------------------------
 *
 * 为什么要在函数里先校验：
 *   不校验的话，请求会带着空的 appid 发出去，微信返回 errcode 40013，
 *   前端只能看到一句「微信登录失败」（或者更糟：被前端的兜底文案说成
 *   「当前环境不支持微信登录」），根本分不清是没有密钥、AppID 写错、
 *   code 过期，还是函数压根没上传。这里把每种情况翻译成能直接照着做的说明。
 *
 * 微信错误码文档：https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/user-login/code2Session.html
 */

// 引用公共模块 shiyu-common（与其它云函数同一套回退写法：
// 本目录副本 → 公共模块名 → 本地开发目录相对路径）
let common;
try {
  common = require('./shiyu-common.js');
} catch (e) {
  try {
    common = require('shiyu-common');
  } catch (e2) {
    common = require('../common/shiyu-common/index.js');
  }
}

/** 微信错误码 → 可执行的说明 */
const WX_ERR_HINT = {
  40013: 'AppID 无效：请检查环境变量 WECHAT_APPID 是否与小程序 AppID 完全一致',
  40029: 'code 无效或已过期：code 只能使用一次且几分钟内有效，请重新点击登录',
  40163: 'code 已被使用过：同一个 code 换不了两次，请重新点击登录',
  41008: '缺少 code：请重新点击登录',
  45011: '请求过于频繁：请稍后再试'
};

/** 统一失败返回 */
function fail(message, data) {
  return { code: -1, message: message, data: data || null };
}

/** AppID 打码：只露出头尾，既能核对又不会把完整值写进日志/界面 */
function maskAppId(appid) {
  const s = String(appid || '');
  if (!s) return '';
  if (s.length <= 10) return s.slice(0, 2) + '***';
  return s.slice(0, 6) + '***' + s.slice(-4);
}

/**
 * 配置自检结果
 *
 * 只回答「AppID / Secret 配了没有」，不需要真实 code，
 * 因此前端在登录失败时可以顺手调一次，把「到底哪一步没配好」直接写进提示里，
 * 而不是让用户拿着「微信登录失败」去猜。**绝不返回 Secret 本身**。
 */
async function wechatConfigStatus() {
  const cfg = await common.loadWechatConfig(uniCloud.database());
  const appid = cfg.appid || '';
  const hasSecret = !!cfg.secret;

  const missing = [];
  if (!appid) missing.push('WECHAT_APPID（或后台的「微信 AppID」）');
  if (!hasSecret) missing.push('WECHAT_SECRET（或后台的「微信 AppSecret」）');

  const where = {
    database: '管理后台 → AI 配置',
    env: '云函数环境变量',
    mixed: '管理后台 + 云函数环境变量（两处混用，注意 AppID 与 Secret 要属于同一个小程序）'
  }[cfg.source];

  if (missing.length) {
    return {
      configured: false,
      missing: missing,
      appid_masked: maskAppId(appid),
      secret_set: hasSecret,
      source: cfg.source,
      hint:
        '配置自检：缺少 ' + missing.join(' 与 ') + '。\n' +
        '两种配法任选其一：\n' +
        '① 管理后台 → AI 配置 → 微信登录配置（保存即生效，不用重新部署）\n' +
        '② uniCloud 控制台 → 云函数 → wechat-login → 环境变量，配完必须重新部署该云函数'
    };
  }

  return {
    configured: true,
    missing: [],
    appid_masked: maskAppId(appid),
    secret_set: true,
    source: cfg.source,
    hint:
      '配置自检：已就位（AppID ' + maskAppId(appid) + '，来源：' + where + '）。\n' +
      '若仍失败，对照微信错误码：40013 = AppID 与小程序不一致；' +
      '40029 / 40163 = code 已失效（重新点一次「微信一键登录」即可）。'
  };
}

exports.main = async (event, context) => {
  // 自检模式：不需要 code，只回报配置状态
  if (event && (event.action === 'check' || event.check === true)) {
    return { code: 0, message: 'success', data: await wechatConfigStatus() };
  }

  const code = event && event.code;
  if (!code) {
    return fail('缺少 code 参数：请重新点击微信一键登录');
  }

  const cfg = await common.loadWechatConfig(uniCloud.database());
  const appid = cfg.appid || '';
  const secret = cfg.secret || '';

  // 先自查配置：这种情况不该把请求发出去，也不该让用户以为是自己的问题。
  // 这里只说「缺什么」——完整的配置指引由前端调 check 自检时给出，
  // 两边都写一遍会让弹窗里出现两段几乎一样的话（踩过）。
  if (!appid || !secret) {
    const missing = [];
    if (!appid) missing.push('WECHAT_APPID');
    if (!secret) missing.push('WECHAT_SECRET');
    return fail('微信登录尚未配置：缺少 ' + missing.join(' 与 '), { missing: missing });
  }

  try {
    const res = await uniCloud.httpclient.request(
      'https://api.weixin.qq.com/sns/jscode2session',
      {
        method: 'GET',
        data: {
          appid: appid,
          secret: secret,
          js_code: code,
          grant_type: 'authorization_code'
        },
        dataType: 'json',
        // 云函数默认超时只有 5 秒，微信接口偶尔会慢；这里显式给 8 秒，
        // 避免「请求云函数超时」掩盖真正的原因
        timeout: 8000
      }
    );

    const data = (res && res.data) || {};

    if (data.openid) {
      return {
        code: 0,
        message: 'success',
        data: {
          openid: data.openid,
          session_key: data.session_key
        }
      };
    }

    const errcode = Number(data.errcode) || 0;
    const hint = WX_ERR_HINT[errcode];
    const detail = data.errmsg || '微信未返回 openid';
    return fail(
      '微信登录失败：' + (hint || detail + (errcode ? '（errcode ' + errcode + '）' : '')),
      { errcode: errcode, errmsg: detail }
    );
  } catch (e) {
    const msg = (e && (e.errMsg || e.message)) || '未知异常';
    return fail(
      '调用微信接口异常：' + msg + '\n' +
      '请检查云函数能否访问外网（api.weixin.qq.com），以及云函数超时设置。'
    );
  }
};
