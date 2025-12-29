# Parsing Spec: Frontmatter, Tags, Wiki Links

This spec defines deterministic parsing rules used by the backend indexers and by the frontend renderer.

## General principles

- Parsing must be deterministic and testable.
- For MVP, parsing may ignore Markdown semantics beyond what’s required, but **must** follow the edge-case rules below consistently.
- Parsing operates on the raw Markdown source.
- Current implementations:
  - Backend: `apps/api/sindhai_api/parsing.py` (codepoint offsets)
  - Frontend renderer: `apps/web/src/markdown.ts`

## YAML frontmatter

### Detection

Frontmatter exists if and only if:
- The file starts at byte 0 with a line equal to `---`
- A subsequent line equal to `---` exists
- The content between them is parsed as YAML

Everything after the closing `---` is the Markdown body.

### Supported fields (MVP)

- `title: string` (optional)
- `tags: string[] | string` (optional)
- `aliases: string[] | string` (optional; used in link resolution)
- `id: string` (optional; if the chosen identity strategy uses it)

Unknown fields are preserved in `frontmatter` but not interpreted.

### Error handling

- If YAML parsing fails, treat the file as having **no** frontmatter and do not attempt partial extraction.
- Surface a warning in note metadata (e.g., `frontmatter_error`) without blocking note load.

## Tags

Tags come from:
1. Frontmatter `tags`
2. Inline tags in the Markdown body

### Normalization

- Strip leading `#` from inline tags.
- Lowercase tags for storage and matching.
- Trim surrounding whitespace.
- Preserve `/` within tags for hierarchy (e.g., `project/alpha`).

### Inline tag syntax (MVP)

An inline tag is a `#` followed by one or more of:
- Letters/numbers/underscore (`_`)
- Hyphen (`-`)
- Forward slash (`/`)

Tag terminates on whitespace or punctuation not in the allowed set.

### Exclusions

Inline tags are **not** detected inside:
- Fenced code blocks (``` … ```)
- Inline code spans (`...`)

## Wiki links

Wiki links create explicit link edges.

### Syntax

- `[[Target]]`
- `[[Target|Alias]]`

Where `Target` and `Alias`:
- Are trimmed of surrounding whitespace
- Must be non-empty after trimming

### Parsing exclusions

Wiki links are **not** detected inside:
- Fenced code blocks (``` … ```)
- Inline code spans (`...`)

### Parsed representation

For each wiki link occurrence, extract:
- `target_raw: string` (text inside link before `|`)
- `alias_raw: string | null` (text after `|`, if present)
- `start_offset: number` and `end_offset: number` (byte or codepoint offsets; pick one and keep consistent)

### Target normalization (for resolution)

Normalization function (deterministic):
- Trim whitespace
- Collapse internal runs of whitespace to a single space
- Do not lowercase by default (case-sensitive titles are allowed)

### Link resolution rules (MVP)

Given `target_normalized`:
1. Match by exact `title`
2. Else match by exact `aliases[]`
3. Else match by filename stem

If multiple matches:
- Mark as ambiguous and return all candidate ids for UI disambiguation.

If no matches:
- Mark as unresolved (UI may offer “create note”).
