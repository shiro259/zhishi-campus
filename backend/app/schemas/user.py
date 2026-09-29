"""
用户相关 schema
"""
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel


class WechatLoginRequest(BaseModel):
    code: str
    nickname: Optional[str] = "同学"
    avatar: Optional[str] = ""


class UserUpdateRequest(BaseModel):
    nickname: Optional[str] = None
    avatar: Optional[str] = None
    student_id: Optional[str] = None
    taste_pref: Optional[List[str]] = None
    allergies: Optional[List[str]] = None


class UserInfo(BaseModel):
    id: str
    openid: Optional[str] = None
    nickname: str
    avatar: str
    phone: Optional[str] = None
    student_id: Optional[str] = None
    role: str
    taste_pref: List[str] = []
    allergies: List[str] = []
    status: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserInfo


class AdminLoginRequest(BaseModel):
    username: str
    password: str
