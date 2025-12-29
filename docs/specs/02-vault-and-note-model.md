# Vault & Note Model Spec

## Source of truth

- The Markdown vault directory is the source of truth for note content.
- The backend **must not** store a divergent copy of the canonical note Markdown; derived indexes (graph/vector) are allowed.

## Vault directory layout

- Vault root is configured via `VAULT_DIR`.
- Notes are stored as UTF-8 `.md` files under the vault root.
- Relative paths (vault-relative) are the user-visible “address” of a note.

### Path constraints (MVP)
- A note path is unique within the vault.
- Paths are normalized using `/` separators.
- Disallow path traversal (`..`) and absolute paths at the API boundary.

## Note identity

The system needs a stable `note_id` that can survive:
- Renames/moves
- Title changes

For MVP, the implementation may choose one of the following strategies (TBD):
1. **Frontmatter ID**: store `id: <uuid>` in YAML frontmatter; treat it as canonical identity.
2. **Sidecar index**: maintain a backend mapping `{path -> uuid}` in a small metadata store.
3. **Path-derived ID** (fallback): compute `id = hash(path)`; identity changes on rename (acceptable only if explicitly adopted).

Regardless of strategy:
- API refers to notes by `id`.
- `path` remains a first-class field and is required for file I/O.

### MVP implementation choice

- Use a sidecar index at `VAULT_DIR/.sindhai/notes.json` mapping `{path -> uuid}` (see `docs/decisions/0001-note-identity-sidecar-index.md`).
- Store stable per-note metadata (currently `created_at`) in `VAULT_DIR/.sindhai/note_meta.json`, keyed by `{uuid -> {created_at}}`.

## Note fields (conceptual)

- `id: string` (stable identifier; format TBD)
- `path: string` (vault-relative)
- `title: string`
- `content_markdown: string`
- `frontmatter: object` (parsed YAML; raw also allowed for round-trip)
- `tags: string[]` (normalized; union of frontmatter + inline tags)
- `links_out: LinkOut[]` (derived)
- `created_at: string (RFC3339)` (derived from filesystem on first sight, then persisted in metadata store)
- `updated_at: string (RFC3339)` (filesystem mtime or metadata store)
- `content_hash: string` (stable hash of canonical markdown used for reindex decisions)

### Title derivation

MVP rule (deterministic):
1. If frontmatter contains `title`, use it.
2. Else, use the filename stem (basename without extension).

Future enhancement (optional): allow `# Heading 1` as title source.

## Content hashing

- `content_hash` is computed from the canonical Markdown bytes as stored on disk (after normalizing line endings to `\n` for hashing).
- Indexing and embedding only run when `content_hash` changes.

## Deletion semantics

- Deleting a note removes its `.md` file from the vault.
- The system must also remove/mark-stale its graph edges and vector entries.
