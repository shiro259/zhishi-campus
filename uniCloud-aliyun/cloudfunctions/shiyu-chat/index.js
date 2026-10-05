'use strict'
/**
 * 食遇校园 · AI 聊天云函数
 * 所有用户共用云端配置的 API Key，调用通义千问大模型
 *
 * 部署步骤：
 * 1. 在 HBuilderX 中右键 shiyu-chat → 上传部署
 * 2. 在 uniCloud 控制台 → 云数据库 → shiyu-config 集合中添加记录：
 *    { "api_key": "你的通义千问Key", "model": "qwen-turbo", "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1" }
 * 3. 或在管理后台 → AI 配置页填写保存
 */

/**
 * 兜底菜品库（仅当 dishes 集合为空时使用）
 *
 * 正常情况下应当从 dishes 集合读，这样管理后台改的位置/图片/价格
 * 才能反映到 AI 回答里。这份内嵌数据与 common/local-dishes.js 保持一致：
 * 已删除「清真食堂」，窗口与楼层留空待管理员重填。
 */
var FALLBACK_DISHES = [
  { id: 'd001', name: '麻婆豆腐', price: 8, canteen: '第一食堂', floor: null, window: '', category: '川菜', tags: ['辣', '下饭'], description: '经典川菜，麻辣鲜香，豆腐嫩滑，配米饭一绝。', rating: 4.0 },
  { id: 'd002', name: '宫保鸡丁', price: 12, canteen: '第一食堂', floor: null, window: '', category: '川菜', tags: ['辣', '甜', '下饭'], description: '鸡丁鲜嫩，花生酥脆，甜辣适口，人气爆款。', rating: 4.1 },
  { id: 'd003', name: '鱼香肉丝', price: 10, canteen: '第一食堂', floor: null, window: '', category: '川菜', tags: ['辣', '酸', '下饭'], description: '酸甜微辣，肉丝滑嫩，经典鱼香味型。', rating: 4.1 },
  { id: 'd004', name: '番茄炒蛋', price: 6, canteen: '第一食堂', floor: null, window: '', category: '家常菜', tags: ['清淡', '甜'], description: '酸甜可口，鸡蛋嫩滑，老少皆宜。', rating: 4.2 },
  { id: 'd005', name: '红烧排骨', price: 15, canteen: '第一食堂', floor: null, window: '', category: '家常菜', tags: ['咸香', '下饭'], description: '排骨软烂入味，酱香浓郁，分量十足。', rating: 4.1 },
  { id: 'd006', name: '兰州拉面', price: 10, canteen: '第二食堂', floor: null, window: '', category: '面食', tags: ['清淡', '汤面'], description: '手工拉面，汤清面爽，牛肉片香。', rating: 4.6 },
  { id: 'd007', name: '重庆小面', price: 9, canteen: '第二食堂', floor: null, window: '', category: '面食', tags: ['辣', '干拌面'], description: '麻辣鲜香，面条劲道，正宗重庆味。', rating: 4.8 },
  { id: 'd008', name: '黄焖鸡米饭', price: 14, canteen: '第二食堂', floor: null, window: '', category: '快餐', tags: ['咸香', '下饭'], description: '鸡肉鲜嫩，汤汁浓郁，米饭管够。', rating: 4.0 },
  { id: 'd009', name: '沙县蒸饺', price: 8, canteen: '第二食堂', floor: null, window: '', category: '小吃', tags: ['清淡'], description: '皮薄馅大，蘸醋吃更香，早餐首选。', rating: 4.3 },
  { id: 'd010', name: '皮蛋瘦肉粥', price: 6, canteen: '第二食堂', floor: null, window: '', category: '小吃', tags: ['清淡', '养胃'], description: '粥稠米香，皮蛋瘦肉搭配，暖胃又营养。', rating: 4.0 },
  { id: 'd011', name: '广东肠粉', price: 7, canteen: '第三食堂', floor: null, window: '', category: '粤菜', tags: ['清淡', '早餐'], description: '米浆蒸制，滑嫩Q弹，淋上酱汁超满足。', rating: 4.8 },
  { id: 'd012', name: '白切鸡', price: 16, canteen: '第三食堂', floor: null, window: '', category: '粤菜', tags: ['清淡', '鲜嫩'], description: '皮爽肉滑，原汁原味，配姜葱酱绝佳。', rating: 4.0 },
  { id: 'd013', name: '蜜汁叉烧饭', price: 15, canteen: '第三食堂', floor: null, window: '', category: '粤菜', tags: ['甜', '下饭'], description: '叉烧肥瘦相间，蜜汁香甜，米饭吸满肉汁。', rating: 4.2 },
  { id: 'd014', name: '螺蛳粉', price: 12, canteen: '第三食堂', floor: null, window: '', category: '地方菜', tags: ['辣', '酸', '汤面'], description: '酸辣鲜爽，配料丰富，闻着臭吃着香。', rating: 4.4 },
  { id: 'd015', name: '麻辣香锅', price: 18, canteen: '第三食堂', floor: null, window: '', category: '地方菜', tags: ['辣', '重油'], description: '自选食材，麻辣干香，重口味必点。', rating: 4.3 },
  { id: 'd016', name: '牛肉拉面', price: 11, canteen: '第二食堂', floor: null, window: '', category: '面食', tags: ['清淡', '汤面'], description: '汤浓面劲，牛肉片实在，分量管饱。', rating: 4.5 },
  { id: 'd017', name: '大盘鸡', price: 20, canteen: '第三食堂', floor: null, window: '', category: '地方菜', tags: ['辣', '咸香'], description: '鸡肉土豆配皮带面，新疆特色，香辣过瘾。', rating: 4.6 },
  { id: 'd018', name: '烤羊肉串', price: 3, canteen: '第三食堂', floor: null, window: '', category: '烧烤', tags: ['辣', '咸香'], description: '现烤羊肉，外焦里嫩，撒上孜然辣椒面。', rating: 4.7 },
  { id: 'd019', name: '手抓饭', price: 13, canteen: '第三食堂', floor: null, window: '', category: '地方菜', tags: ['咸香'], description: '胡萝卜羊肉焖饭，油润不腻，香气扑鼻。', rating: 4.3 },
  { id: 'd020', name: '珍珠奶茶', price: 10, canteen: '第一食堂', floor: null, window: '', category: '饮品', tags: ['甜'], description: 'Q弹珍珠，香浓奶茶，下午茶必备。', rating: 4.6 },
  { id: 'd021', name: '水果沙拉', price: 12, canteen: '第二食堂', floor: null, window: '', category: '轻食', tags: ['清淡', '健康'], description: '新鲜水果搭配酸奶，低脂健康。', rating: 4.2 },
  { id: 'd022', name: '蔬菜沙拉', price: 8, canteen: '第二食堂', floor: null, window: '', category: '轻食', tags: ['清淡', '健康'], description: '新鲜时蔬，油醋汁调味，减脂首选。', rating: 4.5 }
]

/**
 * 取菜品库：优先读 dishes 集合（只取上架菜），集合为空才用内嵌兜底
 *
 * 必须优先读库 —— 否则管理后台改的位置（食堂/楼层/窗口）、图片、价格
 * 都不会体现在 AI 的回答里，用户会以为「改了没用」。
 */
async function loadDishes(db) {
  try {
    var res = await db.collection('dishes').where({ status: 1 }).limit(200).get()
    var rows = (res && res.data) || []
    if (rows.length) {
      return rows.map(function (d) {
        return {
          id: d.id || d._id,
          name: d.name,
          price: d.price,
          canteen: d.canteen,
          floor: d.floor,
          window: d.window,
          category: d.category,
          tags: d.tags || [],
          description: d.description,
          rating: d.rating
        }
      })
    }
  } catch (e) {
    // 读库失败（集合不存在等）→ 用内嵌兜底，保证聊天仍可用
  }
  return FALLBACK_DISHES
}

/** 位置文案：「第二食堂 2楼 3号窗口」，缺的段跳过 */
function locationText(d) {
  var parts = []
  if (d.canteen) parts.push(d.canteen)
  if (d.floor) parts.push(d.floor + '楼')
  if (d.window) parts.push(d.window)
  return parts.join(' ')
}

exports.main = async (event, context) => {
  var messages = event.messages || []

  // 从云数据库读取配置
  var config = null
  try {
    var db = uniCloud.database()
    var res = await db.collection('shiyu-config').limit(1).get()
    if (res.data && res.data.length > 0) {
      config = res.data[0]
    }
  } catch (e) {
    // 读取配置失败
  }

  if (!config || !config.api_key) {
    return {
      code: 1,
      message: '管理员尚未配置 API Key，请在管理后台→AI配置中填写'
    }
  }

  // 菜品库优先从 dishes 集合读，读不到才用内嵌兜底
  // 注意变量名不要叫 dishes —— 下面返回结果里已经有一个 dishes（推荐出的菜品卡片），
  // 同函数作用域下 var 会互相覆盖
  var dishLibrary = await loadDishes(uniCloud.database())

  // 构建菜品库文本：带上「食堂 楼层 窗口」位置信息，模型才能回答「在哪儿」
  var dishesText = dishLibrary.map(function (d) {
    return d.id + ' ' + d.name + ' ¥' + d.price + ' ' + locationText(d) +
      ' 标签:' + (d.tags || []).join('/') + ' 评分:' + d.rating + ' ' + d.description
  }).join('\n')

  var systemPrompt = '你是校园食堂AI助手"食遇AI"。学生可以和你聊天，问你想吃什么、查菜品、要推荐。\n\n' +
    '你有以下菜品库：\n' + dishesText + '\n\n' +
    '规则：\n' +
    '1. 只能从上面的菜品库中推荐，不能编造不存在的菜\n' +
    '2. 如果学生说了忌口（如不吃香菜），绝不推荐含该食材的菜\n' +
    '3. 如果学生说了预算，推荐的价格不能超过预算\n' +
    '4. 如果学生提到了具体食材（如鸡肉、牛肉、面条、豆腐等），优先推荐包含该食材的菜品\n' +
    '5. 如果菜品库中没有学生要的食材，诚实告知并推荐相似的替代菜品\n' +
    '6. 回答要自然、口语化，像朋友聊天一样，先说一段话再推荐菜品\n' +
    '7. 当你推荐菜品时，在文字回答的末尾，另起一行，用特殊格式标注推荐的菜品，格式为：\n' +
    '   [DISH:菜品ID,菜品ID,菜品ID]\n' +
    '8. 不推荐菜品时不需要加标注\n\n' +
    '示例对话：\n' +
    '学生：想吃鸡肉\n' +
    '你：想吃鸡肉呀！给你推荐几道鸡肉菜：\n\n1. 宫保鸡丁 ¥12 — 鸡丁鲜嫩，花生酥脆，甜辣适口，人气爆款！\n2. 白切鸡 ¥16 — 皮爽肉滑，原汁原味，配姜葱酱绝佳！\n\n都是同学评价很高的鸡肉菜哦！\n[DISH:d002,d012]\n\n' +
    '学生：想吃辣的，10块以内\n' +
    '你：来，给你推荐几道又辣又实惠的菜！\n\n1. 重庆小面 ¥9 — 麻辣鲜香，面条劲道！\n2. 麻婆豆腐 ¥8 — 经典川菜，配米饭一绝！\n[DISH:d007,d001]'

  // 组装消息
  var chatMessages = [{ role: 'system', content: systemPrompt }]
  // 添加历史对话（最多最近13条）
  var recent = messages.slice(-13)
  for (var i = 0; i < recent.length; i++) {
    chatMessages.push(recent[i])
  }

  // 调用大模型
  var baseUrl = config.base_url || 'https://dashscope.aliyuncs.com/compatible-mode/v1'

  // httpclient 要求带协议头，漏写 https:// 会直接抛错，这里先给出人话提示
  if (!/^https?:\/\//i.test(baseUrl)) {
    return {
      code: 1,
      message: 'base_url 配置有误：「' + baseUrl + '」缺少 http(s):// 前缀，请在管理后台→AI配置中修正'
    }
  }
  // 允许把 /chat/completions 一起填进来，统一去掉，避免拼出重复路径
  var url = baseUrl.replace(/\/+$/, '').replace(/\/chat\/completions$/, '') + '/chat/completions'
  var model = config.model || 'qwen-turbo'

  try {
    // 注意：变量名不要与上面读取配置用的 res 重名（var 会提升到同一函数作用域）
    var aiRes = await uniCloud.httpclient.request(url, {
      method: 'POST',
      timeout: 30000,
      // 显式声明按 JSON 解析：否则 data 可能是一段字符串，
      // 下面取 choices 会得到 undefined 并抛出难以理解的 TypeError，
      // 最终被折叠成一句「大模型调用失败」而看不到真正原因
      dataType: 'json',
      contentType: 'json',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + config.api_key
      },
      data: {
        model: model,
        messages: chatMessages,
        // 用管理后台配置的温度；没配过就用 0.8
        temperature: typeof config.temperature === 'number' ? config.temperature : 0.8,
        max_tokens: 1000
      }
    })

    // 兼容个别情况下仍返回字符串的情况
    var body = aiRes.data
    if (typeof body === 'string') {
      try { body = JSON.parse(body) } catch (parseErr) { /* 保持原样，下面统一报错 */ }
    }
    var bodyText = typeof body === 'string'
      ? body.slice(0, 300)
      : JSON.stringify(body || {}).slice(0, 300)

    if (aiRes.status !== 200) {
      var errMsg = '调用失败 HTTP ' + aiRes.status
      if (body && body.error && body.error.message) {
        errMsg = '调用失败 HTTP ' + aiRes.status + '：' + body.error.message
      } else if (bodyText) {
        errMsg = '调用失败 HTTP ' + aiRes.status + '：' + bodyText
      }
      return { code: 1, message: errMsg }
    }

    if (!body || !body.choices || !body.choices[0] || !body.choices[0].message) {
      return {
        code: 1,
        message: '大模型返回格式异常（model=' + model + '）：' + bodyText
      }
    }

    var reply = body.choices[0].message.content || ''

    // 解析 [DISH:id1,id2] 标注（用同一个菜品库，保证卡片信息与提示词一致）
    var dishMatch = reply.match(/\[DISH:([^\]]+)\]/)
    var dishes = []
    if (dishMatch) {
      var ids = dishMatch[1].split(',')
      var dishMap = {}
      for (var j = 0; j < dishLibrary.length; j++) {
        dishMap[dishLibrary[j].id] = dishLibrary[j]
      }
      for (var k = 0; k < ids.length; k++) {
        var did = ids[k].trim()
        if (dishMap[did]) {
          dishes.push(dishMap[did])
        }
      }
    }

    // 去掉标注，保留纯文字
    var content = reply.replace(/\[DISH:[^\]]+\]/g, '').trim()

    return {
      code: 0,
      data: {
        content: content,
        dishes: dishes
      }
    }
  } catch (e) {
    // 附上请求地址与模型名（绝不回显 api_key），方便区分「地址不可达 / 超时 / 域名写错」
    return {
      code: 1,
      message: '大模型调用失败：' + ((e && (e.message || e.errMsg)) || '未知错误') +
        '\n请求地址：' + url +
        '\n模型：' + model
    }
  }
}
