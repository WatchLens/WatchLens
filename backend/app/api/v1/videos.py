from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .deps import get_db, get_current_user
from ...models.user import User
from ...models.video import Video
from ...models.event import Event
from ...models.session import Session as UserSession


router = APIRouter(prefix="/videos", tags=["videos"])


@router.post("/{video_id}/like")
def like_video(
    video_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Like a video."""
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

    # Note: The actual LIKE event should be sent via the batch endpoint
    # This endpoint is for immediate feedback if needed

    return {"message": "Video liked", "video_id": video_id}


@router.post("/{video_id}/dislike")
def dislike_video(
    video_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Dislike a video."""
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

    return {"message": "Video disliked", "video_id": video_id}
