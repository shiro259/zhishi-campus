"""
菜品相关 schema
"""
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel


class DishCreate(BaseModel):
    name: str
    price: float
    canteen: str
    window: str
    category: str = "其他"
    tags: List[str] = []
    image: str = ""
    description: str = ""
    is_new: bool = False


class DishUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[float] = None
    canteen: Optional[str] = None
    window: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    image: Optional[str] = None
    description: Optional[str] = None
    status: Optional[int] = None
    is_new: Optional[bool] = None


class DishInfo(BaseModel):
    id: str
    name: str
    price: float
    canteen: str
    window: str
    category: str
    tags: List[str] = []
    image: str
    description: str
    rating: float
    review_count: int
    recommend_count: int
    status: int
    is_new: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DishQuery(BaseModel):
    canteen: Optional[str] = None
    category: Optional[str] = None
    keyword: Optional[str] = None
    page: int = 1
    page_size: int = 20
