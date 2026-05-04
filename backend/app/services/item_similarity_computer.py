"""
Metadata-based Item-to-Item similarity calculator.

Re-implements Gorse's autoItemToItem logic:
  - Tags IDF: each item's tags array as a document
  - Users IDF: each item's interacting users as a document
  - Final distance = (tags_dist + users_dist) / 2
  - Final score = 1 / (1 + distance)

Reference: gorse/logics/item_to_item.go:285-376, gorse/dataset/dataset.go:155-199
"""
import logging
import threading
from collections import defaultdict
from math import log, sqrt
from typing import Dict, List, Set, Tuple
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# Per-experiment locks to prevent concurrent auto I2I computation
_experiment_locks: Dict[UUID, threading.Lock] = {}
_locks_lock = threading.Lock()


def _get_experiment_lock(experiment_id: UUID) -> threading.Lock:
    with _locks_lock:
        if experiment_id not in _experiment_locks:
            _experiment_locks[experiment_id] = threading.Lock()
        return _experiment_locks[experiment_id]


def compute_idf(total_count: int, term_freq: Dict[str, int]) -> Dict[str, float]:
    """Compute IDF weights for each term. Matches Gorse dataset.go:183-199."""
    idf = {}
    for term, freq in term_freq.items():
        idf[term] = max(log(total_count / freq), 1e-3)
    return idf


def idf_distance(
    a_terms: List[str],
    b_terms: List[str],
    idf: Dict[str, float],
    shrinkage: int = 100,
) -> float:
    """
    IDF-weighted distance between two term sets.
    Matches Gorse logics/item_to_item.go:337-377.
    """
    a_set = set(a_terms)
    b_set = set(b_terms)
    common = a_set & b_set
    common_count = len(common)

    if common_count == len(a_set) == len(b_set):
        return 0.0  # identical

    if common_count == 0 or len(a_set) == 0 or len(b_set) == 0:
        return 1.0  # no overlap

    common_idf_sum = sum(idf.get(t, 1e-3) for t in common)
    a_idf_sum = sum(idf.get(t, 1e-3) for t in a_set)
    b_idf_sum = sum(idf.get(t, 1e-3) for t in b_set)

    denom = sqrt(a_idf_sum) * sqrt(b_idf_sum) * (common_count + shrinkage)
    if denom == 0:
        return 1.0

    distance = 1 - (common_idf_sum * common_count) / denom
    return distance


def compute_auto_item_similarities(
    db: Session,
    experiment_id: UUID,
    top_k: int = 50,
) -> int:
    """
    Compute metadata-based I2I similarities for an experiment.
    Stores results in item_similarity with algorithm='auto'.

    Returns number of similarity pairs written.
    """
    lock = _get_experiment_lock(experiment_id)
    if not lock.acquire(blocking=False):
        logger.info("Auto I2I already running for experiment %s, skipping", experiment_id)
        return 0

    try:
        return _compute_auto_i2i_inner(db, experiment_id, top_k)
    finally:
        lock.release()


def _compute_auto_i2i_inner(
    db: Session,
    experiment_id: UUID,
    top_k: int,
) -> int:
    exp_str = str(experiment_id)

    # 1. Load videos with tags
    rows = db.execute(
        text("SELECT id, tags FROM videos WHERE experiment_id = :eid"),
        {"eid": exp_str},
    ).fetchall()

    if not rows:
        logger.info("No videos for experiment %s", experiment_id)
        return 0

    video_tags: Dict[str, List[str]] = {}
    for row in rows:
        vid = str(row[0])
        tags = row[1] if row[1] else []
        video_tags[vid] = [str(t) for t in tags]

    video_ids = list(video_tags.keys())
    total_items = len(video_ids)
    logger.info("Computing auto I2I for %d videos in experiment %s", total_items, experiment_id)

    # 2. Tags IDF
    tag_freq: Dict[str, int] = defaultdict(int)
    for tags in video_tags.values():
        for tag in set(tags):  # unique tags per item
            tag_freq[tag] += 1
    tag_idf = compute_idf(total_items, tag_freq)

    # 3. Load video-user interactions from events
    user_rows = db.execute(
        text("""
            SELECT e.video_id, s.user_id
            FROM events e
            JOIN sessions s ON e.session_id = s.id
            JOIN videos v ON e.video_id = v.id
            WHERE v.experiment_id = :eid
              AND e.video_id IS NOT NULL
            GROUP BY e.video_id, s.user_id
        """),
        {"eid": exp_str},
    ).fetchall()

    video_users: Dict[str, Set[str]] = defaultdict(set)
    for row in user_rows:
        video_users[str(row[0])].add(str(row[1]))

    has_user_data = len(video_users) > 0

    # 4. Users IDF (if user data exists)
    user_idf: Dict[str, float] = {}
    if has_user_data:
        user_freq: Dict[str, int] = defaultdict(int)
        for users in video_users.values():
            for uid in users:
                user_freq[uid] += 1
        user_idf = compute_idf(total_items, user_freq)

    # 5. Compute pairwise distances, keep top_k per item
    similarities: Dict[str, List[Tuple[str, float]]] = defaultdict(list)

    for i in range(total_items):
        vid_a = video_ids[i]
        a_tags = video_tags[vid_a]
        a_users = list(video_users.get(vid_a, []))

        for j in range(i + 1, total_items):
            vid_b = video_ids[j]
            b_tags = video_tags[vid_b]
            b_users = list(video_users.get(vid_b, []))

            tags_dist = idf_distance(a_tags, b_tags, tag_idf)

            if has_user_data and a_users and b_users:
                users_dist = idf_distance(a_users, b_users, user_idf)
                dist = (tags_dist + users_dist) / 2
            else:
                # Day 0: tags only
                dist = tags_dist

            score = 1.0 / (1.0 + dist)

            if score > 0.01:  # skip near-zero similarities
                similarities[vid_a].append((vid_b, score))
                similarities[vid_b].append((vid_a, score))

    # 6. Keep top_k per item
    total_pairs = 0
    insert_rows: List[Dict] = []
    for vid, neighbors in similarities.items():
        neighbors.sort(key=lambda x: x[1], reverse=True)
        for target_vid, score in neighbors[:top_k]:
            insert_rows.append({
                "eid": exp_str,
                "src": vid,
                "tgt": target_vid,
                "score": score,
                "algo": "auto",
            })
            total_pairs += 1

    # 7. Transaction: DELETE old auto + bulk INSERT
    db.execute(
        text("DELETE FROM item_similarity WHERE experiment_id = :eid AND algorithm = 'auto'"),
        {"eid": exp_str},
    )

    if insert_rows:
        # Batch insert in chunks
        CHUNK = 1000
        for start in range(0, len(insert_rows), CHUNK):
            chunk = insert_rows[start:start + CHUNK]
            values_parts = []
            params = {}
            for idx, row in enumerate(chunk):
                key = f"_{start + idx}"
                values_parts.append(
                    f"(gen_random_uuid(), :eid{key}, :src{key}, :tgt{key}, :score{key}, :algo{key}, NOW())"
                )
                params[f"eid{key}"] = row["eid"]
                params[f"src{key}"] = row["src"]
                params[f"tgt{key}"] = row["tgt"]
                params[f"score{key}"] = row["score"]
                params[f"algo{key}"] = row["algo"]

            sql = (
                "INSERT INTO item_similarity "
                "(id, experiment_id, source_video_id, target_video_id, score, algorithm, created_at) "
                "VALUES " + ", ".join(values_parts)
            )
            db.execute(text(sql), params)

    db.commit()
    logger.info("Auto I2I: wrote %d pairs for experiment %s", total_pairs, experiment_id)
    return total_pairs
