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


def load_settings() -> Settings:
    vault_dir = Path(os.environ.get("VAULT_DIR", "./vault")).resolve()
    neo4j_uri = os.environ.get("NEO4J_URI")
    neo4j_username = os.environ.get("NEO4J_USERNAME")
    neo4j_password = os.environ.get("NEO4J_PASSWORD")
    qdrant_url = os.environ.get("QDRANT_URL")
    ai_external_enabled = os.environ.get("AI_EXTERNAL_ENABLED", "false").lower() == "true"
    return Settings(
        vault_dir=vault_dir,
        neo4j_uri=neo4j_uri,
        neo4j_username=neo4j_username,
        neo4j_password=neo4j_password,
        qdrant_url=qdrant_url,
        ai_external_enabled=ai_external_enabled,
    )

