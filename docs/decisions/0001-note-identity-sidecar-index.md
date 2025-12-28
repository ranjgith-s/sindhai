# 0001. Note identity via sidecar index

Date: 2025-12-28

## Context

The API must refer to notes by a stable `id` that survives renames/moves while keeping the Markdown vault as the source of truth for note content.

## Decision

Maintain a small sidecar index file at `VAULT_DIR/.sindhai/notes.json` that maps vault-relative note `path -> id (uuid)`.

- Notes discovered without an entry are assigned a new UUID and written to the index.
- Renames/moves update the mapping atomically.
- The backend does not write or require frontmatter `id` for MVP.

## Consequences

- Stable IDs work without mutating user note content.
- IDs are not portable unless the `.sindhai/` metadata is preserved; a future export/import flow may optionally materialize IDs into frontmatter.
- The vault scanner must ignore `.sindhai/` so metadata is never treated as user notes.

