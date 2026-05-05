"""Surveys (pre / post / inter_session) + responses

Adds two tables for the survey system:

- ``surveys`` — one row per survey definition. ``kind`` discriminates the
  trigger semantics (``pre`` = forced gate before feed entry, ``post`` =
  shown when ``experiment.status='completed'`` and the survey is active,
  ``inter_session`` = shown on a new SESSION_START asking the user to
  reflect on their most recent prior session). At most one active survey
  per ``(experiment_id, kind)`` is enforced via a partial unique index;
  admins can keep historical drafts alongside the live one.

- ``survey_responses`` — one row per submission. ``about_session_id`` is
  set only for inter-session surveys (the session being reflected on); pre
  and post responses leave it NULL. Per-session uniqueness is enforced via
  two partial unique indexes so the same user cannot submit twice for the
  same context.

Revision ID: 020_surveys
Revises: 019_ui_config_simplify
Create Date: 2026-05-05
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


revision: str = '020_surveys'
down_revision: Union[str, None] = '019_ui_config_simplify'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'surveys',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('experiment_id', UUID(as_uuid=True),
                  sa.ForeignKey('experiments.id', ondelete='CASCADE'), nullable=False),
        sa.Column('kind', sa.String(20), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('questions', JSONB(), nullable=False, server_default='[]'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index('ix_surveys_experiment_id', 'surveys', ['experiment_id'])
    # Partial unique: kind당 active=true 하나만 허용. draft 여러 개는 OK.
    op.create_index(
        'uq_surveys_one_active_per_kind',
        'surveys',
        ['experiment_id', 'kind'],
        unique=True,
        postgresql_where=sa.text('is_active = true'),
    )

    op.create_table(
        'survey_responses',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('survey_id', UUID(as_uuid=True),
                  sa.ForeignKey('surveys.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        # Inter-session 응답만 채움. pre/post 는 NULL.
        sa.Column('about_session_id', UUID(as_uuid=True),
                  sa.ForeignKey('sessions.id', ondelete='SET NULL'), nullable=True),
        sa.Column('answers', JSONB(), nullable=False, server_default='[]'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_responses_survey_user', 'survey_responses', ['survey_id', 'user_id'])

    # Pre / post: about_session_id NULL, (survey, user) 한 쌍에 응답 1개만
    op.create_index(
        'uq_responses_pre_post',
        'survey_responses',
        ['survey_id', 'user_id'],
        unique=True,
        postgresql_where=sa.text('about_session_id IS NULL'),
    )
    # Inter-session: about_session_id 있을 때 (survey, user, session) 트리플로 1개만
    op.create_index(
        'uq_responses_inter_session',
        'survey_responses',
        ['survey_id', 'user_id', 'about_session_id'],
        unique=True,
        postgresql_where=sa.text('about_session_id IS NOT NULL'),
    )


def downgrade() -> None:
    op.drop_index('uq_responses_inter_session', table_name='survey_responses')
    op.drop_index('uq_responses_pre_post', table_name='survey_responses')
    op.drop_index('ix_responses_survey_user', table_name='survey_responses')
    op.drop_table('survey_responses')

    op.drop_index('uq_surveys_one_active_per_kind', table_name='surveys')
    op.drop_index('ix_surveys_experiment_id', table_name='surveys')
    op.drop_table('surveys')
