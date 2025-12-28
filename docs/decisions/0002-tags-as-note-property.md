# 0002. Tags stored as `Note.tags[]` (no Tag nodes)

Date: 2025-12-28

## Context

The graph index must support filtering notes by tags and presenting tags in the UI, while keeping Neo4j modeling minimal for MVP.

## Decision

Represent tags as a property on the note node:

- `(:Note { ..., tags: ["tag1", "tag2"] })`

No separate `(:Tag)` nodes or `:TAGGED_AS` relationships are created in MVP.

## Consequences

- Simpler writes/reads and less schema surface area for MVP.
- Tag-centric graph queries (e.g., tag co-occurrence) are possible but less idiomatic than Tag nodes; this can be revisited later without changing vault content.

