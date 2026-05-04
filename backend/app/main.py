from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .database import SessionLocal
from .api.v1.router import api_router
from .services.auth import create_admin_if_not_exists
from .services.training_scheduler import TrainingScheduler, recover_stuck_runs
from .recommenders import reload_external_instances


settings = get_settings()
scheduler = TrainingScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    db = SessionLocal()
    try:
        create_admin_if_not_exists(
            db,
            login_id=settings.ADMIN_LOGIN_ID,
            password=settings.ADMIN_PASSWORD
        )
        recover_stuck_runs(db)
        # Hydrate the in-process external recommender cache from the
        # `recommender_registry` table. Each uvicorn worker runs this
        # independently — registrations made through the admin API are
        # picked up on the worker that handled the request and on every
        # other worker at next startup.
        reload_external_instances(db)
    finally:
        db.close()

    await scheduler.start()
    yield
    # Shutdown
    await scheduler.stop()


app = FastAPI(
    title="WatchLens",
    description="A Configurable Platform for Online Video Recommendation Experiments",
    version="1.0.0",
    lifespan=lifespan,
)

# Rate limiting for /auth/login is done at nginx edge (see frontend/nginx.conf
# `limit_req_zone login_limit`). nginx shared memory works across all backend
# uvicorn workers where in-process memory would not.

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API router
app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
def health_check():
    return {"status": "healthy"}
