"""
应用配置
"""
import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # 基础配置
    APP_NAME: str = "食遇校园 - AI智能食堂推荐"
    API_PREFIX: str = "/api"
    DEBUG: bool = True

    # 数据库配置（默认SQLite，生产可切换MongoDB云数据库）
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./shiyu.db")

    # JWT 配置
    SECRET_KEY: str = os.getenv("SECRET_KEY", "shiyu-secret-key-change-in-production-2024")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7天

    # 微信小程序配置
    WECHAT_APPID: str = os.getenv("WECHAT_APPID", "")
    WECHAT_SECRET: str = os.getenv("WECHAT_SECRET", "")

    # 大模型 API 配置（支持多个厂商）
    AI_PROVIDER: str = os.getenv("AI_PROVIDER", "deepseek")  # deepseek / qwen / kimi / zhipu
    AI_API_KEY: str = os.getenv("AI_API_KEY", "")
    AI_BASE_URL: str = os.getenv("AI_BASE_URL", "https://api.deepseek.com/v1")
    AI_MODEL: str = os.getenv("AI_MODEL", "deepseek-chat")

    # 管理后台默认账号
    ADMIN_USERNAME: str = os.getenv("ADMIN_USERNAME", "admin")
    ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", "admin123")

    class Config:
        env_file = ".env"
        extra = "allow"


settings = Settings()
