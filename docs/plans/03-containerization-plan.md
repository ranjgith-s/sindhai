# Containerization Plan (Scaffold)

## Decisions to make (minimal)

- Pick graph DB for compose: Neo4j *or* Memgraph.
- Pick vector store for compose: Chroma *or* Qdrant.
- Confirm note storage: bind-mounted `vault/` directory as source of truth.

## Deliverables

- `infra/docker-compose.yml` with:
  - `api` (FastAPI) container
  - `web` (nginx) container
  - graph DB container
  - vector store container
- `apps/api/Dockerfile` and `apps/web/Dockerfile` (initial scaffolds).
- `.env.example` documenting required env vars.
- `README.md` section: “Run with Docker”.

## Acceptance criteria

- `docker compose up` starts all services (even if `api`/`web` are placeholders until code exists).
- Persistent volumes exist for graph/vector storage.
- `vault/` is a bind mount so notes survive container rebuilds.

