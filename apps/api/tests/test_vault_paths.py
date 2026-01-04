import pytest

from sindhai_api.domain.exceptions import PathError
from sindhai_api.infrastructure.persistence.file_vault import normalize_note_path


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Note", "Note.md"),
        ("folder/note", "folder/note.md"),
        ("folder\\note.md", "folder/note.md"),
    ],
)
def test_normalize_note_path(raw: str, expected: str) -> None:
    assert normalize_note_path(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "/abs.md",
        "../escape.md",
        "a/../escape.md",
        ".sindhai/notes.md",
        "",
    ],
)
def test_normalize_note_path_rejects_invalid(raw: str) -> None:
    with pytest.raises(PathError):
        normalize_note_path(raw)

