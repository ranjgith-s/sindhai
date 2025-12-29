# Sindhai

Planning repo for an AI-enabled, Obsidian-like knowledge graph web app (Markdown-first “second brain”) with optional external AI imports and local-first privacy defaults.

- Start here: `docs/README.md`
- Architecture: `docs/architecture/00-overview.md`
- Implementation plan: `docs/plans/00-initial-repo-plan.md`

## Run (Docker)

- Copy env (optional): `cp .env.example .env`
- Start: `docker compose -f infra/docker-compose.yml up --build`
- Dev ports (optional): `docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up --build`
- Open:
  - Web: `http://localhost:3000`
  - API health: `http://localhost:3000/api/health`
  - API notes: `http://localhost:3000/api/notes` (reads/writes to `vault/`)
  - Neo4j browser (dev override): `http://localhost:7474`

Notes:
- The Markdown vault is bind-mounted from `./vault` into the API container at `VAULT_DIR=/data/vault`.
- Neo4j and Qdrant data persist in Docker volumes declared in `infra/docker-compose.yml`.
- To stop: `docker compose -f infra/docker-compose.yml down`
