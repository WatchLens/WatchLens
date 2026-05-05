"""Recommender registry cleanup — rename chronological→recency

Phase: recommender plug-in API cleanup. The recommender registry was
trimmed to five clean baselines + RecBole:

    random, popularity, recency, similarity, recbole

`chronological` is renamed to `recency` to match standard RecSys
literature naming.

This migration rewrites any user_group whose algorithm_config still
references the deprecated key:
    chronological → recency  (preserves intent)

Revision ID: 017_recommender_cleanup
Revises: 016_template_tree
Create Date: 2026-05-04
"""
from typing import Sequence, Union
from alembic import op


revision: str = '017_recommender_cleanup'
down_revision: Union[str, None] = '016_template_tree'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # chronological → recency (both surfaces)
    op.execute(
        """
        UPDATE user_groups
        SET algorithm_config = jsonb_set(
            algorithm_config,
            '{feed}',
            '"recency"'::jsonb
        )
        WHERE algorithm_config ->> 'feed' = 'chronological'
        """
    )
    op.execute(
        """
        UPDATE user_groups
        SET algorithm_config = jsonb_set(
            algorithm_config,
            '{watch}',
            '"recency"'::jsonb
        )
        WHERE algorithm_config ->> 'watch' = 'chronological'
        """
    )


def downgrade() -> None:
    # No structural change — only data rewrites. Restore the
    # chronological name on either surface where recency is set.
    op.execute(
        """
        UPDATE user_groups
        SET algorithm_config = jsonb_set(
            algorithm_config,
            '{feed}',
            '"chronological"'::jsonb
        )
        WHERE algorithm_config ->> 'feed' = 'recency'
        """
    )
    op.execute(
        """
        UPDATE user_groups
        SET algorithm_config = jsonb_set(
            algorithm_config,
            '{watch}',
            '"chronological"'::jsonb
        )
        WHERE algorithm_config ->> 'watch' = 'recency'
        """
    )
