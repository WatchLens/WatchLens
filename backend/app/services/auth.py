from datetime import datetime
from typing import Optional
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models.user import User
from ..utils.security import verify_password, get_password_hash


def authenticate_user(db: Session, login_id: str, password: str) -> Optional[User]:
    """Authenticate a user by login_id and password."""
    user = db.query(User).filter(User.login_id == login_id).first()
    if not user:
        return None
    if not user.is_active:
        return None
    if not verify_password(password, user.password_hash):
        return None

    # Update last login
    user.last_login = datetime.utcnow()
    db.commit()

    return user


def create_admin_if_not_exists(db: Session, login_id: str, password: str) -> Optional[User]:
    """Create the admin user on startup if absent.

    Multi-worker race: uvicorn boots `--workers 4`, each worker runs the
    lifespan startup hook independently, and they can all see "no admin
    yet" before any of them commits. The check-then-insert pattern races
    on the unique `login_id` constraint. We swallow the IntegrityError so
    the late workers no-op cleanly instead of crashing startup.
    """
    existing_admin = db.query(User).filter(User.login_id == login_id).first()
    if existing_admin:
        return None

    admin = User(
        login_id=login_id,
        password_hash=get_password_hash(password),
        is_admin=True,
        is_active=True,
    )
    db.add(admin)
    try:
        db.commit()
    except IntegrityError:
        # Another worker already inserted the admin. Roll back our
        # transaction so the session is reusable for downstream work.
        db.rollback()
        return None
    db.refresh(admin)
    return admin


def get_user_by_id(db: Session, user_id: str) -> Optional[User]:
    """Get user by ID."""
    return db.query(User).filter(User.id == user_id).first()
