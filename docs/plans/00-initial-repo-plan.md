# Initial Repo Plan

This repo currently contains only planning artifacts. This document proposes the first implementation steps and a recommended repo layout.

## Proposed repository layout

- `apps/web`: React + TypeScript SPA/PWA
- `apps/api`: FastAPI backend (notes, graph, search, AI)
- `packages/`: shared code (types, UI, utilities) if/when needed
- `docs/`: architecture + plans + ADRs
- `infra/`: `docker-compose.yml` for a single-host deployment
- `vault/`: local Markdown vault directory (gitignored or sample-only)

## Phase 0 (scaffold)

- Choose the initial stack:
  - graph DB: Neo4j or Memgraph
  - vector store: ChromaDB or Qdrant
  - frontend editor: CodeMirror vs Milkdown
- Add root `README.md` describing goals and how to run.
- Scaffold `apps/web` and `apps/api` with minimal “hello world” integration.
- Add `docker compose` services for the chosen DBs (initial scaffold lives at `infra/docker-compose.yml`).

## Phase 1 (notes + links)

- Notes CRUD with filesystem-backed vault.
- Parse `[[wiki links]]` + tags; store link graph in graph DB.
- Backlinks panel powered by graph queries.

## Phase 2 (graph UI)

- Local graph view around the active note (Cytoscape.js).
- Node click → open note; depth/tag filters.

## Phase 3 (search + embeddings)

- Embeddings pipeline + vector store.
- Semantic search endpoint and UI.
- Related-notes and link-suggestion endpoints.

## Phase 4 (AI actions + imports)

- Summarize note action (local-first; external optional).
- Integrated chat panel and “save to vault”.
- Perplexity integration with citations saved to Markdown.
