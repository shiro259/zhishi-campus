from fastapi import APIRouter
from app.api import auth, dishes, reviews, recommend, admin, stats

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["认证"])
api_router.include_router(dishes.router, prefix="/dishes", tags=["菜品"])
api_router.include_router(reviews.router, prefix="/reviews", tags=["评价"])
api_router.include_router(recommend.router, prefix="/recommend", tags=["AI推荐"])
api_router.include_router(admin.router, prefix="/admin", tags=["管理后台"])
api_router.include_router(stats.router, prefix="/stats", tags=["数据统计"])
