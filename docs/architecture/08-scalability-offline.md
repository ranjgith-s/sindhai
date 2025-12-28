# Scalability & Offline Plan

## Performance and scalability

- Avoid rework:
  - embed only on content change (hash-based)
  - cache recent search results
- Background jobs:
  - initial indexing
  - periodic reindex
  - summarization/tagging batches
- Large vault UX:
  - default to local graph
  - paginate notes list and search results
  - consider WebGL graph rendering if needed (Sigma.js)

## Offline

Phased approach:

1. **PWA read-only offline (MVP)**: cache app shell + recently opened notes.
2. **Offline edits (later)**: store edits in IndexedDB and sync when online; requires conflict strategy.
3. **Full local app option (later)**: Electron wrapper for filesystem-native vault access.
