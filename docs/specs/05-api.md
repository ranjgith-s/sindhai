# API Spec (REST, MVP)

The MVP uses a versionable REST API. All responses are JSON unless otherwise stated.

## Conventions

- Base path: `/api` (recommended behind reverse proxy); routes below omit the prefix.
- Versioning: start with `/v1` once stability is needed; MVP may run unversioned but must be structured to add `/v1` without breaking internals.
- Time format: RFC3339 strings.
- Pagination: when listing large sets, use `limit` + `cursor` (or `offset` for MVP simplicity); choose one and keep consistent.

## Data types

### NoteSummary

```json
{
  "id": "string",
  "title": "string",
  "path": "string",
  "updated_at": "2025-01-01T00:00:00Z",
  "tags": ["string"]
}
```

### NoteDetail

```json
{
  "id": "string",
  "title": "string",
  "path": "string",
  "content_markdown": "string",
  "frontmatter": {},
  "tags": ["string"],
  "updated_at": "2025-01-01T00:00:00Z",
  "content_hash": "string"
}
```

## Notes

### `GET /notes`

List notes.

Query params:
- `limit` (optional)
- `cursor` (optional) or `offset` (optional; choose one)
- `tag` (optional; filter)
- `q` (optional; keyword filter for MVP)

Response: `{ "items": NoteSummary[], "next_cursor": "string|null" }` (or offset variant)

### `POST /notes`

Create a note.

Request:
```json
{
  "path": "string (optional)",
  "title": "string (optional)",
  "content_markdown": "string",
  "frontmatter": {}
}
```

Rules:
- If `path` omitted: backend generates a safe path derived from `title` or `Untitled`.
- Backend writes a `.md` file under the vault and returns the created note.

Response: `NoteDetail`

### `GET /notes/{id}`

Fetch a note plus derived panels.

Response:
```json
{
  "note": { "id": "string", "title": "string", "path": "string", "content_markdown": "string", "frontmatter": {}, "tags": ["string"], "updated_at": "2025-01-01T00:00:00Z", "content_hash": "string" },
  "backlinks": [{ "id": "string", "title": "string", "path": "string", "updated_at": "2025-01-01T00:00:00Z", "tags": ["string"] }],
  "related_notes": [{ "id": "string", "title": "string", "path": "string", "updated_at": "2025-01-01T00:00:00Z", "tags": ["string"], "score": 0.0 }]
}
```

### `PUT /notes/{id}`

Update note content and/or path.

Request:
```json
{
  "path": "string (optional; rename/move)",
  "content_markdown": "string (optional)",
  "frontmatter": {} 
}
```

Rules:
- If `path` changes, backend performs an atomic rename within the vault.
- If `content_markdown` is provided, backend writes file contents and updates `updated_at`.

Response: `NoteDetail`

### `DELETE /notes/{id}`

Delete a note file and remove derived index entries.

Response: `{ "ok": true }`

## Graph

### `GET /notes/{id}/backlinks`

Response: `{ "items": NoteSummary[] }`

### `GET /graph/local?noteId={id}&depth=1`

Response:
```json
{
  "nodes": [{ "id": "string", "title": "string", "tags": ["string"] }],
  "edges": [{ "source": "string", "target": "string", "type": "LINKS_TO" }]
}
```

### `GET /graph/global?limit=...`

Optional in MVP; if implemented, must page results.

## Search

### `GET /search?query=...&mode=hybrid|keyword|semantic`

Response:
```json
{
  "items": [{ "id": "string", "title": "string", "path": "string", "snippet": "string", "score": 0.0 }]
}
```

## AI (internal + user-facing)

### `POST /ai/summarize`

Request:
```json
{ "noteId": "string", "mode": "local|external", "provider": "string|null" }
```

Response:
```json
{ "summary_markdown": "string", "provider": "string" }
```

### `GET /ai/suggest-links?noteId=...&k=5`

Response: `{ "items": [{ "id": "string", "score": 0.0 }] }`

### `GET /ai/suggest-tags?noteId=...&k=10`

Response: `{ "items": [{ "tag": "string", "confidence": 0.0 }] }`

## External integrations (optional)

### `POST /integrations/openai/chat`

Purpose: perform a chat completion and optionally return a payload suitable for “save to note”.

### `POST /integrations/perplexity/ask`

Purpose: perform a grounded answer and return citations suitable for “save to note”.

Both endpoints must enforce the privacy rules in `docs/specs/07-ai-and-integrations.md`.

## Errors

- `400` invalid input (including illegal paths)
- `401/403` auth required/forbidden (if enabled)
- `404` note not found
- `409` conflict (path already exists; rename collisions)
- `422` validation error (structured details)
- `500` unexpected errors

