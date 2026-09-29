"""
认证相关 API
"""
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User
from app.schemas.user import (
    WechatLoginRequest, UserUpdateRequest, UserInfo, TokenResponse, AdminLoginRequest
)
from app.schemas.common import ok, fail
from app.services.auth_service import (
    create_access_token, get_current_user, wechat_code2openid,
    get_or_create_user_by_openid, parse_list_field
)
from app.config import settings

router = APIRouter()


@router.post("/wechat-login")
async def wechat_login(req: WechatLoginRequest, db: AsyncSession = Depends(get_db)):
    """微信一键登录"""
    openid = await wechat_code2openid(req.code)
    if not openid:
        return fail("微信登录失败，无法获取用户标识")

    user = await get_or_create_user_by_openid(db, openid, req.nickname, req.avatar)
    token = create_access_token({"sub": user.id})

    return ok({
        "access_token": token,
        "token_type": "bearer",
        "user": user_to_dict(user)
    })


@router.post("/admin-login")
async def admin_login(req: AdminLoginRequest, db: AsyncSession = Depends(get_db)):
    """管理员账号密码登录"""
    if req.username != settings.ADMIN_USERNAME or req.password != settings.ADMIN_PASSWORD:
        return fail("账号或密码错误", code=401)

    # 查找或创建管理员账号
    result = await db.execute(select(User).where(User.role == "admin"))
    user = result.scalar_one_or_none()
    if not user:
        user = User(
            openid=f"admin_{req.username}",
            nickname="食堂管理员",
            role="admin",
            last_login=datetime.utcnow()
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    else:
        user.last_login = datetime.utcnow()
        await db.commit()

    token = create_access_token({"sub": user.id})
    return ok({
        "access_token": token,
        "token_type": "bearer",
        "user": user_to_dict(user)
    })


@router.get("/me")
async def get_my_info(user: User = Depends(get_current_user)):
    """获取当前用户信息"""
    return ok(user_to_dict(user))


@router.put("/me")
async def update_my_info(req: UserUpdateRequest,
                         user: User = Depends(get_current_user),
                         db: AsyncSession = Depends(get_db)):
    """更新用户信息"""
    if req.nickname is not None:
        user.nickname = req.nickname
    if req.avatar is not None:
        user.avatar = req.avatar
    if req.student_id is not None:
        user.student_id = req.student_id
    if req.taste_pref is not None:
        user.taste_pref = json.dumps(req.taste_pref, ensure_ascii=False)
    if req.allergies is not None:
        user.allergies = json.dumps(req.allergies, ensure_ascii=False)
    user.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(user)
    return ok(user_to_dict(user))


def user_to_dict(user: User) -> dict:
    return {
        "id": user.id,
        "openid": user.openid,
        "nickname": user.nickname,
        "avatar": user.avatar,
        "phone": user.phone,
        "student_id": user.student_id,
        "role": user.role,
        "taste_pref": parse_list_field(user.taste_pref),
        "allergies": parse_list_field(user.allergies),
        "status": user.status,
        "created_at": user.created_at
    }
