"""
Automatic training scheduler.

Periodically checks active experiments and triggers:
1. Auto I2I computation (metadata-based, no ML training needed)
2. Per-group CF model training via RecBole

Uses a "needs update" check (cache empty / expired / sufficient new
interactions) to avoid unnecessary retraining.
"""
import asyncio
import logging
import uuid
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import SessionLocal
from .item_similarity_computer import compute_auto_item_similarities
from .recbole_trainer import run_training_async, I2I_MODELS

logger = logging.getLogger(__name__)


class TrainingScheduler:
    def __init__(self):
        self._task: Optional[asyncio.Task] = None
        self._running = False
        settings = get_settings()
        self._interval_seconds = settings.RECBOLE_FIT_PERIOD_MINUTES * 60
        self._min_interactions = settings.RECBOLE_MIN_INTERACTIONS
        self._cache_expire_hours = settings.RECBOLE_CACHE_EXPIRE_HOURS

    async def start(self):
        if self._task is not None:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())
        logger.info("Training scheduler started (interval=%ds)", self._interval_seconds)

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("Training scheduler stopped")

    async def _loop(self):
        # Initial delay before first cycle
        await asyncio.sleep(60)

        while self._running:
            try:
                await asyncio.to_thread(self._run_cycle)
            except Exception:
                logger.exception("Training scheduler cycle failed")

            await asyncio.sleep(self._interval_seconds)

    def _run_cycle(self):
        db = SessionLocal()
        try:
            # Only process active experiments
            experiments = db.execute(
                text("SELECT id FROM experiments WHERE status = 'active'")
            ).fetchall()

            for (exp_id,) in experiments:
                self._process_experiment(db, exp_id)
        finally:
            db.close()

    def _process_experiment(self, db: Session, experiment_id: uuid.UUID):
        # Step 1: Auto I2I update (independent of CF, runs first)
        if self._needs_auto_i2i_update(db, experiment_id):
            logger.info("Auto I2I update needed for experiment %s", experiment_id)
            try:
                compute_auto_item_similarities(db, experiment_id)
            except Exception:
                logger.exception("Auto I2I failed for experiment %s", experiment_id)

        # Step 2: Per-group CF training
        groups = db.execute(
            text("""
                SELECT id, config FROM user_groups
                WHERE experiment_id = :eid
            """),
            {"eid": str(experiment_id)},
        ).fetchall()

        for group_id, group_config in groups:
            if not group_config:
                continue

            # Check recbole_feed config
            feed_config = group_config.get("recbole_feed") if isinstance(group_config, dict) else None
            if feed_config and isinstance(feed_config, dict) and "model" in feed_config:
                model_name = feed_config["model"]
                if self._needs_cf_update(db, experiment_id, model_name.lower()):
                    self._train_cf(db, experiment_id, feed_config)

            # Check recbole_watch config (I2I models use item_similarity table)
            watch_config = group_config.get("recbole_watch") if isinstance(group_config, dict) else None
            if watch_config and isinstance(watch_config, dict) and "model" in watch_config:
                model_name = watch_config["model"]
                if model_name in I2I_MODELS:
                    if self._needs_i2i_update(db, experiment_id, model_name.lower()):
                        self._train_cf(db, experiment_id, watch_config)
                else:
                    if self._needs_cf_update(db, experiment_id, model_name.lower()):
                        self._train_cf(db, experiment_id, watch_config)

    def _needs_auto_i2i_update(self, db: Session, experiment_id: uuid.UUID) -> bool:
        """Check if auto I2I cache is empty or expired."""
        row = db.execute(
            text("""
                SELECT COUNT(*), MAX(created_at)
                FROM item_similarity
                WHERE experiment_id = :eid AND algorithm = 'auto'
            """),
            {"eid": str(experiment_id)},
        ).fetchone()

        count, latest = row[0], row[1]
        if count == 0:
            return True

        if latest and (datetime.utcnow() - latest) > timedelta(hours=self._cache_expire_hours):
            return True

        return False

    def _needs_cf_update(self, db: Session, experiment_id: uuid.UUID, model_name: str) -> bool:
        """Check if CF cache needs refresh: empty, expired, or enough new interactions."""
        # Check cache state
        row = db.execute(
            text("""
                SELECT COUNT(*), MAX(created_at)
                FROM recommendation_cache
                WHERE experiment_id = :eid AND algorithm = :algo
            """),
            {"eid": str(experiment_id), "algo": model_name},
        ).fetchone()

        count, latest = row[0], row[1]
        if count == 0:
            # Check if there are enough interactions to train
            inter_count = db.execute(
                text("""
                    SELECT COUNT(*)
                    FROM events e
                    JOIN sessions s ON e.session_id = s.id
                    JOIN videos v ON e.video_id = v.id
                    WHERE v.experiment_id = :eid
                      AND e.event_type IN ('VIDEO_WATCHED_1S', 'LIKE', 'VIDEO_ENDED')
                      AND e.video_id IS NOT NULL
                """),
                {"eid": str(experiment_id)},
            ).scalar()
            return inter_count >= self._min_interactions

        # Check if expired
        if latest and (datetime.utcnow() - latest) > timedelta(hours=self._cache_expire_hours):
            return True

        # Check new interactions since last cache update
        new_count = db.execute(
            text("""
                SELECT COUNT(*)
                FROM events e
                JOIN sessions s ON e.session_id = s.id
                JOIN videos v ON e.video_id = v.id
                WHERE v.experiment_id = :eid
                  AND e.event_type IN ('VIDEO_WATCHED_1S', 'LIKE', 'VIDEO_ENDED')
                  AND e.video_id IS NOT NULL
                  AND e.server_timestamp > :since
            """),
            {"eid": str(experiment_id), "since": latest},
        ).scalar()

        return new_count >= self._min_interactions

    def _needs_i2i_update(self, db: Session, experiment_id: uuid.UUID, model_name: str) -> bool:
        """Check if I2I cache needs refresh: empty, expired, or enough new interactions."""
        row = db.execute(
            text("""
                SELECT COUNT(*), MAX(created_at)
                FROM item_similarity
                WHERE experiment_id = :eid AND algorithm = :algo
            """),
            {"eid": str(experiment_id), "algo": model_name},
        ).fetchone()

        count, latest = row[0], row[1]
        if count == 0:
            inter_count = db.execute(
                text("""
                    SELECT COUNT(*)
                    FROM events e
                    JOIN sessions s ON e.session_id = s.id
                    JOIN videos v ON e.video_id = v.id
                    WHERE v.experiment_id = :eid
                      AND e.event_type IN ('VIDEO_WATCHED_1S', 'LIKE', 'VIDEO_ENDED')
                      AND e.video_id IS NOT NULL
                """),
                {"eid": str(experiment_id)},
            ).scalar()
            return inter_count >= self._min_interactions

        if latest and (datetime.utcnow() - latest) > timedelta(hours=self._cache_expire_hours):
            return True

        new_count = db.execute(
            text("""
                SELECT COUNT(*)
                FROM events e
                JOIN sessions s ON e.session_id = s.id
                JOIN videos v ON e.video_id = v.id
                WHERE v.experiment_id = :eid
                  AND e.event_type IN ('VIDEO_WATCHED_1S', 'LIKE', 'VIDEO_ENDED')
                  AND e.video_id IS NOT NULL
                  AND e.server_timestamp > :since
            """),
            {"eid": str(experiment_id), "since": latest},
        ).scalar()

        return new_count >= self._min_interactions

    def _train_cf(self, db: Session, experiment_id: uuid.UUID, config: dict):
        """Create a TrainingRun and launch async training."""
        from ..models.training_run import TrainingRun

        model_name = config.get("model", "BPR")
        top_k = config.get("top_k", 100)
        hyperparameters = config.get("hyperparameters")

        # Check if there's already a pending/running training for this model
        existing = db.execute(
            text("""
                SELECT COUNT(*) FROM training_runs
                WHERE experiment_id = :eid
                  AND model_name = :model
                  AND status IN ('pending', 'running')
            """),
            {"eid": str(experiment_id), "model": model_name},
        ).scalar()

        if existing > 0:
            logger.info("Skipping %s training for experiment %s: already in progress", model_name, experiment_id)
            return

        run = TrainingRun(
            experiment_id=experiment_id,
            model_name=model_name,
            top_k=top_k,
            hyperparameters=hyperparameters or {},
            status="pending",
        )
        db.add(run)
        db.commit()
        db.refresh(run)

        logger.info("Scheduler triggered %s training for experiment %s (run=%s)", model_name, experiment_id, run.id)
        run_training_async(run.id)


def recover_stuck_runs(db: Session):
    """
    Recover training runs stuck in pending/running state after server restart.
    Marks them as failed with an explanatory message.
    """
    from ..models.training_run import TrainingRun

    stuck_runs = (
        db.query(TrainingRun)
        .filter(TrainingRun.status.in_(["pending", "running"]))
        .all()
    )

    if not stuck_runs:
        return

    for run in stuck_runs:
        run.status = "failed"
        run.error_message = "Server restarted during training"
        run.completed_at = datetime.utcnow()

    db.commit()
    logger.info("Recovered %d stuck training runs", len(stuck_runs))
