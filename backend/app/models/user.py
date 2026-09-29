"""
用户模型
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, Boolean, Text
from app.database import Base


def gen_id():
    return uuid.uuid4().hex


class User(Base):
    __tablename__ = "users"

    id = Column(String(32), primary_key=True, default=gen_id)
    # 微信 openid
    openid = Column(String(64), unique=True, index=True, nullable=True)
    # 昵称
    nickname = Column(String(64), default="同学")
    # 头像
    avatar = Column(Text, default="")
    # 手机号
    phone = Column(String(20), nullable=True)
    # 学号（校园身份标识）
    student_id = Column(String(32), nullable=True)
    # 角色：user / admin
    role = Column(String(16), default="user")
    # 口味偏好（JSON字符串存储）
    taste_pref = Column(Text, default="[]")
    # 忌口（JSON字符串存储）
    allergies = Column(Text, default="[]")
    # 账号状态：active / banned
    status = Column(String(16), default="active")
    # 登录时间
    last_login = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
