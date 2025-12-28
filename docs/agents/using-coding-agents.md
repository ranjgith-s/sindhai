# Using Coding Agents (Codex) Effectively

## What agents are best at

- Creating small, well-scoped patches (docs, refactors, endpoints).
- Converting an architectural plan into an incremental backlog.
- Implementing repetitive plumbing consistently (parsers, DTOs, wiring).

## How to ask for changes

- Provide: desired outcome, constraints (privacy/local-first), and examples (sample notes).
- Prefer “implement milestone X” over “build the whole app”.
- If you want a specific stack choice (Neo4j vs Memgraph, Chroma vs Qdrant), state it explicitly.

## Review checklist for agent output

- Does the patch match `docs/architecture/*` (or add an ADR if it diverges)?
- Are external AI calls opt-in and clearly surfaced?
- Are IDs stable and does reindexing avoid unnecessary recomputation?
- Are parsing rules covered by tests and edge cases?

## Suggested prompt template

Paste something like this when starting a new task:

```
Goal:
Scope:
Constraints (privacy/local-first, DB choice, hosting):
Acceptance criteria:
Out of scope:
```

