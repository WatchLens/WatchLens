"""Add block-tree columns to ui_templates: feed_tree + watch_tree

Phase 4 — block-tree authoring track. UI templates of type='tree' can
now store a block tree (BlockNode JSON) per page. Existing tree
templates kept their flat feed_config/watch_config shape; the new
columns are nullable so the legacy shape still works as a fallback.

Render dispatch (custom/feed.tsx, custom/watch.tsx):
   if feed_tree set → BlockTreeRenderer
   elif feed_config has legacy shape → legacy CSS-themed grid
   elif template_type='code' → CompiledUI

Revision ID: 016_template_tree
Revises: 015_template_code
Create Date: 2026-05-01
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = '016_template_tree'
down_revision: Union[str, None] = '015_template_code'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('ui_templates', sa.Column('feed_tree', JSONB(), nullable=True))
    op.add_column('ui_templates', sa.Column('watch_tree', JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column('ui_templates', 'watch_tree')
    op.drop_column('ui_templates', 'feed_tree')
