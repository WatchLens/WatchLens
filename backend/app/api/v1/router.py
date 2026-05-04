from fastapi import APIRouter

from .auth import router as auth_router
from .feed import router as feed_router
from .events import router as events_router
from .sessions import router as sessions_router
from .videos import router as videos_router
from .ui_templates import router as ui_templates_router
from .admin import admin_router

api_router = APIRouter()

# User-facing APIs
api_router.include_router(auth_router)
api_router.include_router(feed_router)
api_router.include_router(events_router)
api_router.include_router(sessions_router)
api_router.include_router(videos_router)
api_router.include_router(ui_templates_router)

# Admin APIs
api_router.include_router(admin_router)
