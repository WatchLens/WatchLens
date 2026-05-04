from datetime import datetime
from typing import Optional, List, Dict, Any
from uuid import UUID
from pydantic import BaseModel, Field


class RecBoleHyperparameters(BaseModel):
    epochs: Optional[int] = None
    learning_rate: Optional[float] = None
    train_batch_size: Optional[int] = None
    eval_batch_size: Optional[int] = None
    embedding_size: Optional[int] = None

    class Config:
        extra = "allow"


class TrainingRunCreate(BaseModel):
    model_name: str = Field(..., min_length=1, max_length=50)
    top_k: int = Field(100, ge=1, le=1000)
    hyperparameters: RecBoleHyperparameters = Field(default_factory=RecBoleHyperparameters)


class TrainingRunResponse(BaseModel):
    id: UUID
    experiment_id: UUID
    model_name: str
    top_k: int
    hyperparameters: Dict[str, Any]
    status: str
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    metrics: Optional[Dict[str, Any]] = None
    interaction_count: Optional[int] = None
    user_count: Optional[int] = None
    item_count: Optional[int] = None
    recommendation_count: Optional[int] = None
    similarity_count: Optional[int] = None
    duration_seconds: Optional[float] = None
    created_at: datetime
    triggered_by: Optional[UUID] = None

    class Config:
        from_attributes = True


class TrainingRunListResponse(BaseModel):
    runs: List[TrainingRunResponse]
    total: int


class RecBoleStatusResponse(BaseModel):
    installed: bool
    version: Optional[str] = None
    torch_version: Optional[str] = None
    cuda_available: bool = False
    device: str = "cpu"
    fit_period_minutes: Optional[int] = None


class RecBoleCoverageResponse(BaseModel):
    users_with_recs: int
    total_users: int
    user_coverage_percent: float
    items_with_sims: int
    total_items: int
    item_coverage_percent: float
    cached_recommendations: int
    cached_similarities: int
    last_training_at: Optional[datetime] = None


class RecBoleModelInfo(BaseModel):
    name: str
    category: str
    purpose: str = "feed"
    description: str
    default_hyperparameters: Dict[str, Any]
