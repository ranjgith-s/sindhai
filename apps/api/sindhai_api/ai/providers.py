from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from sindhai_api.infrastructure.ai.embedding import embed_text


Role = Literal["system", "user", "assistant"]


@dataclass(frozen=True)
class Message:
    role: Role
    content: str


@dataclass(frozen=True)
class ChatResponse:
    provider: str
    content: str
    raw: dict | None = None


class EmbeddingProvider:
    def embed(self, texts: list[str]) -> list[list[float]]:
        raise NotImplementedError


class LocalHashedBowEmbedding(EmbeddingProvider):
    def __init__(self, *, dim: int = 384) -> None:
        self.dim = dim

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [embed_text(t, dim=self.dim) for t in texts]


class SummarizationProvider:
    def summarize(self, text: str) -> tuple[str, str]:
        """
        Returns (summary_markdown, provider_id).
        """
        raise NotImplementedError


class LocalExtractiveSummarizer(SummarizationProvider):
    def __init__(self, *, max_chars: int = 900) -> None:
        self.max_chars = max_chars

    def summarize(self, text: str) -> tuple[str, str]:
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
        summary = "\n\n".join(p for p in paras[:3] if p).strip()
        return (summary[: self.max_chars].rstrip(), "local:extractive")

