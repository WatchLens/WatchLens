from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql://openrecui:openrecui@localhost:5432/openrecui"

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

    # CORS — production only; localhost origins removed for deployed build.
    CORS_ORIGINS: list[str] = [
        "https://openrecui.legenduck.me",
    ]

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
