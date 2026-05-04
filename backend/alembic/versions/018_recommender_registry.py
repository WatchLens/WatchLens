"""Recommender registry table — DB-backed recommender lookup

Phase: Hybrid plug-in foundation. Adds `recommender_registry` to host
metadata for both built-in (Python class) and external (HTTP) policies.

The Python `BUILTIN_INSTANCES` dict in `app/recommenders/__init__.py`
is now mirrored as DB rows (kind='python_class') so the admin UI can
read live metadata without restarting the backend, and so external
HTTP recommenders can be registered alongside the built-ins under the
same key namespace.

Seeds the five current built-ins:
    random, popularity, recency, similarity, recbole

Revision ID: 018_recommender_registry
Revises: 017_recommender_cleanup
Create Date: 2026-05-04
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


revision: str = '018_recommender_registry'
down_revision: Union[str, None] = '017_recommender_cleanup'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'recommender_registry',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('key', sa.String(64), nullable=False, unique=True),
        sa.Column('kind', sa.String(32), nullable=False, server_default='python_class'),
        sa.Column('label', sa.String(128), nullable=False),
        sa.Column('description', sa.Text(), nullable=False, server_default=''),
        sa.Column('category', sa.String(32), nullable=False, server_default='baseline'),
        sa.Column('supports_feed', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('supports_watch', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('config', JSONB(), nullable=False, server_default='{}'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_recommender_registry_key', 'recommender_registry', ['key'], unique=True)

    # Seed the built-ins. Mirrors the metadata declared on each class
    # in app/recommenders/<file>.py — keep these in sync if the
    # built-in metadata changes (or refactor to read from class meta
    # at startup).
    seed_rows = [
        ('random', 'Random', 'baseline', True, True,
         'Returns videos in random order. Use as a control / baseline policy for A/B experiments.'),
        ('popularity', 'Popularity', 'baseline', True, True,
         'Returns videos sorted by view count (most popular first). Non-personalized baseline that captures the popularity bias common in real platforms.'),
        ('recency', 'Recency', 'baseline', True, True,
         'Returns videos sorted by creation date (newest first). Captures the recency bias present in many platforms; useful as a temporal baseline.'),
        ('similarity', 'Similarity', 'baseline', False, True,
         "Content-based similarity using TF-IDF cosine on the video's title, description, and tags. Watch-only — requires a current video. Cold-start friendly (no behaviour data needed)."),
        ('recbole', 'RecBole', 'learned', True, True,
         'Learned policy backed by the RecBole framework (70+ algorithms — BPR, NeuMF, ItemKNN, …). Trains from the events table on a schedule and serves from a precomputed cache, with a popularity / recency fallback for cold start.'),
    ]
    for key, label, category, sf, sw, description in seed_rows:
        op.execute(sa.text(
            """
            INSERT INTO recommender_registry
                (key, kind, label, description, category, supports_feed, supports_watch, config)
            VALUES
                (:key, 'python_class', :label, :description, :category, :sf, :sw, '{}'::jsonb)
            """
        ).bindparams(key=key, label=label, description=description, category=category, sf=sf, sw=sw))


def downgrade() -> None:
    op.drop_index('ix_recommender_registry_key', table_name='recommender_registry')
    op.drop_table('recommender_registry')
