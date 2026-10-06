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
 * 兜底菜品库（仅当 dishes 集合为空或读库失败时使用）
 *
 * 正常情况下应当从 dishes 集合读，这样管理后台改的位置/图片/价格
 * 才能反映到 AI 回答里。这份内嵌数据必须与 common/local-dishes.js
 * 以及 shiyu-seed 的 SEED_DISHES 完全一致，否则 AI 会推荐菜单里没有的菜。
 *
 * 由 node _search/sync-datasets.mjs --write 自动生成，请勿手工修改。
 */
var FALLBACK_DISHES = [
  { id: 'd001', name: '麻婆豆腐', price: 8, canteen: '第一食堂', floor: null, window: '川味窗口', category: '川菜', tags: ['辣', '麻辣', '下饭', '葱', '蒜', '牛肉'], description: '嫩豆腐配牛肉末，麻辣鲜香，拌米饭特别下饭', rating: 4.6 },
  { id: 'd002', name: '水煮肉片', price: 15, canteen: '第一食堂', floor: null, window: '川味窗口', category: '川菜', tags: ['辣', '麻辣', '重油', '下饭', '葱', '蒜'], description: '厚切肉片浸在红油里，麻辣过瘾，配菜吸满汤汁', rating: 4.7 },
  { id: 'd003', name: '回锅肉', price: 14, canteen: '第一食堂', floor: null, window: '川味窗口', category: '川菜', tags: ['辣', '咸香', '重油', '下饭', '蒜'], description: '二刀肉肥瘦相间，配上蒜苗爆炒，咸香又下饭', rating: 4.5 },
  { id: 'd004', name: '宫保鸡丁', price: 12, canteen: '第一食堂', floor: null, window: '川味窗口', category: '川菜', tags: ['辣', '甜', '酸', '花生', '下饭', '葱'], description: '鸡肉丁配花生米，酸甜微辣，甜辣交织很开胃', rating: 4.8 },
  { id: 'd005', name: '鱼香肉丝', price: 13, canteen: '第一食堂', floor: null, window: '川味窗口', category: '川菜', tags: ['酸', '甜', '辣', '下饭', '葱', '蒜'], description: '肉丝滑嫩，鱼香汁酸甜带辣，是米饭的最佳搭档', rating: 4.6 },
  { id: 'd006', name: '辣子鸡', price: 16, canteen: '第一食堂', floor: null, window: '川味窗口', category: '川菜', tags: ['辣', '麻辣', '重油', '鲜嫩'], description: '鸡块炸到金黄酥脆，在辣椒堆里翻找的快乐最过瘾', rating: 4.4 },
  { id: 'd007', name: '酸辣土豆丝', price: 6, canteen: '第一食堂', floor: null, window: '川味窗口', category: '川菜', tags: ['酸', '辣', '下饭'], description: '土豆丝脆爽酸辣，几块钱一份，配饭配馒头都香', rating: 4.3 },
  { id: 'd008', name: '毛血旺', price: 18, canteen: '第一食堂', floor: null, window: '川味窗口', category: '川菜', tags: ['辣', '麻辣', '重油', '内脏'], description: '鸭血毛肚黄喉一锅煮，麻辣厚重，重口味同学最爱', rating: 4.5 },
  { id: 'd009', name: '番茄炒蛋', price: 7, canteen: '第一食堂', floor: null, window: '家常窗口', category: '家常菜', tags: ['酸', '甜', '清淡', '鸡蛋', '下饭'], description: '番茄酸甜出汁，鸡蛋滑嫩，是永远吃不腻的家常味', rating: 4.7 },
  { id: 'd010', name: '土豆炖牛肉', price: 16, canteen: '第一食堂', floor: null, window: '家常窗口', category: '家常菜', tags: ['咸香', '下饭', '牛肉', '养胃'], description: '牛肉炖得软烂入味，土豆吸饱汤汁，暖心又暖胃', rating: 4.8 },
  { id: 'd011', name: '清炒时蔬', price: 5, canteen: '第一食堂', floor: null, window: '家常窗口', category: '素菜', tags: ['清淡', '低卡', '养胃'], description: '当日时令青菜大火快炒，少油少盐，清爽解腻', rating: 4.2 },
  { id: 'd012', name: '香菇滑鸡', price: 13, canteen: '第一食堂', floor: null, window: '家常窗口', category: '家常菜', tags: ['咸香', '鲜嫩', '清淡', '下饭'], description: '香菇和鸡块焖到入味，汁水浓稠，淋在饭上绝了', rating: 4.6 },
  { id: 'd013', name: '蒜蓉粉丝娃娃菜', price: 7, canteen: '第一食堂', floor: null, window: '家常窗口', category: '素菜', tags: ['清淡', '蒜', '低卡'], description: '娃娃菜铺上粉丝和蒜蓉清蒸，鲜甜清爽不油腻', rating: 4.4 },
  { id: 'd014', name: '牛肉拉面', price: 14, canteen: '第二食堂', floor: null, window: '面食窗口', category: '面食', tags: ['汤面', '咸香', '养胃', '牛肉', '葱', '香菜'], description: '现拉面条筋道，牛骨汤底清亮，一碗下去很踏实', rating: 4.8 },
  { id: 'd015', name: '番茄鸡蛋面', price: 10, canteen: '第二食堂', floor: null, window: '面食窗口', category: '面食', tags: ['汤面', '酸', '养胃', '鸡蛋', '葱'], description: '番茄熬出的汤底微酸开胃，配上嫩滑蛋花很舒服', rating: 4.5 },
  { id: 'd016', name: '重庆小面', price: 9, canteen: '第二食堂', floor: null, window: '面食窗口', category: '面食', tags: ['辣', '麻辣', '汤面', '葱', '蒜'], description: '红油辣子打底，面条爽滑，麻辣味从舌尖冲到额头', rating: 4.6 },
  { id: 'd017', name: '炸酱面', price: 11, canteen: '第二食堂', floor: null, window: '面食窗口', category: '面食', tags: ['咸香', '干拌面', '下饭', '葱'], description: '肉末黄豆酱炒出香味，拌上劲道面条越嚼越香', rating: 4.4 },
  { id: 'd018', name: '担担面', price: 12, canteen: '第二食堂', floor: null, window: '面食窗口', category: '面食', tags: ['麻辣', '干拌面', '花生', '葱', '辣'], description: '芝麻花生酱拌面，麻辣回甜，小小一碗滋味很足', rating: 4.5 },
  { id: 'd019', name: '阳春面', price: 5, canteen: '第二食堂', floor: null, window: '面食窗口', category: '面食', tags: ['清淡', '汤面', '早餐', '养胃', '葱'], description: '清汤挂面撒把葱花，简单却养胃，早餐刚刚好', rating: 4.1 },
  { id: 'd020', name: '黄焖鸡米饭', price: 15, canteen: '第二食堂', floor: null, window: '快餐窗口', category: '快餐', tags: ['咸香', '下饭', '鲜嫩'], description: '鸡块焖到脱骨，汤汁浓郁，配米饭一口接一口', rating: 4.7 },
  { id: 'd021', name: '咖喱鸡肉饭', price: 14, canteen: '第二食堂', floor: null, window: '快餐窗口', category: '快餐', tags: ['咸香', '下饭'], description: '咖喱土豆胡萝卜炖鸡肉，浓稠微甜，拌饭超香', rating: 4.3 },
  { id: 'd022', name: '红烧牛肉饭', price: 18, canteen: '第二食堂', floor: null, window: '快餐窗口', category: '快餐', tags: ['咸香', '下饭', '牛肉', '养胃'], description: '大块牛肉红烧入味，酱汁浇在饭上，吃着特别满足', rating: 4.9 },
  { id: 'd023', name: '孜然羊肉饭', price: 19, canteen: '第二食堂', floor: null, window: '快餐窗口', category: '快餐', tags: ['咸香', '羊肉', '下饭'], description: '孜然羊肉粒爆炒出香味，配着米饭解馋又顶饱', rating: 4.5 },
  { id: 'd024', name: '番茄牛腩饭', price: 17, canteen: '第二食堂', floor: null, window: '快餐窗口', category: '快餐', tags: ['酸', '咸香', '下饭', '牛肉'], description: '牛腩炖到软糯，番茄汤汁酸甜，泡饭能吃两碗', rating: 4.8 },
  { id: 'd025', name: '照烧鸡腿饭', price: 16, canteen: '第二食堂', floor: null, window: '快餐窗口', category: '快餐', tags: ['甜', '咸香', '下饭'], description: '鸡腿肉煎香后刷照烧汁，甜咸油亮，看着就有食欲', rating: 4.6 },
  { id: 'd026', name: '麻辣烫', price: 12, canteen: '第二食堂', floor: null, window: '小吃窗口', category: '小吃', tags: ['麻辣', '辣', '重油', '香菜', '蒜'], description: '自选食材一大碗，麻辣汤底煮透，冬天吃着最舒服', rating: 4.5 },
  { id: 'd027', name: '煎饼果子', price: 6, canteen: '第二食堂', floor: null, window: '小吃窗口', category: '小吃', tags: ['早餐', '咸香', '鸡蛋', '葱', '香菜'], description: '现摊薄脆加鸡蛋，刷上酱料卷起来，趁热最好吃', rating: 4.4 },
  { id: 'd028', name: '肉夹馍', price: 9, canteen: '第二食堂', floor: null, window: '小吃窗口', category: '小吃', tags: ['咸香', '下饭', '葱'], description: '腊汁肉剁碎夹进白吉馍，肉香浓馍酥脆，一口满足', rating: 4.6 },
  { id: 'd029', name: '酸辣粉', price: 8, canteen: '第二食堂', floor: null, window: '小吃窗口', category: '小吃', tags: ['酸', '辣', '重油', '香菜', '花生', '葱'], description: '红薯粉煮得爽滑，酸辣汤底加花生碎，越吃越上瘾', rating: 4.3 },
  { id: 'd030', name: '鸭血粉丝汤', price: 10, canteen: '第二食堂', floor: null, window: '小吃窗口', category: '小吃', tags: ['汤面', '养胃', '内脏', '香菜', '葱'], description: '鸭血嫩滑，粉丝吸满鲜汤，撒香菜热乎乎一碗', rating: 4.5 },
  { id: 'd031', name: '小笼包', price: 8, canteen: '第二食堂', floor: null, window: '小吃窗口', category: '小吃', tags: ['早餐', '鲜嫩', '葱'], description: '皮薄馅足一咬爆汁，蘸点醋吃，早餐来一笼刚好', rating: 4.7 },
  { id: 'd032', name: '白切鸡', price: 16, canteen: '第三食堂', floor: null, window: '粤菜窗口', category: '粤菜', tags: ['清淡', '鲜嫩', '葱', '蒜'], description: '皮爽肉滑蘸姜葱酱，原汁原味，清淡却一点不寡淡', rating: 4.8 },
  { id: 'd033', name: '蜜汁叉烧', price: 18, canteen: '第三食堂', floor: null, window: '粤菜窗口', category: '粤菜', tags: ['甜', '咸香', '下饭'], description: '叉烧外皮焦糖色，蜜汁甜香，切片盖饭最受欢迎', rating: 4.7 },
  { id: 'd034', name: '蒜蓉蒸虾', price: 20, canteen: '第三食堂', floor: null, window: '粤菜窗口', category: '粤菜', tags: ['清淡', '鲜嫩', '海鲜', '蒜'], description: '鲜虾开背铺蒜蓉蒸熟，虾肉弹牙，鲜甜味全部锁住', rating: 4.9 },
  { id: 'd035', name: '干炒牛河', price: 15, canteen: '第三食堂', floor: null, window: '粤菜窗口', category: '粤菜', tags: ['咸香', '重油', '牛肉', '葱'], description: '河粉炒得干爽油亮，牛肉嫩滑，锅气十足很香', rating: 4.6 },
  { id: 'd036', name: '羊肉泡馍', price: 18, canteen: '第三食堂', floor: null, window: '地方风味', category: '地方菜', tags: ['咸香', '养胃', '羊肉', '香菜', '葱'], description: '馍掰碎泡进羊汤，肉烂汤浓，吃完浑身都热乎', rating: 4.5 },
  { id: 'd037', name: '螺蛳粉', price: 13, canteen: '第三食堂', floor: null, window: '地方风味', category: '地方菜', tags: ['酸', '辣', '重油', '香菜', '葱', '花生'], description: '酸笋气味霸道，米粉爽滑，汤底酸辣让人又爱又恨', rating: 4.4 },
  { id: 'd038', name: '鸡胸肉沙拉', price: 13, canteen: '第三食堂', floor: null, window: '轻食窗口', category: '轻食', tags: ['低卡', '清淡', '鲜嫩', '鸡蛋'], description: '煎鸡胸配水煮蛋和生菜，低脂高蛋白，减脂同学首选', rating: 4.3 },
  { id: 'd039', name: '藜麦蔬菜饭', price: 14, canteen: '第三食堂', floor: null, window: '轻食窗口', category: '轻食', tags: ['低卡', '清淡', '养胃'], description: '藜麦混搭时蔬和玉米粒，饱腹感很强又不怕胖', rating: 4.2 },
  { id: 'd040', name: '牛奶燕麦碗', price: 8, canteen: '第三食堂', floor: null, window: '轻食窗口', category: '轻食', tags: ['低卡', '甜', '早餐', '牛奶', '养胃'], description: '燕麦泡热牛奶，加香蕉和坚果，甜甜的一碗早餐', rating: 4.4 }
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
    // ⚠️ 示例里的菜品 ID 必须与菜品库对得上（宫保鸡丁=d004、白切鸡=d032、
    //    重庆小面=d016、麻婆豆腐=d001）。ID 写错会让模型学着输出错的 ID，
    //    界面就会把推荐链接到另一道菜上。改菜品数据后请跑 _search/check.mjs 复核。
    '示例对话：\n' +
    '学生：想吃鸡肉\n' +
    '你：想吃鸡肉呀！给你推荐几道鸡肉菜：\n\n1. 宫保鸡丁 ¥12 — 鸡肉丁配花生米，酸甜微辣，很开胃！\n2. 白切鸡 ¥16 — 皮爽肉滑，原汁原味，配姜葱酱绝佳！\n\n都是同学评价很高的鸡肉菜哦！\n[DISH:d004,d032]\n\n' +
    '学生：想吃辣的，10块以内\n' +
    '你：来，给你推荐几道又辣又实惠的菜！\n\n1. 重庆小面 ¥9 — 麻辣鲜香，面条爽滑！\n2. 麻婆豆腐 ¥8 — 麻辣鲜香，拌米饭特别下饭！\n[DISH:d016,d001]'

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
