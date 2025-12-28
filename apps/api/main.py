import os
from pathlib import Path

from fastapi import FastAPI

app = FastAPI(title="Sindhai API", version="0.0.0")


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/notes")
def list_notes():
    vault_dir = Path(os.environ.get("VAULT_DIR", "./vault")).resolve()
    if not vault_dir.exists():
        return {"vault_dir": str(vault_dir), "notes": []}
    notes = sorted(p.relative_to(vault_dir).as_posix() for p in vault_dir.rglob("*.md"))
    return {"vault_dir": str(vault_dir), "notes": notes}

