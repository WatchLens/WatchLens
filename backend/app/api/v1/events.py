import logging
from collections import Counter
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, update
from sqlalchemy.orm import Session

from .deps import get_db, get_current_user
from ...models.user import User
from ...models.session import Session as UserSession
from ...models.event import Event
from ...models.video import Video
from ...schemas.event import EventBatchCreate, EventBatchResponse

logger = logging.getLogger(__name__)


router = APIRouter(prefix="/events", tags=["events"])


@router.post("/batch", response_model=EventBatchResponse)
def create_events_batch(
    batch: EventBatchCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Receive batch of events from frontend.

    Events are batched and sent:
    - Every 5 seconds
    - When buffer reaches 20 items
    - On page unload (beforeunload event)
    """
    # Get or create session
    session = db.query(UserSession).filter(UserSession.id == batch.session_id).first()
    if not session:
        # Create session if not exists
        session = UserSession(
            id=batch.session_id,
            user_id=current_user.id,
            started_at=datetime.utcnow(),
        )
        db.add(session)
        db.flush()

    # Verify session belongs to current user
    if session.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Session does not belong to current user",
        )

    # Get experiment_id from user's group
    experiment_id = None
    algorithm = None
    if current_user.user_group:
        experiment_id = current_user.user_group.experiment_id
        algorithm_config = current_user.user_group.algorithm_config or {"feed": "random", "watch": "random"}
        algorithm = algorithm_config.get("feed", "random")

    # Single bulk Video lookup: gather every external video_id referenced in
    # the batch and resolve to UUIDs in one query. Previously each event did
    # its own SELECT (50 events × ~8 distinct videos = 400 round-trips).
    referenced_external_ids = {e.video_id for e in batch.events if e.video_id}
    video_lookup: dict[str, object] = {}
    if referenced_external_ids and experiment_id:
        rows = db.query(Video.id, Video.video_id).filter(
            Video.experiment_id == experiment_id,
            Video.video_id.in_(referenced_external_ids),
        ).all()
        video_lookup = {ext_id: uuid_id for (uuid_id, ext_id) in rows}

    # Count VIDEO_STARTs per resolved video so we can issue one UPDATE per
    # distinct video instead of one UPDATE per event.
    view_start_counts: Counter = Counter()
    now = datetime.utcnow()
    event_rows = []
    for event_data in batch.events:
        video_uuid = video_lookup.get(event_data.video_id) if event_data.video_id else None
        if video_uuid and event_data.event_type == "VIDEO_START":
            view_start_counts[video_uuid] += 1
        event_rows.append({
            "session_id": batch.session_id,
            "video_id": video_uuid,
            "event_type": event_data.event_type,
            "watch_ratio": event_data.watch_ratio,
            "watch_duration": event_data.watch_duration,
            "position_in_feed": event_data.position_in_feed,
            "algorithm": algorithm,
            "payload": event_data.payload or {},
            "client_timestamp": event_data.timestamp,
            "server_timestamp": now,
        })

    if event_rows:
        db.bulk_insert_mappings(Event, event_rows)

    # One atomic UPDATE per distinct video — concurrent VIDEO_START batches
    # for the same video serialize safely at the row level.
    for video_uuid, n in view_start_counts.items():
        db.execute(
            update(Video)
            .where(Video.id == video_uuid)
            .values(view_count=func.coalesce(Video.view_count, 0) + n)
        )

    db.commit()

    return EventBatchResponse(received=len(event_rows))
