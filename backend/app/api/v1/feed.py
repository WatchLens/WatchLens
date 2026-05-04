from uuid import UUID
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func, text

from .deps import get_db, get_current_user
from ...models.user import User
from ...models.video import Video
from ...models.comment import Comment
from ...schemas.video import FeedResponse, VideoResponse, ResolvedUrl
from ...schemas.comment import CommentResponse, CommentListResponse
from ...recommenders import get_recommender
from ...services.video import resolve_video_url


router = APIRouter(prefix="/feed", tags=["feed"])


def _video_to_response(video: Video) -> VideoResponse:
    resp = VideoResponse.model_validate(video)
    resp.resolved_url = ResolvedUrl(**resolve_video_url(video.url, video.thumbnail_url))
    return resp


def _get_watched_video_ids(db: Session, user_id: UUID) -> List[UUID]:
    """Return distinct video_ids this user has watched for 1+ seconds.

    Driven by the VIDEO_WATCHED_1S event (fires once per play at 1s mark) and
    VIDEO_ENDED (covers sub-1s videos that completed naturally).
    """
    rows = db.execute(
        text(
            """
            SELECT DISTINCT e.video_id
            FROM events e
            JOIN sessions s ON e.session_id = s.id
            WHERE s.user_id = :uid
              AND e.video_id IS NOT NULL
              AND e.event_type IN ('VIDEO_WATCHED_1S', 'VIDEO_ENDED')
            """
        ),
        {"uid": str(user_id)},
    ).fetchall()
    return [row[0] for row in rows]


def _count_experiment_videos(db: Session, experiment_id: UUID) -> int:
    return db.query(func.count(Video.id)).filter(Video.experiment_id == experiment_id).scalar() or 0


@router.get("", response_model=FeedResponse)
def get_feed(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get recommended video feed for the current user.

    The algorithm used depends on the user's group assignment.
    """
    # Get user's algorithm from their group
    if not current_user.user_group:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not assigned to any group",
        )

    algorithm_config = current_user.user_group.algorithm_config or {"feed": "random", "watch": "random"}
    algorithm = algorithm_config.get("feed", "random")
    experiment_id = current_user.user_group.experiment_id

    # Extract per-group algorithm params (e.g. recbole_feed model config)
    group_config = current_user.user_group.config or {}
    algorithm_params = group_config.get("recbole_feed", {}) if algorithm == "recbole" else None

    # Get recommender
    try:
        recommender = get_recommender(algorithm)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )

    # Calculate offset
    offset = (page - 1) * limit

    # Exclude videos the user has already watched (>=25%) across all sessions.
    watched_ids = _get_watched_video_ids(db, current_user.id)

    # Get recommendations (Feed page: no current_video_id)
    videos = recommender.get_recommendations(
        db=db,
        experiment_id=experiment_id,
        user_id=current_user.id,
        limit=limit + 1,  # Get one extra to check if there's more
        offset=offset,
        exclude_video_ids=watched_ids or None,
        current_video_id=None,
        algorithm_params=algorithm_params,
    )

    # Check if there are more videos
    has_more = len(videos) > limit
    if has_more:
        videos = videos[:limit]

    # Exhausted = user has seen every video in this experiment
    exhausted = False
    if not videos and watched_ids:
        total_videos = _count_experiment_videos(db, experiment_id)
        exhausted = total_videos > 0 and len(watched_ids) >= total_videos

    return FeedResponse(
        videos=[_video_to_response(v) for v in videos],
        algorithm=algorithm,
        page=page,
        has_more=has_more,
        exhausted=exhausted,
    )


@router.get("/{video_id}", response_model=VideoResponse)
def get_video(
    video_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a single video by video_id (external ID)."""
    if not current_user.user_group:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not assigned to any group",
        )

    experiment_id = current_user.user_group.experiment_id

    video = db.query(Video).filter(
        Video.experiment_id == experiment_id,
        Video.video_id == video_id
    ).first()

    if not video:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Video not found",
        )

    return _video_to_response(video)


@router.get("/{video_id}/related", response_model=FeedResponse)
def get_related_videos(
    video_id: str,
    limit: int = Query(10, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get related videos for the watch page.

    Uses the 'watch' algorithm from the user's group algorithm_config.
    """
    if not current_user.user_group:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not assigned to any group",
        )

    algorithm_config = current_user.user_group.algorithm_config or {"feed": "random", "watch": "random"}
    algorithm = algorithm_config.get("watch", "random")
    experiment_id = current_user.user_group.experiment_id

    # Extract per-group algorithm params (e.g. recbole_watch model config)
    group_config = current_user.user_group.config or {}
    algorithm_params = group_config.get("recbole_watch", {}) if algorithm == "recbole" else None

    # Get current video to exclude it from related
    current_video = db.query(Video).filter(
        Video.experiment_id == experiment_id,
        Video.video_id == video_id
    ).first()

    # Exclude current + already-watched videos
    watched_ids = _get_watched_video_ids(db, current_user.id)
    exclude_ids: List[UUID] = list({*watched_ids, *(([current_video.id] if current_video else []))})

    # Get recommender
    try:
        recommender = get_recommender(algorithm)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )

    # Get related video recommendations (Watch page: pass current_video_id)
    videos = recommender.get_recommendations(
        db=db,
        experiment_id=experiment_id,
        user_id=current_user.id,
        limit=limit,
        offset=0,
        exclude_video_ids=exclude_ids,
        current_video_id=current_video.id if current_video else None,
        algorithm_params=algorithm_params,
    )

    exhausted = False
    if not videos and watched_ids:
        total_videos = _count_experiment_videos(db, experiment_id)
        # -1 to discount the current video
        exhausted = total_videos > 0 and len(watched_ids) >= max(total_videos - 1, 0)

    return FeedResponse(
        videos=[_video_to_response(v) for v in videos],
        algorithm=algorithm,
        page=1,
        has_more=False,
        exhausted=exhausted,
    )


@router.get("/{video_id}/comments", response_model=CommentListResponse)
def get_video_comments(
    video_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get top-level comments for a video (read-only).
    Sorted by like_count descending (most popular first).
    """
    if not current_user.user_group:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not assigned to any group",
        )

    experiment_id = current_user.user_group.experiment_id

    video = db.query(Video).filter(
        Video.experiment_id == experiment_id,
        Video.video_id == video_id,
    ).first()

    if not video:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Video not found",
        )

    # Count total top-level comments
    total = db.query(func.count(Comment.id)).filter(
        Comment.video_id == video.id,
        Comment.parent_id.is_(None),
    ).scalar() or 0

    # Fetch top-level comments, sorted by likes
    offset = (page - 1) * limit
    comments = db.query(Comment).filter(
        Comment.video_id == video.id,
        Comment.parent_id.is_(None),
    ).order_by(Comment.like_count.desc()).offset(offset).limit(limit).all()

    return CommentListResponse(
        comments=[CommentResponse.model_validate(c) for c in comments],
        total=total,
        page=page,
        limit=limit,
        has_more=offset + limit < total,
    )


@router.get("/{video_id}/comments/{comment_id}/replies", response_model=CommentListResponse)
def get_comment_replies(
    video_id: str,
    comment_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get replies to a specific comment (read-only).
    Sorted by published_at ascending (chronological).
    """
    if not current_user.user_group:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not assigned to any group",
        )

    experiment_id = current_user.user_group.experiment_id

    video = db.query(Video).filter(
        Video.experiment_id == experiment_id,
        Video.video_id == video_id,
    ).first()

    if not video:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Video not found",
        )

    # Count replies
    total = db.query(func.count(Comment.id)).filter(
        Comment.video_id == video.id,
        Comment.parent_id == comment_id,
    ).scalar() or 0

    # Fetch replies
    offset = (page - 1) * limit
    replies = db.query(Comment).filter(
        Comment.video_id == video.id,
        Comment.parent_id == comment_id,
    ).order_by(Comment.published_at.asc()).offset(offset).limit(limit).all()

    return CommentListResponse(
        comments=[CommentResponse.model_validate(c) for c in replies],
        total=total,
        page=page,
        limit=limit,
        has_more=offset + limit < total,
    )
