import uuid as uuid_mod
from uuid import UUID
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..deps import get_db, get_current_admin
from ....models.user import User
from ....models.ui_template import UITemplate
from ....models.user_group import UserGroup
from ....schemas.ui_template import (
    UITemplateCreate,
    UITemplateUpdate,
    UITemplateResponse,
    UITemplateListItem,
)


router = APIRouter(tags=["admin-ui-templates"])


@router.get("/ui-templates", response_model=List[UITemplateListItem])
def list_ui_templates(
    template_status: Optional[str] = Query(None, alias="status"),
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """List all UI templates, optionally filtered by status."""
    query = db.query(UITemplate)
    if template_status:
        query = query.filter(UITemplate.status == template_status)
    query = query.order_by(UITemplate.updated_at.desc())
    return query.all()


@router.get("/ui-templates/{template_id}", response_model=UITemplateResponse)
def get_ui_template(
    template_id: UUID,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Get a single UI template with full config and CSS."""
    template = db.query(UITemplate).filter(UITemplate.id == template_id).first()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="UI template not found",
        )
    return template


@router.post("/ui-templates", response_model=UITemplateResponse, status_code=status.HTTP_201_CREATED)
def create_ui_template(
    data: UITemplateCreate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Create a new UI template."""
    existing = db.query(UITemplate).filter(UITemplate.name == data.name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Template with name '{data.name}' already exists",
        )

    template = UITemplate(
        name=data.name,
        description=data.description,
        template_type=data.template_type,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.put("/ui-templates/{template_id}", response_model=UITemplateResponse)
def update_ui_template(
    template_id: UUID,
    data: UITemplateUpdate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Update a UI template."""
    template = db.query(UITemplate).filter(UITemplate.id == template_id).first()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="UI template not found",
        )

    if data.name is not None:
        existing = db.query(UITemplate).filter(
            UITemplate.name == data.name, UITemplate.id != template_id
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Template with name '{data.name}' already exists",
            )
        template.name = data.name
    if data.description is not None:
        template.description = data.description
    if data.status is not None:
        if data.status not in ("draft", "published"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Status must be 'draft' or 'published'",
            )
        template.status = data.status
    if data.feed_config is not None:
        template.feed_config = data.feed_config
    if data.watch_config is not None:
        template.watch_config = data.watch_config
    if data.feed_css is not None:
        template.feed_css = data.feed_css
    if data.watch_css is not None:
        template.watch_css = data.watch_css
    if data.template_type is not None:
        if data.template_type not in ("tree", "code"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="template_type must be 'tree' or 'code'",
            )
        template.template_type = data.template_type
    if data.code_text is not None:
        template.code_text = data.code_text
    if data.feed_tree is not None:
        template.feed_tree = data.feed_tree
    if data.watch_tree is not None:
        template.watch_tree = data.watch_tree

    db.commit()
    db.refresh(template)
    return template


@router.delete("/ui-templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ui_template(
    template_id: UUID,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Delete a UI template. Fails if any user group references it."""
    template = db.query(UITemplate).filter(UITemplate.id == template_id).first()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="UI template not found",
        )

    # Check if any user group references this template
    groups_using = db.query(UserGroup).filter(
        UserGroup.ui_config["template_id"].as_string() == str(template_id)
    ).first()
    if groups_using:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete template that is in use by a user group",
        )

    db.delete(template)
    db.commit()


@router.post("/ui-templates/{template_id}/duplicate", response_model=UITemplateResponse, status_code=status.HTTP_201_CREATED)
def duplicate_ui_template(
    template_id: UUID,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Duplicate a UI template with a new name."""
    template = db.query(UITemplate).filter(UITemplate.id == template_id).first()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="UI template not found",
        )

    # Generate unique name
    base_name = f"{template.name} (Copy)"
    name = base_name
    counter = 2
    while db.query(UITemplate).filter(UITemplate.name == name).first():
        name = f"{base_name} {counter}"
        counter += 1

    new_template = UITemplate(
        name=name,
        description=template.description,
        status="draft",
        template_type=template.template_type,
        feed_config=template.feed_config,
        watch_config=template.watch_config,
        feed_css=template.feed_css,
        watch_css=template.watch_css,
        code_text=template.code_text,
        feed_tree=template.feed_tree,
        watch_tree=template.watch_tree,
    )
    db.add(new_template)
    db.commit()
    db.refresh(new_template)
    return new_template
