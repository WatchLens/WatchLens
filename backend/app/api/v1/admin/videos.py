import csv
import logging
import re
import threading
from uuid import UUID
from io import StringIO
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..deps import get_db, get_current_admin
from ....models.user import User
from ....models.experiment import Experiment
from ....models.video import Video
from ....schemas.video import VideoResponse, VideoListResponse

logger = logging.getLogger(__name__)


router = APIRouter(tags=["admin-videos"])


def detect_video_type(url: str) -> str:
    """Detect if URL is YouTube or direct video URL."""
    # YouTube patterns
    youtube_patterns = [
        "youtube.com",
        "youtu.be",
    ]
    for pattern in youtube_patterns:
        if pattern in url.lower():
            return "youtube"

    # YouTube video ID: 11 chars, alphanumeric + _ + -
    if re.match(r'^[A-Za-z0-9_-]{11}$', url):
        return "youtube"

    return "url"


@router.get("/experiments/{experiment_id}/videos", response_model=VideoListResponse)
def list_videos(
    experiment_id: UUID,
    page: int = Query(1, ge=1),
    limit: int = Query(100, ge=1, le=500),
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """List videos in an experiment with pagination."""
    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Experiment not found",
        )

    # Total count
    total = db.query(Video).filter(Video.experiment_id == experiment_id).count()

    # Sort by created_at desc, then video_id
    videos = (
        db.query(Video)
        .filter(Video.experiment_id == experiment_id)
        .order_by(Video.created_at.desc(), Video.video_id.asc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    return VideoListResponse(
        videos=[VideoResponse.model_validate(v) for v in videos],
        total=total,
        has_more=(page * limit) < total,
    )


@router.post("/experiments/{experiment_id}/videos/csv")
async def upload_videos_csv(
    experiment_id: UUID,
    file: UploadFile = File(...),
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Upload videos from CSV file.

    CSV format:
    video_id,url,duration,title,thumbnail,category,tags,description,like_count,dislike_count,comment_count,channel_name
    vid001,https://example.com/video1.mp4,120,Video Title,https://thumb.jpg,tech,"ai,ml",Description text,100,5,20,ChannelName
    """
    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Experiment not found",
        )

    if experiment.status == "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot modify completed experiment",
        )

    # Read and parse CSV (cap body to prevent OOM on malicious large upload)
    MAX_CSV_SIZE = 50 * 1024 * 1024  # 50 MB
    if file.size and file.size > MAX_CSV_SIZE:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="CSV too large (max 50MB)")
    content = await file.read()
    if len(content) > MAX_CSV_SIZE:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="CSV too large (max 50MB)")
    try:
        text = content.decode("utf-8-sig")  # Handles BOM
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(StringIO(text))

    # Required fields
    required_fields = ["video_id", "url", "duration"]

    created_count = 0
    skipped_count = 0
    errors = []

    for i, row in enumerate(reader, start=2):  # Start at 2 (header is row 1)
        # Check required fields
        missing = [f for f in required_fields if not row.get(f)]
        if missing:
            errors.append(f"Row {i}: Missing required fields: {missing}")
            continue

        # Check if video_id already exists in this experiment
        existing = db.query(Video).filter(
            Video.experiment_id == experiment_id,
            Video.video_id == row["video_id"]
        ).first()

        if existing:
            skipped_count += 1
            continue

        # Parse tags
        tags = []
        if row.get("tags"):
            tags = [t.strip() for t in row["tags"].split(",")]

        # Parse duration
        try:
            duration = int(row["duration"])
        except ValueError:
            errors.append(f"Row {i}: Invalid duration: {row['duration']}")
            continue

        # Parse optional integer fields
        view_count = 0
        like_count = 0
        dislike_count = 0
        comment_count = 0
        if row.get("view_count"):
            try:
                view_count = int(row["view_count"])
            except ValueError:
                pass
        if row.get("like_count"):
            try:
                like_count = int(row["like_count"])
            except ValueError:
                pass
        if row.get("dislike_count"):
            try:
                dislike_count = int(row["dislike_count"])
            except ValueError:
                pass
        if row.get("comment_count"):
            try:
                comment_count = int(row["comment_count"])
            except ValueError:
                pass

        # Parse published_at
        published_at = None
        if row.get("published_at"):
            try:
                from dateutil.parser import parse as parse_date
                published_at = parse_date(row["published_at"])
            except Exception:
                pass

        # Create video
        video = Video(
            experiment_id=experiment_id,
            video_id=row["video_id"],
            url=row["url"],
            video_type=detect_video_type(row["url"]),
            duration=duration,
            title=row.get("title"),
            thumbnail_url=row.get("thumbnail"),
            category=row.get("category"),
            tags=tags,
            view_count=view_count,
            extra_metadata={"thumbnail_url_original": row["thumbnail_url"]} if row.get("thumbnail_url") else {},
            # YouTube-style metadata
            description=row.get("description"),
            like_count=like_count,
            dislike_count=dislike_count,
            comment_count=comment_count,
            channel_name=row.get("channel_name"),
            channel_id=row.get("channel_id"),
            published_at=published_at,
        )
        db.add(video)
        created_count += 1

    db.commit()

    # Trigger auto I2I computation in background if new videos were created
    if created_count > 0:
        _trigger_auto_i2i(experiment_id)

    return {
        "created": created_count,
        "skipped": skipped_count,
        "errors": errors[:10] if errors else [],  # Return first 10 errors
        "total_errors": len(errors),
    }


def _trigger_auto_i2i(experiment_id: UUID):
    """Trigger auto I2I computation in a background thread with its own DB session."""
    def _worker():
        from ....database import SessionLocal
        from ....services.item_similarity_computer import compute_auto_item_similarities
        worker_db = SessionLocal()
        try:
            compute_auto_item_similarities(worker_db, experiment_id)
        except Exception:
            logger.exception("Background auto I2I failed for experiment %s", experiment_id)
        finally:
            worker_db.close()

    thread = threading.Thread(target=_worker, daemon=True)
    thread.start()


@router.delete("/videos/{video_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_video(
    video_id: UUID,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Delete a video."""
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Video not found",
        )

    experiment = db.query(Experiment).filter(Experiment.id == video.experiment_id).first()
    if experiment and experiment.status == "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot modify completed experiment",
        )

    db.delete(video)
    db.commit()


class BulkDeleteRequest(BaseModel):
    video_ids: List[UUID]


@router.post("/videos/bulk-delete", status_code=status.HTTP_200_OK)
def bulk_delete_videos(
    request: BulkDeleteRequest,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Bulk delete videos by IDs."""
    videos = db.query(Video).filter(Video.id.in_(request.video_ids)).all()
    if not videos:
        return {"deleted": 0}

    # Block delete if ANY of the experiments involved is completed (not just the
    # first). Previously only videos[0]'s experiment was checked so a mix could
    # slip through.
    experiment_ids = {v.experiment_id for v in videos}
    completed_count = db.query(Experiment).filter(
        Experiment.id.in_(experiment_ids),
        Experiment.status == "completed",
    ).count()
    if completed_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="One or more videos belong to a completed experiment",
        )

    deleted = db.query(Video).filter(Video.id.in_(request.video_ids)).delete(synchronize_session=False)
    db.commit()
    return {"deleted": deleted}
