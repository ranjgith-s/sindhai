import logging
import time
import uuid
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse

from sindhai_api.ai.openai_compat import ExternalAIError, openai_chat_completion, perplexity_ask
from sindhai_api.ai.providers import Message
from sindhai_api.infrastructure.config import Settings
from sindhai_api.dependencies import get_graph, get_indexer, get_settings, get_vault, get_vectors
from sindhai_api.domain.schemas import (
    NoteCreateIn,
    NoteDetailOut,
    NoteGetOut,
    NoteSummaryOut,
    NoteUpdateIn,
    OpenAIChatIn,
    OpenAIChatOut,
    PerplexityAskIn,
    PerplexityAskOut,
    RelatedNoteOut,
    SuggestLinkOut,
    SuggestLinksOut,
    SuggestTagOut,
    SuggestTagsOut,
    SummarizeIn,
    SummarizeOut,
)
from sindhai_api.indexing.graph import Neo4jGraph
from sindhai_api.indexing.indexer import Indexer, build_catalog, resolve_wikilinks
from sindhai_api.indexing.vector import QdrantIndex, VectorNote
from sindhai_api.domain.parsing import parse_frontmatter, render_markdown_with_frontmatter
from sindhai_api.util import normalize_newlines_for_hash, rfc3339_now, sha256_hex
from sindhai_api.domain.exceptions import PathError
from sindhai_api.infrastructure.persistence.file_vault import FileVaultRepository as Vault

router = APIRouter()
logger = logging.getLogger("sindhai.api")


def _simple_local_summary(markdown: str, *, max_chars: int = 900) -> str:
    fm = parse_frontmatter(markdown)
    text = fm.body.strip()
    if not text:
        return ""
    lines = [ln.strip() for ln in text.splitlines()]
    paras: list[str] = []
    buf: list[str] = []
    for ln in lines:
        if not ln:
            if buf:
                paras.append(" ".join(buf).strip())
                buf = []
            continue
        buf.append(ln)
    if buf:
        paras.append(" ".join(buf).strip())
    summary = "\n\n".join(p for p in paras[:3] if p)
    return summary[:max_chars].rstrip()


@router.get("/health")
def health():
    return {"ok": True}


@router.get("/notes")
def list_notes(
    limit: int = Query(100, ge=1, le=500),
    cursor: int = Query(0, ge=0),
    tag: Optional[str] = None,
    q: Optional[str] = None,
    vault: Vault = Depends(get_vault),
):
    items = vault.list_summaries(q=q, tag=tag)
    page = items[cursor : cursor + limit]
    next_cursor = cursor + limit if cursor + limit < len(items) else None
    return {"items": [NoteSummaryOut(**p.__dict__).model_dump() for p in page], "next_cursor": next_cursor}


@router.post("/notes", response_model=NoteDetailOut)
def create_note(
    payload: NoteCreateIn,
    request: Request,
    vault: Vault = Depends(get_vault),
    indexer: Indexer = Depends(get_indexer),
):
    try:
        content = payload.content_markdown
        if payload.frontmatter is not None:
            body = parse_frontmatter(content).body
            content = render_markdown_with_frontmatter(payload.frontmatter, body)
        detail = vault.create_note(payload.path, payload.title, content)
        logger.info("note_create", extra={"rid": getattr(request.state, "request_id", ""), "id": detail.id, "path": detail.path})
        indexer.index_note(detail.id)
        return NoteDetailOut(**detail.__dict__)
    except PathError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except FileExistsError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e


@router.get("/notes/{note_id}", response_model=NoteGetOut)
def get_note(
    note_id: str,
    vault: Vault = Depends(get_vault),
    graph: Neo4jGraph = Depends(get_graph),
    vectors: QdrantIndex = Depends(get_vectors),
):
    try:
        detail = vault.read_note_detail(note_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail="note_not_found") from e

    backlinks: list[NoteSummaryOut] = []
    for n in graph.backlinks(note_id):
        bid = n.get("id")
        if not bid:
            continue
        try:
            bdetail = vault.read_note_detail(bid)
            backlinks.append(
                NoteSummaryOut(
                    id=bdetail.id,
                    title=bdetail.title,
                    path=bdetail.path,
                    created_at=bdetail.created_at,
                    updated_at=bdetail.updated_at,
                    tags=bdetail.tags,
                )
            )
        except FileNotFoundError:
            backlinks.append(
                NoteSummaryOut(
                    id=bid,
                    title=n.get("title") or "",
                    path=n.get("path") or "",
                    created_at="",
                    updated_at=n.get("updated_at") or "",
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

    related_out: list[RelatedNoteOut] = []
    for r in related:
        rid = r.get("id")
        if not rid:
            continue
        created_at = ""
        try:
            created_at = vault.read_note_detail(rid).created_at
        except FileNotFoundError:
            pass
        related_out.append(
            RelatedNoteOut(
                id=rid,
                title=r.get("title") or "",
                path=r.get("path") or "",
                created_at=created_at,
                updated_at=r.get("updated_at") or "",
                tags=[],
                score=r.get("score") or 0.0,
                snippet=r.get("snippet") or "",
            )
        )

    return NoteGetOut(note=NoteDetailOut(**detail.__dict__), backlinks=backlinks, related_notes=related_out)


@router.put("/notes/{note_id}", response_model=NoteDetailOut)
def update_note(
    note_id: str,
    payload: NoteUpdateIn,
    request: Request,
    vault: Vault = Depends(get_vault),
    indexer: Indexer = Depends(get_indexer),
):
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
        logger.info("note_update", extra={"rid": getattr(request.state, "request_id", ""), "id": detail.id, "path": detail.path})
        indexer.index_note(note_id)
        return NoteDetailOut(**detail.__dict__)
    except PathError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail="note_not_found") from e
    except FileExistsError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e


@router.delete("/notes/{note_id}")
def delete_note(
    note_id: str,
    request: Request,
    vault: Vault = Depends(get_vault),
    indexer: Indexer = Depends(get_indexer),
):
    try:
        path = vault.delete_note(note_id)
        logger.info("note_delete", extra={"rid": getattr(request.state, "request_id", ""), "id": note_id, "path": path})
        indexer.delete_note(note_id)
        return {"ok": True}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail="note_not_found") from e


@router.get("/notes/{note_id}/backlinks")
def backlinks(
    note_id: str,
    vault: Vault = Depends(get_vault),
    graph: Neo4jGraph = Depends(get_graph),
):
    items = []
    for n in graph.backlinks(note_id):
        bid = n.get("id")
        if not bid:
            continue
        try:
            bdetail = vault.read_note_detail(bid)
            items.append(
                NoteSummaryOut(
                    id=bdetail.id,
                    title=bdetail.title,
                    path=bdetail.path,
                    created_at=bdetail.created_at,
                    updated_at=bdetail.updated_at,
                    tags=bdetail.tags,
                ).model_dump()
            )
        except FileNotFoundError:
            items.append(
                NoteSummaryOut(
                    id=bid,
                    title=n.get("title") or "",
                    path=n.get("path") or "",
                    created_at="",
                    updated_at=n.get("updated_at") or "",
                    tags=n.get("tags") or [],
                ).model_dump()
            )
    return {"items": items}


@router.get("/graph/local")
def graph_local(
    noteId: str,
    depth: int = Query(1, ge=1, le=3),
    graph: Neo4jGraph = Depends(get_graph),
):
    # MVP implements depth=1.
    _ = depth
    nodes, edges = graph.local_graph(noteId)
    return {"nodes": nodes, "edges": edges}


@router.get("/search")
def search(
    query: str,
    mode: Literal["hybrid", "keyword", "semantic"] = "hybrid",
    limit: int = Query(20, ge=1, le=100),
    vault: Vault = Depends(get_vault),
    vectors: QdrantIndex = Depends(get_vectors),
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


@router.get("/ai/suggest-links", response_model=SuggestLinksOut)
def ai_suggest_links(
    noteId: str,
    k: int = Query(5, ge=1, le=50),
    vault: Vault = Depends(get_vault),
    vectors: QdrantIndex = Depends(get_vectors),
):
    try:
        detail = vault.read_note_detail(noteId)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail="note_not_found") from e

    if not vectors.enabled():
        return SuggestLinksOut(items=[])

    catalog = build_catalog(vault)
    existing_targets, _meta = resolve_wikilinks(noteId, vault, catalog)
    already_linked = {t.id for t in existing_targets}

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
        limit=min(100, k * 10),
    )

    out: list[SuggestLinkOut] = []
    for r in related:
        rid = r.get("id")
        if not rid or rid == noteId or rid in already_linked:
            continue
        out.append(SuggestLinkOut(id=rid, score=float(r.get("score") or 0.0)))
        if len(out) >= k:
            break
    return SuggestLinksOut(items=out)


@router.get("/ai/suggest-tags", response_model=SuggestTagsOut)
def ai_suggest_tags(
    noteId: str,
    k: int = Query(10, ge=1, le=50),
    vault: Vault = Depends(get_vault),
    vectors: QdrantIndex = Depends(get_vectors),
):
    try:
        detail = vault.read_note_detail(noteId)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail="note_not_found") from e

    if not vectors.enabled():
        return SuggestTagsOut(items=[])

    existing = set(detail.tags)
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
        limit=80,
    )

    scores: dict[str, float] = {}
    for r in related:
        rid = r.get("id")
        if not rid:
            continue
        score = float(r.get("score") or 0.0)
        try:
            rd = vault.read_note_detail(rid)
        except FileNotFoundError:
            continue
        for tag in rd.tags:
            if tag in existing:
                continue
            scores[tag] = scores.get(tag, 0.0) + score

    if not scores:
        return SuggestTagsOut(items=[])

    max_score = max(scores.values()) or 1.0
    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)[:k]
    return SuggestTagsOut(items=[SuggestTagOut(tag=t, confidence=s / max_score) for (t, s) in ranked])


@router.post("/ai/summarize", response_model=SummarizeOut)
def ai_summarize(
    payload: SummarizeIn,
    vault: Vault = Depends(get_vault),
    settings: Settings = Depends(get_settings),
):
    try:
        detail = vault.read_note_detail(payload.noteId)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail="note_not_found") from e

    if payload.mode == "external":
        if not settings.ai_external_enabled:
            raise HTTPException(status_code=403, detail="external_ai_disabled")

        text = parse_frontmatter(detail.content_markdown).body
        if len(text) > settings.ai_external_max_chars:
            raise HTTPException(status_code=400, detail="external_payload_too_large")

        provider = payload.provider or "openai"
        if provider == "perplexity":
            if not settings.perplexity_api_key:
                raise HTTPException(status_code=400, detail="provider_not_configured")
            sys = Message(role="system", content="Summarize the provided text as concise Markdown.")
            user = Message(role="user", content=text)
            try:
                resp, _cit = perplexity_ask(
                    base_url=settings.perplexity_base_url,
                    api_key=settings.perplexity_api_key,
                    model=settings.perplexity_model,
                    messages=[sys, user],
                )
            except ExternalAIError as e:
                raise HTTPException(status_code=502, detail=str(e)) from e
            return SummarizeOut(summary_markdown=resp.content.strip(), provider=resp.provider)

        if not settings.openai_api_key:
            raise HTTPException(status_code=400, detail="provider_not_configured")
        sys = Message(role="system", content="Summarize the provided text as concise Markdown.")
        user = Message(role="user", content=text)
        try:
            resp = openai_chat_completion(
                base_url=settings.openai_base_url,
                api_key=settings.openai_api_key,
                model=settings.openai_model,
                messages=[sys, user],
            )
        except ExternalAIError as e:
            raise HTTPException(status_code=502, detail=str(e)) from e
        return SummarizeOut(summary_markdown=resp.content.strip(), provider=resp.provider)

    summary = _simple_local_summary(detail.content_markdown)
    return SummarizeOut(summary_markdown=summary, provider="local:extractive")


@router.post("/admin/reindex-all")
def reindex_all(
    request: Request,
    indexer: Indexer = Depends(get_indexer),
):
    logger.info("reindex_all", extra={"rid": getattr(request.state, "request_id", "")})
    return indexer.reindex_all()


@router.post("/admin/reindex")
def admin_reindex(
    request: Request,
    indexer: Indexer = Depends(get_indexer),
):
    logger.info("reindex_all", extra={"rid": getattr(request.state, "request_id", "")})
    return indexer.reindex_all()


def _ensure_external_enabled(settings: Settings) -> None:
    if not settings.ai_external_enabled:
        raise HTTPException(status_code=403, detail="external_ai_disabled")


def _ensure_size_ok(chunks: list[str], settings: Settings) -> None:
    total = sum(len(c) for c in chunks if c)
    if total > settings.ai_external_max_chars:
        raise HTTPException(status_code=400, detail="external_payload_too_large")


@router.post("/integrations/openai/chat", response_model=OpenAIChatOut)
def integrations_openai_chat(
    payload: OpenAIChatIn,
    settings: Settings = Depends(get_settings),
):
    _ensure_external_enabled(settings)
    if not settings.openai_api_key:
        raise HTTPException(status_code=400, detail="provider_not_configured")

    context = (payload.context or "").strip()
    msgs = [Message(role=m.role, content=m.content) for m in payload.messages]
    _ensure_size_ok([context, *[m.content for m in msgs]], settings)
    if context:
        msgs = [Message(role="system", content=f"Context (user-selected):\n\n{context}"), *msgs]

    try:
        resp = openai_chat_completion(
            base_url=settings.openai_base_url,
            api_key=settings.openai_api_key,
            model=settings.openai_model,
            messages=msgs,
        )
    except ExternalAIError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    now = rfc3339_now()
    save_md = (
        "---\n"
        f"provider: {resp.provider}\n"
        f"generated_at: {now}\n"
        "tags:\n"
        "  - imported\n"
        "---\n\n"
        "## Prompt\n\n"
        + "\n\n".join(f"- **{m.role}**: {m.content}" for m in payload.messages if m.content.strip())
        + "\n\n## Response\n\n"
        + resp.content.strip()
    )
    return OpenAIChatOut(provider=resp.provider, content=resp.content.strip(), save_markdown=save_md)


@router.post("/integrations/perplexity/ask", response_model=PerplexityAskOut)
def integrations_perplexity_ask(
    payload: PerplexityAskIn,
    settings: Settings = Depends(get_settings),
):
    _ensure_external_enabled(settings)
    if not settings.perplexity_api_key:
        raise HTTPException(status_code=400, detail="provider_not_configured")

    q = payload.query.strip()
    if not q:
        raise HTTPException(status_code=400, detail="query_empty")

    context = (payload.context or "").strip()
    _ensure_size_ok([q, context], settings)

    sys = Message(
        role="system",
        content="Answer the question. Prefer Markdown. Include citations if the provider supports them.",
    )
    user = Message(role="user", content=(f"Question:\n{q}\n\n" + (f"Context (user-selected):\n{context}\n" if context else "")).strip())
    try:
        resp, citations = perplexity_ask(
            base_url=settings.perplexity_base_url,
            api_key=settings.perplexity_api_key,
            model=settings.perplexity_model,
            messages=[sys, user],
        )
    except ExternalAIError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    answer = resp.content.strip()
    refs = "\n".join(f"- {c}" for c in citations) if citations else ""
    now = rfc3339_now()
    save_md = (
        "---\n"
        f"provider: {resp.provider}\n"
        f"generated_at: {now}\n"
        "tags:\n"
        "  - imported\n"
        "---\n\n"
        "## Answer\n\n"
        + answer
        + ("\n\n## References\n\n" + refs if refs else "")
    )
    return PerplexityAskOut(provider=resp.provider, answer_markdown=answer, citations=citations, save_markdown=save_md)
