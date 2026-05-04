from uuid import UUID
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class CommentResponse(BaseModel):
    """Single comment for display."""
    id: int
    comment_id: str
    parent_id: Optional[str] = None
    author_name: str
    author_channel_id: Optional[str] = None
    text: str
    like_count: int = 0
    published_at: Optional[datetime] = None
    reply_count: int = 0

    class Config:
        from_attributes = True


class CommentListResponse(BaseModel):
    """Paginated comment list."""
    comments: List[CommentResponse]
    total: int
    page: int
    limit: int
    has_more: bool
