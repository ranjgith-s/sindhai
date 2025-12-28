# Architecture Overview

## Product goals

- Markdown-first notes with rich rendering (GFM, math, diagrams).
- Obsidian-style `[[wiki links]]`, backlinks, and tags.
- Graph visualization (global + local neighborhood).
- AI augmentation: semantic search, link suggestions, tagging, summarization.
- Optional external AI integrations (ChatGPT/OpenAI-compatible; Perplexity) with an “import to vault” flow.
- Privacy-first defaults; local models preferred, external calls explicitly opt-in.

## Core components

1. **Web app (SPA/PWA)**: editor + viewer, sidebars (notes/tags/backlinks), graph view, AI panels.
2. **Backend API**: note CRUD, graph queries, search, AI tasks, external-provider integrations.
3. **Markdown store** (source of truth for note text):
   - MVP: filesystem “vault” directory of `.md` files (easy export/sync).
   - Alternative: database-backed note storage (Postgres/SQLite) if needed later.
4. **Graph database**: stores explicit relationships (links, tags) and supports graph queries for backlinks/local graph.
5. **Vector index**: stores embeddings for semantic search and similarity-based suggestions.
6. **AI module**: pluggable providers for embeddings/summarization/chat (local models by default; external providers optional).

## Data flow (high level)

- **Create/update note**
  - Persist Markdown content (file or DB).
  - Parse note for `[[links]]` and tags/frontmatter → upsert graph nodes/edges.
  - Generate embedding → upsert vector index.
  - Optionally enqueue background jobs (summaries, suggested tags/links).

- **Open note**
  - Fetch note content + metadata.
  - Fetch backlinks and local subgraph from graph DB.
  - Fetch related notes from vector index.

- **Search**
  - Keyword search (optional) + semantic search via vector index.
  - Return ranked results with snippets and quick-open.

## Non-goals for the first MVP

- Multi-user collaboration, real-time co-editing, and complex sync conflict resolution.
- Full offline-first editing with bidirectional sync (start with read-only offline).
- Heavy enterprise deployments (k8s, clustering) — keep self-host friendly first.

