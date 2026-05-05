"""ui_templates.device + user_groups.ui_config nested per-device shape

Architecture: WatchLens UI templates are tagged per device
(`'desktop' | 'tablet' | 'mobile'`). Each template targets a single
device — no multi-viewport responsive rendering. A user group's
`ui_config` maps each (surface, device) pair to a template:

    {
      "feed":  { "desktop": "youtube", "tablet": "<uuid>", "mobile": "<uuid>" },
      "watch": { "desktop": "youtube", "tablet": "<uuid>", "mobile": "<uuid>" }
    }

Tablet / mobile slots are optional. When a participant arrives on an
unconfigured device, the dispatcher renders a "this experiment only
supports <X>" notice page rather than silently scaling a desktop UI
to 375px (which would confound experimental treatment per device).

Built-in keys (`youtube`, `tiktok`, `none`) are tagged `device='desktop'`
in code (see frontend `ui-presets/registry.ts`); the validator rejects
them in tablet / mobile slots.

This migration:
  1. Adds `ui_templates.device` (default 'desktop' so existing rows
     stay valid).
  2. Rewrites every `user_groups.ui_config` from the flat
     `{feed: <key>, watch: <key>}` shape to the nested
     `{feed: {desktop: <key>}, watch: {desktop: <key>}}` shape.
     Idempotent — already-nested rows are left untouched.

Revision ID: 020_template_device
Revises: 019_ui_config_simplify
Create Date: 2026-05-06
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '021_template_device'
down_revision: Union[str, None] = '020_surveys'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add device column to ui_templates. Existing rows default to
    #    'desktop' (they were authored against the desktop viewport
    #    width before this migration shipped).
    op.add_column(
        'ui_templates',
        sa.Column('device', sa.String(20), nullable=False, server_default='desktop'),
    )

    # 2. Rewrite ui_config to nested per-device form. Both `feed` and
    #    `watch` are independently flattened — guard against partial
    #    states (string vs object) so re-runs are idempotent.
    op.execute(
        """
        UPDATE user_groups
        SET ui_config = jsonb_build_object(
            'feed',
            CASE
                WHEN jsonb_typeof(ui_config->'feed') = 'string'
                    THEN jsonb_build_object('desktop', ui_config->'feed')
                WHEN jsonb_typeof(ui_config->'feed') = 'object'
                    THEN ui_config->'feed'
                ELSE jsonb_build_object('desktop', '"youtube"'::jsonb)
            END,
            'watch',
            CASE
                WHEN jsonb_typeof(ui_config->'watch') = 'string'
                    THEN jsonb_build_object('desktop', ui_config->'watch')
                WHEN jsonb_typeof(ui_config->'watch') = 'object'
                    THEN ui_config->'watch'
                ELSE jsonb_build_object('desktop', '"youtube"'::jsonb)
            END
        )
        """
    )


def downgrade() -> None:
    # Best-effort reversal: collapse nested form back to flat (desktop
    # value wins; tablet/mobile are dropped). device column is removed.
    op.execute(
        """
        UPDATE user_groups
        SET ui_config = jsonb_build_object(
            'feed',  COALESCE(ui_config->'feed'->>'desktop', 'youtube'),
            'watch', COALESCE(ui_config->'watch'->>'desktop', 'youtube')
        )
        WHERE jsonb_typeof(ui_config->'feed') = 'object'
        """
    )
    op.drop_column('ui_templates', 'device')
