from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from .deps import get_db, get_current_user
from ...models.user import User
from ...models.session import Session as UserSession
from ...schemas.session import SessionCreate, SessionResponse


router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", response_model=SessionResponse)
def create_session(
    session_data: SessionCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Register a new session.

    Sessions are created on the frontend with crypto.randomUUID()
    and registered here when the user loads the app.
    """
    # Check if session already exists
    existing = db.query(UserSession).filter(UserSession.id == session_data.session_id).first()
    if existing:
        # Return existing session
        return SessionResponse.model_validate(existing)

    # Get client IP
    ip_address = request.client.host if request.client else None

    # Create new session
    session = UserSession(
        id=session_data.session_id,
        user_id=current_user.id,
        started_at=datetime.utcnow(),
        user_agent=session_data.user_agent,
        ip_address=ip_address,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    return SessionResponse.model_validate(session)


@router.post("/{session_id}/end")
def end_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark a session as ended."""
    session = db.query(UserSession).filter(UserSession.id == session_id).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    if session.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Session does not belong to current user",
        )

    session.ended_at = datetime.utcnow()
    db.commit()

    return {"message": "Session ended"}
