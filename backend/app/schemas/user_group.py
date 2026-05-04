from uuid import UUID
from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, field_validator

from ..recommenders import (
    BUILTIN_INSTANCES,
    EXTERNAL_INSTANCES,
    is_registered,
    get_capability,
)


# ── UI config ──────────────────────────────────────────────────────


# Built-in UI keys hardcoded server-side. Mirror of `BUILTIN_UIS` in
# `frontend/src/ui-presets/registry.ts`. Adding a new built-in preset
# = entries in both lists.
BUILTIN_UI_KEYS_FEED = {"youtube", "tiktok", "none"}
BUILTIN_UI_KEYS_WATCH = {"youtube", "tiktok"}


def _is_valid_ui_template_id(key: str) -> bool:
    """Return True if `key` is a published `ui_templates.id` UUID.
    Opens its own DB session so the pydantic validator can call this
    without an injected session (the validator runs with no request
    scope)."""
    from ..database import SessionLocal
    from ..models.ui_template import UITemplate

    try:
        # Cheap UUID parse first — the vast majority of unknown strings
        # aren't UUIDs and we can fail fast without hitting the DB.
        UUID(key)
    except (ValueError, TypeError):
        return False
    db = SessionLocal()
    try:
        row = (
            db.query(UITemplate)
            .filter(UITemplate.id == key, UITemplate.status == "published")
            .first()
        )
        return row is not None
    finally:
        db.close()


class UIConfig(BaseModel):
    """UI configuration for a user group.

    `feed` and `watch` are string keys that match either:
      - a built-in preset (`'youtube'`, `'tiktok'`, plus `'none'` for feed
        only — disables the feed page and routes the user straight into
        the first watch video on `/`), or
      - a published `ui_templates.id` UUID (admin-authored UI via the
        visual or code editor).

    Both built-in keys and template UUIDs are equal first-class options
    in the admin dropdown — the dispatcher in `pages/user/Feed.tsx` /
    `pages/user/VideoWatch.tsx` resolves built-ins first, then falls
    through to the template renderer for any other key.
    """
    feed: str = "youtube"
    watch: str = "youtube"

    @field_validator("feed")
    @classmethod
    def _validate_feed(cls, v: str) -> str:
        if v in BUILTIN_UI_KEYS_FEED:
            return v
        if _is_valid_ui_template_id(v):
            return v
        raise ValueError(
            f"Unknown feed UI '{v}'. Built-in: {sorted(BUILTIN_UI_KEYS_FEED)}; "
            f"or supply a published ui_templates.id."
        )

    @field_validator("watch")
    @classmethod
    def _validate_watch(cls, v: str) -> str:
        if v in BUILTIN_UI_KEYS_WATCH:
            return v
        if _is_valid_ui_template_id(v):
            return v
        raise ValueError(
            f"Unknown watch UI '{v}'. Built-in: {sorted(BUILTIN_UI_KEYS_WATCH)}; "
            f"or supply a published ui_templates.id. (Note: 'none' is feed-only.)"
        )


# ── Algorithm config ───────────────────────────────────────────────


def _available_algorithm_keys() -> list[str]:
    """Snapshot of dispatchable recommender keys (built-in + external)."""
    return sorted(set(BUILTIN_INSTANCES.keys()) | set(EXTERNAL_INSTANCES.keys()))


class AlgorithmConfig(BaseModel):
    """Algorithm configuration for a user group.

    Validated at runtime against the registered keys in
    `BUILTIN_INSTANCES + EXTERNAL_INSTANCES`. External HTTP recommenders
    register at runtime via the admin API, and validation will accept
    their keys without a backend restart (on the worker that handled
    the registration; other workers see the new key after the next
    cache miss → DB refresh).

    Each recommender declares whether it can serve the feed page, the
    watch page, or both. The validator enforces those capability flags
    so a watch-only policy can't be assigned to the feed surface.
    """
    feed: str = "random"
    watch: str = "random"

    @field_validator("feed")
    @classmethod
    def _validate_feed(cls, v: str) -> str:
        if not is_registered(v):
            raise ValueError(
                f"Unknown feed algorithm '{v}'. Available: {_available_algorithm_keys()}"
            )
        supports_feed, _ = get_capability(v)
        if not supports_feed:
            raise ValueError(
                f"Recommender '{v}' does not support the feed surface."
            )
        return v

    @field_validator("watch")
    @classmethod
    def _validate_watch(cls, v: str) -> str:
        if not is_registered(v):
            raise ValueError(
                f"Unknown watch algorithm '{v}'. Available: {_available_algorithm_keys()}"
            )
        _, supports_watch = get_capability(v)
        if not supports_watch:
            raise ValueError(
                f"Recommender '{v}' does not support the watch surface."
            )
        return v


# ── Group create / update / response ───────────────────────────────


class UserGroupCreate(BaseModel):
    name: str
    algorithm_config: AlgorithmConfig = AlgorithmConfig()
    ui_config: UIConfig = UIConfig()
    config: Optional[Dict[str, Any]] = None


class UserGroupUpdate(BaseModel):
    name: Optional[str] = None
    algorithm_config: Optional[AlgorithmConfig] = None
    ui_config: Optional[UIConfig] = None
    config: Optional[Dict[str, Any]] = None


class UserGroupResponse(BaseModel):
    id: UUID
    experiment_id: UUID
    name: str
    algorithm_config: Dict[str, str] = {"feed": "random", "watch": "random"}
    ui_config: Dict[str, Any] = {"feed": "youtube", "watch": "youtube"}
    config: Optional[Dict[str, Any]] = None
    created_at: datetime
    user_count: int = 0

    class Config:
        from_attributes = True
