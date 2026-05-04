import logging
from uuid import UUID
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..deps import get_db, get_current_admin
from ....models.user import User
from ....models.experiment import Experiment
from ....models.user_group import UserGroup
from ....models.video import Video
from ....schemas.experiment import (
    ExperimentCreate,
    ExperimentUpdate,
    ExperimentResponse,
    ExperimentListResponse,
    UserGroupSummary,
)

logger = logging.getLogger(__name__)


router = APIRouter(prefix="/experiments", tags=["admin-experiments"])


@router.get("", response_model=ExperimentListResponse)
def list_experiments(
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """List all experiments."""
    experiments = db.query(Experiment).order_by(Experiment.created_at.desc()).all()

    result = []
    for exp in experiments:
        # Count users and videos
        total_users = sum(len(g.users) for g in exp.user_groups)
        total_videos = len(exp.videos)

        # Build group summaries
        groups = [
            UserGroupSummary(
                id=g.id,
                name=g.name,
                algorithm_config=g.algorithm_config,
                user_count=len(g.users),
            )
            for g in exp.user_groups
        ]

        result.append(ExperimentResponse(
            id=exp.id,
            name=exp.name,
            description=exp.description,
            status=exp.status,
            start_date=exp.start_date,
            end_date=exp.end_date,
            created_at=exp.created_at,
            updated_at=exp.updated_at,
            user_groups=groups,
            total_users=total_users,
            total_videos=total_videos,
        ))

    return ExperimentListResponse(experiments=result, total=len(result))


@router.post("", response_model=ExperimentResponse, status_code=status.HTTP_201_CREATED)
def create_experiment(
    data: ExperimentCreate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Create a new experiment."""
    experiment = Experiment(
        name=data.name,
        description=data.description,
        start_date=data.start_date,
        end_date=data.end_date,
        status="draft",
    )
    db.add(experiment)
    db.commit()
    db.refresh(experiment)

    return ExperimentResponse(
        id=experiment.id,
        name=experiment.name,
        description=experiment.description,
        status=experiment.status,
        start_date=experiment.start_date,
        end_date=experiment.end_date,
        created_at=experiment.created_at,
        updated_at=experiment.updated_at,
        user_groups=[],
        total_users=0,
        total_videos=0,
    )


@router.get("/{experiment_id}", response_model=ExperimentResponse)
def get_experiment(
    experiment_id: UUID,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Get a single experiment by ID."""
    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Experiment not found",
        )

    total_users = sum(len(g.users) for g in experiment.user_groups)
    total_videos = len(experiment.videos)

    groups = [
        UserGroupSummary(
            id=g.id,
            name=g.name,
            algorithm_config=g.algorithm_config,
            user_count=len(g.users),
        )
        for g in experiment.user_groups
    ]

    return ExperimentResponse(
        id=experiment.id,
        name=experiment.name,
        description=experiment.description,
        status=experiment.status,
        start_date=experiment.start_date,
        end_date=experiment.end_date,
        created_at=experiment.created_at,
        updated_at=experiment.updated_at,
        user_groups=groups,
        total_users=total_users,
        total_videos=total_videos,
    )


@router.put("/{experiment_id}", response_model=ExperimentResponse)
def update_experiment(
    experiment_id: UUID,
    data: ExperimentUpdate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Update an experiment."""
    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Experiment not found",
        )

    if data.name is not None:
        experiment.name = data.name
    if data.description is not None:
        experiment.description = data.description
    if data.status is not None:
        experiment.status = data.status
    if data.start_date is not None:
        experiment.start_date = data.start_date
    if data.end_date is not None:
        experiment.end_date = data.end_date

    db.commit()
    db.refresh(experiment)

    total_users = sum(len(g.users) for g in experiment.user_groups)
    total_videos = len(experiment.videos)

    groups = [
        UserGroupSummary(
            id=g.id,
            name=g.name,
            algorithm_config=g.algorithm_config,
            user_count=len(g.users),
        )
        for g in experiment.user_groups
    ]

    return ExperimentResponse(
        id=experiment.id,
        name=experiment.name,
        description=experiment.description,
        status=experiment.status,
        start_date=experiment.start_date,
        end_date=experiment.end_date,
        created_at=experiment.created_at,
        updated_at=experiment.updated_at,
        user_groups=groups,
        total_users=total_users,
        total_videos=total_videos,
    )


@router.delete("/{experiment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_experiment(
    experiment_id: UUID,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Delete an experiment and all related data."""
    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Experiment not found",
        )

    db.delete(experiment)
    db.commit()
