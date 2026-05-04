"""Add recommendation_cache and item_similarity tables

Revision ID: 007_recommendation_cache
Revises: 006_ui_templates
Create Date: 2026-03-05 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '007_recommendation_cache'
down_revision: Union[str, None] = '006_ui_templates'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Recommendation cache for personalized Feed recommendations
    op.create_table(
        'recommendation_cache',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('experiment_id', postgresql.UUID(as_uuid=True),
                   sa.ForeignKey('experiments.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                   sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('video_id', postgresql.UUID(as_uuid=True),
                   sa.ForeignKey('videos.id', ondelete='CASCADE'), nullable=False),
        sa.Column('score', sa.Float, nullable=False),
        sa.Column('algorithm', sa.String(50), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint('experiment_id', 'user_id', 'video_id', 'algorithm',
                            name='uq_rec_cache_exp_user_video_algo'),
    )
    op.create_index(
        'ix_rec_cache_lookup',
        'recommendation_cache',
        ['experiment_id', 'user_id', 'algorithm', sa.text('score DESC')],
    )

    # Item similarity for Watch page (item-to-item recommendations)
    op.create_table(
        'item_similarity',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('experiment_id', postgresql.UUID(as_uuid=True),
                   sa.ForeignKey('experiments.id', ondelete='CASCADE'), nullable=False),
        sa.Column('source_video_id', postgresql.UUID(as_uuid=True),
                   sa.ForeignKey('videos.id', ondelete='CASCADE'), nullable=False),
        sa.Column('target_video_id', postgresql.UUID(as_uuid=True),
                   sa.ForeignKey('videos.id', ondelete='CASCADE'), nullable=False),
        sa.Column('score', sa.Float, nullable=False),
        sa.Column('algorithm', sa.String(50), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint('experiment_id', 'source_video_id', 'target_video_id', 'algorithm',
                            name='uq_item_sim_exp_src_tgt_algo'),
    )
    op.create_index(
        'ix_item_sim_lookup',
        'item_similarity',
        ['experiment_id', 'source_video_id', 'algorithm', sa.text('score DESC')],
    )


def downgrade() -> None:
    op.drop_index('ix_item_sim_lookup', table_name='item_similarity')
    op.drop_table('item_similarity')
    op.drop_index('ix_rec_cache_lookup', table_name='recommendation_cache')
    op.drop_table('recommendation_cache')
