import json

from sindhai_api.vault import Vault


def test_created_at_persists_across_update_rename_delete(tmp_path) -> None:
    vault = Vault(tmp_path)

    d1 = vault.create_note(path="a.md", title=None, content_markdown="hello\n")
    assert d1.created_at
    assert d1.updated_at

    d2 = vault.write_note(d1.path, "hello again\n")
    assert d2.id == d1.id
    assert d2.created_at == d1.created_at

    d3 = vault.rename_note(d1.id, "b.md")
    assert d3.id == d1.id
    assert d3.path == "b.md"
    assert d3.created_at == d1.created_at

    notes_path = tmp_path / ".sindhai" / "notes.json"
    mapping = json.loads(notes_path.read_text(encoding="utf-8"))
    assert "a.md" not in mapping
    assert mapping["b.md"] == d1.id

    meta_path = tmp_path / ".sindhai" / "note_meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    assert meta[d1.id]["created_at"] == d1.created_at

    vault.delete_note(d1.id)
    mapping2 = json.loads(notes_path.read_text(encoding="utf-8"))
    assert "b.md" not in mapping2

    meta2 = json.loads(meta_path.read_text(encoding="utf-8"))
    assert d1.id not in meta2

