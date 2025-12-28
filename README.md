# Sindhai

Planning repo for an AI-enabled, Obsidian-like knowledge graph web app (Markdown-first “second brain”) with optional external AI imports and local-first privacy defaults.

- Start here: `docs/README.md`
- Architecture: `docs/architecture/00-overview.md`
- Implementation plan: `docs/plans/00-initial-repo-plan.md`

## Run (Docker)

- Copy env: `cp .env.example .env`
- Start: `docker compose -f infra/docker-compose.yml up --build`
- Open:
  - Web: `http://localhost:3000`
  - API health: `http://localhost:3000/api/health`
  - API notes: `http://localhost:3000/api/notes` (reads from `vault/`)
  - Neo4j browser: `http://localhost:7474`
