# AI & Integrations Spec

## Local-first defaults

- Local embedding and summarization providers are enabled by default.
- External providers are disabled unless explicitly enabled and configured.

## Provider abstraction

Backend must isolate providers behind a minimal interface:

- `embed(texts: string[]) -> number[][]`
- `summarize(text: string) -> string`
- `chat(messages: Message[], context?: string) -> ChatResponse`

The rest of the application must not depend on provider-specific SDKs or response shapes.

## Privacy rules (hard requirements)

- Never send the full vault externally.
- External calls may only include:
  - explicit user-selected note content, or
  - explicit user-selected snippets, or
  - retrieved snippets *from local indexes* bounded by size limits and only when the user initiates an external action
- UI must clearly indicate when content leaves the system.
- Backend enforces an `AI_EXTERNAL_ENABLED=false` kill switch that blocks all external provider calls.

## Embeddings (MVP)

- Default model: a local SentenceTransformers embedding model.
- Embed on note change when `content_hash` changes.
- Store vectors in the configured vector store along with metadata.

## Summarization (optional-for-MVP)

### Modes
- `local`: local summarizer only
- `external`: external LLM (only if enabled + configured)

### Output format
- Summaries are returned as Markdown.
- If saved to vault, the saved note must include:
  - source note id/path
  - timestamp
  - provider identifier (e.g., `local:textrank` or `external:openai:gpt-4o-mini`)

## External chat integrations

### OpenAI-compatible

Requirements:
- API key stored server-side only.
- Browser never receives provider keys.
- Responses are optionally “saveable” as Markdown notes with prompt/response metadata.

### Perplexity (grounded)

Requirements:
- Use OpenAI-compatible chat completion endpoint if available.
- Persist citations/URLs in a Markdown “References” section on save.

## Manual import (fallback)

- Provide an import UI that accepts pasted text and optional citations/URLs.
- Saves as a Markdown note tagged `imported` (or similar) and includes import metadata in frontmatter.

