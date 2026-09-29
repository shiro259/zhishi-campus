"""
菜品相关 API
"""
import json
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.database import get_db
from app.models.dish import Dish
from app.models.review import Review
from app.schemas.dish import DishCreate, DishUpdate, DishQuery
from app.schemas.common import ok, fail
from app.services.auth_service import get_current_admin, parse_list_field

router = APIRouter()


def dish_to_dict(d: Dish) -> dict:
    return {
        "id": d.id,
        "name": d.name,
        "price": d.price,
        "canteen": d.canteen,
        "window": d.window,
        "category": d.category,
        "tags": parse_list_field(d.tags),
        "image": d.image,
        "description": d.description,
        "rating": round(d.rating, 1),
        "review_count": d.review_count,
        "recommend_count": d.recommend_count,
        "status": d.status,
        "is_new": d.is_new,
        "created_at": d.created_at
    }


@router.get("/list")
async def dish_list(
    canteen: str = Query(None),
    category: str = Query(None),
    keyword: str = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db)
):
    """菜品列表（含搜索、筛选）"""
    query = select(Dish).where(Dish.status == 1)
    if canteen:
        query = query.where(Dish.canteen == canteen)
    if category:
        query = query.where(Dish.category == category)
    if keyword:
        query = query.where(or_(Dish.name.contains(keyword), Dish.description.contains(keyword)))

    # 分页
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0
    query = query.order_by(Dish.rating.desc(), Dish.review_count.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    dishes = result.scalars().all()

    return ok({
        "total": total,
        "page": page,
        "page_size": page_size,
        "list": [dish_to_dict(d) for d in dishes]
    })


@router.get("/{dish_id}")
async def dish_detail(dish_id: str, db: AsyncSession = Depends(get_db)):
    """菜品详情"""
    result = await db.execute(select(Dish).where(Dish.id == dish_id))
    dish = result.scalar_one_or_none()
    if not dish:
        return fail("菜品不存在", code=404)
    return ok(dish_to_dict(dish))


@router.get("/rank/hot")
async def hot_rank(limit: int = Query(10, ge=1, le=50), db: AsyncSession = Depends(get_db)):
    """今日热门榜（按推荐次数+评价数综合排序）"""
    query = (select(Dish)
             .where(Dish.status == 1)
             .order_by(Dish.recommend_count.desc(), Dish.review_count.desc())
             .limit(limit))
    result = await db.execute(query)
    dishes = result.scalars().all()
    return ok([dish_to_dict(d) for d in dishes])


@router.get("/rank/good")
async def good_rank(limit: int = Query(10, ge=1, le=50), db: AsyncSession = Depends(get_db)):
    """高分红榜（评分 >= 4.5）"""
    query = (select(Dish)
             .where(Dish.status == 1, Dish.rating >= 4.5, Dish.review_count >= 3)
             .order_by(Dish.rating.desc())
             .limit(limit))
    result = await db.execute(query)
    dishes = result.scalars().all()
    return ok([dish_to_dict(d) for d in dishes])


@router.get("/rank/new")
async def new_dishes(limit: int = Query(10, ge=1, le=50), db: AsyncSession = Depends(get_db)):
    """新品尝鲜"""
    query = (select(Dish)
             .where(Dish.status == 1, Dish.is_new == True)
             .order_by(Dish.created_at.desc())
             .limit(limit))
    result = await db.execute(query)
    dishes = result.scalars().all()
    return ok([dish_to_dict(d) for d in dishes])


@router.get("/canteens/list")
async def canteen_list(db: AsyncSession = Depends(get_db)):
    """获取所有食堂列表"""
    result = await db.execute(
        select(Dish.canteen).distinct().where(Dish.status == 1)
    )
    canteens = [row[0] for row in result.all()]
    return ok(canteens)


@router.get("/categories/list")
async def category_list(db: AsyncSession = Depends(get_db)):
    """获取所有分类"""
    result = await db.execute(
        select(Dish.category).distinct().where(Dish.status == 1)
    )
    cats = [row[0] for row in result.all()]
    return ok(cats)


# ===================== 管理端接口 =====================

@router.post("", dependencies=[Depends(get_current_admin)])
async def create_dish(req: DishCreate, db: AsyncSession = Depends(get_db)):
    """新增菜品"""
    dish = Dish(
        name=req.name,
        price=req.price,
        canteen=req.canteen,
        window=req.window,
        category=req.category,
        tags=json.dumps(req.tags, ensure_ascii=False),
        image=req.image,
        description=req.description,
        is_new=req.is_new
    )
    db.add(dish)
    await db.commit()
    await db.refresh(dish)
    return ok(dish_to_dict(dish), "菜品创建成功")


@router.put("/{dish_id}", dependencies=[Depends(get_current_admin)])
async def update_dish(dish_id: str, req: DishUpdate, db: AsyncSession = Depends(get_db)):
    """更新菜品"""
    result = await db.execute(select(Dish).where(Dish.id == dish_id))
    dish = result.scalar_one_or_none()
    if not dish:
        return fail("菜品不存在", code=404)

    update_data = req.model_dump(exclude_unset=True)
    if "tags" in update_data:
        update_data["tags"] = json.dumps(update_data["tags"], ensure_ascii=False)
    for k, v in update_data.items():
        setattr(dish, k, v)
    dish.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(dish)
    return ok(dish_to_dict(dish), "更新成功")


@router.delete("/{dish_id}", dependencies=[Depends(get_current_admin)])
async def delete_dish(dish_id: str, db: AsyncSession = Depends(get_db)):
    """删除菜品（软删除，下架）"""
    result = await db.execute(select(Dish).where(Dish.id == dish_id))
    dish = result.scalar_one_or_none()
    if not dish:
        return fail("菜品不存在", code=404)
    dish.status = 0
    dish.updated_at = datetime.utcnow()
    await db.commit()
    return ok(None, "菜品已下架")
