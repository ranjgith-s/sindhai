from __future__ import annotations

from dataclasses import dataclass

from ..parsing import normalize_link_target, parse_note
from ..vault import Vault
from .graph import GraphNote, Neo4jGraph
from .vector import QdrantIndex, VectorNote


@dataclass(frozen=True)
class CatalogEntry:
    id: str
    title: str
    path: str
    aliases: list[str]

    @property
    def stem(self) -> str:
        return self.path.rsplit("/", 1)[-1].removesuffix(".md")


def build_catalog(vault: Vault) -> list[CatalogEntry]:
    entries: list[CatalogEntry] = []
    for note_path in vault.list_paths():
        detail = vault.read_note_detail_by_path(note_path)
        entries.append(
            CatalogEntry(
                id=detail.id,
                title=detail.title,
                path=detail.path,
                aliases=detail.aliases,
            )
        )
    return entries


def resolve_wikilinks(note_id: str, vault: Vault, catalog: list[CatalogEntry]) -> tuple[list[CatalogEntry], dict]:
    detail = vault.read_note_detail(note_id)
    parsed = parse_note(detail.content_markdown)

    title_map: dict[str, list[CatalogEntry]] = {}
    alias_map: dict[str, list[CatalogEntry]] = {}
    stem_map: dict[str, list[CatalogEntry]] = {}
    for e in catalog:
        title_map.setdefault(normalize_link_target(e.title), []).append(e)
        for a in e.aliases:
            alias_map.setdefault(normalize_link_target(a), []).append(e)
        stem_map.setdefault(e.stem, []).append(e)

    resolved: dict[str, CatalogEntry] = {}
    ambiguous: list[dict] = []
    unresolved: list[dict] = []

    for wl in parsed.wiki_links:
        key = wl.target_normalized
        candidates = title_map.get(key) or alias_map.get(key) or stem_map.get(key) or []
        if len(candidates) == 1:
            resolved[candidates[0].id] = candidates[0]
        elif len(candidates) > 1:
            ambiguous.append(
                {
                    "target": wl.target_raw,
                    "candidates": [{"id": c.id, "title": c.title, "path": c.path} for c in candidates],
                }
            )
        else:
            unresolved.append({"target": wl.target_raw})

    meta = {"ambiguous": ambiguous, "unresolved": unresolved}
    return (list(resolved.values()), meta)


class Indexer:
    def __init__(self, vault: Vault, graph: Neo4jGraph, vectors: QdrantIndex) -> None:
        self.vault = vault
        self.graph = graph
        self.vectors = vectors

    def index_note(self, note_id: str) -> None:
        detail = self.vault.read_note_detail(note_id)
        graph_note = GraphNote(
            id=detail.id,
            title=detail.title,
            path=detail.path,
            updated_at=detail.updated_at,
            tags=detail.tags,
            content_hash=detail.content_hash,
        )
        parse_error = detail.frontmatter_error
        prev_hash = self.graph.note_content_hash(note_id) if self.graph.enabled() else None
        content_changed = prev_hash != detail.content_hash

        # Always upsert the note node so metadata (path/title/updated_at) stays current.
        # Only replace tags + outgoing links when content_hash changes and parsing is successful.
        update_tags_and_links = content_changed and parse_error is None
        self.graph.upsert_note(graph_note, parse_error=parse_error, update_tags=update_tags_and_links)

        if update_tags_and_links:
            catalog = build_catalog(self.vault)
            targets, _meta = resolve_wikilinks(note_id, self.vault, catalog)

            graph_targets: list[GraphNote] = []
            for t in targets:
                td = self.vault.read_note_detail(t.id)
                graph_targets.append(
                    GraphNote(
                        id=td.id,
                        title=td.title,
                        path=td.path,
                        updated_at=td.updated_at,
                        tags=td.tags,
                        content_hash=td.content_hash,
                    )
                )
            self.graph.replace_outgoing_links(note_id, graph_targets)

        snippet = detail.content_markdown[:280].replace("\n", " ").strip()
        vec_note = VectorNote(
            id=detail.id,
            title=detail.title,
            path=detail.path,
            updated_at=detail.updated_at,
            content_hash=detail.content_hash,
            text=f"{detail.title}\n\n{detail.content_markdown}",
            snippet=snippet,
        )
        self.vectors.upsert_note(vec_note)

    def delete_note(self, note_id: str) -> None:
        self.graph.delete_note(note_id)
        self.vectors.delete_note(note_id)

    def reindex_all(self) -> dict:
        count = 0
        for note_path in self.vault.list_paths():
            detail = self.vault.read_note_detail_by_path(note_path)
            self.index_note(detail.id)
            count += 1
        return {"ok": True, "count": count}
