from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .deps import get_db
from ...models.ui_template import UITemplate
from ...schemas.ui_template import UITemplateResponse


router = APIRouter(prefix="/ui-templates", tags=["ui-templates"])


@router.get("/{template_id}", response_model=UITemplateResponse)
def get_public_ui_template(
    template_id: UUID,
    db: Session = Depends(get_db),
):
    """Public endpoint: get a published UI template for user-facing pages."""
    template = db.query(UITemplate).filter(
        UITemplate.id == template_id,
        UITemplate.status == "published",
    ).first()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="UI template not found or not published",
        )
    return template
