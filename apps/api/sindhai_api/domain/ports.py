from __future__ import annotations

from typing import Protocol, runtime_checkable

from sindhai_api.domain.entities import NoteDetail, NoteSummary


@runtime_checkable
class VaultRepository(Protocol):
    def read_note_detail(self, note_id: str) -> NoteDetail:
        ...

    def read_note_detail_by_path(self, note_path: str) -> NoteDetail:
        ...

    def list_summaries(self, q: str | None = None, tag: str | None = None) -> list[NoteSummary]:
        ...

    def create_note(self, path: str | None, title: str | None, content_markdown: str) -> NoteDetail:
        ...

    def write_note(self, note_path: str, content_markdown: str) -> NoteDetail:
        ...

    def delete_note(self, note_id: str) -> str:
        ...

    def rename_note(self, note_id: str, new_path: str) -> NoteDetail:
        ...

    def list_paths(self) -> list[str]:
        ...

    def generate_path(self, title: str | None) -> str:
        ...
