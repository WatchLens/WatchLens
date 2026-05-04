from uuid import UUID
from datetime import datetime
from typing import Optional, Dict, Any, Literal
from pydantic import BaseModel


TemplateType = Literal["tree", "code"]


class UITemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    template_type: TemplateType = "tree"


class UITemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None  # "draft" | "published"
    template_type: Optional[TemplateType] = None
    feed_config: Optional[Dict[str, Any]] = None
    watch_config: Optional[Dict[str, Any]] = None
    feed_css: Optional[str] = None
    watch_css: Optional[str] = None
    code_text: Optional[str] = None
    feed_tree: Optional[Dict[str, Any]] = None
    watch_tree: Optional[Dict[str, Any]] = None


class UITemplateResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    status: str
    template_type: TemplateType = "tree"
    feed_config: Dict[str, Any] = {}
    watch_config: Dict[str, Any] = {}
    feed_css: str = ""
    watch_css: str = ""
    code_text: Optional[str] = None
    feed_tree: Optional[Dict[str, Any]] = None
    watch_tree: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UITemplateListItem(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    status: str
    template_type: TemplateType = "tree"
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
