from uuid import UUID
from datetime import datetime, date
from typing import Any, Dict, Optional, List
from pydantic import BaseModel

from .user_group import AlgorithmConfig


class ExperimentCreate(BaseModel):
    name: str
    description: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class ExperimentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class UserGroupSummary(BaseModel):
    id: UUID
    name: str
    device: str = "desktop"
    algorithm_config: AlgorithmConfig = AlgorithmConfig()
    user_count: int = 0
    config: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True


class ExperimentResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    status: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    user_groups: List[UserGroupSummary] = []
    total_users: int = 0
    total_videos: int = 0

    class Config:
        from_attributes = True


class ExperimentListResponse(BaseModel):
    experiments: List[ExperimentResponse]
    total: int
