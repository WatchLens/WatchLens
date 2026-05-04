"""
Recommender registry — Python plug-ins + DB-backed external (HTTP) recommenders.

The `BUILTIN_INSTANCES` dict holds one Python instance per built-in
policy. The `recommender_registry` DB table mirrors each built-in (as
`kind='python_class'`) and also hosts external recommender entries
(`kind='external_http'`), constructed lazily into `EXTERNAL_INSTANCES`
at startup and on registration.

Lookup paths:
  - `get_recommender(key)`  — Python dispatch. Checks built-ins first,
                              then external instances. Raises on miss.
  - `list_recommenders(db)` — DB query; returns all rows (built-in +
                              external) for the admin UI.
  - `register_external_http(db, ...)` — write a new external_http row
                              + populate EXTERNAL_INSTANCES so dispatch
                              works immediately on this worker.
  - `unregister_external(db, key)` — remove a non-builtin row + its
                              cached instance.
  - `reload_external_instances(db)` — rebuild EXTERNAL_INSTANCES from DB
                              (called at app startup).

Adding a built-in policy:
  1. Subclass `BaseRecommender` (see `base.py`); set `meta` and the
     `supports_*` flags.
  2. Implement `get_recommendations`.
  3. Add an instance to `BUILTIN_INSTANCES` here.
  4. Add a seed row to a follow-up Alembic migration so admin UI
     surfaces it.

Adding an external HTTP recommender (no code change):
  POST /admin/recommenders { key, kind: "external_http", label, ...,
                             config: { url, body_template, ... } }
"""
import logging
import threading
from typing import Optional, TYPE_CHECKING

from .base import BaseRecommender, RecommenderMeta
from .random import RandomRecommender
from .popularity import PopularityRecommender
from .recency import RecencyRecommender
from .similarity import SimilarityRecommender
from .recbole import RecBoleRecommender
from .http import HTTPRecommender

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


logger = logging.getLogger(__name__)


# Process-local registry of built-in Python recommenders. The keys
# match the `recommender_registry` rows seeded in migration 018.
BUILTIN_INSTANCES: dict[str, BaseRecommender] = {
    "random": RandomRecommender(),
    "popularity": PopularityRecommender(),
    "recency": RecencyRecommender(),
    "similarity": SimilarityRecommender(),
    "recbole": RecBoleRecommender(),
}

# External (non-Python) recommenders constructed from `recommender_registry`
# rows where `kind` is one of {external_http, ...}. Mutated by:
#   * reload_external_instances()  (called at app startup)
#   * register_external_http()     (called by the admin POST endpoint)
#   * unregister_external()        (called by the admin DELETE endpoint)
# A lock guards mutation against concurrent worker startups; reads
# (the dispatcher hot path) are dict access, which is thread-safe in
# CPython.
EXTERNAL_INSTANCES: dict[str, BaseRecommender] = {}
_external_lock = threading.Lock()


# Backward-compat alias. Existing modules import RECOMMENDERS;
# new dispatcher path consults both built-in and external maps.
RECOMMENDERS = BUILTIN_INSTANCES


# ── Dispatcher ─────────────────────────────────────────────────────


def _refresh_external_from_db(key: str) -> bool:
    """Load `key` from `recommender_registry` if it's a non-builtin
    that isn't yet in this worker's `EXTERNAL_INSTANCES`. Returns True
    on success.

    Why: with multiple uvicorn workers, registrations made through the
    admin API populate `EXTERNAL_INSTANCES` only on the worker that
    handled the POST. Sibling workers see the new key as "unknown"
    until their next startup unless they refresh on miss. This
    function is the per-miss refresh — cheap (single SELECT by key),
    cached after first hit on each worker."""
    from ..database import SessionLocal
    from ..models.recommender_registry import RecommenderRegistry

    db = SessionLocal()
    try:
        row = (
            db.query(RecommenderRegistry)
            .filter(
                RecommenderRegistry.key == key,
                RecommenderRegistry.kind != "python_class",
            )
            .first()
        )
        if row is None:
            return False
        try:
            instance = _instantiate_from_row(row)
        except Exception as e:  # noqa: BLE001
            logger.warning(
                "Failed to instantiate external recommender '%s': %s", key, e
            )
            return False
        with _external_lock:
            EXTERNAL_INSTANCES[key] = instance
        return True
    finally:
        db.close()


def get_recommender(algorithm: str) -> BaseRecommender:
    """Look up a recommender by registry key. Built-ins first, then
    external HTTP (with a one-shot DB refresh on miss for cross-worker
    consistency). Raises `ValueError` on unknown keys — callers should
    surface this as a 4xx error so misconfigured groups are visible at
    request time rather than silently returning empty results."""
    if algorithm in BUILTIN_INSTANCES:
        return BUILTIN_INSTANCES[algorithm]
    if algorithm in EXTERNAL_INSTANCES:
        return EXTERNAL_INSTANCES[algorithm]
    if _refresh_external_from_db(algorithm):
        return EXTERNAL_INSTANCES[algorithm]
    available = sorted(set(BUILTIN_INSTANCES.keys()) | set(EXTERNAL_INSTANCES.keys()))
    raise ValueError(f"Unknown algorithm: {algorithm}. Available: {available}")


def is_registered(algorithm: str) -> bool:
    """True if the key is dispatchable (built-in or known external).
    Used by the schema validator. Checks the in-process cache first;
    falls back to DB lookup so registrations made on a sibling worker
    are still accepted without a backend restart."""
    if algorithm in BUILTIN_INSTANCES or algorithm in EXTERNAL_INSTANCES:
        return True
    return _refresh_external_from_db(algorithm)


def get_capability(algorithm: str) -> tuple[bool, bool]:
    """Return (supports_feed, supports_watch) for `algorithm`.
    Raises `ValueError` if not registered."""
    rec = get_recommender(algorithm)
    return (rec.supports_feed, rec.supports_watch)


# ── Listing ────────────────────────────────────────────────────────


def list_recommenders(db: Optional["Session"] = None) -> list[dict]:
    """Return public metadata for every registered recommender.

    With a `db` session: query `recommender_registry` so admin-edited
    metadata and external recommender rows are reflected. Without a
    session: fall back to in-process built-in metadata only (rare;
    intended for CLI tooling without request scope).
    """
    if db is not None:
        from ..models.recommender_registry import RecommenderRegistry

        rows = (
            db.query(RecommenderRegistry)
            .order_by(RecommenderRegistry.created_at.asc())
            .all()
        )
        return [
            {
                "key": r.key,
                "kind": r.kind,
                "label": r.label,
                "category": r.category,
                "description": r.description,
                "supports_feed": r.supports_feed,
                "supports_watch": r.supports_watch,
                "config": r.config,
            }
            for r in rows
        ]

    return [
        {
            "key": key,
            "kind": "python_class",
            "label": rec.meta.label,
            "category": rec.meta.category,
            "description": rec.meta.description,
            "supports_feed": rec.supports_feed,
            "supports_watch": rec.supports_watch,
            "config": {},
        }
        for key, rec in BUILTIN_INSTANCES.items()
    ]


# ── External HTTP recommender lifecycle ────────────────────────────


def _instantiate_from_row(row) -> BaseRecommender:
    """Construct a runtime recommender instance from a DB row."""
    if row.kind == "external_http":
        return HTTPRecommender(
            key=row.key,
            label=row.label,
            description=row.description,
            category=row.category,
            supports_feed=row.supports_feed,
            supports_watch=row.supports_watch,
            config=row.config or {},
        )
    raise ValueError(f"Cannot instantiate kind={row.kind!r} for key={row.key!r}")


def reload_external_instances(db: "Session") -> int:
    """Rebuild `EXTERNAL_INSTANCES` from the DB. Called once at app
    startup. Returns the number of external recommenders loaded."""
    from ..models.recommender_registry import RecommenderRegistry

    rows = (
        db.query(RecommenderRegistry)
        .filter(RecommenderRegistry.kind != "python_class")
        .all()
    )
    new_map: dict[str, BaseRecommender] = {}
    for row in rows:
        try:
            new_map[row.key] = _instantiate_from_row(row)
        except Exception as e:  # noqa: BLE001
            logger.warning(
                "Skipping external recommender '%s' (kind=%s): %s",
                row.key, row.kind, e,
            )
    with _external_lock:
        EXTERNAL_INSTANCES.clear()
        EXTERNAL_INSTANCES.update(new_map)
    return len(new_map)


def register_external_http(
    db: "Session",
    *,
    key: str,
    label: str,
    description: str,
    category: str,
    supports_feed: bool,
    supports_watch: bool,
    config: dict,
):
    """Insert a `kind='external_http'` row and instantiate it in this
    worker's `EXTERNAL_INSTANCES`. Other workers pick it up via
    `reload_external_instances` (next startup) — for now we accept the
    eventual consistency. Returns the inserted row.

    Raises `ValueError` if the key is already taken (built-in or
    external)."""
    from ..models.recommender_registry import RecommenderRegistry

    if key in BUILTIN_INSTANCES:
        raise ValueError(f"'{key}' is a built-in recommender key.")
    existing = (
        db.query(RecommenderRegistry).filter(RecommenderRegistry.key == key).first()
    )
    if existing is not None:
        raise ValueError(f"Recommender key '{key}' already exists.")

    row = RecommenderRegistry(
        key=key,
        kind="external_http",
        label=label,
        description=description,
        category=category,
        supports_feed=supports_feed,
        supports_watch=supports_watch,
        config=config,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    with _external_lock:
        EXTERNAL_INSTANCES[key] = _instantiate_from_row(row)
    return row


def update_recommender(
    db: "Session",
    key: str,
    *,
    label: Optional[str] = None,
    description: Optional[str] = None,
    category: Optional[str] = None,
    supports_feed: Optional[bool] = None,
    supports_watch: Optional[bool] = None,
    config: Optional[dict] = None,
):
    """Patch fields on a registered recommender. Only the keys you pass
    are applied. Constraints:

    - Built-ins (`kind='python_class'`) accept metadata edits only
      (label / description / category). Capability flags and `config`
      are sourced from the Python class for built-ins; ignoring patches
      to them prevents the DB metadata and the runtime dispatch from
      drifting out of sync.
    - For external recommenders, every patchable field is honored. The
      cached instance in `EXTERNAL_INSTANCES` is rebuilt with the new
      row state so subsequent dispatches see the change immediately on
      this worker. Sibling workers refresh on cache miss.
    - The `key` and `kind` are immutable. Re-register if you need to
      change them.

    Raises `ValueError` if the key is unknown or if a patch tries to
    mutate a built-in's runtime characteristics."""
    from ..models.recommender_registry import RecommenderRegistry

    row = (
        db.query(RecommenderRegistry)
        .filter(RecommenderRegistry.key == key)
        .first()
    )
    if row is None:
        raise ValueError(f"Recommender '{key}' not found.")

    is_builtin = row.kind == "python_class"

    if label is not None:
        row.label = label
    if description is not None:
        row.description = description
    if category is not None:
        row.category = category

    if supports_feed is not None:
        if is_builtin and supports_feed != row.supports_feed:
            raise ValueError(
                f"Cannot change supports_feed on built-in '{key}' — "
                f"capability is sourced from the Python class."
            )
        row.supports_feed = supports_feed

    if supports_watch is not None:
        if is_builtin and supports_watch != row.supports_watch:
            raise ValueError(
                f"Cannot change supports_watch on built-in '{key}' — "
                f"capability is sourced from the Python class."
            )
        row.supports_watch = supports_watch

    if config is not None:
        if is_builtin and config:
            raise ValueError(
                f"Cannot set config on built-in '{key}' — built-in "
                f"behaviour is hard-coded in the Python class."
            )
        row.config = config

    db.commit()
    db.refresh(row)

    if not is_builtin:
        # Re-instantiate so cached HTTP recommender picks up new url /
        # body_template / capability flags. Sibling workers see the
        # change on next cache-miss DB lookup or on restart.
        try:
            new_instance = _instantiate_from_row(row)
        except Exception as e:  # noqa: BLE001
            logger.warning(
                "update_recommender('%s') row updated but instance rebuild failed: %s",
                key, e,
            )
        else:
            with _external_lock:
                EXTERNAL_INSTANCES[key] = new_instance

    return row


def unregister_external(db: "Session", key: str) -> None:
    """Delete a non-builtin recommender row and drop its cached
    instance. Built-in keys are protected — caller gets a `ValueError`."""
    from ..models.recommender_registry import RecommenderRegistry

    if key in BUILTIN_INSTANCES:
        raise ValueError(f"Cannot delete built-in recommender '{key}'.")
    row = (
        db.query(RecommenderRegistry)
        .filter(RecommenderRegistry.key == key)
        .first()
    )
    if row is None:
        raise ValueError(f"Recommender '{key}' not found.")
    if row.kind == "python_class":
        # Defensive: a row could be python_class even without the key
        # being in BUILTIN_INSTANCES (e.g. a removed built-in's leftover
        # seed). Block deletion to surface inconsistency.
        raise ValueError(f"'{key}' is registered as a python_class; refuse to delete via API.")
    db.delete(row)
    db.commit()
    with _external_lock:
        EXTERNAL_INSTANCES.pop(key, None)


__all__ = [
    "BaseRecommender",
    "RecommenderMeta",
    "RandomRecommender",
    "PopularityRecommender",
    "RecencyRecommender",
    "SimilarityRecommender",
    "RecBoleRecommender",
    "HTTPRecommender",
    "BUILTIN_INSTANCES",
    "EXTERNAL_INSTANCES",
    "RECOMMENDERS",
    "get_recommender",
    "is_registered",
    "get_capability",
    "list_recommenders",
    "reload_external_instances",
    "register_external_http",
    "update_recommender",
    "unregister_external",
]
