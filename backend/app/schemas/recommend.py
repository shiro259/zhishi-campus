"""
AI推荐相关 schema
"""
from typing import Optional, List
from pydantic import BaseModel


class RecommendRequest(BaseModel):
    # 口味偏好
    taste: List[str] = []  # 辣/不辣/清淡/重油/甜/酸
    # 忌口
    allergies: List[str] = []  # 香菜/葱/蒜/花生/海鲜
    # 预算上限（元）
    budget: Optional[float] = None
    # 食堂范围
    canteen: Optional[str] = None
    # 用餐类型
    meal_type: str = "午餐"  # 早餐/午餐/晚餐/夜宵
    # 额外自由描述
    extra: str = ""


class RecommendItem(BaseModel):
    dish_id: str
    name: str
    canteen: str
    window: str
    price: float
    rating: float
    image: str
    reason: str  # AI推荐理由
    match_score: float  # 匹配度 0-100


class RecommendResponse(BaseModel):
    recommendations: List[RecommendItem]
    summary: str  # AI 总结
