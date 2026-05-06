from uuid import UUID
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class EventCreate(BaseModel):
    """Single event from frontend."""
    event_type: str = Field(..., max_length=50)
    video_id: Optional[str] = Field(None, max_length=100)  # external video id, not UUID
    timestamp: datetime  # Client timestamp
    watch_ratio: Optional[float] = None
    watch_duration: Optional[float] = None
    position_in_feed: Optional[int] = None
    payload: Optional[Dict[str, Any]] = None


class EventBatchCreate(BaseModel):
    """Batch of events from frontend."""
    session_id: UUID
    # Buffer is 20 (normal) + 50 (high-freq) = max ~70 per flush. Cap at 200
    # to leave headroom for sendBeacon combined flush on unload.
    events: List[EventCreate] = Field(..., max_length=200)


class EventResponse(BaseModel):
    id: int
    session_id: UUID
    video_id: Optional[UUID] = None
    event_type: str
    watch_ratio: Optional[float] = None
    watch_duration: Optional[float] = None
    position_in_feed: Optional[int] = None
    algorithm_feed: Optional[str] = None
    algorithm_watch: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None
    client_timestamp: datetime
    server_timestamp: datetime

    class Config:
        from_attributes = True


class EventBatchResponse(BaseModel):
    received: int
