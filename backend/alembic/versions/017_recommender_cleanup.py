"""Recommender registry cleanup — rename chronological→recency, drop auto/jaccard

Phase: recommender plug-in API cleanup. The recommender registry was
trimmed to five clean baselines + RecBole:

    random, popularity, recency, similarity, recbole

`auto` (Gorse autoItemToItem) and `jaccard` (toy tag overlap) are no
longer user-selectable — both were watch-only heuristics with hidden
tuning that didn't fit the "clean baseline" thesis. The internal
item_similarity table machinery (rows tagged algorithm='auto') stays
in place because RecBole's watch-side fallback chain reads from it.

`chronological` is renamed to `recency` to match standard RecSys
literature naming.

This migration rewrites any user_group whose algorithm_config still
references the deprecated keys:
    chronological → recency  (preserves intent)
    auto, jaccard → popularity  (safe non-personalized fallback)

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

    # auto / jaccard (watch-only heuristics) → popularity
    # These keys were never valid on the feed surface, but defensively
    # rewrite both fields if any historical row used them there.
    op.execute(
        """
        UPDATE user_groups
        SET algorithm_config = jsonb_set(
            algorithm_config,
            '{feed}',
            '"popularity"'::jsonb
        )
        WHERE algorithm_config ->> 'feed' IN ('auto', 'jaccard')
        """
    )
    op.execute(
        """
        UPDATE user_groups
        SET algorithm_config = jsonb_set(
            algorithm_config,
            '{watch}',
            '"popularity"'::jsonb
        )
        WHERE algorithm_config ->> 'watch' IN ('auto', 'jaccard')
        """
    )


def downgrade() -> None:
    # No structural change — only data rewrites. Reversal is best-effort
    # because we collapsed two distinct keys (auto, jaccard) onto
    # popularity and can't recover the original. Restore the recency
    # rename only.
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
