import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB

from ..database import Base


class UITemplate(Base):
    __tablename__ = "ui_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False, unique=True)
    description = Column(String(1000), nullable=True)
    status = Column(String(20), nullable=False, default="draft")  # draft, published
    # 'tree' = visual block-tree authoring (feed_config / watch_config / *_css)
    # 'code' = raw TSX source authored in editor, compiled in browser at runtime
    template_type = Column(String(20), nullable=False, default="tree")
    feed_config = Column(JSONB, nullable=False, default=dict)
    watch_config = Column(JSONB, nullable=False, default=dict)
    feed_css = Column(Text, nullable=False, default="")
    watch_css = Column(Text, nullable=False, default="")
    code_text = Column(Text, nullable=True)
    # Phase 4 block-tree columns. When non-null and template_type='tree',
    # the renderer prefers these over the legacy feed_config/watch_config
    # shape. Stored as the BlockNode JSON shape declared in
    # frontend/src/ui-runtime/blocks/types.ts.
    feed_tree = Column(JSONB, nullable=True)
    watch_tree = Column(JSONB, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
