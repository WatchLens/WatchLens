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
)


router = APIRouter(tags=["admin-user-groups"])


def _to_response(g: UserGroup, user_count: int) -> UserGroupResponse:
    return UserGroupResponse(
        id=g.id,
        experiment_id=g.experiment_id,
        name=g.name,
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
    ui_config = data.ui_config.model_dump() if data.ui_config else {"feed": "youtube", "watch": "youtube"}

    group = UserGroup(
        experiment_id=experiment_id,
        name=data.name,
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
        # iterate on recommendations mid-study. ui_config remains locked to avoid
        # layout-driven confounds in participant behavior.
        if data.ui_config is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot change UI config in active experiment",
            )

    if data.name is not None:
        group.name = data.name
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
