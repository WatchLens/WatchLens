from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql://watchlens:watchlens@localhost:5432/watchlens"

    # Auth
    SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_DAYS: int = 7

    # Admin bootstrap
    ADMIN_LOGIN_ID: str = "admin"
    ADMIN_PASSWORD: str

    # Data serving (videos, thumbnails, etc.)
    DATA_BASE_URL: str = "/data"

    # RecBole training scheduler
    RECBOLE_FIT_PERIOD_MINUTES: int = 60
    RECBOLE_MIN_INTERACTIONS: int = 50
    RECBOLE_CACHE_EXPIRE_HOURS: int = 72

    # Cookie
    COOKIE_SECURE: bool = True  # Set False for local HTTP dev

    # CORS allow-list. Defaults to local dev origins; override in
    # production via the CORS_ORIGINS env var (JSON list, e.g.
    # CORS_ORIGINS='["https://study.example.org"]').
    CORS_ORIGINS: list[str] = [
        "http://localhost",
        "http://localhost:80",
        "http://localhost:8080",
        "http://127.0.0.1",
        "http://127.0.0.1:80",
        "http://127.0.0.1:8080",
    ]

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
