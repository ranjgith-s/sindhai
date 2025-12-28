# Indexing Spec: Graph + Vector

This spec defines how the system derives indexes from vault note content.

## Indexing triggers

- On note create/update/delete, schedule indexing for that note.
- Indexing runs only when `content_hash` changes (except for deletes).
- Provide a “reindex all” admin operation (MVP: manual API call).

## Graph index

### Purpose

- Backlinks queries
- Local graph neighborhood queries
- (Later) graph-augmented ranking signals

### Minimum stored entities (MVP)

Notes:
- Node label: `Note`
- Properties: `id`, `title`, `path`, `updated_at`, `tags[]`

Links:
- Relationship: `(:Note)-[:LINKS_TO]->(:Note)`
- Derived from wiki links after resolution

Tags (two allowed representations; choose one for MVP and keep consistent)
1. Property-only: tags stored on `Note.tags[]` and queried via filtering.
2. Tag nodes: `(:Tag {name})` plus `(:Note)-[:TAGGED_AS]->(:Tag)`.

### Upsert semantics

On successful parse:
- Upsert/merge note node by `id`.
- Replace the outgoing `LINKS_TO` set for that note to match the latest parse (delete stale outgoing edges from this note).
- Update tags according to the chosen tag representation (replace set).

On parse failure:
- Do not mutate outgoing edges/tags; keep last known-good index state and surface an error flag on the note node (or in API response).

### Backlinks query contract

Backlinks for note `X` are all notes `Y` such that `Y-[:LINKS_TO]->X`.

## Vector index

### Purpose

- Semantic search over notes
- Related notes (nearest neighbors)
- Candidate link suggestions (later: combine with graph signals)

### Collection

- Collection name: `notes`
- Vector record `id` is either:
  - `note_id` (whole-note embeddings), or
  - a stable `chunk_id` (if chunking is enabled)

### Metadata (MVP)

Store metadata alongside each vector:
- `note_id`
- `title`
- `path`
- `updated_at`
- `content_hash`
- `chunk_index` (optional)
- `chunk_text` or `snippet` (optional; bounded length)

### Chunking (MVP default: off)

Default: whole-note embedding.

If enabled later:
- Chunk by heading sections first; fallback to paragraph grouping.
- Target chunk size: 200–500 tokens equivalent (implementation-defined).
- Persist stable ordering via `chunk_index`.

### Re-embedding rules

- Compute embedding only when `content_hash` changes.
- If chunking mode changes, require a full reindex of embeddings.

