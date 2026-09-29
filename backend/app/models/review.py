"""
评价模型
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


def gen_id():
    return uuid.uuid4().hex


class Review(Base):
    __tablename__ = "reviews"

    id = Column(String(32), primary_key=True, default=gen_id)
    # 关联菜品
    dish_id = Column(String(32), ForeignKey("dishes.id"), nullable=False, index=True)
    # 关联用户
    user_id = Column(String(32), ForeignKey("users.id"), nullable=False, index=True)
    # 评分（1-5星）
    rating = Column(Integer, nullable=False)
    # 文字评价
    content = Column(Text, default="")
    # 评价标签（JSON）：分量足/太咸了/性价比高/避雷 等
    tags = Column(Text, default="[]")
    # 图片URL列表（JSON）
    images = Column(Text, default="[]")
    # 审核状态：pending / approved / rejected
    audit_status = Column(String(16), default="pending")
    # 是否被标记为恶意
    is_malicious = Column(Integer, default=0)
    # 点赞数
    likes = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关联
    dish = relationship("Dish")
    user = relationship("User")
