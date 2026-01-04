# Web UX Spec (MVP)

## Layout

Obsidian-inspired 3-column layout:
- Left sidebar: note list, tags, search box/quick open
- Center: inline editor (document-style)
- Right sidebar: backlinks, related notes, AI actions, (optional) local graph mini-panel

## Routes

- `/` redirects to last opened note or the note list.
- `/note/:id` opens the note view.
- `/graph` opens the graph view (local by default; global optional).
- `/settings` configuration (UI + AI provider enablement UX; server configuration is not exposed).

## Core interactions

### Navigation
- Click a note in the list opens it.
- Clicking a wiki link in preview opens the resolved note; unresolved link prompts “create note”.
- Back button navigates within opened notes history.

### Editing
- Source editor (CodeMirror-style) is the MVP default.
- When typing `[[`, show autocomplete suggestions:
  - note titles
  - aliases
  - filename stems
- Save behavior:
  - Autosave on debounce (e.g., 500–1000ms) or explicit save; choose one for MVP and keep consistent.

#### Document-style editor (MVP polish)

To reduce “developer UI” vibes while staying Obsidian-like:
- Default note view is a single inline editor (no edit/preview tabs).
- Editor uses the app theme (no “Word page” simulation); comfortable typography, no visible file paths.
- A reading/preview affordance can exist as an overlay/modal and should resemble Obsidian’s reading view (typographic Markdown rendering, consistent link styling, dark theme).

### Preview
- Preview renders wiki links as navigable anchors.
- Preview shows tags (e.g., as chips) derived from frontmatter + inline tags.

#### Hiding storage details (UX requirement)

End users should not need to understand storage layout:
- Do not show filesystem paths by default in the UI (note list, title tooltips, header status line).
- Advanced metadata (paths/ids) may be available behind an explicit “Advanced” toggle intended for admins/dev.

## Graph UX

### Local graph (default)
- Shows the current note plus 1-hop neighbors (outgoing + backlinks), with optional `depth` control.
- Node click opens the note.
- Hover highlights neighbors.

### Global graph (optional)
- Must have filtering (tag filter, search focus) and/or limit to avoid overload.

## Panels

### Backlinks
- Shows list of notes that link to current note, ordered by `updated_at` desc by default.

### Related notes
- Shows semantically similar notes with a short snippet and a similarity score indicator.
- One-click action inserts a `[[Link]]` to that note in the editor at cursor position.

### AI actions (optional-for-MVP)
- Summarize note: shows a preview and offers “save summary as note”.
- Suggested tags: show ghost tags with accept/reject.
- Suggested links: show candidates with accept-to-insert behavior.

### AI writing (MVP+)

- Provide “AI writing” actions in the note view (e.g., rewrite/expand/grammar fix/continue).
- Default scope is explicit user-selected text.
- Whole-note actions must be explicitly confirmed and clearly indicate content will be sent externally when using external providers.

## Accessibility (MVP)

- Full keyboard navigation for search results and note list.
- Visible focus states.
- Minimum: ARIA labeling for search input, note list, and editor region.
