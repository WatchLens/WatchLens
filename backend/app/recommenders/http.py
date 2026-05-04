"""
HTTP recommender — external (non-Python) policy via HTTP.

Calls a configured external endpoint at request time, expects a JSON
response containing video IDs, returns the matching `Video` rows from
this experiment's pool. This is the integration path for ML models
trained outside the platform: TF Serving, Triton, vLLM, a colleague's
R / Java / Go service, anything that speaks HTTP and JSON.

The config (stored in `recommender_registry.config` JSONB) drives the
call. Minimum required:

    {
      "url": "http://my-service:8080/recommend",
      "video_id_path": "video_ids"        // path inside the response JSON
    }

Optional:

    {
      "method": "POST",                    // default "POST"
      "timeout_seconds": 5.0,              // default 5
      "headers": {"Authorization": "..."},
      "body_template": {                   // template for the request body
          "user_id": "{user_id}",
          "limit": "{limit}",
          "offset": "{offset}",
          "current_video_id": "{current_video_id}",
          "experiment_id": "{experiment_id}",
          "exclude": "{exclude_video_ids}"
      }
    }

`{...}` placeholders in `body_template` are substituted with the
request's actual values (video UUIDs become strings).

`video_id_path` is a dotted path the recommender walks to extract a
list of strings. Examples:
    "video_ids"               → response["video_ids"]      (list of str)
    "items.*.video_id"        → response["items"][i]["video_id"]
    "data.recommendations"    → response["data"]["recommendations"]

If the external service is slow or returns garbage, the recommender
returns an empty list rather than raising — the dispatcher will then
serve an empty feed for that request rather than a 5xx error. The
researcher can plug a fallback recommender in front via group config
if they need cold-start coverage.
"""
import logging
from typing import Any, Dict, List, Optional
from uuid import UUID

import requests
from sqlalchemy.orm import Session

from .base import BaseRecommender, RecommenderMeta
from ..models.video import Video


logger = logging.getLogger(__name__)


def _walk_path(obj: Any, path: str) -> List[str]:
    """Walk a dotted path through a JSON-decoded object, collecting
    string values. `*` is a wildcard for list iteration."""
    if not path:
        if isinstance(obj, list):
            return [str(x) for x in obj]
        return [str(obj)]

    head, _, rest = path.partition(".")
    if head == "*":
        if not isinstance(obj, list):
            return []
        out: List[str] = []
        for item in obj:
            out.extend(_walk_path(item, rest))
        return out

    if isinstance(obj, dict) and head in obj:
        return _walk_path(obj[head], rest)
    if isinstance(obj, list):
        # Allow `path.0.field` style indexed access, but not common.
        try:
            idx = int(head)
            return _walk_path(obj[idx], rest)
        except (ValueError, IndexError):
            return []
    return []


def _substitute(template: Any, values: Dict[str, Any]) -> Any:
    """Recursively substitute `{key}` placeholders in template with
    values from the dict. Lists/dicts are walked structurally."""
    if isinstance(template, str):
        if template.startswith("{") and template.endswith("}") and "." not in template:
            key = template[1:-1]
            if key in values:
                return values[key]
        return template
    if isinstance(template, list):
        return [_substitute(x, values) for x in template]
    if isinstance(template, dict):
        return {k: _substitute(v, values) for k, v in template.items()}
    return template


class HTTPRecommender(BaseRecommender):
    """External recommender served over HTTP.

    Instances are constructed from a `recommender_registry` row with
    `kind='external_http'`. The `config` JSONB on the row drives the
    call shape. Metadata (label / description / capability flags) come
    from the row, not the class — overridden in the constructor below.
    """

    def __init__(
        self,
        key: str,
        label: str,
        description: str,
        category: str,
        supports_feed: bool,
        supports_watch: bool,
        config: Dict[str, Any],
    ):
        # Override class-level meta with row-level metadata. The class
        # default is a placeholder — every instance has its own.
        self.meta = RecommenderMeta(
            label=label,
            category=category,
            description=description,
        )
        self.supports_feed = supports_feed
        self.supports_watch = supports_watch
        self._key = key
        self._config = dict(config or {})

    @property
    def name(self) -> str:
        return self._key

    def get_recommendations(
        self,
        db: Session,
        experiment_id: UUID,
        user_id: UUID,
        limit: int = 20,
        offset: int = 0,
        exclude_video_ids: Optional[List[UUID]] = None,
        current_video_id: Optional[UUID] = None,
        algorithm_params: Optional[Dict] = None,
    ) -> List[Video]:
        url = self._config.get("url")
        if not url:
            logger.warning("HTTPRecommender '%s': no url in config", self._key)
            return []

        method = (self._config.get("method") or "POST").upper()
        timeout = float(self._config.get("timeout_seconds", 5.0))
        headers = self._config.get("headers") or {}
        body_template = self._config.get("body_template") or {
            "user_id": "{user_id}",
            "experiment_id": "{experiment_id}",
            "limit": "{limit}",
            "offset": "{offset}",
            "current_video_id": "{current_video_id}",
            "exclude_video_ids": "{exclude_video_ids}",
        }
        video_id_path = self._config.get("video_id_path", "video_ids")

        substitution_values: Dict[str, Any] = {
            "user_id": str(user_id),
            "experiment_id": str(experiment_id),
            "limit": int(limit),
            "offset": int(offset),
            "current_video_id": str(current_video_id) if current_video_id else None,
            "exclude_video_ids": [str(v) for v in (exclude_video_ids or [])],
        }
        if algorithm_params:
            # Researchers can pass through extra group-level knobs as
            # placeholders; surface algorithm_params keys directly.
            for k, v in algorithm_params.items():
                substitution_values.setdefault(k, v)

        body = _substitute(body_template, substitution_values)

        try:
            if method == "GET":
                response = requests.get(
                    url, params=body, headers=headers, timeout=timeout
                )
            else:
                response = requests.post(
                    url, json=body, headers=headers, timeout=timeout
                )
            response.raise_for_status()
            payload = response.json()
        except (requests.RequestException, ValueError) as e:
            logger.warning(
                "HTTPRecommender '%s' call failed: %s", self._key, e
            )
            return []

        try:
            video_id_strs = _walk_path(payload, video_id_path)
        except Exception as e:  # noqa: BLE001 — defensive against malformed configs
            logger.warning(
                "HTTPRecommender '%s' response parse failed: %s", self._key, e
            )
            return []

        if not video_id_strs:
            return []

        # External service may return any string IDs; coerce to UUID
        # and silently drop ones that don't parse.
        video_uuids: List[UUID] = []
        for s in video_id_strs:
            try:
                video_uuids.append(UUID(s))
            except (ValueError, TypeError):
                continue

        if not video_uuids:
            return []

        excluded = set(exclude_video_ids or [])
        # Fetch matching videos in this experiment, then preserve the
        # external service's ranking. Drop excluded.
        rows = (
            db.query(Video)
            .filter(
                Video.experiment_id == experiment_id,
                Video.id.in_(video_uuids),
            )
            .all()
        )
        by_id: Dict[UUID, Video] = {v.id: v for v in rows if v.id not in excluded}
        ordered = [by_id[uid] for uid in video_uuids if uid in by_id]
        return ordered[offset : offset + limit]
