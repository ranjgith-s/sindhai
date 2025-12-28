# 0003. Baseline local embeddings via hashed bag-of-words

Date: 2025-12-28

## Context

MVP requires semantic search + related notes backed by a vector store, with local-first defaults and a small, swappable provider abstraction.

## Decision

Use a deterministic, local hashed bag-of-words embedding as the MVP default embedding provider:

- Tokenize text into words, hash tokens into a fixed-size vector, and L2-normalize.
- Store/search vectors in Qdrant using cosine distance.
- Keep an internal provider interface so a SentenceTransformers-based provider can be added later without API changes.

## Consequences

- No heavyweight ML dependencies or model downloads are required to get a working vector index.
- Semantic quality is “good enough” for MVP (lexical similarity) and can be improved later by swapping the provider.

