"""Add comments table and video fields (channel_id, published_at)

Revision ID: 009_comments
Revises: 008_training_runs
Create Date: 2026-04-11 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '009_comments'
down_revision: Union[str, None] = '008_training_runs'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new fields to videos table
    op.add_column('videos', sa.Column('channel_id', sa.String(200), nullable=True))
    op.add_column('videos', sa.Column('published_at', sa.DateTime(), nullable=True))

    # Create comments table
    op.create_table(
        'comments',
        sa.Column('id', sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column('video_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('videos.id', ondelete='CASCADE'), nullable=False),
        sa.Column('comment_id', sa.String(200), nullable=False),
        sa.Column('parent_id', sa.String(200), nullable=True),
        sa.Column('author_name', sa.String(200), nullable=False),
        sa.Column('author_channel_id', sa.String(200), nullable=True),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('like_count', sa.Integer(), default=0),
        sa.Column('published_at', sa.DateTime(), nullable=True),
        sa.Column('reply_count', sa.Integer(), default=0),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # Indexes for comments
    op.create_index('idx_comments_video_id', 'comments', ['video_id'])
    op.create_index('idx_comments_comment_id', 'comments', ['comment_id'])
    op.create_index('idx_comments_parent_id', 'comments', ['parent_id'])


def downgrade() -> None:
    op.drop_table('comments')
    op.drop_column('videos', 'channel_id')
    op.drop_column('videos', 'published_at')
