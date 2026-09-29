"""
菜品模型
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, DateTime, Text, Boolean
from app.database import Base


def gen_id():
    return uuid.uuid4().hex


class Dish(Base):
    __tablename__ = "dishes"

    id = Column(String(32), primary_key=True, default=gen_id)
    # 菜品名称
    name = Column(String(128), nullable=False, index=True)
    # 价格（元）
    price = Column(Float, nullable=False, default=0)
    # 所属食堂
    canteen = Column(String(64), nullable=False)
    # 所属窗口
    window = Column(String(64), nullable=False)
    # 分类标签：川菜/粤菜/面食/快餐/饮品/小吃 等
    category = Column(String(32), default="其他")
    # 口味标签（JSON）：辣/清淡/重油/甜 等
    tags = Column(Text, default="[]")
    # 图片URL（云存储）
    image = Column(Text, default="")
    # 描述
    description = Column(Text, default="")
    # 综合评分（0-5）
    rating = Column(Float, default=0)
    # 评价数量
    review_count = Column(Integer, default=0)
    # 推荐次数
    recommend_count = Column(Integer, default=0)
    # 上架状态：1上架 0下架
    status = Column(Integer, default=1)
    # 是否新品
    is_new = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
