"""Per-group device assignment + ui_config flattening

Replaces the per-(surface, device) routing introduced in alembic 020 with
a simpler "one device per group" model. Each user group is now bound to
a single device class; participants whose viewport doesn't match see a
mismatch notice.

Schema changes:
- ``user_groups.device`` (varchar(20), NOT NULL, default 'desktop') —
  the device class this group's participants are expected to use.
- ``user_groups.ui_config`` JSONB collapses from
    ``{feed: {desktop, tablet?, mobile?}, watch: {desktop, tablet?, mobile?}}``
  to
    ``{feed: <key>, watch: <key>}``
  where the existing desktop slot's value is preserved (desktop was the
  required slot pre-021, so all rows have one).

Why: the per-(surface, device) matrix encoded six independent slots
that were almost always set together by device class. Cross-device
combinations like "mobile feed + tablet watch" are not a real
experimental design — a participant uses one device. Folding device
into the group itself removes the implicit incoherence and lets the
admin think in terms of "this group is for mobile users" rather than
"this group's mobile-feed-slot vs tablet-watch-slot".

Revision ID: 021_group_device
Revises: 020_surveys
Create Date: 2026-05-06
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '022_group_device'
down_revision: Union[str, None] = '021_template_device'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. New `device` column. Default 'desktop' for every existing row —
    #    pre-021 all built-ins (and most authored templates) targeted
    #    desktop, so this matches reality without admin intervention.
    op.add_column(
        'user_groups',
        sa.Column('device', sa.String(20), nullable=False, server_default='desktop'),
    )

    # 2. Collapse ui_config to flat shape. The desktop slot was required
    #    pre-021, so it's always present and we promote it to the new
    #    flat key. Tablet and mobile slot values are dropped — admins
    #    that wanted distinct device UIs should split the group.
    op.execute(
        """
        UPDATE user_groups
        SET ui_config = jsonb_build_object(
            'feed',  COALESCE(ui_config->'feed'->>'desktop',  'youtube'),
            'watch', COALESCE(ui_config->'watch'->>'desktop', 'youtube')
        )
        """
    )


def downgrade() -> None:
    # Restore the per-device map shape with the flat value seeded into
    # the desktop slot. Tablet and mobile come back null; they were
    # null on every row that hadn't been explicitly set, so this is
    # lossless for the common case.
    op.execute(
        """
        UPDATE user_groups
        SET ui_config = jsonb_build_object(
            'feed',  jsonb_build_object('desktop', ui_config->>'feed'),
            'watch', jsonb_build_object('desktop', ui_config->>'watch')
        )
        WHERE jsonb_typeof(ui_config->'feed') = 'string'
        """
    )
    op.drop_column('user_groups', 'device')
