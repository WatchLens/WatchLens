import secrets
import string
import logging
from uuid import UUID
from typing import List
from io import StringIO
from urllib.parse import quote
import csv
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..deps import get_db, get_current_admin
from ....models.user import User
from ....models.experiment import Experiment
from ....models.user_group import UserGroup
from ....schemas.user import (
    UserBulkCreate,
    UserBulkResponse,
    UserCredential,
    UserResponse,
    UserListResponse,
)
from ....utils.security import get_password_hash

logger = logging.getLogger(__name__)


router = APIRouter(tags=["admin-users"])


def generate_password(length: int = 10) -> str:
    """Generate a random password."""
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))


@router.get("/experiments/{experiment_id}/users", response_model=UserListResponse)
def list_users(
    experiment_id: UUID,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """List all users in an experiment."""
    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Experiment not found",
        )

    # Get all users from all groups in this experiment
    users = []
    for group in experiment.user_groups:
        for user in group.users:
            users.append(UserResponse(
                id=user.id,
                login_id=user.login_id,
                user_group_id=user.user_group_id,
                group_name=group.name,
                is_admin=user.is_admin,
                is_active=user.is_active,
                created_at=user.created_at,
                last_login=user.last_login,
            ))

    return UserListResponse(users=users, total=len(users))


@router.post("/experiments/{experiment_id}/users/bulk", response_model=UserBulkResponse)
def bulk_create_users(
    experiment_id: UUID,
    data: UserBulkCreate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Bulk create users for an experiment.

    Returns the created users with their plain-text passwords
    (only time passwords are visible).
    """
    # Verify experiment exists
    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Experiment not found",
        )

    if experiment.status == "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot add users to completed experiment",
        )

    # Verify group exists and belongs to experiment
    group = db.query(UserGroup).filter(UserGroup.id == data.user_group_id).first()
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User group not found",
        )
    if group.experiment_id != experiment_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User group does not belong to this experiment",
        )

    # Find the next available number for the prefix
    existing_users = db.query(User).filter(
        User.login_id.like(f"{data.prefix}%")
    ).all()

    existing_numbers = set()
    for user in existing_users:
        try:
            num = int(user.login_id.replace(data.prefix, ""))
            existing_numbers.add(num)
        except ValueError:
            pass

    # Create users
    created_users = []
    next_num = 1
    for _ in range(data.count):
        # Find next available number
        while next_num in existing_numbers:
            next_num += 1

        login_id = f"{data.prefix}{next_num:03d}"
        password = generate_password()

        user = User(
            login_id=login_id,
            password_hash=get_password_hash(password),
            user_group_id=data.user_group_id,
            is_admin=False,
            is_active=True,
        )
        db.add(user)
        created_users.append(UserCredential(login_id=login_id, password=password))

        existing_numbers.add(next_num)
        next_num += 1

    db.commit()

    return UserBulkResponse(created=len(created_users), users=created_users)


@router.get("/experiments/{experiment_id}/users/csv")
def download_users_csv(
    experiment_id: UUID,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Download users as CSV.

    Note: This only includes login_ids, not passwords.
    Passwords are only shown once during bulk creation.
    """
    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Experiment not found",
        )

    # Prepare CSV
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["login_id", "group_name", "algorithm_feed", "algorithm_watch", "created_at", "last_login"])

    for group in experiment.user_groups:
        algo_config = group.algorithm_config or {}
        for user in group.users:
            writer.writerow([
                user.login_id,
                group.name,
                algo_config.get("feed", ""),
                algo_config.get("watch", ""),
                user.created_at.isoformat() if user.created_at else "",
                user.last_login.isoformat() if user.last_login else "",
            ])

    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(f'users_{experiment.name}.csv', safe='')}"
        },
    )


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: UUID,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Delete a user."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete admin users",
        )

    db.delete(user)
    db.commit()
