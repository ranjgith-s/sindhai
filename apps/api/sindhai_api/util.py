from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path


def rfc3339_from_timestamp(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def normalize_newlines_for_hash(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n")


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def atomic_write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_name(f".{path.name}.tmp.{os.getpid()}")
    tmp_path.write_text(content, encoding="utf-8")
    tmp_path.replace(path)


def atomic_write_json(path: Path, data: object) -> None:
    atomic_write_text(path, json.dumps(data, indent=2, sort_keys=True) + "\n")


_SAFE_STEM_RE = re.compile(r"[^a-zA-Z0-9]+")


def safe_filename_stem(title: str) -> str:
    cleaned = _SAFE_STEM_RE.sub("-", title.strip()).strip("-")
    return cleaned or "Untitled"

