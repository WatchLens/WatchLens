from uuid import UUID
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel


class VideoCSVRow(BaseModel):
    """Schema for CSV upload row."""
    video_id: str
    url: str
    duration: int
    title: Optional[str] = None
    thumbnail: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[str] = None  # Comma-separated
    # YouTube-style metadata
    description: Optional[str] = None
    like_count: Optional[int] = None
    dislike_count: Optional[int] = None
    comment_count: Optional[int] = None
    channel_name: Optional[str] = None


class VideoCreate(BaseModel):
    video_id: str
    url: str
    duration: int
    title: Optional[str] = None
    thumbnail_url: Optional[str] = None
    video_type: str = "url"  # url, youtube
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None
    # YouTube-style metadata
    description: Optional[str] = None
    like_count: int = 0
    dislike_count: int = 0
    comment_count: int = 0
    channel_name: Optional[str] = None


class ResolvedUrl(BaseModel):
    type: str  # "youtube" | "direct" | "local"
    video_url: Optional[str] = None
    embed_url: Optional[str] = None
    thumbnail_url: Optional[str] = None  # For local: derived from convention (no extension)


class VideoResponse(BaseModel):
    id: UUID
    video_id: str
    title: Optional[str] = None
    url: str
    resolved_url: Optional[ResolvedUrl] = None
    thumbnail_url: Optional[str] = None
    video_type: str
    duration: Optional[int] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    extra_metadata: Optional[Dict[str, Any]] = None
    view_count: int = 0
    # YouTube-style metadata
    description: Optional[str] = None
    like_count: int = 0
    dislike_count: int = 0
    comment_count: int = 0
    channel_name: Optional[str] = None
    channel_id: Optional[str] = None
    published_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class VideoListResponse(BaseModel):
    videos: List[VideoResponse]
    total: int
    has_more: bool = False


class FeedResponse(BaseModel):
    videos: List[VideoResponse]
    algorithm: str
    page: int
    has_more: bool
    # True when the user has watched (>=25%) every available video in this experiment.
    exhausted: bool = False
