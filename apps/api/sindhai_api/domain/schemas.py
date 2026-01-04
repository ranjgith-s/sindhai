from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class NoteSummaryOut(BaseModel):
    id: str
    title: str
    path: str
    created_at: str
    updated_at: str
    tags: list[str] = Field(default_factory=list)
    aliases: list[str] = Field(default_factory=list)


class NoteDetailOut(BaseModel):
    id: str
    title: str
    path: str
    content_markdown: str
    frontmatter: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)
    aliases: list[str] = Field(default_factory=list)
    created_at: str
    updated_at: str
    content_hash: str
    frontmatter_error: Optional[str] = None


class RelatedNoteOut(NoteSummaryOut):
    score: float
    snippet: str = ""


class NoteGetOut(BaseModel):
    note: NoteDetailOut
    backlinks: list[NoteSummaryOut] = Field(default_factory=list)
    related_notes: list[RelatedNoteOut] = Field(default_factory=list)


class NoteCreateIn(BaseModel):
    path: Optional[str] = None
    title: Optional[str] = None
    content_markdown: str
    frontmatter: Optional[dict[str, Any]] = None


class NoteUpdateIn(BaseModel):
    path: Optional[str] = None
    content_markdown: Optional[str] = None
    frontmatter: Optional[dict[str, Any]] = None


class SuggestLinkOut(BaseModel):
    id: str
    score: float


class SuggestLinksOut(BaseModel):
    items: list[SuggestLinkOut] = Field(default_factory=list)


class SuggestTagOut(BaseModel):
    tag: str
    confidence: float


class SuggestTagsOut(BaseModel):
    items: list[SuggestTagOut] = Field(default_factory=list)


class SummarizeIn(BaseModel):
    noteId: str
    mode: Literal["local", "external"] = "local"
    provider: Optional[str] = None


class SummarizeOut(BaseModel):
    summary_markdown: str
    provider: str


class ChatMessageIn(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class OpenAIChatIn(BaseModel):
    messages: list[ChatMessageIn] = Field(default_factory=list)
    context: Optional[str] = None


class OpenAIChatOut(BaseModel):
    provider: str
    content: str
    save_markdown: str


class PerplexityAskIn(BaseModel):
    query: str
    context: Optional[str] = None


class PerplexityAskOut(BaseModel):
    provider: str
    answer_markdown: str
    citations: list[str] = Field(default_factory=list)
    save_markdown: str
