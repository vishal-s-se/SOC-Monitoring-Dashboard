from pydantic_settings import BaseSettings, SettingsConfigDict

class CollectorSettings(BaseSettings):
    @property
    def get_db_url(self):
        return self.DATABASE_URL.replace('postgresql://', 'postgresql+asyncpg://')
    PROJECT_NAME: str = "SOC Collector"
    COLLECTOR_PORT: int = 5000
    AGENT_SHARED_SECRET: str = "changeme_secret" # Default fallback for local dev
    DATABASE_URL: str = "postgresql+asyncpg://postgres:Vishal%402006@localhost:5432/soc_monitor"

    model_config = SettingsConfigDict(env_file="../.env", env_file_encoding="utf-8", extra="ignore")

settings = CollectorSettings()
