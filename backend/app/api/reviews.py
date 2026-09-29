"""
评价相关 API
"""
import json
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update

from app.database import get_db
from app.models.review import Review
from app.models.dish import Dish
from app.models.user import User
from app.schemas.review import ReviewCreate, ReviewAudit
from app.schemas.common import ok, fail
from app.services.auth_service import get_current_user, get_current_admin, parse_list_field

router = APIRouter()


def review_to_dict(r: Review, nickname: str = "", avatar: str = "") -> dict:
    return {
        "id": r.id,
        "dish_id": r.dish_id,
        "user_id": r.user_id,
        "user_nickname": nickname,
        "user_avatar": avatar,
        "rating": r.rating,
        "content": r.content,
        "tags": parse_list_field(r.tags),
        "images": parse_list_field(r.images),
        "audit_status": r.audit_status,
        "is_malicious": r.is_malicious,
        "likes": r.likes,
        "created_at": r.created_at
    }


@router.get("/list")
async def review_list(
    dish_id: str = Query(None),
    audit_status: str = Query("approved"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db)
):
    """评价列表（默认只显示已审核通过的）"""
    query = select(Review)
    if dish_id:
        query = query.where(Review.dish_id == dish_id)
    if audit_status:
        query = query.where(Review.audit_status == audit_status)

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0
    query = query.order_by(Review.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    reviews = result.scalars().all()

    # 批量查询用户信息
    user_ids = list({r.user_id for r in reviews})
    if user_ids:
        user_result = await db.execute(select(User.id, User.nickname, User.avatar).where(User.id.in_(user_ids)))
        user_map = {row[0]: (row[1], row[2]) for row in user_result.all()}
    else:
        user_map = {}

    return ok({
        "total": total,
        "page": page,
        "page_size": page_size,
        "list": [
            review_to_dict(r, *user_map.get(r.user_id, ("匿名用户", "")))
            for r in reviews
        ]
    })


@router.post("")
async def create_review(req: ReviewCreate,
                        user: User = Depends(get_current_user),
                        db: AsyncSession = Depends(get_db)):
    """发布评价"""
    if req.rating < 1 or req.rating > 5:
        return fail("评分应在1-5分之间")

    # 检查菜品是否存在
    dish_result = await db.execute(select(Dish).where(Dish.id == req.dish_id))
    dish = dish_result.scalar_one_or_none()
    if not dish:
        return fail("菜品不存在", code=404)

    review = Review(
        dish_id=req.dish_id,
        user_id=user.id,
        rating=req.rating,
        content=req.content,
        tags=json.dumps(req.tags, ensure_ascii=False),
        images=json.dumps(req.images, ensure_ascii=False),
        audit_status="approved"  # 可改为 pending 开启审核
    )
    db.add(review)

    # 更新菜品评分和评价数
    dish.review_count = (dish.review_count or 0) + 1
    # 重新计算平均评分
    avg_result = await db.execute(
        select(func.avg(Review.rating)).where(Review.dish_id == req.dish_id, Review.audit_status == "approved")
    )
    avg_rating = avg_result.scalar() or 0
    dish.rating = round((avg_rating * (dish.review_count - 1) + req.rating) / dish.review_count, 1)

    await db.commit()
    await db.refresh(review)
    return ok(review_to_dict(review, user.nickname, user.avatar), "评价发布成功")


@router.post("/{review_id}/like")
async def like_review(review_id: str, db: AsyncSession = Depends(get_db)):
    """点赞评价"""
    await db.execute(update(Review).where(Review.id == review_id).values(likes=Review.likes + 1))
    await db.commit()
    return ok(None, "点赞成功")


@router.get("/mine")
async def my_reviews(user: User = Depends(get_current_user),
                     page: int = Query(1, ge=1),
                     page_size: int = Query(20, ge=1, le=100),
                     db: AsyncSession = Depends(get_db)):
    """我的评价"""
    query = select(Review).where(Review.user_id == user.id)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0
    query = query.order_by(Review.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    reviews = result.scalars().all()
    return ok({
        "total": total,
        "list": [review_to_dict(r, user.nickname, user.avatar) for r in reviews]
    })


# ===================== 管理端接口 =====================

@router.get("/pending", dependencies=[Depends(get_current_admin)])
async def pending_reviews(page: int = Query(1, ge=1),
                          page_size: int = Query(20, ge=1, le=100),
                          db: AsyncSession = Depends(get_db)):
    """待审核评价列表"""
    query = select(Review).where(Review.audit_status == "pending")
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0
    query = query.order_by(Review.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    reviews = result.scalars().all()

    user_ids = list({r.user_id for r in reviews})
    user_map = {}
    if user_ids:
        user_result = await db.execute(select(User.id, User.nickname, User.avatar).where(User.id.in_(user_ids)))
        user_map = {row[0]: (row[1], row[2]) for row in user_result.all()}

    return ok({
        "total": total,
        "list": [review_to_dict(r, *user_map.get(r.user_id, ("", ""))) for r in reviews]
    })


@router.post("/audit", dependencies=[Depends(get_current_admin)])
async def audit_review(req: ReviewAudit, db: AsyncSession = Depends(get_db)):
    """审核评价"""
    result = await db.execute(select(Review).where(Review.id == req.review_id))
    review = result.scalar_one_or_none()
    if not review:
        return fail("评价不存在", code=404)

    review.audit_status = req.audit_status
    if req.audit_status == "rejected":
        review.is_malicious = 1
    review.updated_at = datetime.utcnow()
    await db.commit()
    return ok(None, f"评价已{'通过' if req.audit_status == 'approved' else '驳回'}")


@router.delete("/{review_id}", dependencies=[Depends(get_current_admin)])
async def delete_review(review_id: str, db: AsyncSession = Depends(get_db)):
    """删除评价"""
    result = await db.execute(select(Review).where(Review.id == review_id))
    review = result.scalar_one_or_none()
    if not review:
        return fail("评价不存在", code=404)
    await db.delete(review)
    await db.commit()
    return ok(None, "评价已删除")
