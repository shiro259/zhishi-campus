"""
管理后台 API（菜品管理、评价审核、用户管理）
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.database import get_db
from app.models.user import User
from app.models.dish import Dish
from app.models.review import Review
from app.schemas.common import ok, fail
from app.services.auth_service import get_current_admin, parse_list_field

router = APIRouter()


@router.get("/users")
async def user_list(
    keyword: str = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """用户列表"""
    query = select(User)
    if keyword:
        query = query.where(or_(User.nickname.contains(keyword), User.student_id.contains(keyword)))
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0
    query = query.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    users = result.scalars().all()
    return ok({
        "total": total,
        "list": [{
            "id": u.id,
            "nickname": u.nickname,
            "avatar": u.avatar,
            "student_id": u.student_id,
            "role": u.role,
            "status": u.status,
            "taste_pref": parse_list_field(u.taste_pref),
            "allergies": parse_list_field(u.allergies),
            "created_at": u.created_at
        } for u in users]
    })


@router.post("/users/{user_id}/ban")
async def ban_user(user_id: str,
                   admin: User = Depends(get_current_admin),
                   db: AsyncSession = Depends(get_db)):
    """封禁用户"""
    result = await db.execute(select(User).where(User.id == user_id))
    u = result.scalar_one_or_none()
    if not u:
        return fail("用户不存在", code=404)
    u.status = "banned" if u.status == "active" else "active"
    await db.commit()
    return ok(None, f"用户已{'封禁' if u.status == 'banned' else '解封'}")


@router.get("/dishes/all")
async def all_dishes(page: int = Query(1, ge=1),
                     page_size: int = Query(20, ge=1, le=100),
                     keyword: str = Query(None),
                     admin: User = Depends(get_current_admin),
                     db: AsyncSession = Depends(get_db)):
    """管理端菜品列表（含下架）"""
    query = select(Dish)
    if keyword:
        query = query.where(Dish.name.contains(keyword))
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0
    query = query.order_by(Dish.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    dishes = result.scalars().all()
    return ok({
        "total": total,
        "list": [{
            "id": d.id,
            "name": d.name,
            "price": d.price,
            "canteen": d.canteen,
            "window": d.window,
            "category": d.category,
            "rating": d.rating,
            "review_count": d.review_count,
            "status": d.status,
            "is_new": d.is_new
        } for d in dishes]
    })


@router.get("/reviews/all")
async def all_reviews(audit_status: str = Query(None),
                      page: int = Query(1, ge=1),
                      page_size: int = Query(20, ge=1, le=100),
                      admin: User = Depends(get_current_admin),
                      db: AsyncSession = Depends(get_db)):
    """管理端评价列表"""
    query = select(Review)
    if audit_status:
        query = query.where(Review.audit_status == audit_status)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0
    query = query.order_by(Review.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    reviews = result.scalars().all()
    return ok({"total": total, "list": [
        {"id": r.id, "dish_id": r.dish_id, "rating": r.rating,
         "content": r.content, "audit_status": r.audit_status,
         "is_malicious": r.is_malicious, "created_at": r.created_at}
        for r in reviews
    ]})
