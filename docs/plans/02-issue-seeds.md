# Issue Seeds (Initial Backlog)

These are “good first issues” to open once code scaffolding begins.

## Repo bootstrap

- Decide stack: graph DB (Neo4j vs Memgraph), vector store (Chroma vs Qdrant), editor (CodeMirror vs Milkdown).
- Add `docker-compose.yml` for selected graph DB + vector store.
- Add CI (lint/test) for `apps/web` and `apps/api`.

## Notes

- Implement filesystem-backed vault (create/read/update/delete `.md` files).
- Parse frontmatter + tags; normalize tags and expose them in `GET /notes`.
- Implement wiki link parsing and link resolution.

## Graph

- Upsert note/link/tag schema into the graph DB on every note update.
- Implement backlinks query endpoint and UI panel.
- Implement local graph endpoint and Cytoscape-based view.

## Search

- Add embeddings pipeline + vector store upsert.
- Implement semantic search endpoint.
- Implement related notes + suggested links endpoints.

## AI (optional early)

- Summarization endpoint with local-first default.
- Provider abstraction: local vs OpenAI-compatible vs Perplexity.
- “Save AI output to note” flow.
