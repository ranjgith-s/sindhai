# Data Model & Indexes

## Note model (conceptual)

A note should be identifiable independent of its title.

- `id`: stable UUID or content-addressed hash
- `title`: derived from filename or frontmatter
- `path`: relative path within vault
- `content_markdown`: raw Markdown
- `frontmatter`: parsed YAML (tags, aliases, etc.)
- `tags`: normalized list (union of frontmatter + inline `#tags`)
- `created_at`, `updated_at`
- `content_hash`: helps avoid unnecessary re-embedding/indexing

## Link parsing rules

- `[[Target]]` creates an explicit link edge.
- `[[Target|Alias]]` links to `Target` but displays `Alias`.
- Resolution strategy:
  - Prefer exact title match.
  - Then match aliases.
  - If multiple matches: surface a disambiguation UI.

## Graph schema (Neo4j/Memgraph)

### Nodes

- `(:Note {id, title, path, updated_at, tags[] ...})`
- `(:Tag {name})` (optional; can also store tags as `Note.tags[]` only)

### Edges

- `(:Note)-[:LINKS_TO]->(:Note)` from wiki links in content
- `(:Note)-[:TAGGED_AS]->(:Tag)` if tags are normalized as nodes
- Optional (AI-derived; start disabled by default):
  - `(:Note)-[:SIMILAR_TO {score}]->(:Note)`

## Vector index

- Collection name: `notes`
- Record:
  - `id`: note id (or stable chunk id)
  - `embedding`: float vector
  - `metadata`: `{title, path, updated_at, content_hash, chunk_index?}`

### Chunking strategy (when needed)

- Start with **whole-note embeddings**.
- If notes become long: chunk by headings/paragraphs; store `chunk_index` and a short snippet for UX.
