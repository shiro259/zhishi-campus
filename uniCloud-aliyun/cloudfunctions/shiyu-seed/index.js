'use strict';
/**
 * ============================================================================
 * 云函数：shiyu-seed —— 菜品基础数据初始化 / 补齐
 * ----------------------------------------------------------------------------
 * 项目：食遇校园 - AI智能食堂推荐
 * 作用：把内置的 40 道食堂菜品种子数据写入 dishes 集合，供 AI 推荐使用。
 *
 * 两种模式（event.action）：
 *   - 'reset'：先清空 dishes 集合，再写入全部 40 条（用于演示前重置数据）
 *   - 'sync' ：按 name 去重，只补齐集合中缺失的菜品，已存在的数据不覆盖
 *              （用于首次部署或后续扩充菜谱，不会破坏已有评分/推荐数）
 *
 * 调用方式：在 uniCloud 控制台/客户端以 callFunction 调用，例如
 *   uniCloud.callFunction({ name: 'shiyu-seed', data: { action: 'sync' } })
 *
 * 说明：dishes 集合的 schema 权限为 create/update/delete 全 false，
 *       即客户端只能读；只有云函数（admin 身份）才能写入，本函数就是唯一的写入入口。
 * ============================================================================
 */

// 云函数内以 admin 身份操作数据库，不受 schema 权限限制
const db = uniCloud.database();
const dbCmd = db.command;

// 复用公共库的管理口令校验，避免任何客户端都能清空菜品表
// 引用公共模块 shiyu-common。
// 优先用「模块名」形式：这是 uniCloud 公共模块的标准引用方式，
// HBuilderX 上传云函数时会自动把依赖的公共模块一并打包进去。
// 注意不能只用相对路径 —— 上传时只传该函数自己的目录，云端不存在 ../common/ 这个兄弟目录。
// 但本地目录里两种都成立，所以这里带回退，谁可用用谁。
let common
try {
  // 首选：本目录下的副本。它随云函数一起上传，云端一定存在，
  // 不依赖「公共模块是否被打包」这件事（上传云函数只传该函数自己的目录）。
  common = require('./shiyu-common.js')
} catch (e) {
  try {
    // 次选：uniCloud 公共模块名（部分工具链会自动打包 common/ 下的模块）
    common = require('shiyu-common')
  } catch (e2) {
    // 最后：本地开发目录里的相对路径
    common = require('../common/shiyu-common/index.js')
  }
}

const COLLECTION = 'dishes';

/**
 * 种子菜品数据（40 道）
 * 覆盖三个食堂共八个窗口，价格区间 4~20 元。
 * 每条包含：name / price / canteen / window / category / tags / emoji /
 *          description / rating / review_count / recommend_count / status / is_new
 *
 * ⚠️ image 字段写的是**本机** static/dishes/*.jpg。
 *    菜品图迁到云存储后（管理后台「菜品管理 → 转云存储」），本机图片可能已删除，
 *    此时执行 'reset' 会把云端图片地址改回不存在的本机路径 → 全部菜品退化成 emoji。
 *    要用 'sync'（只补缺失、不覆盖已有记录）而不是 'reset'。
 *    详见 README「菜品配图」一节。
 *
 * tags 设计要点（这是忌口硬过滤的数据基础）：
 *   1. 口味维度取自：辣、麻辣、清淡、咸香、甜、酸、重油、鲜嫩、下饭、汤面、
 *      干拌面、养胃、早餐、低卡
 *   2. 食材维度取自：香菜、葱、蒜、花生、海鲜、牛肉、羊肉、内脏、鸡蛋、牛奶
 *      —— 含该食材的菜品必须把食材名写进 tags，AI 推荐前才能在 JS 层直接剔除
 *   3. 10 个食材词全部有覆盖，带食材标签的菜品远超 8 道
 */
const SEED_DISHES = [
  // ===================== 第一食堂 · 川味窗口（8道） =====================
  {
    name: '麻婆豆腐',
    price: 8,
    canteen: '第一食堂',
    window: '川味窗口',
    category: '川菜',
    // 「牛肉」不可漏：描述里的牛肉末只有写进 tags，搜「牛肉」才搜得到，
    // 忌口牛肉的同学也才会被硬过滤掉（推荐引擎按 tags 精确匹配忌口）
    tags: ['辣', '麻辣', '下饭', '葱', '蒜', '牛肉'],
    emoji: '🌶️', image: 'static/dishes/d001.jpg',
    description: '嫩豆腐配牛肉末，麻辣鲜香，拌米饭特别下饭',
    rating: 4.6,
    review_count: 128,
    recommend_count: 86,
    status: 1,
    is_new: false
  },
  {
    name: '水煮肉片',
    price: 15,
    canteen: '第一食堂',
    window: '川味窗口',
    category: '川菜',
    tags: ['辣', '麻辣', '重油', '下饭', '葱', '蒜'],
    emoji: '🥩', image: 'static/dishes/d003.jpg',
    description: '厚切肉片浸在红油里，麻辣过瘾，配菜吸满汤汁',
    rating: 4.7,
    review_count: 156,
    recommend_count: 120,
    status: 1,
    is_new: false
  },
  {
    name: '回锅肉',
    price: 14,
    canteen: '第一食堂',
    window: '川味窗口',
    category: '川菜',
    tags: ['辣', '咸香', '重油', '下饭', '蒜'],
    emoji: '🥓', image: 'static/dishes/d008.jpg',
    description: '二刀肉肥瘦相间，配上蒜苗爆炒，咸香又下饭',
    rating: 4.5,
    review_count: 143,
    recommend_count: 98,
    status: 1,
    is_new: false
  },
  {
    name: '宫保鸡丁',
    price: 12,
    canteen: '第一食堂',
    window: '川味窗口',
    category: '川菜',
    tags: ['辣', '甜', '酸', '花生', '下饭', '葱'],
    emoji: '🍗', image: 'static/dishes/d002.jpg',
    description: '鸡肉丁配花生米，酸甜微辣，甜辣交织很开胃',
    rating: 4.8,
    review_count: 210,
    recommend_count: 175,
    status: 1,
    is_new: false
  },
  {
    name: '鱼香肉丝',
    price: 13,
    canteen: '第一食堂',
    window: '川味窗口',
    category: '川菜',
    tags: ['酸', '甜', '辣', '下饭', '葱', '蒜'],
    emoji: '🥢', image: 'static/dishes/d004.jpg',
    description: '肉丝滑嫩，鱼香汁酸甜带辣，是米饭的最佳搭档',
    rating: 4.6,
    review_count: 168,
    recommend_count: 132,
    status: 1,
    is_new: false
  },
  {
    name: '辣子鸡',
    price: 16,
    canteen: '第一食堂',
    window: '川味窗口',
    category: '川菜',
    tags: ['辣', '麻辣', '重油', '鲜嫩'],
    emoji: '🍖', image: 'static/dishes/d002.jpg',
    description: '鸡块炸到金黄酥脆，在辣椒堆里翻找的快乐最过瘾',
    rating: 4.4,
    review_count: 96,
    recommend_count: 64,
    status: 1,
    is_new: false
  },
  {
    name: '酸辣土豆丝',
    price: 6,
    canteen: '第一食堂',
    window: '川味窗口',
    category: '川菜',
    tags: ['酸', '辣', '下饭'],
    emoji: '🥔', image: 'static/dishes/d007.jpg',
    description: '土豆丝脆爽酸辣，几块钱一份，配饭配馒头都香',
    rating: 4.3,
    review_count: 187,
    recommend_count: 110,
    status: 1,
    is_new: false
  },
  {
    name: '毛血旺',
    price: 18,
    canteen: '第一食堂',
    window: '川味窗口',
    category: '川菜',
    tags: ['辣', '麻辣', '重油', '内脏'],
    emoji: '🍲', image: 'static/dishes/d005.jpg',
    description: '鸭血毛肚黄喉一锅煮，麻辣厚重，重口味同学最爱',
    rating: 4.5,
    review_count: 88,
    recommend_count: 73,
    status: 1,
    is_new: false
  },

  // ===================== 第一食堂 · 家常窗口（5道） =====================
  {
    name: '番茄炒蛋',
    price: 7,
    canteen: '第一食堂',
    window: '家常窗口',
    category: '家常菜',
    tags: ['酸', '甜', '清淡', '鸡蛋', '下饭'],
    emoji: '🍅', image: 'static/dishes/d009.jpg',
    description: '番茄酸甜出汁，鸡蛋滑嫩，是永远吃不腻的家常味',
    rating: 4.7,
    review_count: 234,
    recommend_count: 190,
    status: 1,
    is_new: false
  },
  {
    name: '土豆炖牛肉',
    price: 16,
    canteen: '第一食堂',
    window: '家常窗口',
    category: '家常菜',
    tags: ['咸香', '下饭', '牛肉', '养胃'],
    emoji: '🍛', image: 'static/dishes/d010.jpg',
    description: '牛肉炖得软烂入味，土豆吸饱汤汁，暖心又暖胃',
    rating: 4.8,
    review_count: 176,
    recommend_count: 142,
    status: 1,
    is_new: false
  },
  {
    name: '清炒时蔬',
    price: 5,
    canteen: '第一食堂',
    window: '家常窗口',
    category: '素菜',
    tags: ['清淡', '低卡', '养胃'],
    emoji: '🥬', image: 'static/dishes/d012.jpg',
    description: '当日时令青菜大火快炒，少油少盐，清爽解腻',
    rating: 4.2,
    review_count: 76,
    recommend_count: 38,
    status: 1,
    is_new: false
  },
  {
    name: '香菇滑鸡',
    price: 13,
    canteen: '第一食堂',
    window: '家常窗口',
    category: '家常菜',
    tags: ['咸香', '鲜嫩', '清淡', '下饭'],
    emoji: '🍄', image: 'static/dishes/d020.jpg',
    description: '香菇和鸡块焖到入味，汁水浓稠，淋在饭上绝了',
    rating: 4.6,
    review_count: 112,
    recommend_count: 79,
    status: 1,
    is_new: false
  },
  {
    name: '蒜蓉粉丝娃娃菜',
    price: 7,
    canteen: '第一食堂',
    window: '家常窗口',
    category: '素菜',
    tags: ['清淡', '蒜', '低卡'],
    emoji: '🥗', image: 'static/dishes/d014.jpg',
    description: '娃娃菜铺上粉丝和蒜蓉清蒸，鲜甜清爽不油腻',
    rating: 4.4,
    review_count: 98,
    recommend_count: 52,
    status: 1,
    is_new: false
  },

  // ===================== 第二食堂 · 面食窗口（6道） =====================
  {
    name: '牛肉拉面',
    price: 14,
    canteen: '第二食堂',
    window: '面食窗口',
    category: '面食',
    tags: ['汤面', '咸香', '养胃', '牛肉', '葱', '香菜'],
    emoji: '🍜', image: 'static/dishes/d015.jpg',
    description: '现拉面条筋道，牛骨汤底清亮，一碗下去很踏实',
    rating: 4.8,
    review_count: 256,
    recommend_count: 205,
    status: 1,
    is_new: false
  },
  {
    name: '番茄鸡蛋面',
    price: 10,
    canteen: '第二食堂',
    window: '面食窗口',
    category: '面食',
    tags: ['汤面', '酸', '养胃', '鸡蛋', '葱'],
    emoji: '🍝', image: 'static/dishes/d018.jpg',
    description: '番茄熬出的汤底微酸开胃，配上嫩滑蛋花很舒服',
    rating: 4.5,
    review_count: 168,
    recommend_count: 121,
    status: 1,
    is_new: false
  },
  {
    name: '重庆小面',
    price: 9,
    canteen: '第二食堂',
    window: '面食窗口',
    category: '面食',
    tags: ['辣', '麻辣', '汤面', '葱', '蒜'],
    emoji: '🌶️', image: 'static/dishes/d006.jpg',
    description: '红油辣子打底，面条爽滑，麻辣味从舌尖冲到额头',
    rating: 4.6,
    review_count: 198,
    recommend_count: 166,
    status: 1,
    is_new: false
  },
  {
    name: '炸酱面',
    price: 11,
    canteen: '第二食堂',
    window: '面食窗口',
    category: '面食',
    tags: ['咸香', '干拌面', '下饭', '葱'],
    emoji: '🍜', image: 'static/dishes/d019.jpg',
    description: '肉末黄豆酱炒出香味，拌上劲道面条越嚼越香',
    rating: 4.4,
    review_count: 132,
    recommend_count: 87,
    status: 1,
    is_new: false
  },
  {
    name: '担担面',
    price: 12,
    canteen: '第二食堂',
    window: '面食窗口',
    category: '面食',
    tags: ['麻辣', '干拌面', '花生', '葱', '辣'],
    emoji: '🥡', image: 'static/dishes/d006.jpg',
    description: '芝麻花生酱拌面，麻辣回甜，小小一碗滋味很足',
    rating: 4.5,
    review_count: 118,
    recommend_count: 74,
    status: 1,
    is_new: false
  },
  {
    name: '阳春面',
    price: 5,
    canteen: '第二食堂',
    window: '面食窗口',
    category: '面食',
    // 描述里的「葱花」要落进 tags：否则搜「葱」搜不到，忌口葱的同学也不会被过滤
    tags: ['清淡', '汤面', '早餐', '养胃', '葱'],
    emoji: '🍲', image: 'static/dishes/d015.jpg',
    description: '清汤挂面撒把葱花，简单却养胃，早餐刚刚好',
    rating: 4.1,
    review_count: 64,
    recommend_count: 29,
    status: 1,
    is_new: false
  },

  // ===================== 第二食堂 · 快餐窗口（6道） =====================
  {
    name: '黄焖鸡米饭',
    price: 15,
    canteen: '第二食堂',
    window: '快餐窗口',
    category: '快餐',
    tags: ['咸香', '下饭', '鲜嫩'],
    emoji: '🍗', image: 'static/dishes/d020.jpg',
    description: '鸡块焖到脱骨，汤汁浓郁，配米饭一口接一口',
    rating: 4.7,
    review_count: 289,
    recommend_count: 231,
    status: 1,
    is_new: false
  },
  {
    name: '咖喱鸡肉饭',
    price: 14,
    canteen: '第二食堂',
    window: '快餐窗口',
    category: '快餐',
    tags: ['咸香', '下饭'],
    emoji: '🍛', image: 'static/dishes/d022.jpg',
    description: '咖喱土豆胡萝卜炖鸡肉，浓稠微甜，拌饭超香',
    rating: 4.3,
    review_count: 104,
    recommend_count: 61,
    status: 1,
    is_new: false
  },
  {
    name: '红烧牛肉饭',
    price: 18,
    canteen: '第二食堂',
    window: '快餐窗口',
    category: '快餐',
    tags: ['咸香', '下饭', '牛肉', '养胃'],
    emoji: '🥘', image: 'static/dishes/d041.jpg',
    description: '大块牛肉红烧入味，酱汁浇在饭上，吃着特别满足',
    rating: 4.9,
    review_count: 302,
    recommend_count: 258,
    status: 1,
    is_new: false
  },
  {
    name: '孜然羊肉饭',
    price: 19,
    canteen: '第二食堂',
    window: '快餐窗口',
    category: '快餐',
    tags: ['咸香', '羊肉', '下饭'],
    emoji: '🍖', image: 'static/dishes/d036.jpg',
    description: '孜然羊肉粒爆炒出香味，配着米饭解馋又顶饱',
    rating: 4.5,
    review_count: 96,
    recommend_count: 68,
    status: 1,
    is_new: false
  },
  {
    name: '番茄牛腩饭',
    price: 17,
    canteen: '第二食堂',
    window: '快餐窗口',
    category: '快餐',
    tags: ['酸', '咸香', '下饭', '牛肉'],
    emoji: '🍲', image: 'static/dishes/d010.jpg',
    description: '牛腩炖到软糯，番茄汤汁酸甜，泡饭能吃两碗',
    rating: 4.8,
    review_count: 154,
    recommend_count: 128,
    status: 1,
    is_new: false
  },
  {
    name: '照烧鸡腿饭',
    price: 16,
    canteen: '第二食堂',
    window: '快餐窗口',
    category: '快餐',
    tags: ['甜', '咸香', '下饭'],
    emoji: '🍱', image: 'static/dishes/d031.jpg',
    description: '鸡腿肉煎香后刷照烧汁，甜咸油亮，看着就有食欲',
    rating: 4.6,
    review_count: 141,
    recommend_count: 103,
    status: 1,
    is_new: true
  },

  // ===================== 第二食堂 · 小吃窗口（6道） =====================
  {
    name: '麻辣烫',
    price: 12,
    canteen: '第二食堂',
    window: '小吃窗口',
    category: '小吃',
    tags: ['麻辣', '辣', '重油', '香菜', '蒜'],
    emoji: '🍢', image: 'static/dishes/d005.jpg',
    description: '自选食材一大碗，麻辣汤底煮透，冬天吃着最舒服',
    rating: 4.5,
    review_count: 267,
    recommend_count: 198,
    status: 1,
    is_new: false
  },
  {
    name: '煎饼果子',
    price: 6,
    canteen: '第二食堂',
    window: '小吃窗口',
    category: '小吃',
    tags: ['早餐', '咸香', '鸡蛋', '葱', '香菜'],
    emoji: '🥞', image: 'static/dishes/d028.jpg',
    description: '现摊薄脆加鸡蛋，刷上酱料卷起来，趁热最好吃',
    rating: 4.4,
    review_count: 189,
    recommend_count: 112,
    status: 1,
    is_new: false
  },
  {
    name: '肉夹馍',
    price: 9,
    canteen: '第二食堂',
    window: '小吃窗口',
    category: '小吃',
    tags: ['咸香', '下饭', '葱'],
    emoji: '🥙', image: 'static/dishes/d028.jpg',
    description: '腊汁肉剁碎夹进白吉馍，肉香浓馍酥脆，一口满足',
    rating: 4.6,
    review_count: 172,
    recommend_count: 134,
    status: 1,
    is_new: false
  },
  {
    name: '酸辣粉',
    price: 8,
    canteen: '第二食堂',
    window: '小吃窗口',
    category: '小吃',
    tags: ['酸', '辣', '重油', '香菜', '花生', '葱'],
    emoji: '🍜', image: 'static/dishes/d006.jpg',
    description: '红薯粉煮得爽滑，酸辣汤底加花生碎，越吃越上瘾',
    rating: 4.3,
    review_count: 143,
    recommend_count: 91,
    status: 1,
    is_new: false
  },
  {
    name: '鸭血粉丝汤',
    price: 10,
    canteen: '第二食堂',
    window: '小吃窗口',
    category: '小吃',
    tags: ['汤面', '养胃', '内脏', '香菜', '葱'],
    emoji: '🍲', image: 'static/dishes/d033.jpg',
    description: '鸭血嫩滑，粉丝吸满鲜汤，撒香菜热乎乎一碗',
    rating: 4.5,
    review_count: 108,
    recommend_count: 76,
    status: 1,
    is_new: true
  },
  {
    name: '小笼包',
    price: 8,
    canteen: '第二食堂',
    window: '小吃窗口',
    category: '小吃',
    tags: ['早餐', '鲜嫩', '葱'],
    emoji: '🥟', image: 'static/dishes/d025.jpg',
    description: '皮薄馅足一咬爆汁，蘸点醋吃，早餐来一笼刚好',
    rating: 4.7,
    review_count: 204,
    recommend_count: 158,
    status: 1,
    is_new: false
  },

  // ===================== 第三食堂 · 粤菜窗口（4道） =====================
  {
    name: '白切鸡',
    price: 16,
    canteen: '第三食堂',
    window: '粤菜窗口',
    category: '粤菜',
    tags: ['清淡', '鲜嫩', '葱', '蒜'],
    emoji: '🍗', image: 'static/dishes/d030.jpg',
    description: '皮爽肉滑蘸姜葱酱，原汁原味，清淡却一点不寡淡',
    rating: 4.8,
    review_count: 132,
    recommend_count: 96,
    status: 1,
    is_new: false
  },
  {
    name: '蜜汁叉烧',
    price: 18,
    canteen: '第三食堂',
    window: '粤菜窗口',
    category: '粤菜',
    tags: ['甜', '咸香', '下饭'],
    emoji: '🍖', image: 'static/dishes/d031.jpg',
    description: '叉烧外皮焦糖色，蜜汁甜香，切片盖饭最受欢迎',
    rating: 4.7,
    review_count: 156,
    recommend_count: 119,
    status: 1,
    is_new: false
  },
  {
    name: '蒜蓉蒸虾',
    price: 20,
    canteen: '第三食堂',
    window: '粤菜窗口',
    category: '粤菜',
    tags: ['清淡', '鲜嫩', '海鲜', '蒜'],
    emoji: '🦐', image: 'static/dishes/d012.jpg',
    description: '鲜虾开背铺蒜蓉蒸熟，虾肉弹牙，鲜甜味全部锁住',
    rating: 4.9,
    review_count: 98,
    recommend_count: 84,
    status: 1,
    is_new: true
  },
  {
    name: '干炒牛河',
    price: 15,
    canteen: '第三食堂',
    window: '粤菜窗口',
    category: '粤菜',
    tags: ['咸香', '重油', '牛肉', '葱'],
    emoji: '🍝', image: 'static/dishes/d029.jpg',
    description: '河粉炒得干爽油亮，牛肉嫩滑，锅气十足很香',
    rating: 4.6,
    review_count: 124,
    recommend_count: 88,
    status: 1,
    is_new: false
  },

  // ===================== 第三食堂 · 地方风味（2道） =====================
  {
    name: '羊肉泡馍',
    price: 18,
    canteen: '第三食堂',
    window: '地方风味',
    category: '地方菜',
    tags: ['咸香', '养胃', '羊肉', '香菜', '葱'],
    emoji: '🍲', image: 'static/dishes/d034.jpg',
    description: '馍掰碎泡进羊汤，肉烂汤浓，吃完浑身都热乎',
    rating: 4.5,
    review_count: 87,
    recommend_count: 65,
    status: 1,
    is_new: false
  },
  {
    name: '螺蛳粉',
    price: 13,
    canteen: '第三食堂',
    window: '地方风味',
    category: '地方菜',
    tags: ['酸', '辣', '重油', '香菜', '葱', '花生'],
    emoji: '🍜', image: 'static/dishes/d026.jpg',
    description: '酸笋气味霸道，米粉爽滑，汤底酸辣让人又爱又恨',
    rating: 4.4,
    review_count: 176,
    recommend_count: 143,
    status: 1,
    is_new: true
  },

  // ===================== 第三食堂 · 轻食窗口（3道） =====================
  {
    name: '鸡胸肉沙拉',
    price: 13,
    canteen: '第三食堂',
    window: '轻食窗口',
    category: '轻食',
    tags: ['低卡', '清淡', '鲜嫩', '鸡蛋'],
    emoji: '🥗', image: 'static/dishes/d038.jpg',
    description: '煎鸡胸配水煮蛋和生菜，低脂高蛋白，减脂同学首选',
    rating: 4.3,
    review_count: 92,
    recommend_count: 47,
    status: 1,
    is_new: true
  },
  {
    name: '藜麦蔬菜饭',
    price: 14,
    canteen: '第三食堂',
    window: '轻食窗口',
    category: '轻食',
    tags: ['低卡', '清淡', '养胃'],
    emoji: '🥙', image: 'static/dishes/d038.jpg',
    description: '藜麦混搭时蔬和玉米粒，饱腹感很强又不怕胖',
    rating: 4.2,
    review_count: 68,
    recommend_count: 35,
    status: 1,
    is_new: true
  },
  {
    name: '牛奶燕麦碗',
    price: 8,
    canteen: '第三食堂',
    window: '轻食窗口',
    category: '轻食',
    tags: ['低卡', '甜', '早餐', '牛奶', '养胃'],
    emoji: '🥣', image: 'static/dishes/d039.jpg',
    description: '燕麦泡热牛奶，加香蕉和坚果，甜甜的一碗早餐',
    rating: 4.4,
    review_count: 74,
    recommend_count: 41,
    status: 1,
    is_new: true
  }
];

/**
 * 给种子数据补齐运行期字段
 * create_date 需要显式写入时间戳（批量 add 时不会自动补 forceDefaultValue）
 */
function buildSeedRows() {
  const now = Date.now();
  return SEED_DISHES.map(function (dish) {
    return Object.assign({}, dish, { create_date: now });
  });
}

/**
 * 清空 dishes 集合
 * 云函数里 admin 身份的 remove() 也要求带 where 条件，
 * 因此这里按批查出 _id 再按 _id 批量删除，循环直到集合为空，避免一次拉取过多数据。
 */
async function clearDishes() {
  let removed = 0;
  // 循环上限只作为防御，正常情况下几轮就能清空
  for (let round = 0; round < 100; round++) {
    const res = await db.collection(COLLECTION).field({ _id: true }).limit(500).get();
    const ids = (res.data || []).map(function (item) {
      return item._id;
    });
    if (ids.length === 0) {
      break;
    }
    await db.collection(COLLECTION).where({ _id: dbCmd.in(ids) }).remove();
    removed += ids.length;
  }
  return removed;
}

/**
 * 查询集合中已存在的全部菜品名
 * 用于 sync 模式下按 name 去重
 */
async function fetchExistingNames() {
  const res = await db.collection(COLLECTION).field({ name: true }).limit(1000).get();
  const nameSet = new Set();
  (res.data || []).forEach(function (item) {
    if (item && item.name) {
      nameSet.add(item.name);
    }
  });
  return nameSet;
}

exports.main = async (event, context) => {
  const payload = event || {};
  const action = payload.action || 'sync';

  console.log('[shiyu-seed] 开始执行, action =', action, '种子菜品数 =', SEED_DISHES.length);

  try {
    // 写操作需要管理口令：云端未初始化口令时，以本次提交的口令完成初始化，
    // 这样首次部署可以直接从管理后台完成初始化，不必先去控制台写数据。
    const auth = await common.verifyAdminToken(db, payload.token || payload.admin_token || '');
    if (!auth.ok) {
      return { code: -1, message: auth.message };
    }

    if (action === 'reset') {
      // ---------- 重置模式：先清空再全量写入 ----------
      const removed = await clearDishes();
      console.log('[shiyu-seed] 已清空旧数据, 删除条数 =', removed);

      const rows = buildSeedRows();
      const addRes = await db.collection(COLLECTION).add(rows);
      // add 批量写入时 affected 为写入条数
      const total = (addRes && (addRes.inserted || addRes.affected)) || rows.length;
      console.log('[shiyu-seed] reset 写入完成, 写入条数 =', total);

      return {
        code: 0,
        message: 'success',
        data: { total: total, removed: removed, action: action }
      };
    }

    if (action === 'sync') {
      // ---------- 补齐模式：写入缺失菜品 + 修复陈旧数据结构 ----------
      const existingNames = await fetchExistingNames();
      const missing = buildSeedRows().filter(function (dish) {
        return !existingNames.has(dish.name);
      });

      console.log('[shiyu-seed] 已存在菜品数 =', existingNames.size, ', 待补齐条数 =', missing.length);

      // 关键修复：老版本数据可能没有 status 字段，而列表查询带 where({status:1})，
      // 这类记录会导致「食堂列表里看得到这个食堂、点进去却没有菜」。这里统一补 status: 1。
      let repaired = 0;
      try {
        const repairRes = await db.collection(COLLECTION)
          .where({ status: dbCmd.exists(false) })
          .update({ status: 1 });
        repaired = (repairRes && (repairRes.updated || repairRes.affected)) || 0;
      } catch (e) {
        console.error('[shiyu-seed] 修复 status 字段失败（不影响补齐）:', e && (e.message || e));
      }
      console.log('[shiyu-seed] 已修复缺失 status 的记录数 =', repaired);

      if (missing.length === 0) {
        return {
          code: 0,
          message: 'success',
          data: { total: 0, existed: existingNames.size, repaired: repaired, action: action }
        };
      }

      const addRes = await db.collection(COLLECTION).add(missing);
      const total = (addRes && (addRes.inserted || addRes.affected)) || missing.length;
      console.log('[shiyu-seed] sync 写入完成, 写入条数 =', total);

      return {
        code: 0,
        message: 'success',
        data: { total: total, existed: existingNames.size, repaired: repaired, action: action }
      };
    }

    // ---------- 未知 action ----------
    return { code: -1, message: '未知的 action: ' + action };
  } catch (e) {
    // 任何异常都不允许让云函数抛出 500，统一返回结构化错误
    console.error('[shiyu-seed] 执行失败:', e && (e.message || e));
    return { code: -1, message: '初始化失败：' + (e && e.message ? e.message : '未知错误') };
  }
};
