from __future__ import annotations

import hashlib
import math
import re


_TOKEN_RE = re.compile(r"[A-Za-z0-9_]+")


def embed_text(text: str, dim: int = 384) -> list[float]:
    """
    Deterministic, local baseline embedding:
    hashed bag-of-words with L2 normalization.
    """
    vec = [0.0] * dim
    for token in _TOKEN_RE.findall(text.lower()):
        h = hashlib.blake2b(token.encode("utf-8"), digest_size=8).digest()
        idx = int.from_bytes(h, "little") % dim
        vec[idx] += 1.0

    norm = math.sqrt(sum(v * v for v in vec))
    if norm > 0:
        inv = 1.0 / norm
        vec = [v * inv for v in vec]
    return vec

