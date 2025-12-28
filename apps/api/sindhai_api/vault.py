from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

from .parsing import ParsedNote, parse_note
from .util import (
    atomic_write_json,
    atomic_write_text,
    normalize_newlines_for_hash,
    rfc3339_from_timestamp,
    safe_filename_stem,
    sha256_hex,
)


class PathError(ValueError):
    pass


def normalize_note_path(path: str) -> str:
    if "\x00" in path:
        raise PathError("path_contains_nul")

    cleaned = path.strip().replace("\\", "/")
    if not cleaned:
        raise PathError("path_empty")

    p = PurePosixPath(cleaned)
    if p.is_absolute():
        raise PathError("path_absolute_not_allowed")
    if ".." in p.parts:
        raise PathError("path_traversal_not_allowed")
    if p.parts and p.parts[0] == ".sindhai":
        raise PathError("path_reserved")

    if p.suffix.lower() != ".md":
        p = p.with_suffix(".md")

    return p.as_posix()


def extract_title(frontmatter: dict, path: str) -> str:
    title = frontmatter.get("title")
    if isinstance(title, str) and title.strip():
        return title.strip()
    return PurePosixPath(path).stem


def extract_aliases(frontmatter: dict) -> list[str]:
    raw = frontmatter.get("aliases")
    if raw is None:
        return []
    if isinstance(raw, str):
        values = [raw]
    elif isinstance(raw, list):
        values = [v for v in raw if isinstance(v, str)]
    else:
        return []
    return [v.strip() for v in values if v.strip()]


@dataclass(frozen=True)
class NoteSummary:
    id: str
    title: str
    path: str
    updated_at: str
    tags: list[str]


@dataclass(frozen=True)
class NoteDetail:
    id: str
    title: str
    path: str
    content_markdown: str
    frontmatter: dict
    tags: list[str]
    updated_at: str
    content_hash: str
    frontmatter_error: str | None
    aliases: list[str]


class NoteIdIndex:
    def __init__(self, vault_dir: Path) -> None:
        self.vault_dir = vault_dir
        self.meta_dir = vault_dir / ".sindhai"
        self.path = self.meta_dir / "notes.json"

    def _load_mapping(self) -> dict[str, str]:
        if not self.path.exists():
            return {}
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return {str(k): str(v) for k, v in data.items()}
        except Exception:
            pass
        return {}

    def _write_mapping(self, mapping: dict[str, str]) -> None:
        self.meta_dir.mkdir(parents=True, exist_ok=True)
        atomic_write_json(self.path, mapping)

    def ensure_id_for_path(self, note_path: str) -> str:
        mapping = self._load_mapping()
        existing = mapping.get(note_path)
        if existing:
            return existing
        new_id = str(uuid.uuid4())
        mapping[note_path] = new_id
        self._write_mapping(mapping)
        return new_id

    def delete_path(self, note_path: str) -> None:
        mapping = self._load_mapping()
        if note_path in mapping:
            mapping.pop(note_path, None)
            self._write_mapping(mapping)

    def resolve_path(self, note_id: str) -> str | None:
        mapping = self._load_mapping()
        for path, mapped_id in mapping.items():
            if mapped_id == note_id:
                return path
        return None

    def rename_path(self, old_path: str, new_path: str) -> None:
        mapping = self._load_mapping()
        note_id = mapping.get(old_path)
        if not note_id:
            note_id = str(uuid.uuid4())
        mapping.pop(old_path, None)
        mapping[new_path] = note_id
        self._write_mapping(mapping)


class Vault:
    def __init__(self, vault_dir: Path) -> None:
        self.vault_dir = vault_dir
        self.ids = NoteIdIndex(vault_dir)

    def _abs_path(self, note_path: str) -> Path:
        return (self.vault_dir / PurePosixPath(note_path)).resolve()

    def _ensure_under_vault(self, abs_path: Path) -> None:
        if self.vault_dir not in abs_path.parents and abs_path != self.vault_dir:
            raise PathError("path_outside_vault")

    def list_paths(self) -> list[str]:
        if not self.vault_dir.exists():
            return []
        paths: list[str] = []
        for p in self.vault_dir.rglob("*.md"):
            rel = p.relative_to(self.vault_dir).as_posix()
            if rel.startswith(".sindhai/"):
                continue
            paths.append(rel)
        return sorted(paths)

    def read_note_detail_by_path(self, note_path: str) -> NoteDetail:
        abs_path = self._abs_path(note_path)
        self._ensure_under_vault(abs_path)
        if not abs_path.exists():
            raise FileNotFoundError(note_path)
        content = abs_path.read_text(encoding="utf-8")
        parsed: ParsedNote = parse_note(content)
        note_id = self.ids.ensure_id_for_path(note_path)
        updated_at = rfc3339_from_timestamp(abs_path.stat().st_mtime)
        content_hash = sha256_hex(normalize_newlines_for_hash(content))
        title = extract_title(parsed.frontmatter, note_path)
        aliases = extract_aliases(parsed.frontmatter)
        return NoteDetail(
            id=note_id,
            title=title,
            path=note_path,
            content_markdown=content,
            frontmatter=parsed.frontmatter,
            tags=parsed.tags,
            updated_at=updated_at,
            content_hash=content_hash,
            frontmatter_error=parsed.frontmatter_error,
            aliases=aliases,
        )

    def read_note_detail(self, note_id: str) -> NoteDetail:
        note_path = self.ids.resolve_path(note_id)
        if not note_path:
            raise FileNotFoundError(note_id)
        return self.read_note_detail_by_path(note_path)

    def list_summaries(self, q: str | None = None, tag: str | None = None) -> list[NoteSummary]:
        summaries: list[NoteSummary] = []
        wanted_tag = tag.strip().lower() if tag else None
        needle = q.strip().lower() if q else None
        for note_path in self.list_paths():
            detail = self.read_note_detail_by_path(note_path)
            if wanted_tag and wanted_tag not in detail.tags:
                continue
            if needle and needle not in detail.title.lower() and needle not in detail.path.lower():
                continue
            summaries.append(
                NoteSummary(
                    id=detail.id,
                    title=detail.title,
                    path=detail.path,
                    updated_at=detail.updated_at,
                    tags=detail.tags,
                )
            )
        summaries.sort(key=lambda n: n.updated_at, reverse=True)
        return summaries

    def generate_path(self, title: str | None) -> str:
        stem = safe_filename_stem(title or "Untitled")
        base = PurePosixPath(stem).with_suffix(".md").as_posix()
        candidate = base
        idx = 2
        while self._abs_path(candidate).exists():
            candidate = PurePosixPath(stem + f"-{idx}").with_suffix(".md").as_posix()
            idx += 1
        return candidate

    def write_note(self, note_path: str, content_markdown: str) -> NoteDetail:
        abs_path = self._abs_path(note_path)
        self._ensure_under_vault(abs_path)
        atomic_write_text(abs_path, content_markdown)
        return self.read_note_detail_by_path(note_path)

    def create_note(self, path: str | None, title: str | None, content_markdown: str) -> NoteDetail:
        note_path = normalize_note_path(path) if path else self.generate_path(title)
        abs_path = self._abs_path(note_path)
        self._ensure_under_vault(abs_path)
        if abs_path.exists():
            raise FileExistsError(note_path)
        return self.write_note(note_path, content_markdown)

    def delete_note(self, note_id: str) -> str:
        note_path = self.ids.resolve_path(note_id)
        if not note_path:
            raise FileNotFoundError(note_id)
        abs_path = self._abs_path(note_path)
        self._ensure_under_vault(abs_path)
        if abs_path.exists():
            abs_path.unlink()
        self.ids.delete_path(note_path)
        return note_path

    def rename_note(self, note_id: str, new_path: str) -> NoteDetail:
        new_path_norm = normalize_note_path(new_path)
        old_path = self.ids.resolve_path(note_id)
        if not old_path:
            raise FileNotFoundError(note_id)

        old_abs = self._abs_path(old_path)
        new_abs = self._abs_path(new_path_norm)
        self._ensure_under_vault(old_abs)
        self._ensure_under_vault(new_abs)
        if not old_abs.exists():
            raise FileNotFoundError(old_path)
        if new_abs.exists():
            raise FileExistsError(new_path_norm)
        new_abs.parent.mkdir(parents=True, exist_ok=True)
        old_abs.replace(new_abs)
        self.ids.rename_path(old_path, new_path_norm)
        return self.read_note_detail(note_id)

