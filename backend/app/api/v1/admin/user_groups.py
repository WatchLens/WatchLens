from uuid import UUID
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..deps import get_db, get_current_admin
from ....models.user import User
from ....models.experiment import Experiment
from ....models.user_group import UserGroup
from ....schemas.user_group import (
    UserGroupCreate,
    UserGroupUpdate,
    UserGroupResponse,
    _validate_ui_key,
)


router = APIRouter(tags=["admin-user-groups"])


def _to_response(g: UserGroup, user_count: int) -> UserGroupResponse:
    return UserGroupResponse(
        id=g.id,
        experiment_id=g.experiment_id,
        name=g.name,
        device=g.device,
        algorithm_config=g.algorithm_config,
        ui_config=g.ui_config,
        config=g.config,
        created_at=g.created_at,
        user_count=user_count,
    )


@router.get("/experiments/{experiment_id}/user-groups", response_model=List[UserGroupResponse])
def list_user_groups(
    experiment_id: UUID,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """List all user groups for an experiment."""
    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experiment not found")
    return [_to_response(g, len(g.users)) for g in experiment.user_groups]


@router.post("/experiments/{experiment_id}/user-groups", response_model=UserGroupResponse, status_code=status.HTTP_201_CREATED)
def create_user_group(
    experiment_id: UUID,
    data: UserGroupCreate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Create a new user group in an experiment."""
    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experiment not found")

    if experiment.status == "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot add groups to completed experiment",
        )

    algo_config = data.algorithm_config.model_dump() if data.algorithm_config else {"feed": "random", "watch": "random"}
    ui_config = data.ui_config.model_dump() if data.ui_config else {"feed": "youtube-desktop", "watch": "youtube-desktop"}

    group = UserGroup(
        experiment_id=experiment_id,
        name=data.name,
        device=data.device,
        algorithm_config=algo_config,
        ui_config=ui_config,
        config=data.config or {},
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    return _to_response(group, 0)


@router.put("/user-groups/{group_id}", response_model=UserGroupResponse)
def update_user_group(
    group_id: UUID,
    data: UserGroupUpdate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Update a user group."""
    group = db.query(UserGroup).filter(UserGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User group not found")

    experiment = db.query(Experiment).filter(Experiment.id == group.experiment_id).first()
    if experiment.status == "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot modify completed experiment",
        )
    if experiment.status == "active":
        # Active experiments: algorithm_config + config are editable so researchers can
        # iterate on recommendations mid-study. ui_config + device remain locked to
        # avoid layout-driven confounds in participant behavior.
        if data.ui_config is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot change UI config in active experiment",
            )
        if data.device is not None and data.device != group.device:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot change device in active experiment",
            )

    # Validate ui_config against the group's effective device. The
    # patch's `device` (if present) wins over the existing one — both
    # `device` and `ui_config` may change in the same call, and the
    # check has to use the post-patch device for correctness.
    effective_device = data.device or group.device
    if data.ui_config is not None:
        _validate_ui_key("feed", data.ui_config.feed, effective_device)
        _validate_ui_key("watch", data.ui_config.watch, effective_device)
    elif data.device is not None and data.device != group.device:
        # Device changed but ui_config didn't — re-validate the existing
        # ui_config against the new device. Catches the "switched mobile
        # → desktop without re-picking templates" foot-gun.
        _validate_ui_key("feed", group.ui_config.get("feed", ""), effective_device)
        _validate_ui_key("watch", group.ui_config.get("watch", ""), effective_device)

    if data.name is not None:
        group.name = data.name
    if data.device is not None:
        group.device = data.device
    if data.algorithm_config is not None:
        group.algorithm_config = data.algorithm_config.model_dump()
    if data.ui_config is not None:
        group.ui_config = data.ui_config.model_dump()
    if data.config is not None:
        group.config = data.config

    db.commit()
    db.refresh(group)
    return _to_response(group, len(group.users))


@router.delete("/user-groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user_group(
    group_id: UUID,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Delete a user group. Refuses if users are still assigned."""
    group = db.query(UserGroup).filter(UserGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User group not found")

    user_count = db.query(User).filter(User.user_group_id == group_id).count()
    if user_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Group has {user_count} assigned user(s). Move or delete users before deleting the group.",
        )

    db.delete(group)
    db.commit()
