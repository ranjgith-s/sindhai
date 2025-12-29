from __future__ import annotations

from dataclasses import dataclass

from sindhai_api.indexing.indexer import Indexer
from sindhai_api.vault import Vault


@dataclass
class _GraphCall:
    kind: str
    note_id: str
    update_tags: bool | None = None
    parse_error: str | None = None
    targets: list[str] | None = None


class FakeGraph:
    def __init__(self) -> None:
        self.notes: dict[str, dict] = {}
        self.calls: list[_GraphCall] = []

    def enabled(self) -> bool:
        return True

    def note_content_hash(self, note_id: str) -> str | None:
        return self.notes.get(note_id, {}).get("content_hash")

    def upsert_note(self, note, *, parse_error: str | None, update_tags: bool) -> None:
        cur = self.notes.get(note.id, {})
        cur.update(
            {
                "content_hash": note.content_hash,
                "title": note.title,
                "path": note.path,
                "updated_at": note.updated_at,
                "parse_error": parse_error,
            }
        )
        if update_tags:
            cur["tags"] = list(note.tags)
        self.notes[note.id] = cur
        self.calls.append(_GraphCall("upsert_note", note.id, update_tags=update_tags, parse_error=parse_error))

    def replace_outgoing_links(self, note_id: str, targets) -> None:
        self.notes.setdefault(note_id, {})["links"] = [t.id for t in targets]
        self.calls.append(_GraphCall("replace_links", note_id, targets=[t.id for t in targets]))

    def delete_note(self, note_id: str) -> None:
        self.notes.pop(note_id, None)
        self.calls.append(_GraphCall("delete_note", note_id))


class FakeVectors:
    def __init__(self) -> None:
        self.records: dict[str, dict] = {}
        self.embed_count = 0

    def enabled(self) -> bool:
        return True

    def upsert_note(self, note) -> None:
        existing = self.records.get(note.id)
        if existing and existing.get("content_hash") == note.content_hash:
            existing.update({"title": note.title, "path": note.path, "updated_at": note.updated_at})
            return
        self.embed_count += 1
        self.records[note.id] = {
            "content_hash": note.content_hash,
            "title": note.title,
            "path": note.path,
            "updated_at": note.updated_at,
        }

    def delete_note(self, note_id: str) -> None:
        self.records.pop(note_id, None)

    def search(self, query: str, limit: int = 20) -> list[dict]:
        _ = (query, limit)
        return []

    def related(self, note, limit: int = 10) -> list[dict]:
        _ = (note, limit)
        return []


def test_indexer_skips_link_replacement_when_content_hash_unchanged(tmp_path) -> None:
    vault = Vault(tmp_path)
    graph = FakeGraph()
    vectors = FakeVectors()
    indexer = Indexer(vault=vault, graph=graph, vectors=vectors)

    d1 = vault.create_note(path="a.md", title=None, content_markdown="Hello [[b]]\n")
    indexer.index_note(d1.id)
    assert [c.kind for c in graph.calls] == ["upsert_note", "replace_links"]
    assert vectors.embed_count == 1

    graph.calls.clear()
    d2 = vault.rename_note(d1.id, "renamed.md")
    assert d2.content_hash == d1.content_hash
    indexer.index_note(d1.id)

    # Upsert note metadata runs, but outgoing links should not be replaced and vectors should not re-embed.
    assert [c.kind for c in graph.calls] == ["upsert_note"]
    assert vectors.embed_count == 1


def test_indexer_preserves_last_known_good_links_on_parse_failure(tmp_path) -> None:
    vault = Vault(tmp_path)
    graph = FakeGraph()
    vectors = FakeVectors()
    indexer = Indexer(vault=vault, graph=graph, vectors=vectors)

    a = vault.create_note(path="a.md", title=None, content_markdown="Hello [[b]]\n")
    b = vault.create_note(path="b.md", title=None, content_markdown="Hi\n")
    indexer.index_note(a.id)
    assert graph.notes[a.id]["links"] == [b.id]

    # Now introduce a frontmatter YAML error; indexing should not mutate outgoing edges/tags.
    bad = "---\ntags: [oops\n---\nHello [[b]] #tag\n"
    vault.write_note("a.md", bad)
    graph.calls.clear()
    indexer.index_note(a.id)

    assert [c.kind for c in graph.calls] == ["upsert_note"]
    assert graph.notes[a.id]["links"] == [b.id]
    assert graph.notes[a.id]["parse_error"] == "frontmatter_yaml_error"
