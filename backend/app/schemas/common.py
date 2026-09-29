"""
通用响应 schema
"""
from typing import Any, Optional, Generic, TypeVar
from pydantic import BaseModel

T = TypeVar("T")


class ResponseBase(BaseModel):
    code: int = 0
    message: str = "success"


class Response(ResponseBase, Generic[T]):
    data: Optional[T] = None


class PageResult(BaseModel, Generic[T]):
    total: int
    page: int
    page_size: int
    list: list[T]


def ok(data: Any = None, message: str = "success") -> dict:
    return {"code": 0, "message": message, "data": data}


def fail(message: str = "error", code: int = -1) -> dict:
    return {"code": code, "message": message, "data": None}
