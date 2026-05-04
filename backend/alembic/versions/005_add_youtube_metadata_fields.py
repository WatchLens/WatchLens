"""Add YouTube-style metadata fields to videos table

Revision ID: 005_youtube_metadata
Revises: 004_algorithm_config
Create Date: 2024-01-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '005_youtube_metadata'
down_revision: Union[str, None] = '004_algorithm_config'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add YouTube-style metadata columns
    op.add_column('videos', sa.Column('description', sa.String(2000), nullable=True))
    op.add_column('videos', sa.Column('like_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('videos', sa.Column('dislike_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('videos', sa.Column('comment_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('videos', sa.Column('channel_name', sa.String(200), nullable=True))


def downgrade() -> None:
    op.drop_column('videos', 'channel_name')
    op.drop_column('videos', 'comment_count')
    op.drop_column('videos', 'dislike_count')
    op.drop_column('videos', 'like_count')
    op.drop_column('videos', 'description')
