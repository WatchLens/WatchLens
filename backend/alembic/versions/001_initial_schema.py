"""Initial schema — WatchLens platform.

This is the squashed initial migration. The dev branch went through 25
incremental migrations as the schema evolved (UI config shape, per-group
device routing, survey system, recommender registry, per-surface event
algorithm tracking, …). The public release folds every accumulated change
into this single file so a fresh deploy boots in one migration step.

Tables created:
  - experiments         — experiment definitions
  - user_groups         — per-experiment treatment groups (device + algorithm + UI)
  - users               — participant accounts
  - sessions            — frontend-generated session UUIDs
  - events              — wide-table event log (33 event types)
  - videos              — per-experiment video pool
  - comments            — read-only imported comments per video
  - ui_templates        — admin-authored UI templates (tree + code tracks)
  - recommendation_cache — pre-computed CF recommendations (RecBole)
  - item_similarity     — pre-computed I2I similarities (RecBole + auto)
  - training_runs       — RecBole training history
  - recommender_registry — built-in + external HTTP recommender metadata
  - surveys / survey_responses — pre / post / inter-session surveys

`recommender_registry` is seeded with the five built-in policies; the
dispatcher in `app/recommenders/__init__.py` mirrors these as Python
instances and dispatches by `key`.

Revision ID: 001_initial_schema
Revises:
Create Date: 2026-05-06
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = '001_initial_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── experiments ───────────────────────────────────────────────────
    op.create_table(
        'experiments',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', sa.String(20), nullable=True, server_default='draft'),
        sa.Column('start_date', sa.Date(), nullable=True),
        sa.Column('end_date', sa.Date(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )

    # ── user_groups ───────────────────────────────────────────────────
    # `device` binds the group to one viewport class (desktop / tablet /
    # mobile). `algorithm_config` is `{feed, watch}` keyed by recommender
    # registry key. `ui_config` is `{feed, watch}` keyed by built-in UI
    # preset key (e.g. `youtube-desktop`) or a published `ui_templates.id`.
    op.create_table(
        'user_groups',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('experiment_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('device', sa.String(20), nullable=False, server_default='desktop'),
        sa.Column(
            'algorithm_config',
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("""'{"feed": "random", "watch": "random"}'::jsonb"""),
        ),
        sa.Column(
            'ui_config',
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text(
                """'{"feed": "youtube-desktop", "watch": "youtube-desktop"}'::jsonb"""
            ),
        ),
        sa.Column(
            'config',
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['experiment_id'], ['experiments.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )

    # ── users ─────────────────────────────────────────────────────────
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_group_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('login_id', sa.String(100), nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('is_admin', sa.Boolean(), nullable=True, server_default=sa.text('false')),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('last_login', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_group_id'], ['user_groups.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('login_id'),
    )
    op.create_index('idx_users_login_id', 'users', ['login_id'])

    # ── videos ────────────────────────────────────────────────────────
    op.create_table(
        'videos',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('experiment_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('video_id', sa.String(100), nullable=False),
        sa.Column('title', sa.String(1000), nullable=True),
        sa.Column('url', sa.String(1000), nullable=False),
        sa.Column('thumbnail_url', sa.String(1000), nullable=True),
        sa.Column('video_type', sa.String(20), nullable=True, server_default='url'),
        sa.Column('duration', sa.Integer(), nullable=True),
        sa.Column('category', sa.String(100), nullable=True),
        sa.Column('tags', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('view_count', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('description', sa.String(5000), nullable=True),
        sa.Column('like_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('dislike_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('comment_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('channel_name', sa.String(200), nullable=True),
        sa.Column('channel_id', sa.String(200), nullable=True),
        sa.Column('published_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['experiment_id'], ['experiments.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_videos_video_id', 'videos', ['video_id'])
    op.create_index('idx_videos_experiment_id', 'videos', ['experiment_id'])

    # ── sessions ──────────────────────────────────────────────────────
    op.create_table(
        'sessions',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('ended_at', sa.DateTime(), nullable=True),
        sa.Column('user_agent', sa.String(500), nullable=True),
        sa.Column('ip_address', sa.String(45), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    # Hot-path index: every Feed/Watch request joins events→sessions
    # WHERE s.user_id = :uid. Postgres doesn't auto-index FKs.
    op.create_index('idx_sessions_user_id', 'sessions', ['user_id'])

    # ── events ────────────────────────────────────────────────────────
    # Wide-table + JSONB payload pattern. Both `algorithm_feed` and
    # `algorithm_watch` capture the policy active at event time so per-
    # surface analysis can join either column without inferring the page
    # from `event_type`.
    op.create_table(
        'events',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('session_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('video_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('event_type', sa.String(50), nullable=False),
        sa.Column('watch_ratio', sa.Float(), nullable=True),
        sa.Column('watch_duration', sa.Float(), nullable=True),
        sa.Column('position_in_feed', sa.Integer(), nullable=True),
        sa.Column('algorithm_feed', sa.String(50), nullable=True),
        sa.Column('algorithm_watch', sa.String(50), nullable=True),
        sa.Column('payload', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('client_timestamp', sa.DateTime(), nullable=False),
        sa.Column('server_timestamp', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['session_id'], ['sessions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['video_id'], ['videos.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_events_session_id', 'events', ['session_id'])
    op.create_index('idx_events_video_id', 'events', ['video_id'])
    op.create_index('idx_events_event_type', 'events', ['event_type'])
    op.create_index('idx_events_server_timestamp', 'events', ['server_timestamp'])
    op.create_index('idx_events_payload', 'events', ['payload'], postgresql_using='gin')
    # Hot-path partial composite for the watched-history exclusion query
    # (`SELECT video_id WHERE event_type IN (…) AND video_id IS NOT NULL`).
    op.create_index(
        'idx_events_type_video',
        'events',
        ['event_type', 'video_id'],
        postgresql_where=sa.text('video_id IS NOT NULL'),
    )

    # ── comments ──────────────────────────────────────────────────────
    op.create_table(
        'comments',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('video_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('comment_id', sa.String(200), nullable=False),
        sa.Column('parent_id', sa.String(200), nullable=True),
        sa.Column('author_name', sa.String(200), nullable=False),
        sa.Column('author_channel_id', sa.String(200), nullable=True),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('like_count', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('published_at', sa.DateTime(), nullable=True),
        sa.Column('reply_count', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['video_id'], ['videos.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_comments_video_id', 'comments', ['video_id'])
    op.create_index('idx_comments_comment_id', 'comments', ['comment_id'])
    op.create_index('idx_comments_parent_id', 'comments', ['parent_id'])

    # ── ui_templates ──────────────────────────────────────────────────
    # Two authoring tracks: 'tree' (visual block-tree editor) and 'code'
    # (raw TSX compiled in-browser). Each template targets exactly one
    # device; group `ui_config` routes per surface to a matching template.
    op.create_table(
        'ui_templates',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.String(1000), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='draft'),
        sa.Column('template_type', sa.String(20), nullable=False, server_default='tree'),
        sa.Column('device', sa.String(20), nullable=False, server_default='desktop'),
        sa.Column(
            'feed_config',
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            'watch_config',
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column('feed_css', sa.Text(), nullable=False, server_default=''),
        sa.Column('watch_css', sa.Text(), nullable=False, server_default=''),
        sa.Column('code_text', sa.Text(), nullable=True),
        sa.Column('feed_tree', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('watch_tree', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )

    # ── recommendation_cache ──────────────────────────────────────────
    op.create_table(
        'recommendation_cache',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('experiment_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('video_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('score', sa.Float(), nullable=False),
        sa.Column('algorithm', sa.String(50), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['experiment_id'], ['experiments.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['video_id'], ['videos.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'experiment_id', 'user_id', 'video_id', 'algorithm',
            name='uq_rec_cache_exp_user_video_algo',
        ),
    )
    op.create_index(
        'ix_rec_cache_lookup',
        'recommendation_cache',
        ['experiment_id', 'user_id', 'algorithm', sa.text('score DESC')],
    )

    # ── item_similarity ───────────────────────────────────────────────
    op.create_table(
        'item_similarity',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('experiment_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('source_video_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('target_video_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('score', sa.Float(), nullable=False),
        sa.Column('algorithm', sa.String(50), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['experiment_id'], ['experiments.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['source_video_id'], ['videos.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['target_video_id'], ['videos.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'experiment_id', 'source_video_id', 'target_video_id', 'algorithm',
            name='uq_item_sim_exp_src_tgt_algo',
        ),
    )
    op.create_index(
        'ix_item_sim_lookup',
        'item_similarity',
        ['experiment_id', 'source_video_id', 'algorithm', sa.text('score DESC')],
    )

    # ── training_runs ─────────────────────────────────────────────────
    op.create_table(
        'training_runs',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('experiment_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('model_name', sa.String(50), nullable=False),
        sa.Column('top_k', sa.Integer(), nullable=False, server_default='100'),
        sa.Column(
            'hyperparameters',
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('metrics', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('interaction_count', sa.Integer(), nullable=True),
        sa.Column('user_count', sa.Integer(), nullable=True),
        sa.Column('item_count', sa.Integer(), nullable=True),
        sa.Column('recommendation_count', sa.Integer(), nullable=True),
        sa.Column('similarity_count', sa.Integer(), nullable=True),
        sa.Column('duration_seconds', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('triggered_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(['experiment_id'], ['experiments.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['triggered_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
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

    # ── recommender_registry ──────────────────────────────────────────
    # DB-backed lookup for Python plug-ins (kind='python_class') and
    # external HTTP recommenders (kind='external_http'). Mirrors
    # `BUILTIN_INSTANCES` in `app/recommenders/__init__.py`.
    op.create_table(
        'recommender_registry',
        sa.Column(
            'id',
            postgresql.UUID(as_uuid=True),
            nullable=False,
            server_default=sa.text('gen_random_uuid()'),
        ),
        sa.Column('key', sa.String(64), nullable=False),
        sa.Column('kind', sa.String(32), nullable=False, server_default='python_class'),
        sa.Column('label', sa.String(128), nullable=False),
        sa.Column('description', sa.Text(), nullable=False, server_default=''),
        sa.Column('category', sa.String(32), nullable=False, server_default='baseline'),
        sa.Column('supports_feed', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('supports_watch', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column(
            'config',
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('key'),
    )
    op.create_index('ix_recommender_registry_key', 'recommender_registry', ['key'], unique=True)

    # Seed the five built-in policies. Keep these in sync with the meta
    # declared on each Python class in `app/recommenders/<name>.py`.
    seed_rows = [
        ('random', 'Random', 'baseline', True, True,
         'Returns videos in random order. Use as a control / baseline policy '
         'for A/B experiments.'),
        ('popularity', 'Popularity', 'baseline', True, True,
         'Returns videos sorted by view count (most popular first). '
         'Non-personalized baseline that captures the popularity bias '
         'common in real platforms.'),
        ('recency', 'Recency', 'baseline', True, True,
         'Returns videos sorted by creation date (newest first). Captures '
         'the recency bias present in many platforms; useful as a temporal '
         'baseline.'),
        ('similarity', 'Similarity', 'baseline', False, True,
         "Content-based similarity using TF-IDF cosine on the video's "
         "title, description, and tags. Watch-only — requires a current "
         "video. Cold-start friendly (no behaviour data needed)."),
        ('recbole', 'RecBole', 'learned', True, True,
         'Learned policy backed by the RecBole framework (70+ algorithms '
         '— BPR, NeuMF, ItemKNN, …). Trains from the events table on a '
         'schedule and serves from a precomputed cache, with a popularity '
         '/ recency fallback for cold start.'),
    ]
    for key, label, category, sf, sw, description in seed_rows:
        op.execute(sa.text(
            """
            INSERT INTO recommender_registry
                (key, kind, label, description, category, supports_feed, supports_watch, config)
            VALUES
                (:key, 'python_class', :label, :description, :category, :sf, :sw, '{}'::jsonb)
            """
        ).bindparams(key=key, label=label, description=description, category=category, sf=sf, sw=sw))

    # ── surveys ───────────────────────────────────────────────────────
    # Three timing kinds: `pre` (forced gate before feed), `post` (after
    # experiment completes, dismissable), `inter_session` (asks about the
    # prior session, dismissable). At most one active per (experiment, kind).
    op.create_table(
        'surveys',
        sa.Column(
            'id',
            postgresql.UUID(as_uuid=True),
            nullable=False,
            server_default=sa.text('gen_random_uuid()'),
        ),
        sa.Column('experiment_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('kind', sa.String(20), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column(
            'questions',
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.ForeignKeyConstraint(['experiment_id'], ['experiments.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_surveys_experiment_id', 'surveys', ['experiment_id'])
    op.create_index(
        'uq_surveys_one_active_per_kind',
        'surveys',
        ['experiment_id', 'kind'],
        unique=True,
        postgresql_where=sa.text('is_active = true'),
    )

    # ── survey_responses ──────────────────────────────────────────────
    # `about_session_id` is set only for inter_session responses; pre/post
    # leave it NULL. Two partial unique indexes prevent duplicate
    # submissions in either case.
    op.create_table(
        'survey_responses',
        sa.Column(
            'id',
            postgresql.UUID(as_uuid=True),
            nullable=False,
            server_default=sa.text('gen_random_uuid()'),
        ),
        sa.Column('survey_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('about_session_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            'answers',
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['survey_id'], ['surveys.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['about_session_id'], ['sessions.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_responses_survey_user', 'survey_responses', ['survey_id', 'user_id'])
    op.create_index(
        'uq_responses_pre_post',
        'survey_responses',
        ['survey_id', 'user_id'],
        unique=True,
        postgresql_where=sa.text('about_session_id IS NULL'),
    )
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

    op.drop_index('ix_recommender_registry_key', table_name='recommender_registry')
    op.drop_table('recommender_registry')

    op.drop_index('ix_training_runs_experiment_status', table_name='training_runs')
    op.drop_index('ix_training_runs_experiment_created', table_name='training_runs')
    op.drop_table('training_runs')

    op.drop_index('ix_item_sim_lookup', table_name='item_similarity')
    op.drop_table('item_similarity')

    op.drop_index('ix_rec_cache_lookup', table_name='recommendation_cache')
    op.drop_table('recommendation_cache')

    op.drop_table('ui_templates')

    op.drop_index('idx_comments_parent_id', table_name='comments')
    op.drop_index('idx_comments_comment_id', table_name='comments')
    op.drop_index('idx_comments_video_id', table_name='comments')
    op.drop_table('comments')

    op.drop_index('idx_events_type_video', table_name='events')
    op.drop_index('idx_events_payload', table_name='events')
    op.drop_index('idx_events_server_timestamp', table_name='events')
    op.drop_index('idx_events_event_type', table_name='events')
    op.drop_index('idx_events_video_id', table_name='events')
    op.drop_index('idx_events_session_id', table_name='events')
    op.drop_table('events')

    op.drop_index('idx_sessions_user_id', table_name='sessions')
    op.drop_table('sessions')

    op.drop_index('idx_videos_experiment_id', table_name='videos')
    op.drop_index('idx_videos_video_id', table_name='videos')
    op.drop_table('videos')

    op.drop_index('idx_users_login_id', table_name='users')
    op.drop_table('users')

    op.drop_table('user_groups')

    op.drop_table('experiments')
