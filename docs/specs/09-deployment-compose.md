# Deployment & Compose Spec (MVP)

## Goals

- Single-host deployment via `docker compose`.
- One command starts: `web`, `api`, graph DB, vector store.
- Data persists across rebuilds via bind mounts and volumes.

## Services (expected)

### `web`

- Serves the SPA static assets via nginx (or equivalent).
- Proxies `/api` to the backend service over the internal network.

### `api`

- FastAPI service providing note CRUD, indexing operations, and AI services.
- Has access to:
  - the vault bind mount
  - graph DB connection
  - vector store connection

### Graph DB

- One of: Neo4j or Memgraph (TBD).
- Only accessible on the internal compose network.

### Vector store

- One of: Chroma or Qdrant (TBD).
- Only accessible on the internal compose network.

## Persistence

Required persisted data:
- `vault/` bind-mounted from host to container at `VAULT_DIR` (e.g., `/data/vault`)
- Graph DB data volume
- Vector store data volume

## Environment variables (minimum)

- `VAULT_DIR=/data/vault`
- Graph DB connection vars (one set depending on choice)
- Vector store connection vars (one set depending on choice)
- `AI_EXTERNAL_ENABLED=false` (default)
- Optional provider keys: `OPENAI_API_KEY`, `PERPLEXITY_API_KEY`

## Networking

- Expose only `web` publicly.
- Keep `api`, graph, and vector on the internal network.

## Operational requirements (MVP)

- Backups:
  - Vault: host filesystem backup of the bind mount
  - Graph/vector: volume backups or export scripts (later)

