from __future__ import annotations

from dataclasses import dataclass

import yaml


@dataclass(frozen=True)
class FrontmatterParse:
    frontmatter: dict
    body: str
    error: str | None


@dataclass(frozen=True)
class WikiLink:
    target_raw: str
    alias_raw: str | None
    start_offset: int
    end_offset: int

    @property
    def target_normalized(self) -> str:
        return normalize_link_target(self.target_raw)


@dataclass(frozen=True)
class ParsedNote:
    frontmatter: dict
    frontmatter_error: str | None
    body: str
    tags: list[str]
    wiki_links: list[WikiLink]


def parse_frontmatter(markdown: str) -> FrontmatterParse:
    if not markdown.startswith("---"):
        return FrontmatterParse(frontmatter={}, body=markdown, error=None)

    first_newline = markdown.find("\n")
    if first_newline == -1:
        return FrontmatterParse(frontmatter={}, body=markdown, error=None)

    first_line = markdown[:first_newline].rstrip("\r")
    if first_line != "---":
        return FrontmatterParse(frontmatter={}, body=markdown, error=None)

    # Find a subsequent line that is exactly `---`
    search_from = first_newline + 1
    while True:
        next_newline = markdown.find("\n", search_from)
        if next_newline == -1:
            return FrontmatterParse(frontmatter={}, body=markdown, error=None)
        line = markdown[search_from:next_newline].rstrip("\r")
        if line == "---":
            yaml_block = markdown[first_newline + 1 : search_from]
            body = markdown[next_newline + 1 :]
            try:
                parsed = yaml.safe_load(yaml_block) or {}
                if not isinstance(parsed, dict):
                    return FrontmatterParse(frontmatter={}, body=markdown, error="frontmatter_not_mapping")
                return FrontmatterParse(frontmatter=parsed, body=body, error=None)
            except Exception:
                return FrontmatterParse(frontmatter={}, body=markdown, error="frontmatter_yaml_error")
        search_from = next_newline + 1


def normalize_tag(tag: str) -> str:
    return tag.strip().lstrip("#").strip().lower()


def extract_frontmatter_tags(frontmatter: dict) -> list[str]:
    raw = frontmatter.get("tags")
    values: list[str] = []
    if raw is None:
        return values
    if isinstance(raw, str):
        values = [raw]
    elif isinstance(raw, list):
        values = [v for v in raw if isinstance(v, str)]
    return [t for t in (normalize_tag(v) for v in values) if t]


def normalize_link_target(target: str) -> str:
    return " ".join(target.strip().split())


def parse_tags_and_links(markdown_body: str) -> tuple[list[str], list[WikiLink]]:
    tags: set[str] = set()
    links: list[WikiLink] = []

    in_fence = False
    in_inline_code = False
    i = 0
    length = len(markdown_body)

    def startswith_at(token: str, idx: int) -> bool:
        return markdown_body.startswith(token, idx)

    while i < length:
        ch = markdown_body[i]

        if not in_inline_code and (i == 0 or markdown_body[i - 1] == "\n") and startswith_at("```", i):
            in_fence = not in_fence
            i += 3
            continue

        if in_fence:
            i += 1
            continue

        if ch == "`":
            in_inline_code = not in_inline_code
            i += 1
            continue

        if in_inline_code:
            i += 1
            continue

        if startswith_at("[[", i):
            close = markdown_body.find("]]", i + 2)
            if close != -1:
                inner = markdown_body[i + 2 : close]
                if "|" in inner:
                    target_raw, alias_raw = inner.split("|", 1)
                    target_raw = target_raw.strip()
                    alias_raw = alias_raw.strip()
                    if target_raw and alias_raw:
                        links.append(
                            WikiLink(
                                target_raw=target_raw,
                                alias_raw=alias_raw,
                                start_offset=i,
                                end_offset=close + 2,
                            )
                        )
                else:
                    target_raw = inner.strip()
                    if target_raw:
                        links.append(
                            WikiLink(
                                target_raw=target_raw,
                                alias_raw=None,
                                start_offset=i,
                                end_offset=close + 2,
                            )
                        )
                i = close + 2
                continue

        if ch == "#":
            j = i + 1
            while j < length:
                cj = markdown_body[j]
                if cj.isalnum() or cj in {"_", "-", "/"}:
                    j += 1
                    continue
                break
            if j > i + 1:
                tag = normalize_tag(markdown_body[i:j])
                if tag:
                    tags.add(tag)
                i = j
                continue

        i += 1

    return sorted(tags), links


def parse_note(markdown: str) -> ParsedNote:
    fm = parse_frontmatter(markdown)
    tags_inline, wiki_links = parse_tags_and_links(fm.body)
    tags = sorted(set(extract_frontmatter_tags(fm.frontmatter)).union(tags_inline))
    return ParsedNote(
        frontmatter=fm.frontmatter,
        frontmatter_error=fm.error,
        body=fm.body,
        tags=tags,
        wiki_links=wiki_links,
    )


def render_markdown_with_frontmatter(frontmatter: dict, body: str) -> str:
    if not frontmatter:
        return body
    yaml_text = yaml.safe_dump(frontmatter, sort_keys=False).strip("\n")
    return f"---\n{yaml_text}\n---\n\n{body.lstrip()}"
