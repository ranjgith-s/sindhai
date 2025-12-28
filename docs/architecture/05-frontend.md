# Frontend Plan (UX + UI)

## Layout (Obsidian-inspired)

- Left sidebar: note list, tags, search.
- Main pane: editor + preview (toggle or split).
- Right sidebar: backlinks, related notes, AI actions, (optional) local graph.
- Top-level route: graph view (global/local).

## Editor and rendering

- Source editing first (fast, predictable).
- Wiki-link autocomplete when typing `[[`.
- Markdown preview supports:
  - GFM tables/tasks
  - Mermaid diagrams
  - KaTeX math
  - custom rendering for `[[wiki links]]`

## Graph UX

- Default to **local graph** around the open note (reduces overwhelm).
- Allow toggling to global graph with filters (tags, search focus).
- Interactions:
  - click node → open note
  - hover → highlight neighbors
  - filter by tag / depth

## AI UX

- Suggested tags: surfaced as “ghost tags” with accept buttons.
- Related notes: list with title + snippet; one-click insert `[[link]]`.
- Summarize: button action; show streamed progress if provider supports it.
- AI assistant panel:
  - “Vault Q&A” mode (later, uses note retrieval)
  - “Web/External” mode (Perplexity/OpenAI-compatible)
