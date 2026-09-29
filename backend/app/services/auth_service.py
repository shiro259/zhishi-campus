"""
认证服务：JWT 令牌、微信登录
"""
import json
import httpx
from datetime import datetime, timedelta
from typing import Optional
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.database import get_db
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_PREFIX}/auth/login", auto_error=False)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


async def get_current_user(token: Optional[str] = Depends(oauth2_scheme),
                           db: AsyncSession = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="登录状态已过期，请重新登录",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exception
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    if user.status == "banned":
        raise HTTPException(status_code=403, detail="账号已被封禁")
    return user


async def get_current_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return user


async def wechat_code2openid(code: str) -> Optional[str]:
    """通过微信 code 换取 openid"""
    if not settings.WECHAT_APPID or not settings.WECHAT_SECRET:
        # 开发环境：未配置微信密钥时，使用 code 模拟 openid
        return f"dev_openid_{code}"
    url = "https://api.weixin.qq.com/sns/jscode2session"
    params = {
        "appid": settings.WECHAT_APPID,
        "secret": settings.WECHAT_SECRET,
        "js_code": code,
        "grant_type": "authorization_code"
    }
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, params=params)
        data = resp.json()
        return data.get("openid")


async def get_or_create_user_by_openid(db: AsyncSession, openid: str,
                                       nickname: str = "同学", avatar: str = "") -> User:
    result = await db.execute(select(User).where(User.openid == openid))
    user = result.scalar_one_or_none()
    if user:
        user.last_login = datetime.utcnow()
        if nickname and nickname != "同学":
            user.nickname = nickname
        if avatar:
            user.avatar = avatar
        await db.commit()
        await db.refresh(user)
        return user
    user = User(openid=openid, nickname=nickname, avatar=avatar, last_login=datetime.utcnow())
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


def parse_list_field(value) -> list:
    """解析 JSON 字符串字段为列表"""
    if not value:
        return []
    if isinstance(value, list):
        return value
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return []
