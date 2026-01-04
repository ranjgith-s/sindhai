import MarkdownIt from "markdown-it";

type MdToken = {
  type: string;
  content: string;
  attrGet: (name: string) => string | null;
  attrSet: (name: string, value: string) => void;
  children?: MdToken[];
};

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
});

function stripFrontmatter(src: string): string {
  if (!src.startsWith("---\n") && !src.startsWith("---\r\n")) return src;
  const normalized = src.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) return src;
  const end = normalized.indexOf("\n---\n", 4);
  if (end === -1) return src;
  return normalized.slice(end + "\n---\n".length);
}

function normalizeWikiTarget(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

function wikilinkPlugin(markdown: MarkdownIt) {
  markdown.inline.ruler.before("emphasis", "wikilink", (state: any, silent: boolean) => {
    const pos = state.pos;
    const src = state.src;
    if (src.charCodeAt(pos) !== 0x5b /* [ */ || src.charCodeAt(pos + 1) !== 0x5b /* [ */) {
      return false;
    }

    const close = src.indexOf("]]", pos + 2);
    if (close === -1) return false;

    const inner = src.slice(pos + 2, close);
    const pipe = inner.indexOf("|");
    const rawTarget = pipe >= 0 ? inner.slice(0, pipe) : inner;
    const rawAlias = pipe >= 0 ? inner.slice(pipe + 1) : null;

    const target = normalizeWikiTarget(rawTarget);
    const alias = rawAlias !== null ? rawAlias.trim() : null;
    if (!target) return false;
    if (rawAlias !== null && !alias) return false;

    if (silent) return true;

    const open = state.push("link_open", "a", 1);
    open.attrSet("href", "#");
    open.attrSet("data-wikilink", target);
    open.attrSet("data-link-kind", "internal");
    open.attrSet("data-link-subtype", "wikilink");

    const text = state.push("text", "", 0);
    text.content = alias ?? target;

    state.push("link_close", "a", -1);

    state.pos = close + 2;
    return true;
  });
}

wikilinkPlugin(md);

const SAFE_EXTERNAL_SCHEMES = new Set(["http", "https", "mailto", "tel"]);

export type LinkType = "external" | "internal-note" | "internal-file" | "anchor" | "unsafe";

function stripQueryAndHash(href: string): string {
  const q = href.indexOf("?");
  const h = href.indexOf("#");
  const end = q === -1 ? (h === -1 ? href.length : h) : h === -1 ? q : Math.min(q, h);
  return href.slice(0, end);
}

function getScheme(href: string): string | null {
  const m = href.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  return m ? m[1].toLowerCase() : null;
}

export function classifyHref(href: string): LinkType {
  const h = href.trim();
  if (!h) return "unsafe";
  if (h.startsWith("#")) return "anchor";
  if (h.startsWith("//")) return "external";

  const scheme = getScheme(h);
  if (scheme) {
    return SAFE_EXTERNAL_SCHEMES.has(scheme) ? "external" : "unsafe";
  }

  const base = stripQueryAndHash(h).toLowerCase();
  if (base.endsWith(".md") || base.endsWith(".markdown")) return "internal-note";
  const last = base.split("/").pop() ?? base;
  if (last.includes(".")) return "internal-file";
  return "internal-note";
}

const defaultLinkOpen =
  md.renderer.rules.link_open ??
  ((tokens: any, idx: any, options: any, _env: any, self: any) => self.renderToken(tokens, idx, options));

md.renderer.rules.link_open = (tokens: any, idx: any, options: any, env: any, self: any) => {
  const token: MdToken = tokens[idx];

  const wikilink = token.attrGet("data-wikilink");
  if (wikilink) {
    token.attrSet("data-link-kind", "internal");
    token.attrSet("data-link-subtype", "wikilink");
    return defaultLinkOpen(tokens, idx, options, env, self);
  }

  const href = token.attrGet("href") ?? "";
  const type = classifyHref(href);
  token.attrSet("data-link-type", type);

  if (type === "external") {
    token.attrSet("target", "_blank");
    token.attrSet("rel", "noreferrer noopener");
  } else if (type === "internal-note" || type === "internal-file" || type === "unsafe") {
    token.attrSet("data-internal-href", href);
    token.attrSet("href", "#");
  }

  return defaultLinkOpen(tokens, idx, options, env, self);
};

export type ParsedLinkRef =
  | {
      type: "wikilink";
      target: string;
      label: string;
    }
  | {
      type: Exclude<LinkType, "anchor">;
      href: string;
      label: string;
    };

function extractLinksFromInlineTokens(children: MdToken[]): ParsedLinkRef[] {
  const out: ParsedLinkRef[] = [];

  for (let i = 0; i < children.length; i++) {
    const t = children[i];
    if (t.type !== "link_open") continue;

    const wikilink = t.attrGet("data-wikilink");
    const href = t.attrGet("href") ?? "";

    let label = "";
    let j = i + 1;
    for (; j < children.length; j++) {
      const inner = children[j];
      if (inner.type === "link_close") break;
      if (inner.type === "text" || inner.type === "code_inline") {
        label += inner.content;
      }
    }
    label = label.trim() || (wikilink ?? href);

    if (wikilink) {
      out.push({ type: "wikilink", target: wikilink, label });
      i = j;
      continue;
    }

    const linkType = classifyHref(href);
    if (linkType === "anchor") {
      i = j;
      continue;
    }

    out.push({ type: linkType, href, label });
    i = j;
  }

  return out;
}

export function extractLinks(src: string): ParsedLinkRef[] {
  const body = stripFrontmatter(src);
  const tokens = md.parse(body, {}) as unknown as MdToken[];
  const out: ParsedLinkRef[] = [];

  for (const t of tokens) {
    const children = t.children;
    if (!children) continue;
    out.push(...extractLinksFromInlineTokens(children));
  }

  return out;
}

export function renderMarkdown(src: string): string {
  const body = stripFrontmatter(src);
  return md.render(body);
}
