from __future__ import annotations

from dataclasses import dataclass

from qdrant_client import QdrantClient
from qdrant_client.http.models import Distance, PointIdsList, PointStruct, VectorParams

from ..embedding import embed_text


@dataclass(frozen=True)
class VectorNote:
    id: str
    title: str
    path: str
    updated_at: str
    content_hash: str
    text: str
    snippet: str


class QdrantIndex:
    def __init__(self, url: str | None, collection: str = "notes", dim: int = 384) -> None:
        self._client = QdrantClient(url=url) if url else None
        self.collection = collection
        self.dim = dim

    def enabled(self) -> bool:
        return self._client is not None

    def ensure_collection(self) -> None:
        if not self._client:
            return
        collections = self._client.get_collections().collections
        if any(c.name == self.collection for c in collections):
            return
        self._client.create_collection(
            collection_name=self.collection,
            vectors_config=VectorParams(size=self.dim, distance=Distance.COSINE),
        )

    def upsert_note(self, note: VectorNote) -> None:
        if not self._client:
            return
        self.ensure_collection()
        existing = self._client.retrieve(collection_name=self.collection, ids=[note.id])
        if existing and existing[0].payload and existing[0].payload.get("content_hash") == note.content_hash:
            return

        vec = embed_text(note.text, dim=self.dim)
        self._client.upsert(
            collection_name=self.collection,
            points=[
                PointStruct(
                    id=note.id,
                    vector=vec,
                    payload={
                        "note_id": note.id,
                        "title": note.title,
                        "path": note.path,
                        "updated_at": note.updated_at,
                        "content_hash": note.content_hash,
                        "snippet": note.snippet,
                    },
                )
            ],
        )

    def delete_note(self, note_id: str) -> None:
        if not self._client:
            return
        self.ensure_collection()
        self._client.delete(
            collection_name=self.collection,
            points_selector=PointIdsList(points=[note_id]),
        )

    def search(self, query: str, limit: int = 20) -> list[dict]:
        if not self._client:
            return []
        self.ensure_collection()
        qvec = embed_text(query, dim=self.dim)
        res = self._client.search(collection_name=self.collection, query_vector=qvec, limit=limit)
        items: list[dict] = []
        for r in res:
            payload = r.payload or {}
            items.append(
                {
                    "id": payload.get("note_id") or str(r.id),
                    "title": payload.get("title"),
                    "path": payload.get("path"),
                    "updated_at": payload.get("updated_at"),
                    "snippet": payload.get("snippet", ""),
                    "score": float(r.score),
                }
            )
        return items

    def related(self, note: VectorNote, limit: int = 10) -> list[dict]:
        if not self._client:
            return []
        self.ensure_collection()
        vec = embed_text(note.text, dim=self.dim)
        res = self._client.search(
            collection_name=self.collection,
            query_vector=vec,
            limit=limit + 1,
        )
        items: list[dict] = []
        for r in res:
            payload = r.payload or {}
            rid = payload.get("note_id") or str(r.id)
            if rid == note.id:
                continue
            items.append(
                {
                    "id": rid,
                    "title": payload.get("title"),
                    "path": payload.get("path"),
                    "updated_at": payload.get("updated_at"),
                    "snippet": payload.get("snippet", ""),
                    "score": float(r.score),
                }
            )
            if len(items) >= limit:
                break
        return items
