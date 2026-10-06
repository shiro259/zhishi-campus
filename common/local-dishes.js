/**
 * 本地菜品数据（纯前端兜底数据源）
 * 说明：云函数 / 云数据库不可用时，页面可直接读取这里的 40 道食堂菜品做展示与推荐。
 * 字段与云数据库表保持一致：
 *   id / name / price / canteen / window / category / tags / emoji /
 *   description / rating / review_count / recommend_count / status / is_new
 * 注意：tags 中除口味词（辣、麻辣、清淡、咸香、甜、酸、重油、鲜嫩、下饭、汤面、干拌面、养胃、早餐、低卡）外，
 *      还包含忌口相关食材名（香菜、葱、蒜、花生、海鲜、牛肉、羊肉、内脏、鸡蛋、牛奶），
 *      推荐引擎据此做忌口硬过滤，保证过敏食材的菜品绝不出现。
 */

export const LOCAL_DISHES = [
  // ===== 第一食堂 · 川味窗口 =====
  { id: 'd001', name: '麻婆豆腐', price: 8.0, canteen: '第一食堂', window: '川味窗口', category: '川菜',
    tags: ['辣', '麻辣', '咸香'], emoji: '🍲', image: 'static/dishes/d001.jpg', description: '经典川菜，麻辣鲜香，豆腐嫩滑，配米饭一绝。',
    rating: 4.7, review_count: 126, recommend_count: 88, status: 1, is_new: false },
  { id: 'd002', name: '宫保鸡丁', price: 12.0, canteen: '第一食堂', window: '川味窗口', category: '川菜',
    tags: ['辣', '花生', '下饭'], emoji: '🍲', image: 'static/dishes/d002.jpg', description: '选用鸡腿肉与花生同炒，酸甜微辣，下饭神器。',
    rating: 4.8, review_count: 214, recommend_count: 163, status: 1, is_new: false },
  { id: 'd003', name: '水煮肉片', price: 15.0, canteen: '第一食堂', window: '川味窗口', category: '川菜',
    tags: ['麻辣', '重油', '辣'], emoji: '🍲', image: 'static/dishes/d003.jpg', description: '红油滚烫肉片嫩滑，麻辣过瘾，敢挑战的来。',
    rating: 4.6, review_count: 187, recommend_count: 121, status: 1, is_new: false },
  { id: 'd004', name: '鱼香肉丝', price: 11.0, canteen: '第一食堂', window: '川味窗口', category: '川菜',
    tags: ['酸', '辣', '下饭'], emoji: '🍲', image: 'static/dishes/d004.jpg', description: '木耳笋丝配肉丝，酸甜微辣，经典米饭杀手。',
    rating: 4.5, review_count: 168, recommend_count: 96, status: 1, is_new: false },
  { id: 'd005', name: '麻辣香锅', price: 18.0, canteen: '第一食堂', window: '川味窗口', category: '川菜',
    tags: ['麻辣', '辣', '重油'], emoji: '🍲', image: 'static/dishes/d005.jpg', description: '自选食材大火一锅炒，麻辣浓郁，越吃越上头。',
    rating: 4.9, review_count: 302, recommend_count: 248, status: 1, is_new: false },
  { id: 'd006', name: '重庆小面', price: 9.0, canteen: '第一食堂', window: '川味窗口', category: '川菜',
    tags: ['麻辣', '汤面', '辣'], emoji: '🍜', image: 'static/dishes/d006.jpg', description: '碱水面配上红油辣子，麻辣鲜香，一碗见底。',
    rating: 4.7, review_count: 233, recommend_count: 175, status: 1, is_new: false },
  { id: 'd007', name: '酸辣土豆丝', price: 6.0, canteen: '第一食堂', window: '川味窗口', category: '川菜',
    tags: ['酸', '辣', '下饭'], emoji: '🍲', image: 'static/dishes/d007.jpg', description: '手切土豆丝脆爽酸辣，开胃解腻，特别下饭。',
    rating: 4.4, review_count: 145, recommend_count: 72, status: 1, is_new: false },
  { id: 'd008', name: '回锅肉', price: 14.0, canteen: '第一食堂', window: '川味窗口', category: '川菜',
    tags: ['辣', '重油', '蒜'], emoji: '🍲', image: 'static/dishes/d008.jpg', description: '带皮二刀肉配蒜苗爆炒，咸香微辣，油而不腻。',
    rating: 4.6, review_count: 176, recommend_count: 118, status: 1, is_new: false },

  // ===== 第一食堂 · 家常窗口 =====
  { id: 'd009', name: '番茄炒蛋', price: 7.0, canteen: '第一食堂', window: '家常窗口', category: '家常菜',
    tags: ['酸', '鸡蛋', '下饭'], emoji: '🍳', image: 'static/dishes/d009.jpg', description: '番茄酸甜鸡蛋滑嫩，汤汁拌饭，家常天花板。',
    rating: 4.8, review_count: 289, recommend_count: 221, status: 1, is_new: false },
  { id: 'd010', name: '红烧排骨', price: 16.0, canteen: '第一食堂', window: '家常窗口', category: '家常菜',
    tags: ['咸香', '下饭', '鲜嫩'], emoji: '🍳', image: 'static/dishes/d010.jpg', description: '排骨慢炖到脱骨软糯，咸甜入味，汤汁浓稠。',
    rating: 4.7, review_count: 198, recommend_count: 142, status: 1, is_new: false },
  { id: 'd011', name: '青椒肉丝', price: 10.0, canteen: '第一食堂', window: '家常窗口', category: '家常菜',
    tags: ['咸香', '下饭'], emoji: '🍳', image: 'static/dishes/d011.jpg', description: '青椒爽脆肉丝嫩滑，咸香清爽，天天吃也不腻。',
    rating: 4.3, review_count: 134, recommend_count: 61, status: 1, is_new: false },
  { id: 'd012', name: '清炒时蔬', price: 5.0, canteen: '第一食堂', window: '家常窗口', category: '家常菜',
    tags: ['清淡', '低卡'], emoji: '🍳', image: 'static/dishes/d012.jpg', description: '当季时蔬大火快炒，清淡少油，解腻又健康。',
    rating: 4.2, review_count: 96, recommend_count: 44, status: 1, is_new: false },
  { id: 'd013', name: '紫菜蛋花汤', price: 4.0, canteen: '第一食堂', window: '家常窗口', category: '汤羹',
    tags: ['清淡', '鸡蛋', '养胃'], emoji: '🍲', image: 'static/dishes/d013.jpg', description: '紫菜蛋花汤清亮鲜香，咸淡适中，暖胃又便宜。',
    rating: 4.5, review_count: 158, recommend_count: 87, status: 1, is_new: false },
  { id: 'd014', name: '蒜蓉油麦菜', price: 6.0, canteen: '第一食堂', window: '家常窗口', category: '家常菜',
    tags: ['清淡', '蒜', '低卡'], emoji: '🍳', image: 'static/dishes/d014.jpg', description: '油麦菜脆嫩配上蒜蓉爆香，低卡又解腻下饭。',
    rating: 4.4, review_count: 121, recommend_count: 58, status: 1, is_new: false },

  // ===== 第二食堂 · 面食窗口 =====
  { id: 'd015', name: '兰州拉面', price: 12.0, canteen: '第二食堂', window: '面食窗口', category: '面食',
    tags: ['汤面', '牛肉', '香菜', '养胃'], emoji: '🍜', image: 'static/dishes/d015.jpg', description: '手工拉面配大片牛肉，撒把香菜，汤鲜又暖胃。',
    rating: 4.8, review_count: 356, recommend_count: 297, status: 1, is_new: false },
  { id: 'd016', name: '三鲜馄饨', price: 9.0, canteen: '第二食堂', window: '面食窗口', category: '面食',
    tags: ['汤面', '鲜嫩', '海鲜'], emoji: '🥟', image: 'static/dishes/d016.jpg', description: '薄皮馄饨包鲜虾肉馅，汤头清鲜，早餐首选。',
    rating: 4.6, review_count: 172, recommend_count: 105, status: 1, is_new: false },
  { id: 'd017', name: '武汉热干面', price: 8.0, canteen: '第二食堂', window: '面食窗口', category: '面食',
    tags: ['干拌面', '咸香', '葱'], emoji: '🍜', image: 'static/dishes/d017.jpg', description: '碱水面拌芝麻酱，撒葱花萝卜丁，香浓顶饱。',
    rating: 4.5, review_count: 241, recommend_count: 168, status: 1, is_new: false },
  { id: 'd018', name: '西红柿鸡蛋面', price: 9.0, canteen: '第二食堂', window: '面食窗口', category: '面食',
    tags: ['汤面', '鸡蛋', '养胃'], emoji: '🍜', image: 'static/dishes/d018.jpg', description: '西红柿熬出沙再卧鸡蛋，面条筋道，汤酸香开胃。',
    rating: 4.7, review_count: 205, recommend_count: 149, status: 1, is_new: false },
  { id: 'd019', name: '油泼面', price: 10.0, canteen: '第二食堂', window: '面食窗口', category: '面食',
    tags: ['干拌面', '辣', '蒜'], emoji: '🍜', image: 'static/dishes/d019.jpg', description: '手扯宽面泼热油，激香辣椒与蒜末，筋道过瘾。',
    rating: 4.6, review_count: 183, recommend_count: 126, status: 1, is_new: false },

  // ===== 第二食堂 · 快餐窗口 =====
  { id: 'd020', name: '黄焖鸡米饭', price: 14.0, canteen: '第二食堂', window: '快餐窗口', category: '快餐',
    tags: ['咸香', '下饭', '鲜嫩'], emoji: '🍚', image: 'static/dishes/d020.jpg', description: '鸡腿块焖得软烂入味，汤汁浓稠，拌饭一绝。',
    rating: 4.5, review_count: 297, recommend_count: 213, status: 1, is_new: false },
  { id: 'd021', name: '台式卤肉饭', price: 13.0, canteen: '第二食堂', window: '快餐窗口', category: '快餐',
    tags: ['咸香', '重油', '下饭'], emoji: '🍚', image: 'static/dishes/d021.jpg', description: '卤肉丁肥瘦相间，热饭上浇一勺，香到舔碗。',
    rating: 4.4, review_count: 166, recommend_count: 98, status: 1, is_new: false },
  { id: 'd022', name: '咖喱鸡排饭', price: 15.0, canteen: '第二食堂', window: '快餐窗口', category: '快餐',
    tags: ['咸香', '重油', '下饭'], emoji: '🍛', image: 'static/dishes/d022.jpg', description: '现炸鸡排配浓稠咖喱汁，咸香微甜，分量很足。',
    rating: 4.3, review_count: 142, recommend_count: 66, status: 1, is_new: true },
  { id: 'd023', name: '梅菜扣肉饭', price: 16.0, canteen: '第二食堂', window: '快餐窗口', category: '快餐',
    tags: ['重油', '咸香', '下饭'], emoji: '🍚', image: 'static/dishes/d023.jpg', description: '梅干菜吸足肉汁，五花肉入口即化，拌饭特别香。',
    rating: 4.6, review_count: 154, recommend_count: 92, status: 1, is_new: false },
  { id: 'd024', name: '蛋炒饭', price: 7.0, canteen: '第二食堂', window: '快餐窗口', category: '快餐',
    tags: ['咸香', '鸡蛋', '下饭'], emoji: '🍚', image: 'static/dishes/d024.jpg', description: '粒粒分明金黄的蛋炒饭，蛋香浓郁，简单又管饱。',
    rating: 4.4, review_count: 268, recommend_count: 179, status: 1, is_new: false },

  // ===== 第二食堂 · 小吃窗口 =====
  { id: 'd025', name: '沙县蒸饺', price: 8.0, canteen: '第二食堂', window: '小吃窗口', category: '小吃',
    tags: ['鲜嫩', '清淡', '早餐'], emoji: '🥟', image: 'static/dishes/d025.jpg', description: '薄皮蒸饺一口一个，蘸点醋更香，清淡不腻。',
    rating: 4.5, review_count: 189, recommend_count: 112, status: 1, is_new: false },
  { id: 'd026', name: '螺蛳粉', price: 12.0, canteen: '第二食堂', window: '小吃窗口', category: '小吃',
    tags: ['辣', '酸', '重油'], emoji: '🍜', image: 'static/dishes/d026.jpg', description: '酸笋酸辣汤底配米粉，闻着冲吃着香，上瘾。',
    rating: 4.7, review_count: 312, recommend_count: 256, status: 1, is_new: false },
  { id: 'd027', name: '烤冷面', price: 7.0, canteen: '第二食堂', window: '小吃窗口', category: '小吃',
    tags: ['酸', '鸡蛋', '咸香'], emoji: '🍢', image: 'static/dishes/d027.jpg', description: '铁板烤冷面刷酱加蛋，酸甜咸香，边走边吃。',
    rating: 4.3, review_count: 178, recommend_count: 104, status: 1, is_new: false },
  { id: 'd028', name: '手抓饼', price: 6.0, canteen: '第二食堂', window: '小吃窗口', category: '小吃',
    tags: ['重油', '咸香', '鸡蛋', '早餐'], emoji: '🥟', image: 'static/dishes/d028.jpg', description: '层层起酥的手抓饼加蛋加肠，热乎又扛饿管饱。',
    rating: 4.2, review_count: 163, recommend_count: 88, status: 1, is_new: true },

  // ===== 第三食堂 · 粤菜窗口 =====
  { id: 'd029', name: '广东肠粉', price: 9.0, canteen: '第三食堂', window: '粤菜窗口', category: '粤菜',
    tags: ['清淡', '鲜嫩', '早餐'], emoji: '🍚', image: 'static/dishes/d029.jpg', description: '现蒸米浆肠粉薄滑透亮，淋上豉油，清爽鲜香。',
    rating: 4.7, review_count: 216, recommend_count: 158, status: 1, is_new: false },
  { id: 'd030', name: '白切鸡', price: 18.0, canteen: '第三食堂', window: '粤菜窗口', category: '粤菜',
    tags: ['鲜嫩', '清淡', '葱'], emoji: '🍚', image: 'static/dishes/d030.jpg', description: '皮爽肉滑的白切鸡，蘸一碟姜葱酱，原味最鲜。',
    rating: 4.8, review_count: 174, recommend_count: 133, status: 1, is_new: false },
  { id: 'd031', name: '蜜汁叉烧饭', price: 16.0, canteen: '第三食堂', window: '粤菜窗口', category: '粤菜',
    tags: ['甜', '鲜嫩', '下饭'], emoji: '🍚', image: 'static/dishes/d031.jpg', description: '蜜汁叉烧外焦里嫩，甜咸交织，配饭刚刚好。',
    rating: 4.6, review_count: 198, recommend_count: 141, status: 1, is_new: false },
  { id: 'd032', name: '皮蛋瘦肉粥', price: 7.0, canteen: '第三食堂', window: '粤菜窗口', category: '粤菜',
    tags: ['清淡', '养胃', '早餐'], emoji: '🍚', image: 'static/dishes/d032.jpg', description: '大米慢熬到开花，配上皮蛋瘦肉，暖胃好消化。',
    rating: 4.5, review_count: 231, recommend_count: 167, status: 1, is_new: false },

  // ===== 第三食堂 · 地方风味 =====
  { id: 'd033', name: '鸭血粉丝汤', price: 11.0, canteen: '第三食堂', window: '地方风味', category: '地方菜',
    tags: ['汤面', '内脏', '咸香'], emoji: '🍲', image: 'static/dishes/d033.jpg', description: '鸭血嫩滑粉丝爽口，汤底鲜香，南京老味道。',
    rating: 4.6, review_count: 187, recommend_count: 124, status: 1, is_new: false },
  { id: 'd034', name: '羊肉泡馍', price: 17.0, canteen: '第三食堂', window: '地方风味', category: '地方菜',
    tags: ['汤面', '羊肉', '养胃'], emoji: '🍲', image: 'static/dishes/d034.jpg', description: '手掰馍块泡进羊肉汤，肉烂汤浓，暖身顶饿。',
    rating: 4.7, review_count: 163, recommend_count: 109, status: 1, is_new: false },
  { id: 'd035', name: '云南过桥米线', price: 15.0, canteen: '第三食堂', window: '地方风味', category: '地方菜',
    tags: ['汤面', '鲜嫩', '清淡'], emoji: '🍜', image: 'static/dishes/d035.jpg', description: '滚烫鸡汤烫熟配菜米线，鲜香清爽，分量足。',
    rating: 4.5, review_count: 208, recommend_count: 137, status: 1, is_new: true },
  { id: 'd036', name: '孜然羊肉串', price: 15.0, canteen: '第三食堂', window: '地方风味', category: '烧烤',
    tags: ['羊肉', '辣', '重油'], emoji: '🍢', image: 'static/dishes/d036.jpg', description: '炭火烤出的羊肉串撒孜然，外焦里嫩，解馋。',
    rating: 4.6, review_count: 259, recommend_count: 201, status: 1, is_new: false },

  // ===== 第三食堂 · 轻食窗口 =====
  { id: 'd037', name: '鸡胸沙拉', price: 16.0, canteen: '第三食堂', window: '轻食窗口', category: '轻食',
    tags: ['清淡', '低卡', '鲜嫩'], emoji: '🥗', image: 'static/dishes/d037.jpg', description: '煎鸡胸配生菜玉米，低卡高蛋白，清爽饱腹。',
    rating: 4.4, review_count: 149, recommend_count: 83, status: 1, is_new: false },
  { id: 'd038', name: '全麦三明治', price: 12.0, canteen: '第三食堂', window: '轻食窗口', category: '轻食',
    tags: ['清淡', '鸡蛋', '低卡'], emoji: '🥗', image: 'static/dishes/d038.jpg', description: '全麦面包夹鸡蛋生菜，低卡便携，早餐好搭档。',
    rating: 4.3, review_count: 126, recommend_count: 69, status: 1, is_new: true },
  { id: 'd039', name: '水果酸奶杯', price: 10.0, canteen: '第三食堂', window: '轻食窗口', category: '轻食',
    tags: ['甜', '低卡', '牛奶'], emoji: '🥤', image: 'static/dishes/d039.jpg', description: '酸奶铺满时令水果与麦片，酸甜清爽又解腻。',
    rating: 4.5, review_count: 178, recommend_count: 112, status: 1, is_new: true },
  { id: 'd040', name: '鲜榨橙汁', price: 8.0, canteen: '第三食堂', window: '轻食窗口', category: '饮品',
    tags: ['酸', '甜', '低卡'], emoji: '🥤', image: 'static/dishes/d040.jpg', description: '现榨橙汁不加一滴糖，酸甜清口，饭后解腻。',
    rating: 4.3, review_count: 92, recommend_count: 47, status: 1, is_new: false }
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
