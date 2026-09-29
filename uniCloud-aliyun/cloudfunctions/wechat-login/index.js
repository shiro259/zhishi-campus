'use strict';
/**
 * 微信登录云函数
 * 通过 code 换取 openid，返回给前端用于后端登录
 */
exports.main = async (event, context) => {
  const { code } = event;
  if (!code) {
    return { code: -1, message: '缺少 code 参数' };
  }

  try {
    // 调用微信 jscode2session 接口
    const res = await uniCloud.httpclient.request(
      'https://api.weixin.qq.com/sns/jscode2session',
      {
        method: 'GET',
        data: {
          appid: process.env.WECHAT_APPID || '',
          secret: process.env.WECHAT_SECRET || '',
          js_code: code,
          grant_type: 'authorization_code'
        },
        dataType: 'json'
      }
    );

    const data = res.data || {};
    if (data.openid) {
      return {
        code: 0,
        message: 'success',
        data: {
          openid: data.openid,
          session_key: data.session_key
        }
      };
    } else {
      return { code: -1, message: data.errmsg || '微信登录失败', data: data };
    }
  } catch (e) {
    return { code: -1, message: '请求异常: ' + e.message };
  }
};
