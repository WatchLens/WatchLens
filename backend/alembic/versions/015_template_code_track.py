"""Add code-track columns to ui_templates: template_type + code_text

Phase 3 — code track. UI templates can now be authored either as a block
tree (existing path, type='tree') or as raw TSX source compiled in the
browser at runtime (new path, type='code').

Revision ID: 015_template_code
Revises: 014_hot_indexes
Create Date: 2026-04-30
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '015_template_code'
down_revision: Union[str, None] = '014_hot_indexes'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'ui_templates',
        sa.Column('template_type', sa.String(20), nullable=False, server_default='tree'),
    )
    op.add_column(
        'ui_templates',
        sa.Column('code_text', sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('ui_templates', 'code_text')
    op.drop_column('ui_templates', 'template_type')
