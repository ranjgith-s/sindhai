# AI Services Plan

## Features

- **Semantic search**: embed query → nearest notes.
- **Related notes panel**: nearest neighbors to the current note (excluding already-linked notes).
- **Contextual link suggestions**: propose `[[links]]` based on similarity and graph signals.
- **Tag suggestions**: suggest tags from content (local classifier/zero-shot or embedding-based clustering).
- **Summarization**: fast previews and “summarize this note” action.
- **Vault Q&A (later)**: RAG over notes (retrieve notes/chunks → answer with references).

## Provider abstraction

Define internal interfaces so the app can switch between:

- Local embedding model (SentenceTransformers).
- Local summarizer (extractive TextRank or transformer model).
- Optional external LLM provider (OpenAI-compatible; Perplexity for grounded web answers).

Keep the rest of the system dependent on:

- `embed(texts[]) -> embeddings[]`
- `summarize(text) -> summary`
- `chat(messages, context?) -> response`

## Caching and background work

- Only re-embed when `content_hash` changes.
- Queue or background tasks for:
  - reindexing all notes
  - generating summaries/tags
  - importing external AI results

## Safety & privacy defaults

- Local-only mode: disable all external providers.
- Explicit UI affordances for external calls (“this will send note content to a third party”).
- Avoid sending the entire vault to external APIs; prefer sending only the minimal selected note or retrieved snippets.
