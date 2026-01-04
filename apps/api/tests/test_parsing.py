from sindhai_api.domain.parsing import parse_frontmatter, parse_note, parse_tags_and_links


def test_frontmatter_parses_at_byte_zero() -> None:
    md = "---\ntitle: Hello\ntags: [One, Two]\n---\n\nBody\n"
    fm = parse_frontmatter(md)
    assert fm.error is None
    assert fm.frontmatter["title"] == "Hello"
    assert "Body" in fm.body


def test_frontmatter_ignored_when_not_first_line() -> None:
    md = "\n---\ntitle: Hello\n---\nBody\n"
    fm = parse_frontmatter(md)
    assert fm.frontmatter == {}
    assert fm.error is None


def test_frontmatter_yaml_error_falls_back_to_no_frontmatter() -> None:
    md = "---\ntitle: [oops\n---\nBody\n"
    fm = parse_frontmatter(md)
    assert fm.frontmatter == {}
    assert fm.error == "frontmatter_yaml_error"


def test_frontmatter_not_mapping_falls_back_to_no_frontmatter() -> None:
    md = "---\n- a\n- b\n---\nBody\n"
    fm = parse_frontmatter(md)
    assert fm.frontmatter == {}
    assert fm.error == "frontmatter_not_mapping"
    assert fm.body == md


def test_tags_and_links_ignore_fenced_code() -> None:
    body = "Hello #tag\n```\n#nope [[Nope]]\n```\nAfter [[Yes]]\n"
    tags, links = parse_tags_and_links(body)
    assert tags == ["tag"]
    assert [l.target_raw for l in links] == ["Yes"]


def test_tags_and_links_ignore_inline_code() -> None:
    body = "Hi `#no [[No]]` then #yes and [[Ok]]"
    parsed = parse_note(body)
    assert "yes" in parsed.tags
    assert [l.target_raw for l in parsed.wiki_links] == ["Ok"]


def test_tag_normalization_and_allowed_chars() -> None:
    body = "#One #two-three #a_b #project/Alpha #x.y #z!"
    tags, _links = parse_tags_and_links(body)
    assert tags == ["a_b", "one", "project/alpha", "two-three", "x", "z"]


def test_wikilink_alias_requires_nonempty() -> None:
    body = "[[Target|Alias]] [[Target|  ]] [[ Target ]]"
    parsed = parse_note(body)
    assert [l.alias_raw for l in parsed.wiki_links] == ["Alias", None]


def test_wikilink_raw_values_are_trimmed_and_offsets_consistent() -> None:
    body = "x [[  Target Name  |  Alias  ]] y"
    parsed = parse_note(body)
    assert len(parsed.wiki_links) == 1
    wl = parsed.wiki_links[0]
    assert wl.target_raw == "Target Name"
    assert wl.alias_raw == "Alias"
    assert body[wl.start_offset : wl.end_offset] == "[[  Target Name  |  Alias  ]]"
    assert wl.target_normalized == "Target Name"
