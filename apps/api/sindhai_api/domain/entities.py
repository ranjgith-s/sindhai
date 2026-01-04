from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class NoteSummary:
    id: str
    title: str
    path: str
    created_at: str
    updated_at: str
    tags: list[str]
    aliases: list[str]


@dataclass(frozen=True)
class NoteDetail:
    id: str
    title: str
    path: str
    content_markdown: str
    frontmatter: dict
    tags: list[str]
    created_at: str
    updated_at: str
    content_hash: str
    frontmatter_error: str | None
    aliases: list[str]
