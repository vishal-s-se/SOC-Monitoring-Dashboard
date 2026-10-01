import secrets
from typing import List, Optional

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

UNSAFE_SECRETS = {
    "",
    "changeme",
    "changeme_secret",
    "SUPER_SECRET_KEY_REPLACE_IN_PRODUCTION",
    "dev-only-insecure-secret",
    "secret",
    "password",
}


class Settings(BaseSettings):
    PROJECT_NAME: str = "SOC Monitor"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"

    ENVIRONMENT: str = "development"
    DEBUG: bool = False
    HTTPS_ENABLED: bool = False

    REDIS_URL: str = "redis://localhost:6379/0"
    DATABASE_URL: str = "postgresql://localhost:5432/soc_monitor"

    SECRET_KEY: str = Field(default_factory=lambda: secrets.token_urlsafe(32))
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    CORS_ORIGINS: str = "http://localhost:3000"

    MAX_REQUEST_BODY_BYTES: int = 1_048_576
    RATE_LIMIT_ENABLED: bool = True
    API_RATE_LIMIT_PER_MINUTE: int = 300
    LOGIN_RATE_LIMIT_PER_MINUTE: int = 5
    EXPENSIVE_RATE_LIMIT_PER_MINUTE: int = 30
    WS_MAX_CONNECTIONS: int = 50
    WS_MAX_MESSAGE_BYTES: int = 4096

    BOOTSTRAP_ADMIN_USERNAME: Optional[str] = None
    BOOTSTRAP_ADMIN_PASSWORD: Optional[str] = None
    BOOTSTRAP_ADMIN_EMAIL: Optional[str] = None

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("ENVIRONMENT")
    @classmethod
    def normalize_environment(cls, value: str) -> str:
        return (value or "development").strip().lower()

    @property
    def cors_origin_list(self) -> List[str]:
        origins = [item.strip() for item in self.CORS_ORIGINS.split(",") if item.strip()]
        return origins or ["http://localhost:3000"]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @model_validator(mode="after")
    def validate_environment_safety(self):
        if self.is_production:
            if self.DEBUG:
                raise ValueError("DEBUG must be disabled in production")
            if self.SECRET_KEY in UNSAFE_SECRETS:
                raise ValueError("SECRET_KEY must be set to a strong unique value in production")
            if "*" in self.cors_origin_list:
                raise ValueError("Wildcard CORS origins are not allowed in production")
            if "postgres:postgres@" in self.DATABASE_URL:
                raise ValueError("Default database credentials are not allowed in production")
            if not self.BOOTSTRAP_ADMIN_PASSWORD:
                pass
        return self


settings = Settings()
