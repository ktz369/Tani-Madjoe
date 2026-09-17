from functools import lru_cache
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "TANDUR - SaaS Monitoring Pertanian"
    VERSION: str = "0.1.0"
    API_V1_PREFIX: str = "/api"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@db:5432/tani"

    # Security
    SECRET_KEY: str = "tani_super_secret_jwt_key_369_development"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # Google Earth Engine
    GEE_KEY_PATH: str = "/app/credentials/gee-key.json"
    GEE_SERVICE_ACCOUNT: str = ""
    GEE_PROJECT: str = ""

    # Mapbox
    MAPBOX_TOKEN: str = ""

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = ["*"]

    # Email / SMTP
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = "noreply@tani.ag"
    SMTP_TLS: bool = True
    FRONTEND_URL: str = "http://localhost:3000"


    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
