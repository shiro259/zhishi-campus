/**
 * 本机菜谱（客户端兜底数据源）
 *
 * ⚠️ 这份数据必须与云端种子数据 uniCloud-aliyun/cloudfunctions/shiyu-seed/index.js
 *    的 SEED_DISHES 保持**完全一致**（菜名 / 食堂 / 窗口 / 分类 / tags / 价格 / image）。
 *
 * 原因：搜索的关键字匹配同时覆盖「菜名 / 标签 / 窗口 / 食堂 / 分类」。
 *   两份数据一旦分叉，同一个关键词走云端和走本地兜底就会返回两批不同的菜，
 *   用户看到的就是「有时候搜不到、有时候搜到错误菜品」。
 *
 * 改动方式：改完 shiyu-seed 的 SEED_DISHES 后运行
 *   node _search/sync-datasets.mjs --write
 * 由脚本把云端种子数据同步到本文件，避免手工改出偏差；
 * 再用 node _search/compare-datasets.mjs 复核两份是否一致。
 *
 * 字段与云端 dishes 集合一致：
 *   id / name / price / canteen / window / category / tags / emoji /
 *   image / description / rating / review_count / recommend_count / status / is_new
 *
 * tags 说明：除口味词（辣、麻辣、清淡、咸香、甜、酸、重油、鲜嫩、下饭、汤面、
 *   干拌面、养胃、早餐、低卡）外，还包含忌口相关食材名（香菜、葱、蒜、花生、
 *   海鲜、牛肉、羊肉、内脏、鸡蛋、牛奶）——推荐引擎据此做忌口硬过滤，
 *   含该食材的菜品必须把食材名写进 tags，否则过敏同学可能被推荐到忌口菜。
 */

export const LOCAL_DISHES = [
  // ===== 第一食堂 · 川味窗口 =====
  { id: 'd001', name: '麻婆豆腐', price: 8, canteen: '第一食堂', window: '川味窗口', category: '川菜',
    tags: ['辣', '麻辣', '下饭', '葱', '蒜', '牛肉'], emoji: '🌶️', image: 'static/dishes/d001.jpg', description: '嫩豆腐配牛肉末，麻辣鲜香，拌米饭特别下饭',
    rating: 4.6, review_count: 128, recommend_count: 86, status: 1, is_new: false },
  { id: 'd002', name: '水煮肉片', price: 15, canteen: '第一食堂', window: '川味窗口', category: '川菜',
    tags: ['辣', '麻辣', '重油', '下饭', '葱', '蒜'], emoji: '🥩', image: 'static/dishes/d003.jpg', description: '厚切肉片浸在红油里，麻辣过瘾，配菜吸满汤汁',
    rating: 4.7, review_count: 156, recommend_count: 120, status: 1, is_new: false },
  { id: 'd003', name: '回锅肉', price: 14, canteen: '第一食堂', window: '川味窗口', category: '川菜',
    tags: ['辣', '咸香', '重油', '下饭', '蒜'], emoji: '🥓', image: 'static/dishes/d008.jpg', description: '二刀肉肥瘦相间，配上蒜苗爆炒，咸香又下饭',
    rating: 4.5, review_count: 143, recommend_count: 98, status: 1, is_new: false },
  { id: 'd004', name: '宫保鸡丁', price: 12, canteen: '第一食堂', window: '川味窗口', category: '川菜',
    tags: ['辣', '甜', '酸', '花生', '下饭', '葱'], emoji: '🍗', image: 'static/dishes/d002.jpg', description: '鸡肉丁配花生米，酸甜微辣，甜辣交织很开胃',
    rating: 4.8, review_count: 210, recommend_count: 175, status: 1, is_new: false },
  { id: 'd005', name: '鱼香肉丝', price: 13, canteen: '第一食堂', window: '川味窗口', category: '川菜',
    tags: ['酸', '甜', '辣', '下饭', '葱', '蒜'], emoji: '🥢', image: 'static/dishes/d004.jpg', description: '肉丝滑嫩，鱼香汁酸甜带辣，是米饭的最佳搭档',
    rating: 4.6, review_count: 168, recommend_count: 132, status: 1, is_new: false },
  { id: 'd006', name: '辣子鸡', price: 16, canteen: '第一食堂', window: '川味窗口', category: '川菜',
    tags: ['辣', '麻辣', '重油', '鲜嫩'], emoji: '🍖', image: 'static/dishes/d002.jpg', description: '鸡块炸到金黄酥脆，在辣椒堆里翻找的快乐最过瘾',
    rating: 4.4, review_count: 96, recommend_count: 64, status: 1, is_new: false },
  { id: 'd007', name: '酸辣土豆丝', price: 6, canteen: '第一食堂', window: '川味窗口', category: '川菜',
    tags: ['酸', '辣', '下饭'], emoji: '🥔', image: 'static/dishes/d007.jpg', description: '土豆丝脆爽酸辣，几块钱一份，配饭配馒头都香',
    rating: 4.3, review_count: 187, recommend_count: 110, status: 1, is_new: false },
  { id: 'd008', name: '毛血旺', price: 18, canteen: '第一食堂', window: '川味窗口', category: '川菜',
    tags: ['辣', '麻辣', '重油', '内脏'], emoji: '🍲', image: 'static/dishes/d005.jpg', description: '鸭血毛肚黄喉一锅煮，麻辣厚重，重口味同学最爱',
    rating: 4.5, review_count: 88, recommend_count: 73, status: 1, is_new: false },
  // ===== 第一食堂 · 家常窗口 =====
  { id: 'd009', name: '番茄炒蛋', price: 7, canteen: '第一食堂', window: '家常窗口', category: '家常菜',
    tags: ['酸', '甜', '清淡', '鸡蛋', '下饭'], emoji: '🍅', image: 'static/dishes/d009.jpg', description: '番茄酸甜出汁，鸡蛋滑嫩，是永远吃不腻的家常味',
    rating: 4.7, review_count: 234, recommend_count: 190, status: 1, is_new: false },
  { id: 'd010', name: '土豆炖牛肉', price: 16, canteen: '第一食堂', window: '家常窗口', category: '家常菜',
    tags: ['咸香', '下饭', '牛肉', '养胃'], emoji: '🍛', image: 'static/dishes/d010.jpg', description: '牛肉炖得软烂入味，土豆吸饱汤汁，暖心又暖胃',
    rating: 4.8, review_count: 176, recommend_count: 142, status: 1, is_new: false },
  { id: 'd011', name: '清炒时蔬', price: 5, canteen: '第一食堂', window: '家常窗口', category: '素菜',
    tags: ['清淡', '低卡', '养胃'], emoji: '🥬', image: 'static/dishes/d012.jpg', description: '当日时令青菜大火快炒，少油少盐，清爽解腻',
    rating: 4.2, review_count: 76, recommend_count: 38, status: 1, is_new: false },
  { id: 'd012', name: '香菇滑鸡', price: 13, canteen: '第一食堂', window: '家常窗口', category: '家常菜',
    tags: ['咸香', '鲜嫩', '清淡', '下饭'], emoji: '🍄', image: 'static/dishes/d020.jpg', description: '香菇和鸡块焖到入味，汁水浓稠，淋在饭上绝了',
    rating: 4.6, review_count: 112, recommend_count: 79, status: 1, is_new: false },
  { id: 'd013', name: '蒜蓉粉丝娃娃菜', price: 7, canteen: '第一食堂', window: '家常窗口', category: '素菜',
    tags: ['清淡', '蒜', '低卡'], emoji: '🥗', image: 'static/dishes/d014.jpg', description: '娃娃菜铺上粉丝和蒜蓉清蒸，鲜甜清爽不油腻',
    rating: 4.4, review_count: 98, recommend_count: 52, status: 1, is_new: false },
  // ===== 第二食堂 · 面食窗口 =====
  { id: 'd014', name: '牛肉拉面', price: 14, canteen: '第二食堂', window: '面食窗口', category: '面食',
    tags: ['汤面', '咸香', '养胃', '牛肉', '葱', '香菜'], emoji: '🍜', image: 'static/dishes/d015.jpg', description: '现拉面条筋道，牛骨汤底清亮，一碗下去很踏实',
    rating: 4.8, review_count: 256, recommend_count: 205, status: 1, is_new: false },
  { id: 'd015', name: '番茄鸡蛋面', price: 10, canteen: '第二食堂', window: '面食窗口', category: '面食',
    tags: ['汤面', '酸', '养胃', '鸡蛋', '葱'], emoji: '🍝', image: 'static/dishes/d018.jpg', description: '番茄熬出的汤底微酸开胃，配上嫩滑蛋花很舒服',
    rating: 4.5, review_count: 168, recommend_count: 121, status: 1, is_new: false },
  { id: 'd016', name: '重庆小面', price: 9, canteen: '第二食堂', window: '面食窗口', category: '面食',
    tags: ['辣', '麻辣', '汤面', '葱', '蒜'], emoji: '🌶️', image: 'static/dishes/d006.jpg', description: '红油辣子打底，面条爽滑，麻辣味从舌尖冲到额头',
    rating: 4.6, review_count: 198, recommend_count: 166, status: 1, is_new: false },
  { id: 'd017', name: '炸酱面', price: 11, canteen: '第二食堂', window: '面食窗口', category: '面食',
    tags: ['咸香', '干拌面', '下饭', '葱'], emoji: '🍜', image: 'static/dishes/d019.jpg', description: '肉末黄豆酱炒出香味，拌上劲道面条越嚼越香',
    rating: 4.4, review_count: 132, recommend_count: 87, status: 1, is_new: false },
  { id: 'd018', name: '担担面', price: 12, canteen: '第二食堂', window: '面食窗口', category: '面食',
    tags: ['麻辣', '干拌面', '花生', '葱', '辣'], emoji: '🥡', image: 'static/dishes/d006.jpg', description: '芝麻花生酱拌面，麻辣回甜，小小一碗滋味很足',
    rating: 4.5, review_count: 118, recommend_count: 74, status: 1, is_new: false },
  { id: 'd019', name: '阳春面', price: 5, canteen: '第二食堂', window: '面食窗口', category: '面食',
    tags: ['清淡', '汤面', '早餐', '养胃', '葱'], emoji: '🍲', image: 'static/dishes/d015.jpg', description: '清汤挂面撒把葱花，简单却养胃，早餐刚刚好',
    rating: 4.1, review_count: 64, recommend_count: 29, status: 1, is_new: false },
  // ===== 第二食堂 · 快餐窗口 =====
  { id: 'd020', name: '黄焖鸡米饭', price: 15, canteen: '第二食堂', window: '快餐窗口', category: '快餐',
    tags: ['咸香', '下饭', '鲜嫩'], emoji: '🍗', image: 'static/dishes/d020.jpg', description: '鸡块焖到脱骨，汤汁浓郁，配米饭一口接一口',
    rating: 4.7, review_count: 289, recommend_count: 231, status: 1, is_new: false },
  { id: 'd021', name: '咖喱鸡肉饭', price: 14, canteen: '第二食堂', window: '快餐窗口', category: '快餐',
    tags: ['咸香', '下饭'], emoji: '🍛', image: 'static/dishes/d022.jpg', description: '咖喱土豆胡萝卜炖鸡肉，浓稠微甜，拌饭超香',
    rating: 4.3, review_count: 104, recommend_count: 61, status: 1, is_new: false },
  { id: 'd022', name: '红烧牛肉饭', price: 18, canteen: '第二食堂', window: '快餐窗口', category: '快餐',
    tags: ['咸香', '下饭', '牛肉', '养胃'], emoji: '🥘', image: 'static/dishes/d041.jpg', description: '大块牛肉红烧入味，酱汁浇在饭上，吃着特别满足',
    rating: 4.9, review_count: 302, recommend_count: 258, status: 1, is_new: false },
  { id: 'd023', name: '孜然羊肉饭', price: 19, canteen: '第二食堂', window: '快餐窗口', category: '快餐',
    tags: ['咸香', '羊肉', '下饭'], emoji: '🍖', image: 'static/dishes/d036.jpg', description: '孜然羊肉粒爆炒出香味，配着米饭解馋又顶饱',
    rating: 4.5, review_count: 96, recommend_count: 68, status: 1, is_new: false },
  { id: 'd024', name: '番茄牛腩饭', price: 17, canteen: '第二食堂', window: '快餐窗口', category: '快餐',
    tags: ['酸', '咸香', '下饭', '牛肉'], emoji: '🍲', image: 'static/dishes/d010.jpg', description: '牛腩炖到软糯，番茄汤汁酸甜，泡饭能吃两碗',
    rating: 4.8, review_count: 154, recommend_count: 128, status: 1, is_new: false },
  { id: 'd025', name: '照烧鸡腿饭', price: 16, canteen: '第二食堂', window: '快餐窗口', category: '快餐',
    tags: ['甜', '咸香', '下饭'], emoji: '🍱', image: 'static/dishes/d031.jpg', description: '鸡腿肉煎香后刷照烧汁，甜咸油亮，看着就有食欲',
    rating: 4.6, review_count: 141, recommend_count: 103, status: 1, is_new: true },
  // ===== 第二食堂 · 小吃窗口 =====
  { id: 'd026', name: '麻辣烫', price: 12, canteen: '第二食堂', window: '小吃窗口', category: '小吃',
    tags: ['麻辣', '辣', '重油', '香菜', '蒜'], emoji: '🍢', image: 'static/dishes/d005.jpg', description: '自选食材一大碗，麻辣汤底煮透，冬天吃着最舒服',
    rating: 4.5, review_count: 267, recommend_count: 198, status: 1, is_new: false },
  { id: 'd027', name: '煎饼果子', price: 6, canteen: '第二食堂', window: '小吃窗口', category: '小吃',
    tags: ['早餐', '咸香', '鸡蛋', '葱', '香菜'], emoji: '🥞', image: 'static/dishes/d028.jpg', description: '现摊薄脆加鸡蛋，刷上酱料卷起来，趁热最好吃',
    rating: 4.4, review_count: 189, recommend_count: 112, status: 1, is_new: false },
  { id: 'd028', name: '肉夹馍', price: 9, canteen: '第二食堂', window: '小吃窗口', category: '小吃',
    tags: ['咸香', '下饭', '葱'], emoji: '🥙', image: 'static/dishes/d028.jpg', description: '腊汁肉剁碎夹进白吉馍，肉香浓馍酥脆，一口满足',
    rating: 4.6, review_count: 172, recommend_count: 134, status: 1, is_new: false },
  { id: 'd029', name: '酸辣粉', price: 8, canteen: '第二食堂', window: '小吃窗口', category: '小吃',
    tags: ['酸', '辣', '重油', '香菜', '花生', '葱'], emoji: '🍜', image: 'static/dishes/d006.jpg', description: '红薯粉煮得爽滑，酸辣汤底加花生碎，越吃越上瘾',
    rating: 4.3, review_count: 143, recommend_count: 91, status: 1, is_new: false },
  { id: 'd030', name: '鸭血粉丝汤', price: 10, canteen: '第二食堂', window: '小吃窗口', category: '小吃',
    tags: ['汤面', '养胃', '内脏', '香菜', '葱'], emoji: '🍲', image: 'static/dishes/d033.jpg', description: '鸭血嫩滑，粉丝吸满鲜汤，撒香菜热乎乎一碗',
    rating: 4.5, review_count: 108, recommend_count: 76, status: 1, is_new: true },
  { id: 'd031', name: '小笼包', price: 8, canteen: '第二食堂', window: '小吃窗口', category: '小吃',
    tags: ['早餐', '鲜嫩', '葱'], emoji: '🥟', image: 'static/dishes/d025.jpg', description: '皮薄馅足一咬爆汁，蘸点醋吃，早餐来一笼刚好',
    rating: 4.7, review_count: 204, recommend_count: 158, status: 1, is_new: false },
  // ===== 第三食堂 · 粤菜窗口 =====
  { id: 'd032', name: '白切鸡', price: 16, canteen: '第三食堂', window: '粤菜窗口', category: '粤菜',
    tags: ['清淡', '鲜嫩', '葱', '蒜'], emoji: '🍗', image: 'static/dishes/d030.jpg', description: '皮爽肉滑蘸姜葱酱，原汁原味，清淡却一点不寡淡',
    rating: 4.8, review_count: 132, recommend_count: 96, status: 1, is_new: false },
  { id: 'd033', name: '蜜汁叉烧', price: 18, canteen: '第三食堂', window: '粤菜窗口', category: '粤菜',
    tags: ['甜', '咸香', '下饭'], emoji: '🍖', image: 'static/dishes/d031.jpg', description: '叉烧外皮焦糖色，蜜汁甜香，切片盖饭最受欢迎',
    rating: 4.7, review_count: 156, recommend_count: 119, status: 1, is_new: false },
  { id: 'd034', name: '蒜蓉蒸虾', price: 20, canteen: '第三食堂', window: '粤菜窗口', category: '粤菜',
    tags: ['清淡', '鲜嫩', '海鲜', '蒜'], emoji: '🦐', image: 'static/dishes/d012.jpg', description: '鲜虾开背铺蒜蓉蒸熟，虾肉弹牙，鲜甜味全部锁住',
    rating: 4.9, review_count: 98, recommend_count: 84, status: 1, is_new: true },
  { id: 'd035', name: '干炒牛河', price: 15, canteen: '第三食堂', window: '粤菜窗口', category: '粤菜',
    tags: ['咸香', '重油', '牛肉', '葱'], emoji: '🍝', image: 'static/dishes/d029.jpg', description: '河粉炒得干爽油亮，牛肉嫩滑，锅气十足很香',
    rating: 4.6, review_count: 124, recommend_count: 88, status: 1, is_new: false },
  // ===== 第三食堂 · 地方风味 =====
  { id: 'd036', name: '羊肉泡馍', price: 18, canteen: '第三食堂', window: '地方风味', category: '地方菜',
    tags: ['咸香', '养胃', '羊肉', '香菜', '葱'], emoji: '🍲', image: 'static/dishes/d034.jpg', description: '馍掰碎泡进羊汤，肉烂汤浓，吃完浑身都热乎',
    rating: 4.5, review_count: 87, recommend_count: 65, status: 1, is_new: false },
  { id: 'd037', name: '螺蛳粉', price: 13, canteen: '第三食堂', window: '地方风味', category: '地方菜',
    tags: ['酸', '辣', '重油', '香菜', '葱', '花生'], emoji: '🍜', image: 'static/dishes/d026.jpg', description: '酸笋气味霸道，米粉爽滑，汤底酸辣让人又爱又恨',
    rating: 4.4, review_count: 176, recommend_count: 143, status: 1, is_new: true },
  // ===== 第三食堂 · 轻食窗口 =====
  { id: 'd038', name: '鸡胸肉沙拉', price: 13, canteen: '第三食堂', window: '轻食窗口', category: '轻食',
    tags: ['低卡', '清淡', '鲜嫩', '鸡蛋'], emoji: '🥗', image: 'static/dishes/d038.jpg', description: '煎鸡胸配水煮蛋和生菜，低脂高蛋白，减脂同学首选',
    rating: 4.3, review_count: 92, recommend_count: 47, status: 1, is_new: true },
  { id: 'd039', name: '藜麦蔬菜饭', price: 14, canteen: '第三食堂', window: '轻食窗口', category: '轻食',
    tags: ['低卡', '清淡', '养胃'], emoji: '🥙', image: 'static/dishes/d038.jpg', description: '藜麦混搭时蔬和玉米粒，饱腹感很强又不怕胖',
    rating: 4.2, review_count: 68, recommend_count: 35, status: 1, is_new: true },
  { id: 'd040', name: '牛奶燕麦碗', price: 8, canteen: '第三食堂', window: '轻食窗口', category: '轻食',
    tags: ['低卡', '甜', '早餐', '牛奶', '养胃'], emoji: '🥣', image: 'static/dishes/d039.jpg', description: '燕麦泡热牛奶，加香蕉和坚果，甜甜的一碗早餐',
    rating: 4.4, review_count: 74, recommend_count: 41, status: 1, is_new: true }
]

/**
 * 获取去重后的食堂列表（保持菜品出现顺序：第一食堂、第二食堂、第三食堂）
 * @returns {string[]}
 */
export function getLocalCanteens() {
  const list = []
  LOCAL_DISHES.forEach(function (dish) {
    if (list.indexOf(dish.canteen) < 0) list.push(dish.canteen)
  })
  return list
}

/**
 * 获取去重后的分类列表
 * @returns {string[]}
 */
export function getLocalCategories() {
  const list = []
  LOCAL_DISHES.forEach(function (dish) {
    if (list.indexOf(dish.category) < 0) list.push(dish.category)
  })
  return list
}
