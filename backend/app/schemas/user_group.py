"""User group schemas.

Each group has a single ``device`` (desktop / tablet / mobile) — the
device class its participants are expected to use. ``ui_config`` is a
flat ``{feed, watch}`` map of UI keys; the validator at group create /
update time ensures every key is registered AND device-compatible
with the group's declared device.
"""
from uuid import UUID
from datetime import datetime
from typing import Literal, Optional, Dict, Any
from pydantic import BaseModel, field_validator, model_validator

from ..recommenders import (
    BUILTIN_INSTANCES,
    EXTERNAL_INSTANCES,
    is_registered,
    get_capability,
)


# ── UI config ──────────────────────────────────────────────────────


Device = Literal["desktop", "tablet", "mobile"]


# Built-in UI keys hardcoded server-side. Mirror of `BUILTIN_UIS` in
# `frontend/src/ui-presets/registry.ts`. Each key lists the devices it
# may be assigned to; the validator below rejects mismatches. The YouTube
# preset ships per-device variants (`youtube-{desktop,tablet,mobile}`)
# so that group on any device can pick a built-in. `'none'` redirects
# without rendering UI and is therefore device-agnostic.
BUILTIN_FEED_KEYS: dict[str, set[str]] = {
    "youtube-desktop": {"desktop"},
    "youtube-tablet": {"tablet"},
    "youtube-mobile": {"mobile"},
    "tiktok-desktop": {"desktop"},
    "tiktok-tablet": {"tablet"},
    "tiktok-mobile": {"mobile"},
    "none": {"desktop", "tablet", "mobile"},
}

BUILTIN_WATCH_KEYS: dict[str, set[str]] = {
    "youtube-desktop": {"desktop"},
    "youtube-tablet": {"tablet"},
    "youtube-mobile": {"mobile"},
    "tiktok-desktop": {"desktop"},
    "tiktok-tablet": {"tablet"},
    "tiktok-mobile": {"mobile"},
}


def _is_valid_template_for_device(key: str, device: Device) -> bool:
    """True if ``key`` is a published ``ui_templates.id`` UUID whose
    ``device`` column matches the group's ``device``."""
    from ..database import SessionLocal
    from ..models.ui_template import UITemplate

    try:
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
        if row is None:
            return False
        return row.device == device
    finally:
        db.close()


def _validate_ui_key(
    surface: Literal["feed", "watch"],
    key: str,
    device: Device,
) -> str:
    """Validate one UI key against the group's device.

    Each built-in key declares which device classes it supports. YouTube
    ships per-device variants (`youtube-desktop`, `youtube-tablet`,
    `youtube-mobile`); TikTok is desktop-only; `'none'` redirects
    without UI and works on any device. Anything else must be a
    published template whose `device` matches the group's `device`.
    """
    builtin_map = BUILTIN_FEED_KEYS if surface == "feed" else BUILTIN_WATCH_KEYS

    if key in builtin_map:
        if device in builtin_map[key]:
            return key
        allowed = sorted(builtin_map[key])
        raise ValueError(
            f"Built-in '{key}' is not available for device='{device}'. "
            f"Allowed devices for this key: {allowed}."
        )
    if _is_valid_template_for_device(key, device):
        return key

    raise ValueError(
        f"Unknown {surface} UI '{key}' for device='{device}'. "
        f"Use a matching built-in: {sorted(builtin_map.keys())}, "
        f"or a published ui_templates.id whose device='{device}'."
    )


class UIConfig(BaseModel):
    """Flat UI configuration: one key per surface.

    Validation happens at the parent (UserGroupCreate / UserGroupUpdate)
    level because it requires the group's ``device``; UIConfig alone
    can't decide whether a given key is admissible.
    """
    feed: str = "youtube-desktop"
    watch: str = "youtube-desktop"


# ── Algorithm config ───────────────────────────────────────────────


def _available_algorithm_keys() -> list[str]:
    """Snapshot of dispatchable recommender keys (built-in + external)."""
    return sorted(set(BUILTIN_INSTANCES.keys()) | set(EXTERNAL_INSTANCES.keys()))


class AlgorithmConfig(BaseModel):
    """Algorithm configuration for a user group."""
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
    device: Device = "desktop"
    algorithm_config: AlgorithmConfig = AlgorithmConfig()
    ui_config: UIConfig = UIConfig()
    config: Optional[Dict[str, Any]] = None

    @model_validator(mode="after")
    def _check_ui_config(self) -> "UserGroupCreate":
        _validate_ui_key("feed", self.ui_config.feed, self.device)
        _validate_ui_key("watch", self.ui_config.watch, self.device)
        return self


class UserGroupUpdate(BaseModel):
    name: Optional[str] = None
    device: Optional[Device] = None
    algorithm_config: Optional[AlgorithmConfig] = None
    ui_config: Optional[UIConfig] = None
    config: Optional[Dict[str, Any]] = None

    # ``ui_config`` validation happens at the endpoint level for
    # updates because the device may or may not be in this patch — the
    # endpoint reads the existing group's device when the patch omits
    # it.


class UserGroupResponse(BaseModel):
    id: UUID
    experiment_id: UUID
    name: str
    device: Device = "desktop"
    algorithm_config: Dict[str, str] = {"feed": "random", "watch": "random"}
    ui_config: Dict[str, str] = {"feed": "youtube-desktop", "watch": "youtube-desktop"}
    config: Optional[Dict[str, Any]] = None
    created_at: datetime
    user_count: int = 0

    class Config:
        from_attributes = True
