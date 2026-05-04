from uuid import UUID
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class SessionCreate(BaseModel):
    """Session registration from frontend."""
    session_id: UUID
    user_agent: Optional[str] = None


class SessionResponse(BaseModel):
    id: UUID
    user_id: UUID
    started_at: datetime
    ended_at: Optional[datetime] = None
    user_agent: Optional[str] = None

    class Config:
        from_attributes = True
