"""Add hot-path indexes: sessions(user_id) and events(event_type, video_id)

Pre-study audit identified two indexes missing on the hottest query paths:

- `sessions(user_id)`: every Feed/Watch request, watch-alerts poll, and
  scheduler cycle joins events → sessions WHERE s.user_id = :uid. Postgres
  does not auto-index FKs, so the join was falling back to a hash. With the
  index, the join becomes an index lookup.

- `events(event_type, video_id)` partial on video_id NOT NULL: feeds the
  `_get_watched_video_ids(user_id)` query that runs on every `/feed` and
  `/feed/{id}/related` request. Without a composite index the planner used
  `idx_events_event_type` alone, which is low-selectivity at study scale.

Revision ID: 014_hot_indexes
Revises: 010_extend_description_length
Create Date: 2026-04-17 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '014_hot_indexes'
down_revision: Union[str, None] = '010_description'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "idx_sessions_user_id",
        "sessions",
        ["user_id"],
    )
    op.create_index(
        "idx_events_type_video",
        "events",
        ["event_type", "video_id"],
        postgresql_where=sa.text("video_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("idx_events_type_video", table_name="events")
    op.drop_index("idx_sessions_user_id", table_name="sessions")
