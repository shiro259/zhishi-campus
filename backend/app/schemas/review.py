"""
评价相关 schema
"""
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel


class ReviewCreate(BaseModel):
    dish_id: str
    rating: int
    content: str = ""
    tags: List[str] = []
    images: List[str] = []


class ReviewAudit(BaseModel):
    review_id: str
    audit_status: str  # approved / rejected
    reason: str = ""


class ReviewInfo(BaseModel):
    id: str
    dish_id: str
    user_id: str
    user_nickname: Optional[str] = None
    user_avatar: Optional[str] = None
    rating: int
    content: str
    tags: List[str] = []
    images: List[str] = []
    audit_status: str
    is_malicious: int
    likes: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ReviewQuery(BaseModel):
    dish_id: Optional[str] = None
    audit_status: Optional[str] = None
    page: int = 1
    page_size: int = 20
