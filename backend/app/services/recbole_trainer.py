"""
RecBole training pipeline for Open Rec UI.

Extracts interaction data from PostgreSQL, trains a RecBole model,
and writes predictions back to recommendation_cache / item_similarity tables.

Usage:
  API: POST /api/v1/admin/experiments/{id}/training/runs
  CLI: python -m app.services.recbole_trainer --experiment-id <UUID> --model BPR --top-k 100
"""

import argparse
import logging
import os
import tempfile
import threading
import time
import traceback
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# I2I models that output item_similarity instead of recommendation_cache
I2I_MODELS = {"ItemKNN", "EASE"}


def extract_interactions(db: Session, experiment_id: uuid.UUID) -> List[Dict]:
    """
    Extract user-video interactions from events table.

    Maps event types to implicit feedback. We use VIDEO_WATCHED_1S
    rather than VIDEO_PLAY for the base interaction signal because
    VIDEO_PLAY fires on every (auto)play including page-load autoplay,
    which inflates training data with weak / noisy signal. The 1-second
    threshold filters that out — same definition as the watched-history
    exclusion in `feed.py`.

    - VIDEO_WATCHED_1S -> interaction (weight 1.0)
    - LIKE             -> interaction (weight 3.0)
    - VIDEO_ENDED with watch_ratio > 0.5 -> interaction (weight 2.0)
    """
    query = text("""
        SELECT
            u.id AS user_id,
            v.video_id AS item_id,
            e.event_type,
            e.watch_ratio,
            e.client_timestamp
        FROM events e
        JOIN sessions s ON e.session_id = s.id
        JOIN users u ON s.user_id = u.id
        JOIN videos v ON e.video_id = v.id
        JOIN user_groups ug ON u.user_group_id = ug.id
        WHERE ug.experiment_id = :experiment_id
          AND e.event_type IN ('VIDEO_WATCHED_1S', 'LIKE', 'VIDEO_ENDED')
          AND e.video_id IS NOT NULL
        ORDER BY e.client_timestamp
    """)

    rows = db.execute(query, {"experiment_id": str(experiment_id)}).fetchall()

    interactions = []
    for row in rows:
        user_id, item_id, event_type, watch_ratio, timestamp = row

        if event_type == "VIDEO_WATCHED_1S":
            weight = 1.0
        elif event_type == "LIKE":
            weight = 3.0
        elif event_type == "VIDEO_ENDED" and watch_ratio and watch_ratio > 0.5:
            weight = 2.0
        else:
            continue

        interactions.append({
            "user_id": str(user_id),
            "item_id": item_id,
            "rating": weight,
            "timestamp": int(timestamp.timestamp()) if timestamp else 0,
        })

    return interactions


def write_inter_file(interactions: List[Dict], output_dir: str) -> str:
    """Write interactions in RecBole .inter format."""
    inter_path = os.path.join(output_dir, "watchlens.inter")
    with open(inter_path, "w") as f:
        f.write("user_id:token\titem_id:token\trating:float\ttimestamp:float\n")
        for inter in interactions:
            f.write(f"{inter['user_id']}\t{inter['item_id']}\t{inter['rating']}\t{inter['timestamp']}\n")
    return inter_path


def build_id_mappings(db: Session, experiment_id: uuid.UUID) -> Tuple[Dict, Dict]:
    """Build mappings between external video_id and internal UUID."""
    query = text("""
        SELECT id, video_id FROM videos WHERE experiment_id = :experiment_id
    """)
    rows = db.execute(query, {"experiment_id": str(experiment_id)}).fetchall()

    video_id_to_uuid = {row[1]: row[0] for row in rows}  # external_id -> UUID
    uuid_to_video_id = {row[0]: row[1] for row in rows}  # UUID -> external_id

    return video_id_to_uuid, uuid_to_video_id


def train_and_predict(
    interactions: List[Dict],
    model_name: str = "BPR",
    top_k: int = 100,
    hyperparameters: Optional[Dict] = None,
) -> Tuple[Dict[str, List[Tuple[str, float]]], Dict[str, List[Tuple[str, float]]], Dict]:
    """
    Train RecBole model and generate predictions.

    Returns:
        user_recs: {user_id: [(item_id, score), ...]}
        item_sims: {source_item_id: [(target_item_id, score), ...]}
        metrics: {metric_name: value, ...}
    """
    from recbole.config import Config
    from recbole.data import create_dataset, data_preparation
    from recbole.utils import init_seed, init_logger
    from recbole.trainer import Trainer
    from recbole.utils import get_model

    import torch
    import numpy as np

    with tempfile.TemporaryDirectory() as tmpdir:
        # Write interaction data
        write_inter_file(interactions, tmpdir)

        # RecBole configuration
        config_dict = {
            "model": model_name,
            "dataset": "watchlens",
            "data_path": tmpdir,
            "USER_ID_FIELD": "user_id",
            "ITEM_ID_FIELD": "item_id",
            "RATING_FIELD": "rating",
            "TIME_FIELD": "timestamp",
            "load_col": {
                "inter": ["user_id", "item_id", "rating", "timestamp"],
            },
            "eval_args": {
                "split": {"RS": [0.8, 0.1, 0.1]},
                "order": "TO",
                "group_by": "user",
                "mode": "full",
            },
            "topk": [top_k],
            "metrics": ["Recall", "NDCG"],
            "training_neg_sample_num": 1,
            "epochs": 50,
            "train_batch_size": 2048,
            "eval_batch_size": 4096,
            "learning_rate": 0.001,
            "checkpoint_dir": os.path.join(tmpdir, "checkpoints"),
        }

        # Merge user-provided hyperparameters
        if hyperparameters:
            config_dict.update(hyperparameters)

        config = Config(model=model_name, config_dict=config_dict)
        init_seed(config["seed"], config["reproducibility"])

        # Create dataset and dataloaders
        dataset = create_dataset(config)
        train_data, valid_data, test_data = data_preparation(config, dataset)

        # Build and train model
        model_class = get_model(model_name)
        model = model_class(config, train_data.dataset).to(config["device"])
        trainer = Trainer(config, model)
        best_valid_score, best_valid_result = trainer.fit(train_data, valid_data)

        # Evaluate on test set
        test_result = trainer.evaluate(test_data)

        # Collect metrics
        metrics = {}
        if isinstance(test_result, dict):
            for key, value in test_result.items():
                metrics[key] = float(value) if hasattr(value, '__float__') else value
        if best_valid_result and isinstance(best_valid_result, dict):
            for key, value in best_valid_result.items():
                if key not in metrics:
                    metrics[f"valid_{key}"] = float(value) if hasattr(value, '__float__') else value

        # Generate predictions for all users
        user_recs = {}
        user_id_field = dataset.uid_field
        item_id_field = dataset.iid_field

        # Get all user/item tokens
        user_tokens = dataset.field2id_token[user_id_field]
        item_tokens = dataset.field2id_token[item_id_field]

        # Predict scores for all users
        model.set_phase("eval")
        with torch.no_grad():
            for uid_internal in range(1, dataset.user_num):  # 0 is padding
                user_token = user_tokens[uid_internal]
                if user_token == "[PAD]":
                    continue

                # Create interaction for this user with all items
                input_interaction = {
                    user_id_field: torch.full((dataset.item_num,), uid_internal, dtype=torch.long).to(config["device"]),
                    item_id_field: torch.arange(dataset.item_num).to(config["device"]),
                }

                scores = model.predict(input_interaction).cpu().numpy()

                # Get top-k items (skip padding index 0)
                scores[0] = -np.inf
                top_indices = np.argsort(scores)[::-1][:top_k]

                recs = []
                for idx in top_indices:
                    item_token = item_tokens[idx]
                    if item_token == "[PAD]":
                        continue
                    recs.append((item_token, float(scores[idx])))

                user_recs[user_token] = recs

        # I2I is now handled separately by train_i2i_model()
        item_sims = {}

    return user_recs, item_sims, metrics


def train_i2i_model(
    interactions: List[Dict],
    model_name: str = "ItemKNN",
    top_k: int = 50,
    hyperparameters: Optional[Dict] = None,
) -> Tuple[Dict[str, List[Tuple[str, float]]], Dict]:
    """
    Train an I2I model (ItemKNN or EASE) and extract item-item similarities.

    Returns:
        item_sims: {source_item_id: [(target_item_id, score), ...]}
        metrics: {metric_name: value, ...}
    """
    from recbole.config import Config
    from recbole.data import create_dataset, data_preparation
    from recbole.utils import init_seed
    from recbole.trainer import Trainer
    from recbole.utils import get_model

    import numpy as np

    with tempfile.TemporaryDirectory() as tmpdir:
        write_inter_file(interactions, tmpdir)

        config_dict = {
            "model": model_name,
            "dataset": "watchlens",
            "data_path": tmpdir,
            "USER_ID_FIELD": "user_id",
            "ITEM_ID_FIELD": "item_id",
            "RATING_FIELD": "rating",
            "TIME_FIELD": "timestamp",
            "load_col": {
                "inter": ["user_id", "item_id", "rating", "timestamp"],
            },
            "eval_args": {
                "split": {"RS": [0.8, 0.1, 0.1]},
                "order": "TO",
                "group_by": "user",
                "mode": "full",
            },
            "topk": [top_k],
            "metrics": ["Recall", "NDCG"],
            "training_neg_sample_num": 1,
            "epochs": 1,
            "checkpoint_dir": os.path.join(tmpdir, "checkpoints"),
        }

        if hyperparameters:
            config_dict.update(hyperparameters)

        config = Config(model=model_name, config_dict=config_dict)
        init_seed(config["seed"], config["reproducibility"])

        dataset = create_dataset(config)
        train_data, valid_data, test_data = data_preparation(config, dataset)

        model_class = get_model(model_name)
        model = model_class(config, train_data.dataset).to(config["device"])
        trainer = Trainer(config, model)
        trainer.fit(train_data, valid_data)  # TRADITIONAL models: computed in __init__

        test_result = trainer.evaluate(test_data)

        metrics = {}
        if isinstance(test_result, dict):
            for key, value in test_result.items():
                metrics[key] = float(value) if hasattr(value, '__float__') else value

        item_tokens = dataset.field2id_token[dataset.iid_field]
        item_sims = {}

        if model_name == "ItemKNN":
            w = model.w  # scipy CSC [n_items, n_items]
            for iid in range(1, dataset.item_num):
                token = item_tokens[iid]
                if token == "[PAD]":
                    continue
                col = w[:, iid].toarray().flatten()
                col[0] = 0
                col[iid] = 0  # skip pad & self
                top_idx = np.argsort(col)[::-1][:top_k]
                sims = [(item_tokens[i], float(col[i])) for i in top_idx if col[i] > 0 and item_tokens[i] != "[PAD]"]
                if sims:
                    item_sims[token] = sims

        elif model_name == "EASE":
            B = model.item_similarity  # numpy dense [n_items, n_items]
            for iid in range(1, dataset.item_num):
                token = item_tokens[iid]
                if token == "[PAD]":
                    continue
                row = B[iid].copy()
                row[0] = 0
                row[iid] = 0  # skip pad & self
                top_idx = np.argsort(row)[::-1][:top_k]
                sims = [(item_tokens[i], float(row[i])) for i in top_idx if row[i] > 0 and item_tokens[i] != "[PAD]"]
                if sims:
                    item_sims[token] = sims

    return item_sims, metrics


def upsert_similarities(
    db: Session,
    experiment_id: uuid.UUID,
    algorithm: str,
    item_sims: Dict[str, List[Tuple[str, float]]],
    video_id_to_uuid: Dict[str, uuid.UUID],
) -> int:
    """Replace item similarities for a given experiment + algorithm."""
    exp_id = str(experiment_id)

    db.execute(
        text("DELETE FROM item_similarity WHERE experiment_id = :exp_id AND algorithm = :algo"),
        {"exp_id": exp_id, "algo": algorithm},
    )

    sim_count = 0
    for source_id, sims in item_sims.items():
        source_uuid = video_id_to_uuid.get(source_id)
        if not source_uuid:
            continue

        for target_id, score in sims:
            target_uuid = video_id_to_uuid.get(target_id)
            if not target_uuid:
                continue

            db.execute(
                text("""
                    INSERT INTO item_similarity (id, experiment_id, source_video_id, target_video_id, score, algorithm, created_at)
                    VALUES (:id, :exp_id, :source_id, :target_id, :score, :algo, :created_at)
                """),
                {
                    "id": str(uuid.uuid4()),
                    "exp_id": exp_id,
                    "source_id": str(source_uuid),
                    "target_id": str(target_uuid),
                    "score": score,
                    "algo": algorithm,
                    "created_at": datetime.utcnow(),
                },
            )
            sim_count += 1

    db.commit()
    logger.info(f"Upserted {sim_count} item similarities for algorithm={algorithm}")
    return sim_count


def upsert_recommendations(
    db: Session,
    experiment_id: uuid.UUID,
    algorithm: str,
    user_recs: Dict[str, List[Tuple[str, float]]],
    item_sims: Dict[str, List[Tuple[str, float]]],
    video_id_to_uuid: Dict[str, uuid.UUID],
    user_id_map: Dict[str, uuid.UUID],
):
    """
    Replace cached recommendations with fresh predictions.

    Uses DELETE + INSERT pattern for atomic updates.
    """
    exp_id = str(experiment_id)

    # Clear old recommendations for this experiment + algorithm
    db.execute(
        text("DELETE FROM recommendation_cache WHERE experiment_id = :exp_id AND algorithm = :algo"),
        {"exp_id": exp_id, "algo": algorithm},
    )
    # Insert personalized recommendations
    rec_count = 0
    for user_id_str, recs in user_recs.items():
        user_uuid = user_id_map.get(user_id_str)
        if not user_uuid:
            continue

        for item_id, score in recs:
            video_uuid = video_id_to_uuid.get(item_id)
            if not video_uuid:
                continue

            db.execute(
                text("""
                    INSERT INTO recommendation_cache (id, experiment_id, user_id, video_id, score, algorithm, created_at)
                    VALUES (:id, :exp_id, :user_id, :video_id, :score, :algo, :created_at)
                """),
                {
                    "id": str(uuid.uuid4()),
                    "exp_id": exp_id,
                    "user_id": str(user_uuid),
                    "video_id": str(video_uuid),
                    "score": score,
                    "algo": algorithm,
                    "created_at": datetime.utcnow(),
                },
            )
            rec_count += 1

    # Insert item similarities (only if model produced I2I data)
    sim_count = 0
    if item_sims:
        db.execute(
            text("DELETE FROM item_similarity WHERE experiment_id = :exp_id AND algorithm = :algo"),
            {"exp_id": exp_id, "algo": algorithm},
        )
    for source_id, sims in item_sims.items():
        source_uuid = video_id_to_uuid.get(source_id)
        if not source_uuid:
            continue

        for target_id, score in sims:
            target_uuid = video_id_to_uuid.get(target_id)
            if not target_uuid:
                continue

            db.execute(
                text("""
                    INSERT INTO item_similarity (id, experiment_id, source_video_id, target_video_id, score, algorithm, created_at)
                    VALUES (:id, :exp_id, :source_id, :target_id, :score, :algo, :created_at)
                """),
                {
                    "id": str(uuid.uuid4()),
                    "exp_id": exp_id,
                    "source_id": str(source_uuid),
                    "target_id": str(target_uuid),
                    "score": score,
                    "algo": algorithm,
                    "created_at": datetime.utcnow(),
                },
            )
            sim_count += 1

    db.commit()
    logger.info(f"Upserted {rec_count} recommendations and {sim_count} item similarities")
    return rec_count, sim_count


def run_training(
    db: Session,
    experiment_id: uuid.UUID,
    model_name: str = "BPR",
    top_k: int = 100,
    hyperparameters: Optional[Dict] = None,
) -> Dict:
    """
    Full training pipeline: extract -> train -> predict -> upsert.

    Returns summary dict with counts and metrics.
    """
    logger.info(f"Starting RecBole training: experiment={experiment_id}, model={model_name}, top_k={top_k}")

    # 1. Extract interactions
    interactions = extract_interactions(db, experiment_id)
    if not interactions:
        logger.warning("No interactions found for this experiment")
        return {"status": "no_data", "interactions": 0}

    logger.info(f"Extracted {len(interactions)} interactions")

    # 2. Build ID mappings
    video_id_to_uuid, uuid_to_video_id = build_id_mappings(db, experiment_id)

    if model_name in I2I_MODELS:
        # I2I model: train and write to item_similarity
        item_sims, metrics = train_i2i_model(interactions, model_name, top_k, hyperparameters)
        sim_count = upsert_similarities(db, experiment_id, model_name.lower(), item_sims, video_id_to_uuid)
        logger.info(f"Generated similarities for {len(item_sims)} items")
        return {
            "status": "success",
            "model": model_name,
            "interactions": len(interactions),
            "users_with_recs": 0,
            "items_with_sims": len(item_sims),
            "total_recommendations": 0,
            "total_similarities": sim_count,
            "metrics": metrics,
        }
    else:
        # U2I model: train and write to recommendation_cache
        user_ids = set(i["user_id"] for i in interactions)
        user_id_map = {uid: uuid.UUID(uid) for uid in user_ids}

        user_recs, item_sims, metrics = train_and_predict(
            interactions, model_name, top_k, hyperparameters
        )
        logger.info(f"Generated recommendations for {len(user_recs)} users")

        rec_count, sim_count = upsert_recommendations(
            db, experiment_id, model_name.lower(),
            user_recs, item_sims, video_id_to_uuid, user_id_map,
        )

        return {
            "status": "success",
            "model": model_name,
            "interactions": len(interactions),
            "users_with_recs": len(user_recs),
            "items_with_sims": len(item_sims),
            "total_recommendations": rec_count,
            "total_similarities": sim_count,
            "metrics": metrics,
        }


def run_training_async(run_id: uuid.UUID):
    """Launch training in a background thread."""
    thread = threading.Thread(target=_training_worker, args=(run_id,), daemon=True)
    thread.start()


def _training_worker(run_id: uuid.UUID):
    """Background worker that runs training and updates DB status."""
    from ..database import SessionLocal

    db = SessionLocal()
    try:
        run = db.query(_get_training_run_model()).filter_by(id=run_id).first()
        if not run:
            logger.error(f"Training run {run_id} not found")
            return

        # Mark as running
        run.status = "running"
        run.started_at = datetime.utcnow()
        db.commit()

        start_time = time.time()

        # Extract interactions
        interactions = extract_interactions(db, run.experiment_id)
        if not interactions:
            run.status = "failed"
            run.error_message = "No interactions found for this experiment"
            run.completed_at = datetime.utcnow()
            run.duration_seconds = time.time() - start_time
            db.commit()
            return

        # Update counts
        user_ids = set(i["user_id"] for i in interactions)
        item_ids = set(i["item_id"] for i in interactions)
        run.interaction_count = len(interactions)
        run.user_count = len(user_ids)
        run.item_count = len(item_ids)
        db.commit()

        # Build ID mappings
        video_id_to_uuid, uuid_to_video_id = build_id_mappings(db, run.experiment_id)
        hyperparameters = run.hyperparameters if run.hyperparameters else None

        if run.model_name in I2I_MODELS:
            # I2I model: train and write to item_similarity
            item_sims, metrics = train_i2i_model(
                interactions, run.model_name, run.top_k, hyperparameters
            )
            sim_count = upsert_similarities(
                db, run.experiment_id, run.model_name.lower(), item_sims, video_id_to_uuid
            )
            rec_count = 0
        else:
            # U2I model: train and write to recommendation_cache
            user_id_map = {uid: uuid.UUID(uid) for uid in user_ids}
            user_recs, item_sims, metrics = train_and_predict(
                interactions, run.model_name, run.top_k, hyperparameters
            )
            rec_count, sim_count = upsert_recommendations(
                db, run.experiment_id, run.model_name.lower(),
                user_recs, item_sims, video_id_to_uuid, user_id_map,
            )

        # Mark as completed
        run.status = "completed"
        run.completed_at = datetime.utcnow()
        run.duration_seconds = time.time() - start_time
        run.metrics = metrics
        run.recommendation_count = rec_count
        run.similarity_count = sim_count
        db.commit()

        logger.info(
            f"Training run {run_id} completed: {rec_count} recs, {sim_count} sims, "
            f"duration={run.duration_seconds:.1f}s"
        )

    except Exception as e:
        logger.exception(f"Training run {run_id} failed")
        try:
            run = db.query(_get_training_run_model()).filter_by(id=run_id).first()
            if run:
                run.status = "failed"
                run.error_message = f"{type(e).__name__}: {str(e)}\n{traceback.format_exc()}"
                run.completed_at = datetime.utcnow()
                db.commit()
        except Exception:
            logger.exception("Failed to update run status after error")
    finally:
        db.close()


def _get_training_run_model():
    """Lazy import to avoid circular imports."""
    from ..models.training_run import TrainingRun
    return TrainingRun


# CLI entry point
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    parser = argparse.ArgumentParser(description="Train RecBole model for an experiment")
    parser.add_argument("--experiment-id", required=True, help="Experiment UUID")
    parser.add_argument("--model", default="BPR", help="RecBole model name (default: BPR)")
    parser.add_argument("--top-k", type=int, default=100, help="Number of recommendations per user (default: 100)")
    args = parser.parse_args()

    from app.database import SessionLocal

    db = SessionLocal()
    try:
        result = run_training(db, uuid.UUID(args.experiment_id), args.model, args.top_k)
        print(f"Training result: {result}")
    finally:
        db.close()
