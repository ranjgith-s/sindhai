# External AI Sync & Import

The goal is not to “sync” third-party histories (which APIs often don’t expose), but to make AI outputs easy to capture as first-class notes.

## Integrated chat (recommended approach)

- Provide an in-app chat UI backed by configured providers.
- Persist conversations as:
  - one note per conversation, or
  - one note per answer (with metadata pointing back to the conversation)

## OpenAI-compatible ChatGPT integration

- Backend calls the provider; browser never sees the API key.
- “Save” flow:
  - user selects message(s) or answer
  - backend creates a Markdown note including prompt + response + metadata

## Perplexity integration

- Use Perplexity’s OpenAI-compatible endpoint (chat completion style).
- Store:
  - answer text
  - citations/URLs as a Markdown reference section
  - query metadata (timestamp, model)

## Manual import (fallback)

- Provide a paste/import modal that:
  - accepts raw text
  - optionally parses citations/URLs
  - saves to vault with appropriate tags (e.g., `#imported`)
