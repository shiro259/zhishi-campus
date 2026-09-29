"""
数据统计 API（数据看板）
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models.user import User
from app.models.dish import Dish
from app.models.review import Review
from app.schemas.common import ok
from app.services.auth_service import get_current_admin

router = APIRouter()


@router.get("/overview")
async def overview(user: User = Depends(get_current_admin),
                   db: AsyncSession = Depends(get_db)):
    """数据概览"""
    user_count = (await db.execute(select(func.count(User.id)))).scalar() or 0
    dish_count = (await db.execute(select(func.count(Dish.id)).where(Dish.status == 1))).scalar() or 0
    review_count = (await db.execute(select(func.count(Review.id)))).scalar() or 0
    pending_count = (await db.execute(
        select(func.count(Review.id)).where(Review.audit_status == "pending")
    )).scalar() or 0

    return ok({
        "user_count": user_count,
        "dish_count": dish_count,
        "review_count": review_count,
        "pending_review_count": pending_count
    })


@router.get("/top-dishes")
async def top_dishes(limit: int = 10,
                     user: User = Depends(get_current_admin),
                     db: AsyncSession = Depends(get_db)):
    """高频推荐菜品统计"""
    query = (select(Dish.name, Dish.canteen, Dish.recommend_count, Dish.review_count, Dish.rating)
             .where(Dish.status == 1)
             .order_by(Dish.recommend_count.desc())
             .limit(limit))
    result = await db.execute(query)
    return ok([{
        "name": row[0], "canteen": row[1],
        "recommend_count": row[2], "review_count": row[3], "rating": row[4]
    } for row in result.all()])


@router.get("/canteen-stats")
async def canteen_stats(user: User = Depends(get_current_admin),
                        db: AsyncSession = Depends(get_db)):
    """各食堂菜品数量统计"""
    query = (select(Dish.canteen, func.count(Dish.id).label("cnt"))
             .where(Dish.status == 1)
             .group_by(Dish.canteen))
    result = await db.execute(query)
    return ok([{"canteen": row[0], "count": row[1]} for row in result.all()])
