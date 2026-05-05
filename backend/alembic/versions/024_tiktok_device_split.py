"""Rename `tiktok` UI key → `tiktok-desktop`

Mirrors alembic 023 (youtube → youtube-desktop). The TikTok preset is
desktop-only; renaming the key brings it in line with the
`<preset>-<device>` convention so future tablet / mobile TikTok
variants slot in alongside (e.g. `tiktok-mobile` for a phone-native
vertical-pager preset later).

Revision ID: 024_tiktok_device_split
Revises: 023_youtube_device_split
Create Date: 2026-05-06
"""
from typing import Sequence, Union

from alembic import op


revision: str = '024_tiktok_device_split'
down_revision: Union[str, None] = '023_youtube_device_split'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE user_groups
        SET ui_config = jsonb_set(
            ui_config,
            '{feed}',
            '"tiktok-desktop"'::jsonb
        )
        WHERE ui_config->>'feed' = 'tiktok'
        """
    )
    op.execute(
        """
        UPDATE user_groups
        SET ui_config = jsonb_set(
            ui_config,
            '{watch}',
            '"tiktok-desktop"'::jsonb
        )
        WHERE ui_config->>'watch' = 'tiktok'
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE user_groups
        SET ui_config = jsonb_set(ui_config, '{feed}', '"tiktok"'::jsonb)
        WHERE ui_config->>'feed' = 'tiktok-desktop'
        """
    )
    op.execute(
        """
        UPDATE user_groups
        SET ui_config = jsonb_set(ui_config, '{watch}', '"tiktok"'::jsonb)
        WHERE ui_config->>'watch' = 'tiktok-desktop'
        """
    )
