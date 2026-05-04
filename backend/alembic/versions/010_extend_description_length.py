"""Extend video description column to 5000 chars

Revision ID: 010_description
Revises: 009_comments
Create Date: 2026-04-11 23:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '010_description'
down_revision: Union[str, None] = '009_comments'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('videos', 'description', type_=sa.String(5000), existing_nullable=True)


def downgrade() -> None:
    op.alter_column('videos', 'description', type_=sa.String(2000), existing_nullable=True)
