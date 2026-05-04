"""ui_config simplify — drop format/feed_enabled/template_id, fold custom→UUID, shorts→none/tiktok

Phase: UI dispatch hybrid model. The `ui_config` JSONB on `user_groups`
is simplified to just `{feed, watch}` where each value is either a
built-in preset key (`'youtube'`, `'tiktok'`, plus `'none'` for feed
only) or a published `ui_templates.id` UUID. The previous fields are
retired:

  - `format` ('longform' | 'shortform') — preset clustering metadata,
    no longer used; the dispatcher routes by key alone.
  - `feed_enabled` (bool) — replaced by `feed='none'` for the disabled
    case.
  - `template_id` (UUID) — replaced by `feed`/`watch` carrying the
    template UUID directly (built-in keys and templates are equal
    citizens of the same string namespace).

Existing rows are rewritten:
  - `feed='custom'`  → `feed=template_id`
  - `watch='custom'` → `watch=template_id`
  - `feed='shorts'`  → `feed='none'`           (split-screen feed had
                                                 no thumbnail grid; the
                                                 closest semantic is
                                                 the new "no feed page"
                                                 flow)
  - `watch='shorts'` → `watch='tiktok'`        (split-screen watch is
                                                 retired; TikTok pager
                                                 is the closest
                                                 shortform watch)
  - `feed='youtube'/'tiktok'` → unchanged
  - `watch='youtube'/'tiktok'` → unchanged
  - `format`, `feed_enabled`, `template_id` keys are stripped.

Revision ID: 019_ui_config_simplify
Revises: 018_recommender_registry
Create Date: 2026-05-04
"""
from typing import Sequence, Union

from alembic import op


revision: str = '019_ui_config_simplify'
down_revision: Union[str, None] = '018_recommender_registry'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. feed='custom' or watch='custom' → write the template_id UUID
    #    in their place. Must run before stripping template_id.
    op.execute(
        """
        UPDATE user_groups
        SET ui_config = jsonb_set(
            ui_config,
            '{feed}',
            to_jsonb(ui_config->>'template_id')
        )
        WHERE ui_config->>'feed' = 'custom'
          AND ui_config->>'template_id' IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE user_groups
        SET ui_config = jsonb_set(
            ui_config,
            '{watch}',
            to_jsonb(ui_config->>'template_id')
        )
        WHERE ui_config->>'watch' = 'custom'
          AND ui_config->>'template_id' IS NOT NULL
        """
    )

    # 2. feed='shorts' → feed='none' (no thumbnail grid; closest new
    #    semantic is "skip the feed page").
    op.execute(
        """
        UPDATE user_groups
        SET ui_config = jsonb_set(ui_config, '{feed}', '"none"'::jsonb)
        WHERE ui_config->>'feed' = 'shorts'
        """
    )

    # 3. watch='shorts' → watch='tiktok' (TikTok pager is the closest
    #    surviving shortform watch).
    op.execute(
        """
        UPDATE user_groups
        SET ui_config = jsonb_set(ui_config, '{watch}', '"tiktok"'::jsonb)
        WHERE ui_config->>'watch' = 'shorts'
        """
    )

    # 4. Strip retired keys (format, feed_enabled, template_id).
    op.execute(
        """
        UPDATE user_groups
        SET ui_config = ui_config - 'format' - 'feed_enabled' - 'template_id'
        """
    )


def downgrade() -> None:
    # No structural change — only data rewrites. Reversal is best-effort
    # because the simplification collapses information (e.g., we can't
    # distinguish a former 'shorts' feed from one always set to 'none').
    # Restore conservative defaults: longform / feed enabled.
    op.execute(
        """
        UPDATE user_groups
        SET ui_config = ui_config
            || '{"format": "longform", "feed_enabled": true}'::jsonb
        WHERE NOT (ui_config ? 'format')
        """
    )
