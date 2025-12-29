from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    vault_dir: Path
    neo4j_uri: str | None
    neo4j_username: str | None
    neo4j_password: str | None
    qdrant_url: str | None
    ai_external_enabled: bool
    openai_base_url: str
    openai_api_key: str | None
    openai_model: str
    perplexity_base_url: str
    perplexity_api_key: str | None
    perplexity_model: str
    ai_external_max_chars: int


def load_settings() -> Settings:
    vault_dir = Path(os.environ.get("VAULT_DIR", "./vault")).resolve()
    neo4j_uri = os.environ.get("NEO4J_URI")
    neo4j_username = os.environ.get("NEO4J_USERNAME")
    neo4j_password = os.environ.get("NEO4J_PASSWORD")
    qdrant_url = os.environ.get("QDRANT_URL")
    ai_external_enabled = os.environ.get("AI_EXTERNAL_ENABLED", "false").lower() == "true"
    openai_base_url = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com")
    openai_api_key = os.environ.get("OPENAI_API_KEY")
    openai_model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    perplexity_base_url = os.environ.get("PERPLEXITY_BASE_URL", "https://api.perplexity.ai")
    perplexity_api_key = os.environ.get("PERPLEXITY_API_KEY")
    perplexity_model = os.environ.get("PERPLEXITY_MODEL", "sonar")
    ai_external_max_chars = int(os.environ.get("AI_EXTERNAL_MAX_CHARS", "20000"))
    return Settings(
        vault_dir=vault_dir,
        neo4j_uri=neo4j_uri,
        neo4j_username=neo4j_username,
        neo4j_password=neo4j_password,
        qdrant_url=qdrant_url,
        ai_external_enabled=ai_external_enabled,
        openai_base_url=openai_base_url,
        openai_api_key=openai_api_key,
        openai_model=openai_model,
        perplexity_base_url=perplexity_base_url,
        perplexity_api_key=perplexity_api_key,
        perplexity_model=perplexity_model,
        ai_external_max_chars=ai_external_max_chars,
    )
