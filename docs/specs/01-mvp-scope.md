# MVP Scope Spec

This spec defines what “MVP” means for this project and what is explicitly out of scope.

## MVP definition

“A usable Markdown vault in the browser” with:
- Note CRUD in a filesystem-backed vault
- Deterministic parsing of frontmatter, tags, and wiki links
- Backlinks + local graph view
- Semantic search + related notes

## In scope (functional requirements)

### Notes (core)
- Create, read, update, delete Markdown notes.
- Navigate via note list and search.
- Render Markdown with extensions: frontmatter (YAML), wiki links, tags, math, diagrams.
- Store note content in the vault as `.md` files (source of truth).

### Links, tags, graph
- Parse `[[Wiki Links]]` and `[[Target|Alias]]` deterministically from Markdown source.
- Parse frontmatter `tags` and inline tags (see parsing spec).
- Persist link relationships for backlinks and local graph queries.
- Provide local graph visualization for the active note (depth=1 default).

### Search (MVP)
- Keyword search (may be simple substring/filename match initially).
- Semantic search over note content via embeddings + vector store.
- Related notes panel powered by semantic similarity.

### AI augmentations (optional-for-MVP)
- Summarize note action (local-first).
- Suggested tags and suggested links (local-first).
- External integrations (OpenAI-compatible, Perplexity) only if explicitly enabled/configured and only over user-selected content/snippets.

## Out of scope (MVP non-goals)

- Multi-user collaboration, shared vaults, RBAC.
- Real-time co-editing.
- Full offline-first bidirectional sync with conflict resolution.
- Vault-wide RAG that sends the vault externally.
- Kubernetes/cluster deployments; single-host `docker compose` only.

## Milestones → acceptance criteria

### Milestone 1 — Markdown vault
- User can create/edit/delete notes and changes persist to the vault directory.
- Markdown preview correctly renders:
  - GFM basics (tables/tasks)
  - wiki links as navigable links
  - frontmatter parsed and applied to metadata
  - tags surfaced in UI

### Milestone 2 — Graph foundations
- Backlinks for a note are correct given the parsing rules.
- Local graph endpoint returns nodes+edges that match the persisted link graph.
- Local graph UI renders the neighborhood and supports click-to-open.

### Milestone 3 — Semantic layer
- Embeddings are generated on note changes only when content hash changes.
- Semantic search returns ranked results with title/path and snippet.
- Related notes panel shows nearest neighbors excluding self.

### Milestone 4 — AI augmentations (optional)
- Summarize action writes a new note or updates a field according to spec.
- External calls are blocked unless explicitly enabled, and UI warns before sending content.

