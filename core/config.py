from __future__ import annotations
import logging
from functools import lru_cache
from typing import Literal

from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── App ───────────────────────────────────────────────────────────────────
    env: Literal["development", "production", "test"] = "development"
    debug: bool = True
    backend_host: str = "0.0.0.0"
    backend_port: int = 5454

    # ── LLM defaults (overridable via DB AppSetting "llm.default") ────────────
    default_llm_provider: str = "google"
    default_llm_model: str = ""  # blank → use provider's default_model
    default_llm_temperature: float = 0.4

    # ── LLM providers ─────────────────────────────────────────────────────────
    google_api_key: str = ""
    google_client_secret: str = ""
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    deepseek_api_key: str = ""
    openrouter_api_key: str = ""
    ollama_base_url: str = "http://localhost:11434"
    base_url: str = ""
    tavily_api_key: str = ""

    # ── Composio Tool Router ──────────────────────────────────────────────────
    composio_api_key: str = ""
    composio_user_id: str = ""

    # ── OAuth credential storage ──────────────────────────────────────────────
    # 32-byte key, base64-url-encoded. Generate with:
    #   python -c "import os,base64; print(base64.urlsafe_b64encode(os.urandom(32)).decode())"
    oauth_encryption_key: str = ""

    # ── GitHub OAuth ──────────────────────────────────────────────────────────
    github_client_id: str = ""
    github_client_secret: str = ""
    google_oauth_client_id: str = "95116700360-13ege5jmfrjjt4vmd86oh00eu5jlei5e.apps.googleusercontent.com"

    # ── PostgreSQL ────────────────────────────────────────────────────────────
    postgres_host: str = "localhost"
    postgres_port: int = 5433
    postgres_db: str = "agentic_memory"
    postgres_user: str = "agentic"
    postgres_password: str = "agentic_secret"

    # ── Neo4j ─────────────────────────────────────────────────────────────────
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "neo4j_secret"

    # ── OpenSearch ────────────────────────────────────────────────────────────
    opensearch_host: str = "localhost"
    opensearch_port: int = 9201

    # ── Computed ──────────────────────────────────────────────────────────────

    @computed_field  # type: ignore[prop-decorator]
    @property
    def postgres_dsn(self) -> str:
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def opensearch_url(self) -> str:
        return f"http://{self.opensearch_host}:{self.opensearch_port}"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def logging_level(self) -> int:
        return logging.DEBUG if self.debug else logging.INFO


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


# ── Logging ────────────────────────────────────────────────────────────────────

logging.basicConfig(level=get_settings().logging_level)
logger = logging.getLogger(__name__)


def get_logger(name: str) -> logging.Logger:
    l = logging.getLogger(name)
    l.setLevel(get_settings().logging_level)
    return l
