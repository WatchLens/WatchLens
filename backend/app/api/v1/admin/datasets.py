"""
Dataset auto-discovery and import API.

Scans the /app/data/ directory for datasets containing *_videos.csv files.
Provides one-click import of videos + comments into an experiment.
"""

import csv
import io
import logging
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..deps import get_db, get_current_admin
from ....models.user import User
from ....models.video import Video
from ....models.comment import Comment
from ....models.experiment import Experiment

logger = logging.getLogger(__name__)

router = APIRouter(tags=["datasets"])

DATA_DIR = Path("/app/data")


def _detect_video_type(url: str) -> str:
    """Detect video type from URL."""
    if "youtube.com" in url or "youtu.be" in url:
        return "youtube"
    return "url"


def _scan_datasets():
    """Scan data directory for available datasets."""
    datasets = []
    if not DATA_DIR.exists():
        return datasets

    for subdir in sorted(DATA_DIR.iterdir()):
        if not subdir.is_dir():
            continue

        # Find *_videos.csv
        video_csvs = list(subdir.glob("*_videos.csv"))
        comment_csvs = list(subdir.glob("*_comments.csv"))

        # Count video/thumbnail files
        video_files = list(subdir.glob("videos/*.mp4")) + list(subdir.glob("videos/*.webm"))
        thumb_files = list(subdir.glob("thumbnails/*.jpg")) + list(subdir.glob("thumbnails/*.png")) + list(subdir.glob("thumbnails/*.webp"))

        if video_csvs or video_files:
            # Count rows in video CSV
            video_count = 0
            if video_csvs:
                try:
                    with open(video_csvs[0], "r", encoding="utf-8-sig") as f:
                        text = f.read().lstrip('\ufeff')
                        video_count = text.count('\n') - 1  # subtract header
                except Exception:
                    pass

            comment_count = 0
            if comment_csvs:
                try:
                    with open(comment_csvs[0], "r", encoding="utf-8-sig") as f:
                        text = f.read().lstrip('\ufeff')
                        comment_count = text.count('\n') - 1
                except Exception:
                    pass

            datasets.append({
                "name": subdir.name,
                "video_csv": str(video_csvs[0].relative_to(DATA_DIR)) if video_csvs else None,
                "comment_csv": str(comment_csvs[0].relative_to(DATA_DIR)) if comment_csvs else None,
                "video_csv_count": max(video_count, 0),
                "comment_csv_count": max(comment_count, 0),
                "video_files": len(video_files),
                "thumbnail_files": len(thumb_files),
            })

    return datasets


@router.get("/datasets")
def list_datasets(
    admin: User = Depends(get_current_admin),
):
    """List available datasets in the data directory."""
    return _scan_datasets()


@router.post("/experiments/{experiment_id}/import-dataset")
def import_dataset(
    experiment_id: UUID,
    dataset_name: str,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Import a dataset (videos + comments) into an experiment in one shot.

    1. Reads *_videos.csv and creates Video records
    2. Reads *_comments.csv and creates Comment records (linked to videos)
    """
    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experiment not found")

    if experiment.status == "completed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot modify completed experiment")

    dataset_dir = DATA_DIR / dataset_name
    if not dataset_dir.resolve().is_relative_to(DATA_DIR.resolve()):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid dataset_name")
    if not dataset_dir.exists() or not dataset_dir.is_dir():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Dataset '{dataset_name}' not found")

    # Find CSV files
    video_csvs = list(dataset_dir.glob("*_videos.csv"))
    comment_csvs = list(dataset_dir.glob("*_comments.csv"))

    if not video_csvs:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No *_videos.csv found in dataset")

    result = {
        "dataset": dataset_name,
        "videos_created": 0,
        "videos_skipped": 0,
        "comments_created": 0,
        "comments_skipped": 0,
        "errors": [],
    }

    # --- Import videos ---
    video_csv = video_csvs[0]
    logger.info(f"Importing videos from {video_csv}")

    with open(video_csv, "r", encoding="utf-8-sig") as f:
        text = f.read().lstrip('\ufeff')
        reader = csv.DictReader(io.StringIO(text))

        for i, row in enumerate(reader, start=2):
            vid = row.get("video_id", "").strip()
            url = row.get("url", "").strip()
            duration_str = row.get("duration", "0").strip()

            if not vid or not url:
                result["errors"].append(f"Row {i}: missing video_id or url")
                continue

            # Skip if already exists
            existing = db.query(Video).filter(
                Video.experiment_id == experiment_id,
                Video.video_id == vid,
            ).first()
            if existing:
                result["videos_skipped"] += 1
                continue

            try:
                duration = int(duration_str)
            except ValueError:
                duration = 0

            # Parse tags
            tags = []
            if row.get("tags"):
                tags = [t.strip() for t in row["tags"].split(",") if t.strip()]

            # Parse optional ints
            def safe_int(val, default=0):
                try:
                    return int(val) if val else default
                except (ValueError, TypeError):
                    return default

            # Parse published_at
            published_at = None
            if row.get("published_at"):
                try:
                    from dateutil.parser import parse as parse_date
                    published_at = parse_date(row["published_at"])
                except Exception:
                    pass

            desc = (row.get("description") or "").replace('\x00', '')[:5000]

            video = Video(
                experiment_id=experiment_id,
                video_id=vid,
                url=url,
                video_type=_detect_video_type(url),
                duration=duration,
                title=row.get("title"),
                thumbnail_url=row.get("thumbnail"),
                category=row.get("category"),
                tags=tags,
                view_count=safe_int(row.get("view_count")),
                description=desc,
                like_count=safe_int(row.get("like_count")),
                comment_count=safe_int(row.get("comment_count")),
                channel_name=row.get("channel_name"),
                channel_id=row.get("channel_id"),
                published_at=published_at,
                extra_metadata={"thumbnail_url_original": row["thumbnail_url"]} if row.get("thumbnail_url") else {},
            )
            db.add(video)
            result["videos_created"] += 1

            if result["videos_created"] % 200 == 0:
                db.commit()

    db.commit()
    logger.info(f"Videos imported: {result['videos_created']} created, {result['videos_skipped']} skipped")

    # --- Import comments ---
    if comment_csvs:
        comment_csv = comment_csvs[0]
        logger.info(f"Importing comments from {comment_csv}")

        # Build video_id -> UUID lookup
        videos = db.query(Video).filter(Video.experiment_id == experiment_id).all()
        video_lookup = {v.video_id: v.id for v in videos}

        with open(comment_csv, "r", encoding="utf-8-sig") as f:
            text = f.read().lstrip('\ufeff')
            reader = csv.DictReader(io.StringIO(text))

            batch = []
            for row in reader:
                ext_vid = row.get("video_id", "").strip()
                video_uuid = video_lookup.get(ext_vid)
                if not video_uuid:
                    result["comments_skipped"] += 1
                    continue

                parent_id = row.get("parent_id", "").strip() or None

                # Parse published_at
                pub_at = None
                if row.get("published_at"):
                    try:
                        from dateutil.parser import parse as parse_date
                        pub_at = parse_date(row["published_at"])
                    except Exception:
                        pass

                # Strip NUL characters from text
                text = (row.get("text", "") or "").replace('\x00', '')
                author = (row.get("author_name", "Anonymous") or "Anonymous").replace('\x00', '')

                comment = Comment(
                    video_id=video_uuid,
                    comment_id=row.get("comment_id", "").strip(),
                    parent_id=parent_id,
                    author_name=author,
                    author_channel_id=row.get("author_channel_id", ""),
                    text=text,
                    like_count=int(row.get("like_count", 0) or 0),
                    published_at=pub_at,
                    reply_count=int(row.get("reply_count", 0) or 0),
                )
                batch.append(comment)
                result["comments_created"] += 1

                if len(batch) >= 1000:
                    db.bulk_save_objects(batch)
                    db.commit()
                    batch = []

            if batch:
                db.bulk_save_objects(batch)
                db.commit()

        logger.info(f"Comments imported: {result['comments_created']} created, {result['comments_skipped']} skipped")

    result["errors"] = result["errors"][:10]
    return result
