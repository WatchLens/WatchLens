"""Add ui_type to user_groups

Revision ID: 002_add_ui_type
Revises: 001_initial
Create Date: 2026-01-28

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '002_add_ui_type'
down_revision: Union[str, None] = '001_initial'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'user_groups',
        sa.Column('ui_type', sa.String(50), nullable=False, server_default='youtube')
    )


def downgrade() -> None:
    op.drop_column('user_groups', 'ui_type')
