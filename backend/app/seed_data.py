"""
种子数据：初始化示例菜品数据
运行: python -m app.seed_data
"""
import json
import asyncio
from app.database import AsyncSessionLocal, init_db, Base, engine
from app.models.dish import Dish


SAMPLE_DISHES = [
    # 第一食堂
    {"name": "麻婆豆腐", "price": 8.0, "canteen": "第一食堂", "window": "川味窗口",
     "category": "川菜", "tags": ["辣", "下饭"], "is_new": False,
     "description": "经典川菜，麻辣鲜香，豆腐嫩滑，配米饭一绝。"},
    {"name": "宫保鸡丁", "price": 12.0, "canteen": "第一食堂", "window": "川味窗口",
     "category": "川菜", "tags": ["辣", "甜", "下饭"], "is_new": False,
     "description": "鸡丁鲜嫩，花生酥脆，甜辣适口，人气爆款。"},
    {"name": "鱼香肉丝", "price": 10.0, "canteen": "第一食堂", "window": "川味窗口",
     "category": "川菜", "tags": ["辣", "酸", "下饭"], "is_new": False,
     "description": "酸甜微辣，肉丝滑嫩，经典鱼香味型。"},
    {"name": "番茄炒蛋", "price": 6.0, "canteen": "第一食堂", "window": "家常窗口",
     "category": "家常菜", "tags": ["清淡", "甜"], "is_new": False,
     "description": "酸甜可口，鸡蛋嫩滑，老少皆宜。"},
    {"name": "红烧排骨", "price": 15.0, "canteen": "第一食堂", "window": "家常窗口",
     "category": "家常菜", "tags": ["咸香", "下饭"], "is_new": False,
     "description": "排骨软烂入味，酱香浓郁，分量十足。"},

    # 第二食堂
    {"name": "兰州拉面", "price": 10.0, "canteen": "第二食堂", "window": "面食窗口",
     "category": "面食", "tags": ["清淡", "汤面"], "is_new": False,
     "description": "手工拉面，汤清面爽，牛肉片香。"},
    {"name": "重庆小面", "price": 9.0, "canteen": "第二食堂", "window": "面食窗口",
     "category": "面食", "tags": ["辣", "干拌面"], "is_new": True,
     "description": "麻辣鲜香，面条劲道，正宗重庆味。"},
    {"name": "黄焖鸡米饭", "price": 14.0, "canteen": "第二食堂", "window": "快餐窗口",
     "category": "快餐", "tags": ["咸香", "下饭"], "is_new": False,
     "description": "鸡肉鲜嫩，汤汁浓郁，米饭管够。"},
    {"name": "沙县蒸饺", "price": 8.0, "canteen": "第二食堂", "window": "小吃窗口",
     "category": "小吃", "tags": ["清淡"], "is_new": False,
     "description": "皮薄馅大，蘸醋吃更香，早餐首选。"},
    {"name": "皮蛋瘦肉粥", "price": 6.0, "canteen": "第二食堂", "window": "小吃窗口",
     "category": "小吃", "tags": ["清淡", "养胃"], "is_new": False,
     "description": "粥稠米香，皮蛋瘦肉搭配，暖胃又营养。"},

    # 第三食堂
    {"name": "广东肠粉", "price": 7.0, "canteen": "第三食堂", "window": "粤菜窗口",
     "category": "粤菜", "tags": ["清淡", "早餐"], "is_new": True,
     "description": "米浆蒸制，滑嫩Q弹，淋上酱汁超满足。"},
    {"name": "白切鸡", "price": 16.0, "canteen": "第三食堂", "window": "粤菜窗口",
     "category": "粤菜", "tags": ["清淡", "鲜嫩"], "is_new": False,
     "description": "皮爽肉滑，原汁原味，配姜葱酱绝佳。"},
    {"name": "蜜汁叉烧饭", "price": 15.0, "canteen": "第三食堂", "window": "粤菜窗口",
     "category": "粤菜", "tags": ["甜", "下饭"], "is_new": False,
     "description": "叉烧肥瘦相间，蜜汁香甜，米饭吸满肉汁。"},
    {"name": "螺蛳粉", "price": 12.0, "canteen": "第三食堂", "window": "地方风味",
     "category": "地方菜", "tags": ["辣", "酸", "汤面"], "is_new": True,
     "description": "酸辣鲜爽，配料丰富，闻着臭吃着香。"},
    {"name": "麻辣香锅", "price": 18.0, "canteen": "第三食堂", "window": "地方风味",
     "category": "地方菜", "tags": ["辣", "重油"], "is_new": False,
     "description": "自选食材，麻辣干香，重口味必点。"},

    # 清真食堂
    {"name": "牛肉拉面", "price": 11.0, "canteen": "清真食堂", "window": "面食窗口",
     "category": "面食", "tags": ["清淡", "汤面"], "is_new": False,
     "description": "清真牛肉，汤浓面劲，分量实在。"},
    {"name": "大盘鸡", "price": 20.0, "canteen": "清真食堂", "window": "新疆风味",
     "category": "地方菜", "tags": ["辣", "咸香"], "is_new": False,
     "description": "鸡肉土豆配皮带面，新疆特色，香辣过瘾。"},
    {"name": "烤羊肉串", "price": 3.0, "canteen": "清真食堂", "window": "新疆风味",
     "category": "烧烤", "tags": ["辣", "咸香"], "is_new": True,
     "description": "现烤羊肉，外焦里嫩，撒上孜然辣椒面。"},
    {"name": "手抓饭", "price": 13.0, "canteen": "清真食堂", "window": "新疆风味",
     "category": "地方菜", "tags": ["咸香"], "is_new": False,
     "description": "胡萝卜羊肉焖饭，油润不腻，香气扑鼻。"},

    # 饮品/轻食
    {"name": "珍珠奶茶", "price": 10.0, "canteen": "第一食堂", "window": "饮品窗口",
     "category": "饮品", "tags": ["甜"], "is_new": False,
     "description": "Q弹珍珠，香浓奶茶，下午茶必备。"},
    {"name": "水果沙拉", "price": 12.0, "canteen": "第二食堂", "window": "轻食窗口",
     "category": "轻食", "tags": ["清淡", "健康"], "is_new": True,
     "description": "新鲜水果搭配酸奶，低脂健康。"},
    {"name": "蔬菜沙拉", "price": 8.0, "canteen": "第二食堂", "window": "轻食窗口",
     "category": "轻食", "tags": ["清淡", "健康"], "is_new": False,
     "description": "新鲜时蔬，油醋汁调味，减脂首选。"},
]


async def seed():
    await init_db()
    async with AsyncSessionLocal() as session:
        # 检查是否已有数据
        from sqlalchemy import select, func
        count = (await session.execute(select(func.count(Dish.id)))).scalar() or 0
        if count > 0:
            print(f"数据库已有 {count} 条菜品数据，跳过初始化")
            return

        for dish_data in SAMPLE_DISHES:
            dish = Dish(
                name=dish_data["name"],
                price=dish_data["price"],
                canteen=dish_data["canteen"],
                window=dish_data["window"],
                category=dish_data["category"],
                tags=json.dumps(dish_data["tags"], ensure_ascii=False),
                description=dish_data["description"],
                is_new=dish_data["is_new"],
                rating=round(4.0 + (hash(dish_data["name"]) % 10) / 10, 1),
                review_count=hash(dish_data["name"]) % 50 + 5
            )
            session.add(dish)

        await session.commit()
        print(f"✅ 成功初始化 {len(SAMPLE_DISHES)} 道示例菜品")


if __name__ == "__main__":
    asyncio.run(seed())
