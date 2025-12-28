# Agent Instructions (Codex / AI Coding Agents)

This repo is currently in the **planning** phase. Most work should start by updating `docs/` before adding implementation code.

## How to work in this repo

1. Read `docs/README.md` and the relevant files under `docs/architecture/`.
2. If you are making a significant choice (stack, storage model, auth), add an ADR under `docs/decisions/`.
3. Keep changes small and reviewable; avoid “scaffold everything” PRs.

## Preferred architecture (initial)

- Web: React + TypeScript SPA/PWA
- API: FastAPI (Python) with AI modules in-process
- Storage: filesystem Markdown vault + graph DB + vector index
- Local-first AI by default; external providers are opt-in

If you deviate from this, record it in an ADR.

## Implementation guardrails

- Treat the Markdown vault as the source of truth for note content unless an ADR changes this.
- Never send vault-wide data to external AI providers; only send explicit user-selected content/snippets.
- Keep provider integrations behind a small abstraction so local/external models are swappable.
- Prefer deterministic, testable parsing for:
  - wiki links (`[[Target]]`, `[[Target|Alias]]`)
  - YAML frontmatter
  - tag extraction

## Repo conventions (when code exists)

- Keep frontend and backend separated (suggested: `apps/web`, `apps/api`).
- Add short, focused tests alongside new parsing/indexing logic.
- Document new commands in `README.md` and/or `docs/`.

## Agent best practices

- Clarify assumptions early (single-user? filesystem vault? chosen DBs?).
- Before introducing new dependencies, justify them and prefer widely adopted OSS options.
- Make security/privacy tradeoffs explicit (especially around API keys and external calls).
- When uncertain, propose 1–2 options and ask which to implement.

