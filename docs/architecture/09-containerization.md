# Containerization & Deployment (Initial)

Goal: make the app easy to run locally and deploy to a single host via Docker, without committing to complex orchestration early.

## Target runtime

- **Single host** deployment (VPS/home server/NAS) using `docker compose`.
- One command brings up:
  - `api` (FastAPI)
  - `web` (static assets served by nginx)
  - graph DB (Neo4j *or* Memgraph)
  - vector store (Chroma *or* Qdrant)

## Design principles

- Keep containers stateless; persist data via named volumes or bind mounts.
- Put API keys and secrets in env vars (`.env`, not committed).
- Prefer “local-first” AI: embeddings/summarization run in the `api` container without external calls by default.
- Avoid Docker-in-Docker and privileged containers.

## Data persistence

Persist these directories/volumes:

- `vault/` (Markdown notes): bind mount to host for easy backup/sync.
- Graph DB data volume (Neo4j/Memgraph).
- Vector store data volume (Chroma/Qdrant).
- Optional: API metadata (SQLite) volume if/when introduced.

## Networking

- `web` publicly exposed on `80/443` (behind reverse proxy if desired).
- `api`, `graph`, `vector` only on the internal compose network.
- `web` talks to `api` on the internal network (or via `/api` reverse proxy).

## Environment configuration (suggested)

- `VAULT_DIR=/data/vault`
- Graph:
  - Neo4j: `NEO4J_URI=bolt://neo4j:7687`, `NEO4J_AUTH=neo4j/<password>`
  - Memgraph: `MEMGRAPH_HOST=memgraph`, `MEMGRAPH_PORT=7687`
- Vector:
  - Chroma: `CHROMA_PERSIST_DIR=/data/chroma`
  - Qdrant: `QDRANT_URL=http://qdrant:6333`
- AI providers (optional):
  - `OPENAI_API_KEY=...` (OpenAI-compatible)
  - `PERPLEXITY_API_KEY=...`
  - `AI_EXTERNAL_ENABLED=false` (default)

## Deployment path (phased)

1. **Local dev**: run dependencies in compose; run `api`/`web` on host for fast iteration.
2. **Containerized dev**: run everything in compose (repeatable).
3. **Single-host prod**: compose + reverse proxy + backups (vault bind mount + volumes).
4. **Scale later**: separate services only when bottlenecks appear.

