"""
Admin endpoints for the recommender registry.

GET    /admin/recommenders         — list all registered recommenders
                                     (built-in + external) for the
                                     algorithm-selection dropdown.
POST   /admin/recommenders         — register a new external HTTP
                                     recommender.
PATCH  /admin/recommenders/{key}   — partial update. Built-ins accept
                                     only metadata edits; externals
                                     accept full field set including
                                     config / capability flags.
DELETE /admin/recommenders/{key}   — unregister a non-builtin
                                     recommender. Built-ins are
                                     protected and return 400.
"""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from ....recommenders import (
    list_recommenders,
    register_external_http,
    update_recommender,
    unregister_external,
    BUILTIN_INSTANCES,
)
from ..deps import get_current_admin, get_db
from ....models.user import User


router = APIRouter()


@router.get("/recommenders", response_model=List[dict])
def list_available_recommenders(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """Return metadata for every registered recommender. Used by the
    admin UI to populate the algorithm-selection dropdown."""
    return list_recommenders(db=db)


# ── External HTTP registration ─────────────────────────────────────


class ExternalHTTPRegisterRequest(BaseModel):
    """Body for `POST /admin/recommenders`. Only `external_http` is
    accepted today; other kinds raise 400."""

    key: str = Field(..., min_length=1, max_length=64)
    kind: str = Field(default="external_http")
    label: str = Field(..., min_length=1, max_length=128)
    description: str = Field(default="")
    category: str = Field(default="external")
    supports_feed: bool = True
    supports_watch: bool = True
    config: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("key")
    @classmethod
    def _key_charset(cls, v: str) -> str:
        # Keep keys URL-safe / log-friendly. Disallow whitespace and
        # punctuation that would clash with the algorithm_config JSONB
        # key form.
        if not all(c.isalnum() or c in ("_", "-") for c in v):
            raise ValueError("key may only contain letters, digits, '_', and '-'")
        return v

    @field_validator("kind")
    @classmethod
    def _kind_supported(cls, v: str) -> str:
        if v != "external_http":
            raise ValueError(
                "Only kind='external_http' is registerable via this endpoint."
            )
        return v

    @field_validator("config")
    @classmethod
    def _config_has_url(cls, v: Dict[str, Any]) -> Dict[str, Any]:
        if not v.get("url"):
            raise ValueError("config.url is required for external_http recommenders.")
        return v


@router.post("/recommenders", response_model=dict, status_code=status.HTTP_201_CREATED)
def register_recommender(
    body: ExternalHTTPRegisterRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """Register a new external HTTP recommender. The instance becomes
    dispatchable on this worker immediately; other workers pick it up
    on cache miss (DB lookup) or at next backend restart."""
    if body.key in BUILTIN_INSTANCES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"'{body.key}' is a built-in recommender key.",
        )
    try:
        row = register_external_http(
            db,
            key=body.key,
            label=body.label,
            description=body.description,
            category=body.category,
            supports_feed=body.supports_feed,
            supports_watch=body.supports_watch,
            config=body.config,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    return {
        "key": row.key,
        "kind": row.kind,
        "label": row.label,
        "category": row.category,
        "description": row.description,
        "supports_feed": row.supports_feed,
        "supports_watch": row.supports_watch,
        "config": row.config,
    }


# ── Partial update ─────────────────────────────────────────────────


class RecommenderPatchRequest(BaseModel):
    """Partial update body. All fields optional — only the keys you send
    are applied. `key` and `kind` are immutable; re-register to change."""

    label: Optional[str] = Field(default=None, min_length=1, max_length=128)
    description: Optional[str] = None
    category: Optional[str] = Field(default=None, min_length=1, max_length=32)
    supports_feed: Optional[bool] = None
    supports_watch: Optional[bool] = None
    config: Optional[Dict[str, Any]] = None


@router.patch("/recommenders/{key}", response_model=dict)
def patch_recommender(
    key: str,
    body: RecommenderPatchRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """Partial-update a registered recommender.

    Built-ins accept only metadata edits (label / description /
    category); attempts to flip capability flags or set config on a
    built-in return 400 because the Python class — not the row — is
    the source of truth for those.

    External recommenders accept the full field set. After commit the
    cached instance is rebuilt on this worker so subsequent dispatches
    pick up the new config (URL, body_template, etc.) immediately.
    Sibling workers refresh on cache miss."""
    try:
        row = update_recommender(
            db,
            key,
            label=body.label,
            description=body.description,
            category=body.category,
            supports_feed=body.supports_feed,
            supports_watch=body.supports_watch,
            config=body.config,
        )
    except ValueError as e:
        msg = str(e)
        if "not found" in msg:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=msg,
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=msg,
        )
    return {
        "key": row.key,
        "kind": row.kind,
        "label": row.label,
        "category": row.category,
        "description": row.description,
        "supports_feed": row.supports_feed,
        "supports_watch": row.supports_watch,
        "config": row.config,
    }


# ── Delete ─────────────────────────────────────────────────────────


@router.delete("/recommenders/{key}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recommender(
    key: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """Delete a non-builtin recommender. Returns 400 for built-ins
    and 404 for unknown keys."""
    if key in BUILTIN_INSTANCES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete built-in recommender '{key}'.",
        )
    try:
        unregister_external(db, key)
    except ValueError as e:
        msg = str(e)
        if "not found" in msg:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=msg,
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=msg,
        )
    return None
