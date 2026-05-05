"""Rename `youtube` UI key → `youtube-desktop` (per-device variants)

Adds tablet and mobile YouTube built-in presets alongside the existing
desktop one. The previously-keyed ``'youtube'`` rows on
``user_groups.ui_config`` rename to ``'youtube-desktop'`` since every
existing group has ``device='desktop'`` (alembic 022 set that as the
default for backfilled rows; non-desktop groups can only have come from
explicit admin action post-022 and would already point at templates).

The frontend ``ui-presets/registry.ts`` and the backend
``schemas/user_group.py:BUILTIN_FEED_KEYS / BUILTIN_WATCH_KEYS`` mirror
the new key set.

Revision ID: 023_youtube_device_split
Revises: 022_group_device
Create Date: 2026-05-06
"""
from typing import Sequence, Union

from alembic import op


revision: str = '023_youtube_device_split'
down_revision: Union[str, None] = '022_group_device'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Rename feed slot.
    op.execute(
        """
        UPDATE user_groups
        SET ui_config = jsonb_set(
            ui_config,
            '{feed}',
            '"youtube-desktop"'::jsonb
        )
        WHERE ui_config->>'feed' = 'youtube'
        """
    )
    # Rename watch slot.
    op.execute(
        """
        UPDATE user_groups
        SET ui_config = jsonb_set(
            ui_config,
            '{watch}',
            '"youtube-desktop"'::jsonb
        )
        WHERE ui_config->>'watch' = 'youtube'
        """
    )


def downgrade() -> None:
    # Reverse — collapses any of the three device variants back to the
    # bare 'youtube' key. Lossy if admins assigned tablet/mobile groups
    # before downgrade, since those rows lose the device suffix.
    for variant in ('youtube-desktop', 'youtube-tablet', 'youtube-mobile'):
        op.execute(
            f"""
            UPDATE user_groups
            SET ui_config = jsonb_set(ui_config, '{{feed}}', '"youtube"'::jsonb)
            WHERE ui_config->>'feed' = '{variant}'
            """
        )
        op.execute(
            f"""
            UPDATE user_groups
            SET ui_config = jsonb_set(ui_config, '{{watch}}', '"youtube"'::jsonb)
            WHERE ui_config->>'watch' = '{variant}'
            """
        )
