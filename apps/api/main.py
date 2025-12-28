from __future__ import annotations

from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

from sindhai_api.config import load_settings
from sindhai_api.indexing.graph import Neo4jGraph
from sindhai_api.indexing.indexer import Indexer
from sindhai_api.indexing.vector import QdrantIndex, VectorNote
from sindhai_api.parsing import parse_frontmatter, render_markdown_with_frontmatter
from sindhai_api.util import normalize_newlines_for_hash, sha256_hex
from sindhai_api.vault import PathError, Vault

app = FastAPI(title="Sindhai API", version="0.0.0")

settings = load_settings()
vault = Vault(settings.vault_dir)
graph = Neo4jGraph(settings.neo4j_uri, settings.neo4j_username, settings.neo4j_password)
vectors = QdrantIndex(settings.qdrant_url)
indexer = Indexer(vault=vault, graph=graph, vectors=vectors)


class NoteSummaryOut(BaseModel):
    id: str
    title: str
    path: str
    updated_at: str
    tags: list[str] = Field(default_factory=list)


class NoteDetailOut(BaseModel):
    id: str
    title: str
    path: str
    content_markdown: str
    frontmatter: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)
    updated_at: str
    content_hash: str
    frontmatter_error: str | None = None


class RelatedNoteOut(NoteSummaryOut):
    score: float
    snippet: str = ""


class NoteGetOut(BaseModel):
    note: NoteDetailOut
    backlinks: list[NoteSummaryOut] = Field(default_factory=list)
    related_notes: list[RelatedNoteOut] = Field(default_factory=list)


class NoteCreateIn(BaseModel):
    path: str | None = None
    title: str | None = None
    content_markdown: str
    frontmatter: dict[str, Any] | None = None


class NoteUpdateIn(BaseModel):
    path: str | None = None
    content_markdown: str | None = None
    frontmatter: dict[str, Any] | None = None


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/notes")
def list_notes(
    limit: int = Query(100, ge=1, le=500),
    cursor: int = Query(0, ge=0),
    tag: str | None = None,
    q: str | None = None,
):
    items = vault.list_summaries(q=q, tag=tag)
    page = items[cursor : cursor + limit]
    next_cursor = cursor + limit if cursor + limit < len(items) else None
    return {"items": [NoteSummaryOut(**p.__dict__).model_dump() for p in page], "next_cursor": next_cursor}


@app.post("/notes", response_model=NoteDetailOut)
def create_note(payload: NoteCreateIn):
    try:
        content = payload.content_markdown
        if payload.frontmatter is not None:
            body = parse_frontmatter(content).body
            content = render_markdown_with_frontmatter(payload.frontmatter, body)
        detail = vault.create_note(payload.path, payload.title, content)
        indexer.index_note(detail.id)
        return NoteDetailOut(**detail.__dict__)
    except PathError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except FileExistsError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e


@app.get("/notes/{note_id}", response_model=NoteGetOut)
def get_note(note_id: str):
    try:
        detail = vault.read_note_detail(note_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail="note_not_found") from e

    backlinks: list[NoteSummaryOut] = []
    for n in graph.backlinks(note_id):
        backlinks.append(
            NoteSummaryOut(
                id=n.get("id"),
                title=n.get("title"),
                path=n.get("path"),
                updated_at=n.get("updated_at"),
                tags=n.get("tags") or [],
            )
        )

    snippet = detail.content_markdown[:280].replace("\n", " ").strip()
    related = vectors.related(
        VectorNote(
            id=detail.id,
            title=detail.title,
            path=detail.path,
            updated_at=detail.updated_at,
            content_hash=detail.content_hash,
            text=f"{detail.title}\n\n{detail.content_markdown}",
            snippet=snippet,
        ),
        limit=10,
    )

    related_out = [
        RelatedNoteOut(
            id=r["id"],
            title=r.get("title") or "",
            path=r.get("path") or "",
            updated_at=r.get("updated_at") or "",
            tags=[],
            score=r.get("score") or 0.0,
            snippet=r.get("snippet") or "",
        )
        for r in related
    ]

    return NoteGetOut(note=NoteDetailOut(**detail.__dict__), backlinks=backlinks, related_notes=related_out)


@app.put("/notes/{note_id}", response_model=NoteDetailOut)
def update_note(note_id: str, payload: NoteUpdateIn):
    try:
        if payload.path:
            vault.rename_note(note_id, payload.path)

        if payload.content_markdown is not None or payload.frontmatter is not None:
            existing = vault.read_note_detail(note_id)
            if payload.content_markdown is None:
                parsed_existing = parse_frontmatter(existing.content_markdown)
                body = parsed_existing.body
                frontmatter = payload.frontmatter or parsed_existing.frontmatter
                content = render_markdown_with_frontmatter(frontmatter, body)
            else:
                content = payload.content_markdown
                if payload.frontmatter is not None:
                    body = parse_frontmatter(content).body
                    content = render_markdown_with_frontmatter(payload.frontmatter, body)

            content_hash = sha256_hex(normalize_newlines_for_hash(content))
            if content_hash != existing.content_hash or payload.frontmatter is not None:
                vault.write_note(existing.path, content)

        detail = vault.read_note_detail(note_id)
        indexer.index_note(note_id)
        return NoteDetailOut(**detail.__dict__)
    except PathError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail="note_not_found") from e
    except FileExistsError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e


@app.delete("/notes/{note_id}")
def delete_note(note_id: str):
    try:
        vault.delete_note(note_id)
        indexer.delete_note(note_id)
        return {"ok": True}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail="note_not_found") from e


@app.get("/notes/{note_id}/backlinks")
def backlinks(note_id: str):
    items = []
    for n in graph.backlinks(note_id):
        items.append(
            NoteSummaryOut(
                id=n.get("id"),
                title=n.get("title"),
                path=n.get("path"),
                updated_at=n.get("updated_at"),
                tags=n.get("tags") or [],
            ).model_dump()
        )
    return {"items": items}


@app.get("/graph/local")
def graph_local(noteId: str, depth: int = Query(1, ge=1, le=3)):
    # MVP implements depth=1.
    _ = depth
    nodes, edges = graph.local_graph(noteId)
    return {"nodes": nodes, "edges": edges}


@app.get("/search")
def search(
    query: str,
    mode: Literal["hybrid", "keyword", "semantic"] = "hybrid",
    limit: int = Query(20, ge=1, le=100),
):
    needle = query.strip()
    if not needle:
        return {"items": []}

    def keyword_items() -> list[dict]:
        out: list[dict] = []
        ql = needle.lower()
        for note_path in vault.list_paths():
            detail = vault.read_note_detail_by_path(note_path)
            hay = (detail.title + "\n" + detail.path + "\n" + detail.content_markdown).lower()
            if ql not in hay:
                continue
            snippet = detail.content_markdown[:280].replace("\n", " ").strip()
            out.append(
                {
                    "id": detail.id,
                    "title": detail.title,
                    "path": detail.path,
                    "snippet": snippet,
                    "score": 1.0,
                }
            )
        return out[:limit]

    items: list[dict] = []
    if mode in {"semantic", "hybrid"}:
        items.extend(vectors.search(needle, limit=limit))
    if mode in {"keyword", "hybrid"}:
        items.extend(keyword_items())

    merged: dict[str, dict] = {}
    for it in items:
        nid = it.get("id")
        if not nid:
            continue
        cur = merged.get(nid)
        if not cur:
            merged[nid] = it
            continue
        cur["score"] = max(float(cur.get("score") or 0.0), float(it.get("score") or 0.0))
        if not cur.get("snippet") and it.get("snippet"):
            cur["snippet"] = it["snippet"]

    ranked = sorted(merged.values(), key=lambda x: float(x.get("score") or 0.0), reverse=True)[:limit]
    return {"items": ranked}


@app.post("/admin/reindex-all")
def reindex_all():
    return indexer.reindex_all()

