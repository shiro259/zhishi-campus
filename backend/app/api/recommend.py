"""
AI 推荐 API
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.recommend import RecommendRequest
from app.schemas.common import ok, fail
from app.services.auth_service import get_current_user
from app.services.ai_service import ai_service

router = APIRouter()


@router.post("")
async def recommend(req: RecommendRequest,
                    user: User = Depends(get_current_user),
                    db: AsyncSession = Depends(get_db)):
    """AI 智能推荐菜品"""
    try:
        result = await ai_service.recommend(db, req)
        return ok({
            "recommendations": [r.model_dump() for r in result.recommendations],
            "summary": result.summary
        })
    except Exception as e:
        return fail(f"推荐失败：{str(e)}")
