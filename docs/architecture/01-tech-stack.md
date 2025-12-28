# Tech Stack Plan

This document proposes an initial stack aligned with the research plan, while keeping swap points explicit.

## Frontend

- **React + TypeScript** (or Vue/Svelte): component model for editor panes, side panels, and graph view.
- **Markdown editing**
  - Options:
    - **CodeMirror 6** + Markdown language support (source mode).
    - **Milkdown / TipTap** (if WYSIWYG mode is desired early).
  - MVP recommendation: start with **source mode** (CodeMirror) + fast preview.
- **Markdown rendering**
  - `markdown-it` (GFM) + plugins for:
    - wiki links `[[...]]` (custom rule)
    - frontmatter (YAML)
    - math (KaTeX)
    - diagrams (Mermaid)
- **Graph visualization**
  - Prefer **Cytoscape.js** (feature-rich and proven in similar tooling).
  - Alternatives: Sigma.js (WebGL-heavy graphs), D3 (custom force layout).
- **PWA**
  - Service worker + asset caching; start with read-only offline.

## Backend

- **FastAPI (Python)** for API + AI tasks (embeddings/summarization) in-process.
  - Alternatives: Node.js (Nest/Express) + separate Python AI worker.
  - Recommendation: keep AI and API in the same Python service initially to reduce integration complexity.

## Data storage

- **Markdown “vault”** directory (source note text).
- **Graph DB**
  - Options: **Neo4j (community)** or **Memgraph**.
  - MVP recommendation: pick one early and commit to its query language (Cypher for both, with small differences).
- **Vector store**
  - Options: **ChromaDB**, **Qdrant**, **FAISS**.
  - MVP recommendation: **ChromaDB** (simple Python API + persistence).
- Optional later:
  - **SQLite/Postgres** for user accounts, API keys metadata, job state.

## AI / ML

- **Embeddings (local-first)**
  - SentenceTransformers, e.g. `all-MiniLM-L6-v2` (fast, good baseline).
- **Summarization**
  - Local: BART/T5 or a lightweight extractive summarizer (TextRank) for MVP performance.
  - Optional: external LLM summarization (OpenAI-compatible) if user provides key.
- **Provider abstraction**
  - A small internal interface so switching between local/external providers doesn’t leak across the codebase.

## Infrastructure

- Development: `docker compose` for graph DB + vector DB.
- Production (later): single-host deployment first; consider scaling components independently only when needed.
