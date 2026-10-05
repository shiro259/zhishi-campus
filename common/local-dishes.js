/**
 * 本地菜品数据集（云端不可用时的兜底数据源）
 *
 * 位置字段：canteen（食堂）+ floor（楼层，数字）+ window（窗口）
 * 窗口要么是编号窗口（'3号窗口'），要么是自定义档口（'滋士客汉堡'）。
 *
 * 注意两点：
 * 1. 已按需求删除「清真食堂」，原先属于它的 4 道菜移到第三食堂；
 * 2. 22 道内置菜的 window / floor 已**清空**，等你在管理后台「菜品管理」里
 *    逐个重填真实位置 —— 填之前列表只显示食堂名。
 * 3. 食堂名必须与 common/constants.js 的 CANTEEN_FLOORS、以及云函数 shiyu-seed
 *    的内置数据完全一致，否则会出现「首页有食堂、点进去没有菜」。
 */

export const LOCAL_DISHES = [
  { id: 'd001', name: '麻婆豆腐', price: 8, canteen: '第一食堂', floor: null, window: '', category: '川菜', tags: ['辣', '下饭'], image: '', description: '经典川菜，麻辣鲜香，豆腐嫩滑，配米饭一绝。', rating: 4.0, review_count: 5, recommend_count: 0, status: 1, is_new: false },
  { id: 'd002', name: '宫保鸡丁', price: 12, canteen: '第一食堂', floor: null, window: '', category: '川菜', tags: ['辣', '甜', '下饭'], image: '', description: '鸡丁鲜嫩，花生酥脆，甜辣适口，人气爆款。', rating: 4.1, review_count: 36, recommend_count: 0, status: 1, is_new: false },
  { id: 'd003', name: '鱼香肉丝', price: 10, canteen: '第一食堂', floor: null, window: '', category: '川菜', tags: ['辣', '酸', '下饭'], image: '', description: '酸甜微辣，肉丝滑嫩，经典鱼香味型。', rating: 4.1, review_count: 6, recommend_count: 0, status: 1, is_new: false },
  { id: 'd004', name: '番茄炒蛋', price: 6, canteen: '第一食堂', floor: null, window: '', category: '家常菜', tags: ['清淡', '甜'], image: '', description: '酸甜可口，鸡蛋嫩滑，老少皆宜。', rating: 4.2, review_count: 17, recommend_count: 0, status: 1, is_new: false },
  { id: 'd005', name: '红烧排骨', price: 15, canteen: '第一食堂', floor: null, window: '', category: '家常菜', tags: ['咸香', '下饭'], image: '', description: '排骨软烂入味，酱香浓郁，分量十足。', rating: 4.1, review_count: 16, recommend_count: 0, status: 1, is_new: false },
  { id: 'd006', name: '兰州拉面', price: 10, canteen: '第二食堂', floor: null, window: '', category: '面食', tags: ['清淡', '汤面'], image: '', description: '手工拉面，汤清面爽，牛肉片香。', rating: 4.6, review_count: 51, recommend_count: 0, status: 1, is_new: false },
  { id: 'd007', name: '重庆小面', price: 9, canteen: '第二食堂', floor: null, window: '', category: '面食', tags: ['辣', '干拌面'], image: '', description: '麻辣鲜香，面条劲道，正宗重庆味。', rating: 4.8, review_count: 23, recommend_count: 0, status: 1, is_new: true },
  { id: 'd008', name: '黄焖鸡米饭', price: 14, canteen: '第二食堂', floor: null, window: '', category: '快餐', tags: ['咸香', '下饭'], image: '', description: '鸡肉鲜嫩，汤汁浓郁，米饭管够。', rating: 4.0, review_count: 45, recommend_count: 0, status: 1, is_new: false },
  { id: 'd009', name: '沙县蒸饺', price: 8, canteen: '第二食堂', floor: null, window: '', category: '小吃', tags: ['清淡'], image: '', description: '皮薄馅大，蘸醋吃更香，早餐首选。', rating: 4.3, review_count: 48, recommend_count: 0, status: 1, is_new: false },
  { id: 'd010', name: '皮蛋瘦肉粥', price: 6, canteen: '第二食堂', floor: null, window: '', category: '小吃', tags: ['清淡', '养胃'], image: '', description: '粥稠米香，皮蛋瘦肉搭配，暖胃又营养。', rating: 4.0, review_count: 35, recommend_count: 0, status: 1, is_new: false },
  { id: 'd011', name: '广东肠粉', price: 7, canteen: '第三食堂', floor: null, window: '', category: '粤菜', tags: ['清淡', '早餐'], image: '', description: '米浆蒸制，滑嫩Q弹，淋上酱汁超满足。', rating: 4.8, review_count: 23, recommend_count: 0, status: 1, is_new: true },
  { id: 'd012', name: '白切鸡', price: 16, canteen: '第三食堂', floor: null, window: '', category: '粤菜', tags: ['清淡', '鲜嫩'], image: '', description: '皮爽肉滑，原汁原味，配姜葱酱绝佳。', rating: 4.0, review_count: 5, recommend_count: 0, status: 1, is_new: false },
  { id: 'd013', name: '蜜汁叉烧饭', price: 15, canteen: '第三食堂', floor: null, window: '', category: '粤菜', tags: ['甜', '下饭'], image: '', description: '叉烧肥瘦相间，蜜汁香甜，米饭吸满肉汁。', rating: 4.2, review_count: 17, recommend_count: 0, status: 1, is_new: false },
  { id: 'd014', name: '螺蛳粉', price: 12, canteen: '第三食堂', floor: null, window: '', category: '地方菜', tags: ['辣', '酸', '汤面'], image: '', description: '酸辣鲜爽，配料丰富，闻着臭吃着香。', rating: 4.4, review_count: 29, recommend_count: 0, status: 1, is_new: true },
  { id: 'd015', name: '麻辣香锅', price: 18, canteen: '第三食堂', floor: null, window: '', category: '地方菜', tags: ['辣', '重油'], image: '', description: '自选食材，麻辣干香，重口味必点。', rating: 4.3, review_count: 28, recommend_count: 0, status: 1, is_new: false },
  { id: 'd016', name: '牛肉拉面', price: 11, canteen: '第二食堂', floor: null, window: '', category: '面食', tags: ['清淡', '汤面'], image: '', description: '汤浓面劲，牛肉片实在，分量管饱。', rating: 4.5, review_count: 30, recommend_count: 0, status: 1, is_new: false },
  { id: 'd017', name: '大盘鸡', price: 20, canteen: '第三食堂', floor: null, window: '', category: '地方菜', tags: ['辣', '咸香'], image: '', description: '鸡肉土豆配皮带面，新疆特色，香辣过瘾。', rating: 4.6, review_count: 41, recommend_count: 0, status: 1, is_new: false },
  { id: 'd018', name: '烤羊肉串', price: 3, canteen: '第三食堂', floor: null, window: '', category: '烧烤', tags: ['辣', '咸香'], image: '', description: '现烤羊肉，外焦里嫩，撒上孜然辣椒面。', rating: 4.7, review_count: 22, recommend_count: 0, status: 1, is_new: true },
  { id: 'd019', name: '手抓饭', price: 13, canteen: '第三食堂', floor: null, window: '', category: '地方菜', tags: ['咸香'], image: '', description: '胡萝卜羊肉焖饭，油润不腻，香气扑鼻。', rating: 4.3, review_count: 18, recommend_count: 0, status: 1, is_new: false },
  { id: 'd020', name: '珍珠奶茶', price: 10, canteen: '第一食堂', floor: null, window: '', category: '饮品', tags: ['甜'], image: '', description: 'Q弹珍珠，香浓奶茶，下午茶必备。', rating: 4.6, review_count: 11, recommend_count: 0, status: 1, is_new: false },
  { id: 'd021', name: '水果沙拉', price: 12, canteen: '第二食堂', floor: null, window: '', category: '轻食', tags: ['清淡', '健康'], image: '', description: '新鲜水果搭配酸奶，低脂健康。', rating: 4.2, review_count: 27, recommend_count: 0, status: 1, is_new: true },
  { id: 'd022', name: '蔬菜沙拉', price: 8, canteen: '第二食堂', floor: null, window: '', category: '轻食', tags: ['清淡', '健康'], image: '', description: '新鲜时蔬，油醋汁调味，减脂首选。', rating: 4.5, review_count: 10, recommend_count: 0, status: 1, is_new: false }
]

/** 获取所有食堂名（去重） */
export function getLocalCanteens() {
  return [...new Set(LOCAL_DISHES.map((d) => d.canteen))]
}

/** 获取所有分类名（去重） */
export function getLocalCategories() {
  return [...new Set(LOCAL_DISHES.map((d) => d.category))]
}
