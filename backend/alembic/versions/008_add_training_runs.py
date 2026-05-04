"""Add training_runs table

Revision ID: 008_training_runs
Revises: 007_recommendation_cache
Create Date: 2026-03-05 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '008_training_runs'
down_revision: Union[str, None] = '007_recommendation_cache'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'training_runs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('experiment_id', postgresql.UUID(as_uuid=True),
                   sa.ForeignKey('experiments.id', ondelete='CASCADE'), nullable=False),
        sa.Column('model_name', sa.String(50), nullable=False),
        sa.Column('top_k', sa.Integer, nullable=False, server_default='100'),
        sa.Column('hyperparameters', postgresql.JSONB, server_default='{}'),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('metrics', postgresql.JSONB, nullable=True),
        sa.Column('interaction_count', sa.Integer, nullable=True),
        sa.Column('user_count', sa.Integer, nullable=True),
        sa.Column('item_count', sa.Integer, nullable=True),
        sa.Column('recommendation_count', sa.Integer, nullable=True),
        sa.Column('similarity_count', sa.Integer, nullable=True),
        sa.Column('duration_seconds', sa.Float, nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('triggered_by', postgresql.UUID(as_uuid=True),
                   sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
    )
    op.create_index(
        'ix_training_runs_experiment_created',
        'training_runs',
        ['experiment_id', sa.text('created_at DESC')],
    )
    op.create_index(
        'ix_training_runs_experiment_status',
        'training_runs',
        ['experiment_id', 'status'],
    )


def downgrade() -> None:
    op.drop_index('ix_training_runs_experiment_status', table_name='training_runs')
    op.drop_index('ix_training_runs_experiment_created', table_name='training_runs')
    op.drop_table('training_runs')
