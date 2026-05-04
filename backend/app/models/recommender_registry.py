"""
Recommender registry — DB-backed lookup for both built-in (Python class)
and external (HTTP-served) recommenders.

The Python plug-in side keeps a process-local `BUILTIN_INSTANCES` dict
of `BaseRecommender` instances. The DB row mirrors each built-in for
metadata purposes (label, description, capability flags, category) and
also hosts external recommender registrations (kind != 'python_class').

The single-source-of-truth flow:

    BUILTIN_INSTANCES (Python)        recommender_registry (DB)
            │                                    │
            └────────── shared key ──────────────┘
                              │
                              ▼
              get_recommender(key, db) dispatcher
"""
import uuid
from datetime import datetime

from sqlalchemy import Column, String, Text, Boolean, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB

from ..database import Base


# Allowed values for `kind`. Phase 1 only `python_class` is wired;
# `external_http` lands in Phase 2.
KIND_PYTHON_CLASS = "python_class"
KIND_EXTERNAL_HTTP = "external_http"


class RecommenderRegistry(Base):
    """One row per registered recommender — built-in or external."""

    __tablename__ = "recommender_registry"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Lookup key: matches `algorithm_config.feed` / `.watch` JSONB and
    # the entry in `BUILTIN_INSTANCES` (for python_class) or stays
    # admin-defined (for external_*).
    key = Column(String(64), nullable=False, unique=True, index=True)

    # Channel discriminator. python_class = in-process Python.
    # external_http = call out via HTTP at request time. external_pushed
    # is reserved for a possible future channel; not implemented now.
    kind = Column(String(32), nullable=False, default=KIND_PYTHON_CLASS)

    # Human-readable metadata served by /admin/recommenders.
    label = Column(String(128), nullable=False)
    description = Column(Text, nullable=False, default="")
    category = Column(String(32), nullable=False, default="baseline")

    # Capability flags — also enforced by the schema validator.
    supports_feed = Column(Boolean, nullable=False, default=True)
    supports_watch = Column(Boolean, nullable=False, default=True)

    # Channel-specific config. python_class: empty dict. external_http:
    # {"url": "...", "method": "POST", "body_template": {...},
    #  "response_path": "items[*].video_id", "timeout_ms": 5000}.
    config = Column(JSONB, nullable=False, default=dict)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
