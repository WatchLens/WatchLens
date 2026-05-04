"""Change ui_type to ui_config JSONB

Revision ID: 003_ui_config
Revises: 002_add_ui_type
Create Date: 2026-01-28
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers
revision = '003_ui_config'
down_revision = '002_add_ui_type'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new ui_config column
    op.add_column(
        'user_groups',
        sa.Column('ui_config', JSONB, nullable=True)
    )

    # Migrate existing ui_type values to ui_config
    op.execute("""
        UPDATE user_groups
        SET ui_config = jsonb_build_object(
            'format', 'longform',
            'feed', COALESCE(ui_type, 'youtube'),
            'watch', COALESCE(ui_type, 'youtube')
        )
    """)

    # Set default for new rows
    op.alter_column(
        'user_groups',
        'ui_config',
        nullable=False,
        server_default='{"format": "longform", "feed": "youtube", "watch": "youtube"}'
    )

    # Drop old ui_type column
    op.drop_column('user_groups', 'ui_type')


def downgrade() -> None:
    # Add back ui_type column
    op.add_column(
        'user_groups',
        sa.Column('ui_type', sa.String(50), nullable=True)
    )

    # Migrate ui_config back to ui_type (use feed value)
    op.execute("""
        UPDATE user_groups
        SET ui_type = COALESCE(ui_config->>'feed', 'youtube')
    """)

    # Set not null
    op.alter_column(
        'user_groups',
        'ui_type',
        nullable=False,
        server_default='youtube'
    )

    # Drop ui_config column
    op.drop_column('user_groups', 'ui_config')
