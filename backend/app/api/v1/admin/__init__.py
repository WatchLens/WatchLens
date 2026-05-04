from fastapi import APIRouter

from .experiments import router as experiments_router
from .user_groups import router as user_groups_router
from .users import router as users_router
from .videos import router as videos_router
from .stats import router as stats_router
from .ui_templates import router as ui_templates_router
from .training import router as training_router
from .datasets import router as datasets_router
from .recommenders import router as recommenders_router

admin_router = APIRouter(prefix="/admin", tags=["admin"])

admin_router.include_router(experiments_router)
admin_router.include_router(user_groups_router)
admin_router.include_router(users_router)
admin_router.include_router(videos_router)
admin_router.include_router(stats_router)
admin_router.include_router(ui_templates_router)
admin_router.include_router(training_router)
admin_router.include_router(datasets_router)
admin_router.include_router(recommenders_router)
