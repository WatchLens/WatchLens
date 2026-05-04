import logging
from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session
from sqlalchemy import func, text

from ..deps import get_db, get_current_admin
from ....models.user import User
from ....models.experiment import Experiment
from ....models.video import Video
from ....models.training_run import TrainingRun
from ....models.recommendation_cache import RecommendationCache, ItemSimilarity
from ....schemas.training_run import (
    TrainingRunCreate,
    TrainingRunResponse,
    TrainingRunListResponse,
    RecBoleStatusResponse,
    RecBoleCoverageResponse,
    RecBoleModelInfo,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["admin-training"])

# Feed models: User-to-Item (U2I) collaborative filtering
FEED_MODELS: List[RecBoleModelInfo] = [
    RecBoleModelInfo(
        name="BPR",
        category="General",
        purpose="feed",
        description="Bayesian Personalized Ranking - classic pairwise learning-to-rank",
        default_hyperparameters={"epochs": 50, "learning_rate": 0.001, "train_batch_size": 2048, "embedding_size": 64},
    ),
    RecBoleModelInfo(
        name="NeuMF",
        category="General",
        purpose="feed",
        description="Neural Matrix Factorization - combines MF with MLP",
        default_hyperparameters={"epochs": 50, "learning_rate": 0.001, "train_batch_size": 256, "embedding_size": 64},
    ),
    RecBoleModelInfo(
        name="LightGCN",
        category="General",
        purpose="feed",
        description="Light Graph Convolution Network - simplified GCN for CF",
        default_hyperparameters={"epochs": 50, "learning_rate": 0.001, "train_batch_size": 2048, "embedding_size": 64},
    ),
    RecBoleModelInfo(
        name="SASRec",
        category="Sequential",
        purpose="feed",
        description="Self-Attentive Sequential Recommendation - transformer-based",
        default_hyperparameters={"epochs": 50, "learning_rate": 0.001, "train_batch_size": 256, "embedding_size": 64},
    ),
    RecBoleModelInfo(
        name="GRU4Rec",
        category="Sequential",
        purpose="feed",
        description="GRU-based session recommendation",
        default_hyperparameters={"epochs": 50, "learning_rate": 0.001, "train_batch_size": 256, "embedding_size": 64},
    ),
]

# Watch models: Item-to-Item (I2I) similarity
WATCH_MODELS: List[RecBoleModelInfo] = [
    RecBoleModelInfo(
        name="ItemKNN",
        category="I2I",
        purpose="watch",
        description="Item K-Nearest Neighbors - cosine similarity on interaction matrix",
        default_hyperparameters={"k": 100, "shrink": 0},
    ),
    RecBoleModelInfo(
        name="EASE",
        category="I2I",
        purpose="watch",
        description="Embarrassingly Shallow Autoencoders - closed-form linear I2I",
        default_hyperparameters={"reg_weight": 250.0},
    ),
]

RECBOLE_MODELS: List[RecBoleModelInfo] = FEED_MODELS + WATCH_MODELS


@router.get("/recbole/status", response_model=RecBoleStatusResponse)
def get_recbole_status(
    admin: User = Depends(get_current_admin),
):
    """Get RecBole installation status, version, and device info."""
    from ....config import get_settings
    settings = get_settings()

    try:
        import recbole
        import torch

        return RecBoleStatusResponse(
            installed=True,
            version=recbole.__version__,
            torch_version=torch.__version__,
            cuda_available=torch.cuda.is_available(),
            device="cuda" if torch.cuda.is_available() else "cpu",
            fit_period_minutes=settings.RECBOLE_FIT_PERIOD_MINUTES,
        )
    except ImportError:
        return RecBoleStatusResponse(
            installed=False,
            fit_period_minutes=settings.RECBOLE_FIT_PERIOD_MINUTES,
        )


@router.get("/recbole/models", response_model=List[RecBoleModelInfo])
def get_recbole_models(
    purpose: Optional[str] = Query(None, description="Filter by purpose: feed or watch"),
    admin: User = Depends(get_current_admin),
):
    """Get curated list of available RecBole models with default hyperparameters."""
    if purpose == "feed":
        return FEED_MODELS
    elif purpose == "watch":
        return WATCH_MODELS
    return RECBOLE_MODELS


@router.post(
    "/experiments/{experiment_id}/training/runs",
    response_model=TrainingRunResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def start_training_run(
    experiment_id: UUID,
    data: TrainingRunCreate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Start an asynchronous training run for the experiment."""
    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Experiment not found",
        )

    # Check for concurrent runs
    active_run = (
        db.query(TrainingRun)
        .filter(
            TrainingRun.experiment_id == experiment_id,
            TrainingRun.status.in_(["pending", "running"]),
        )
        .first()
    )
    if active_run:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Training already in progress (run {active_run.id}, status: {active_run.status})",
        )

    # Create training run record
    run = TrainingRun(
        experiment_id=experiment_id,
        model_name=data.model_name,
        top_k=data.top_k,
        hyperparameters=data.hyperparameters.model_dump(exclude_none=True),
        status="pending",
        triggered_by=admin.id,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    # Launch async training
    from ....services.recbole_trainer import run_training_async
    run_training_async(run.id)

    return run


@router.get(
    "/experiments/{experiment_id}/training/runs",
    response_model=TrainingRunListResponse,
)
def list_training_runs(
    experiment_id: UUID,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """List training run history for an experiment."""
    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Experiment not found",
        )

    runs = (
        db.query(TrainingRun)
        .filter(TrainingRun.experiment_id == experiment_id)
        .order_by(TrainingRun.created_at.desc())
        .all()
    )

    return TrainingRunListResponse(
        runs=[TrainingRunResponse.model_validate(r) for r in runs],
        total=len(runs),
    )


@router.get(
    "/experiments/{experiment_id}/training/runs/{run_id}",
    response_model=TrainingRunResponse,
)
def get_training_run(
    experiment_id: UUID,
    run_id: UUID,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Get details of a specific training run."""
    run = (
        db.query(TrainingRun)
        .filter(
            TrainingRun.id == run_id,
            TrainingRun.experiment_id == experiment_id,
        )
        .first()
    )
    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Training run not found",
        )
    return run


@router.get(
    "/experiments/{experiment_id}/training/coverage",
    response_model=RecBoleCoverageResponse,
)
def get_training_coverage(
    experiment_id: UUID,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Get recommendation coverage statistics for the experiment."""
    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Experiment not found",
        )

    # Count users with recommendations
    users_with_recs = (
        db.query(func.count(func.distinct(RecommendationCache.user_id)))
        .filter(RecommendationCache.experiment_id == experiment_id)
        .scalar()
    ) or 0

    # Total users in experiment
    total_users = db.execute(
        text("""
            SELECT COUNT(*) FROM users u
            JOIN user_groups ug ON u.user_group_id = ug.id
            WHERE ug.experiment_id = :exp_id
        """),
        {"exp_id": str(experiment_id)},
    ).scalar() or 0

    # Items with similarities
    items_with_sims = (
        db.query(func.count(func.distinct(ItemSimilarity.source_video_id)))
        .filter(ItemSimilarity.experiment_id == experiment_id)
        .scalar()
    ) or 0

    # Total items in experiment
    total_items = (
        db.query(func.count(Video.id))
        .filter(Video.experiment_id == experiment_id)
        .scalar()
    ) or 0

    # Cache counts
    cached_recs = (
        db.query(func.count(RecommendationCache.id))
        .filter(RecommendationCache.experiment_id == experiment_id)
        .scalar()
    ) or 0

    cached_sims = (
        db.query(func.count(ItemSimilarity.id))
        .filter(ItemSimilarity.experiment_id == experiment_id)
        .scalar()
    ) or 0

    # Last completed training
    last_run = (
        db.query(TrainingRun)
        .filter(
            TrainingRun.experiment_id == experiment_id,
            TrainingRun.status == "completed",
        )
        .order_by(TrainingRun.completed_at.desc())
        .first()
    )

    user_coverage = (users_with_recs / total_users * 100) if total_users > 0 else 0.0
    item_coverage = (items_with_sims / total_items * 100) if total_items > 0 else 0.0

    return RecBoleCoverageResponse(
        users_with_recs=users_with_recs,
        total_users=total_users,
        user_coverage_percent=round(user_coverage, 1),
        items_with_sims=items_with_sims,
        total_items=total_items,
        item_coverage_percent=round(item_coverage, 1),
        cached_recommendations=cached_recs,
        cached_similarities=cached_sims,
        last_training_at=last_run.completed_at if last_run else None,
    )


@router.post("/experiments/{experiment_id}/training/import-rec-graph")
async def import_rec_graph(
    experiment_id: UUID,
    file: UploadFile = File(...),
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Import recommendation graph CSV as I2I data (algorithm='auto').
    CSV format: source_video_id,recommended_video_id,position
    video_id is Video.video_id (external ID like YouTube 11-char ID).
    """
    import csv
    from io import StringIO

    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")

    if experiment.status == "completed":
        raise HTTPException(status_code=400, detail="Cannot modify completed experiment")

    MAX_CSV_SIZE = 50 * 1024 * 1024  # 50 MB
    if file.size and file.size > MAX_CSV_SIZE:
        raise HTTPException(status_code=413, detail="CSV too large (max 50MB)")
    content = await file.read()
    if len(content) > MAX_CSV_SIZE:
        raise HTTPException(status_code=413, detail="CSV too large (max 50MB)")
    try:
        text_content = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text_content = content.decode("latin-1")

    reader = csv.DictReader(StringIO(text_content))

    # Build video_id -> UUID mapping
    videos = db.query(Video).filter(Video.experiment_id == experiment_id).all()
    vid_map = {v.video_id: str(v.id) for v in videos}

    insert_rows = []
    skipped = 0
    errors = []
    for i, row in enumerate(reader, start=2):
        src = row.get("source_video_id", "").strip()
        tgt = row.get("recommended_video_id", "").strip()
        pos_str = row.get("position", "").strip()

        if not src or not tgt:
            errors.append(f"Row {i}: missing source/target video_id")
            continue

        if src not in vid_map:
            skipped += 1
            continue
        if tgt not in vid_map:
            skipped += 1
            continue

        try:
            position = int(pos_str)
        except (ValueError, TypeError):
            position = 0

        score = 1.0 / (position + 1)
        insert_rows.append({
            "eid": str(experiment_id),
            "src": vid_map[src],
            "tgt": vid_map[tgt],
            "score": score,
            "algo": "auto",
        })

    # DELETE existing auto + bulk INSERT
    db.execute(
        text("DELETE FROM item_similarity WHERE experiment_id = :eid AND algorithm = 'auto'"),
        {"eid": str(experiment_id)},
    )

    if insert_rows:
        CHUNK = 1000
        for start in range(0, len(insert_rows), CHUNK):
            chunk = insert_rows[start:start + CHUNK]
            values_parts = []
            params = {}
            for idx, r in enumerate(chunk):
                key = f"_{start + idx}"
                values_parts.append(
                    f"(gen_random_uuid(), :eid{key}, :src{key}, :tgt{key}, :score{key}, :algo{key}, NOW())"
                )
                params[f"eid{key}"] = r["eid"]
                params[f"src{key}"] = r["src"]
                params[f"tgt{key}"] = r["tgt"]
                params[f"score{key}"] = r["score"]
                params[f"algo{key}"] = r["algo"]

            sql = (
                "INSERT INTO item_similarity "
                "(id, experiment_id, source_video_id, target_video_id, score, algorithm, created_at) "
                "VALUES " + ", ".join(values_parts)
            )
            db.execute(text(sql), params)

    db.commit()

    logger.info(
        "Rec graph import: %d pairs imported, %d skipped for experiment %s",
        len(insert_rows), skipped, experiment_id,
    )

    return {
        "imported": len(insert_rows),
        "skipped": skipped,
        "errors": errors[:10],
        "total_errors": len(errors),
    }


@router.get("/experiments/{experiment_id}/training/fallback-stats")
def get_fallback_statistics(
    experiment_id: UUID,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Get real-time fallback stage usage statistics."""
    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Experiment not found",
        )

    from ....services.fallback_stats import get_fallback_stats
    return get_fallback_stats().get_stats(experiment_id)


@router.delete(
    "/experiments/{experiment_id}/training/cache",
    status_code=status.HTTP_204_NO_CONTENT,
)
def clear_training_cache(
    experiment_id: UUID,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Clear recommendation cache for the experiment."""
    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Experiment not found",
        )

    db.query(RecommendationCache).filter(
        RecommendationCache.experiment_id == experiment_id
    ).delete()
    db.query(ItemSimilarity).filter(
        ItemSimilarity.experiment_id == experiment_id
    ).delete()
    db.commit()
