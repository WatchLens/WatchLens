from uuid import UUID
from typing import Any, Optional, Dict
from pydantic import BaseModel


class LoginRequest(BaseModel):
    login_id: str
    password: str


class UserResponse(BaseModel):
    id: UUID
    login_id: str
    is_admin: bool
    user_group_id: Optional[UUID] = None
    algorithm_config: Optional[Dict[str, Any]] = None  # From user's group: {feed, watch}
    ui_config: Optional[Dict[str, Any]] = None  # From user's group: {feed, watch}

    class Config:
        from_attributes = True


class LoginResponse(BaseModel):
    user: UserResponse
    message: str = "Login successful"
