"""Change algorithm to algorithm_config JSONB

Revision ID: 004_algorithm_config
Revises: 003_ui_config
Create Date: 2024-01-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision: str = '004_algorithm_config'
down_revision: Union[str, None] = '003_ui_config'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new algorithm_config column
    op.add_column('user_groups', sa.Column('algorithm_config', JSONB, nullable=True))

    # Migrate existing algorithm values to algorithm_config
    op.execute("""
        UPDATE user_groups
        SET algorithm_config = jsonb_build_object(
            'feed', COALESCE(algorithm, 'random'),
            'watch', COALESCE(algorithm, 'random')
        )
    """)

    # Make algorithm_config not nullable
    op.alter_column('user_groups', 'algorithm_config', nullable=False)

    # Drop old algorithm column
    op.drop_column('user_groups', 'algorithm')


def downgrade() -> None:
    # Add back the algorithm column
    op.add_column('user_groups', sa.Column('algorithm', sa.String(50), nullable=True))

    # Migrate algorithm_config.feed back to algorithm
    op.execute("""
        UPDATE user_groups
        SET algorithm = COALESCE(algorithm_config->>'feed', 'random')
    """)

    # Make algorithm not nullable with default
    op.alter_column('user_groups', 'algorithm', nullable=False, server_default='random')

    # Drop algorithm_config column
    op.drop_column('user_groups', 'algorithm_config')
