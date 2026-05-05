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
    # From user's group; null for admins or unassigned users.
    device: Optional[str] = None  # 'desktop' | 'tablet' | 'mobile'
    algorithm_config: Optional[Dict[str, Any]] = None  # {feed, watch}
    ui_config: Optional[Dict[str, Any]] = None  # {feed, watch}

    class Config:
        from_attributes = True


class LoginResponse(BaseModel):
    user: UserResponse
    message: str = "Login successful"
