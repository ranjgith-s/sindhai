# API Contracts (Initial)

The MVP favors a REST API; keep routes stable and versionable.

## Notes

- `GET /notes` → list notes (id, title, path, updated_at, tags)
- `POST /notes` → create note `{title?, path?, content_markdown, frontmatter?}`
- `GET /notes/{id}` → `{note, backlinks, related_notes}`
- `PUT /notes/{id}` → update content/frontmatter
- `DELETE /notes/{id}` → delete note

## Graph

- `GET /notes/{id}/backlinks` → notes that link to `{id}`
- `GET /graph/local?noteId={id}&depth=1` → nodes + edges for local graph
- `GET /graph/global?limit=...` → optional; for large graphs prefer server-side paging

## Search

- `GET /search?query=...&mode=hybrid|keyword|semantic` → ranked results

## AI

- `POST /ai/embed` (internal) → computes embeddings after note updates
- `GET /ai/suggest-links?noteId=...&k=5` → candidate note ids + scores
- `GET /ai/suggest-tags?noteId=...&k=10` → suggested tags + confidence
- `POST /ai/summarize` → `{noteId}` or `{text}` → summary markdown

## External AI integrations (optional, explicit opt-in)

- `POST /integrations/openai/chat` → chat completion + “save to note” option
- `POST /integrations/perplexity/ask` → grounded answer + citations + “save to note”

## Auth (self-host baseline)

- MVP: single-user auth (session cookie) or a token in reverse proxy.
- Later: proper users/roles if multi-user becomes a goal.
