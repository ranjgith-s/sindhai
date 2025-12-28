import MarkdownIt from "markdown-it";

const md = new MarkdownIt({
  html: true,
  linkify: true,
});

function stripFrontmatter(src: string): string {
  if (!src.startsWith("---\n") && !src.startsWith("---\r\n")) return src;
  const normalized = src.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) return src;
  const end = normalized.indexOf("\n---\n", 4);
  if (end === -1) return src;
  return normalized.slice(end + "\n---\n".length);
}

function transformWikiLinks(src: string): string {
  const s = src;
  let out = "";
  let i = 0;
  let inFence = false;
  let inInline = false;

  while (i < s.length) {
    const ch = s[i];

    if (!inInline && (i === 0 || s[i - 1] === "\n") && s.startsWith("```", i)) {
      inFence = !inFence;
      out += "```";
      i += 3;
      continue;
    }

    if (inFence) {
      out += ch;
      i += 1;
      continue;
    }

    if (ch === "`") {
      inInline = !inInline;
      out += ch;
      i += 1;
      continue;
    }

    if (inInline) {
      out += ch;
      i += 1;
      continue;
    }

    if (s.startsWith("[[", i)) {
      const close = s.indexOf("]]", i + 2);
      if (close !== -1) {
        const inner = s.slice(i + 2, close);
        const pipe = inner.indexOf("|");
        let target = "";
        let label = "";
        if (pipe >= 0) {
          target = inner.slice(0, pipe).trim();
          label = inner.slice(pipe + 1).trim();
        } else {
          target = inner.trim();
          label = target;
        }
        if (target && label) {
          const escTarget = target.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
          const escLabel = label.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          out += `<a href="#" data-wikilink="${escTarget}">${escLabel}</a>`;
          i = close + 2;
          continue;
        }
      }
    }

    out += ch;
    i += 1;
  }

  return out;
}

export function renderMarkdown(src: string): string {
  const body = stripFrontmatter(src);
  const withLinks = transformWikiLinks(body);
  return md.render(withLinks);
}

