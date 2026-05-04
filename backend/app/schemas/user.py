from uuid import UUID
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class UserCreate(BaseModel):
    login_id: str
    password: str
    user_group_id: Optional[UUID] = None


class UserBulkCreate(BaseModel):
    user_group_id: UUID
    count: int
    prefix: str = "user"


class UserCredential(BaseModel):
    login_id: str
    password: str  # Plain password (only for response, not stored)


class UserBulkResponse(BaseModel):
    created: int
    users: List[UserCredential]


class UserResponse(BaseModel):
    id: UUID
    login_id: str
    user_group_id: Optional[UUID] = None
    group_name: Optional[str] = None
    is_admin: bool
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    users: List[UserResponse]
    total: int
