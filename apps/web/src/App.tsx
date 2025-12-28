import React, { useEffect, useMemo, useRef, useState } from "react";
import type { LocalGraph, NoteGet, NoteSummary } from "./api";
import { createNote, deleteNote, getLocalGraph, getNote, listNotes, updateNote } from "./api";
import { GraphPanel } from "./GraphPanel";
import { MarkdownEditor } from "./MarkdownEditor";
import { extractLinks, renderMarkdown } from "./markdown";

function normalizeWikiTarget(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

function stem(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.endsWith(".md") ? base.slice(0, -3) : base;
}

function stripQueryAndHash(s: string): string {
  const q = s.indexOf("?");
  const h = s.indexOf("#");
  const end = q === -1 ? (h === -1 ? s.length : h) : h === -1 ? q : Math.min(q, h);
  return s.slice(0, end);
}

function safeDecodeURIComponent(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function App() {
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [active, setActive] = useState<NoteGet | null>(null);
  const [graph, setGraph] = useState<LocalGraph | null>(null);
  const [editor, setEditor] = useState("");
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<"split" | "edit" | "preview">("split");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const saveTimer = useRef<number | null>(null);
  const toastTimer = useRef<number | null>(null);

  const notesById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);

  async function refreshList(nextQuery?: string) {
    const items = await listNotes(nextQuery ?? query);
    setNotes(items);
    if (!activeId && items[0]) setActiveId(items[0].id);
  }

  useEffect(() => {
    const t = window.setTimeout(() => void refreshList(query), 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    if (!activeId) {
      setActive(null);
      setGraph(null);
      setEditor("");
      return;
    }
    (async () => {
      const [note, g] = await Promise.all([getNote(activeId), getLocalGraph(activeId)]);
      setActive(note);
      setGraph(g);
      setEditor(note.note.content_markdown);
    })().catch((e) => {
      console.error(e);
      setActive(null);
      setGraph(null);
    });
  }, [activeId]);

  useEffect(() => {
    setEditingTitle(false);
    setTitleDraft(active?.note.title ?? "");
  }, [active?.note.id, active?.note.title]);

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2500);
  }

  function scheduleSave(next: string) {
    if (!activeId) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      try {
        setSaving(true);
        await updateNote(activeId, { content_markdown: next });
        const [note, g] = await Promise.all([getNote(activeId), getLocalGraph(activeId)]);
        setActive(note);
        setGraph(g);
        await refreshList();
      } finally {
        setSaving(false);
      }
    }, 800);
  }

  async function commitTitle() {
    if (!activeId || !active) return;
    const nextTitle = titleDraft.trim();
    setEditingTitle(false);
    if (!nextTitle || nextTitle === active.note.title) {
      setTitleDraft(active.note.title);
      return;
    }
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const frontmatter = (active.note.frontmatter ?? {}) as Record<string, unknown>;
    const merged = { ...frontmatter, title: nextTitle };
    try {
      setSaving(true);
      await updateNote(activeId, { content_markdown: editor, frontmatter: merged });
      const [note, g] = await Promise.all([getNote(activeId), getLocalGraph(activeId)]);
      setActive(note);
      setGraph(g);
      setEditor(note.note.content_markdown);
      await refreshList();
    } finally {
      setSaving(false);
    }
  }

  async function onNewNote() {
    const title = window.prompt("New note title")?.trim();
    if (!title) return;
    const created = await createNote({ title });
    await refreshList();
    setActiveId(created.id);
  }

  async function onDeleteNote() {
    if (!activeId) return;
    const title = notesById.get(activeId)?.title ?? "this note";
    if (!window.confirm(`Delete ${title}?`)) return;
    await deleteNote(activeId);
    await refreshList();
    setActiveId(notes[0]?.id ?? null);
  }

  function resolveWikiLink(target: string): string | null {
    const t = normalizeWikiTarget(target);
    for (const n of notes) {
      if (normalizeWikiTarget(n.title) === t) return n.id;
      if (stem(n.path) === t) return n.id;
    }
    return null;
  }

  async function openOrCreateWiki(target: string) {
    const resolved = resolveWikiLink(target);
    if (resolved) {
      setActiveId(resolved);
      return;
    }
    if (!window.confirm(`Create note "${target}"?`)) return;
    const created = await createNote({ title: target });
    await refreshList();
    setActiveId(created.id);
  }

  function resolveInternalMarkdownHref(rawHref: string): string | null {
    const decoded = safeDecodeURIComponent(rawHref);
    const href = stripQueryAndHash(decoded).replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\//, "");
    if (!href) return null;

    const hrefNorm = href.toLowerCase().endsWith(".markdown") ? href.replace(/\.markdown$/i, ".md") : href;
    for (const n of notes) {
      if (n.path === hrefNorm) return n.id;
    }
    if (!hrefNorm.toLowerCase().endsWith(".md")) {
      for (const n of notes) {
        if (n.path === `${hrefNorm}.md`) return n.id;
      }
    }

    const stemCandidate = hrefNorm.endsWith(".md") ? stem(hrefNorm) : hrefNorm;
    return resolveWikiLink(stemCandidate);
  }

  async function openOrCreateInternalHref(rawHref: string) {
    const resolved = resolveInternalMarkdownHref(rawHref);
    if (resolved) {
      setActiveId(resolved);
      return;
    }

    const decoded = safeDecodeURIComponent(rawHref);
    const href = stripQueryAndHash(decoded).replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\//, "");
    if (!href) return;

    const base = href.toLowerCase().endsWith(".markdown") ? href.replace(/\.markdown$/i, ".md") : href;
    const titleGuess = stem(base);
    const createPath = base.toLowerCase().endsWith(".md") ? base : base.includes("/") ? `${base}.md` : undefined;
    const promptLabel = createPath ? `"${createPath}"` : `"${titleGuess}"`;
    if (!window.confirm(`Create note ${promptLabel}?`)) return;
    const created = await createNote({ title: titleGuess, path: createPath });
    await refreshList();
    setActiveId(created.id);
  }

  const references = useMemo(() => {
    const refs = extractLinks(editor);
    const internal: Array<
      | { kind: "wikilink"; label: string; target: string; resolvedId: string | null }
      | { kind: "internal-note" | "internal-file"; label: string; href: string; resolvedId: string | null }
    > = [];
    const external: Array<{ label: string; href: string }> = [];
    const seen = new Set<string>();

    for (const r of refs) {
      if (r.type === "external") {
        const key = `ext:${r.href}`;
        if (seen.has(key)) continue;
        seen.add(key);
        external.push({ label: r.label, href: r.href });
        continue;
      }
      if (r.type === "wikilink") {
        const key = `wiki:${r.target}`;
        if (seen.has(key)) continue;
        seen.add(key);
        internal.push({ kind: "wikilink", label: r.label, target: r.target, resolvedId: resolveWikiLink(r.target) });
        continue;
      }
      if (r.type === "internal-note" || r.type === "internal-file") {
        const key = `in:${r.href}`;
        if (seen.has(key)) continue;
        seen.add(key);
        internal.push({
          kind: r.type,
          label: r.label,
          href: r.href,
          resolvedId: resolveInternalMarkdownHref(r.href),
        });
      }
    }

    return { internal, external };
  }, [editor, notes]);

  const previewHtml = useMemo(() => renderMarkdown(editor), [editor]);

  return (
    <div className="h-full bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100">
      <div className="grid h-full grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_360px]">
        <aside className="hidden min-w-0 flex-col border-r border-white/10 bg-slate-900/50 backdrop-blur-xl md:flex">
          <div className="flex items-center gap-2 border-b border-white/10 p-3">
            <button
              className="inline-flex items-center justify-center rounded-xl border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-sky-300/50 hover:bg-sky-400/15 active:translate-y-px"
              onClick={() => void onNewNote()}
            >
              New
            </button>
            <button
              className="inline-flex items-center justify-center rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-rose-300/50 hover:bg-rose-400/15 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!activeId}
              onClick={() => void onDeleteNote()}
            >
              Delete
            </button>
          </div>

          <div className="p-3">
            <input
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:border-sky-400/50 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="flex-1 overflow-auto px-2 pb-3">
            <div className="flex flex-col gap-2">
              {notes.map((n) => {
                const isActive = n.id === activeId;
                return (
                  <button
                    key={n.id}
                    className={[
                      "w-full rounded-xl border px-3 py-2 text-left transition active:translate-y-px",
                      isActive
                        ? "border-sky-400/40 bg-sky-400/10 ring-1 ring-sky-400/20"
                        : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10",
                    ].join(" ")}
                    onClick={() => setActiveId(n.id)}
                  >
                    <div className="truncate text-sm font-semibold">{n.title}</div>
                    <div className="mt-1 truncate text-xs text-slate-300/80">{n.path}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-col">
          <div className="border-b border-white/10 bg-slate-950/30 px-4 py-3 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                {editingTitle ? (
                  <input
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-base font-semibold text-slate-100 focus:border-sky-400/50 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                    value={titleDraft}
                    autoFocus
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={() => void commitTitle()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void commitTitle();
                      if (e.key === "Escape") {
                        setEditingTitle(false);
                        setTitleDraft(active?.note.title ?? "");
                      }
                    }}
                  />
                ) : (
                  <button
                    className="w-full truncate rounded-xl border border-transparent px-3 py-2 text-left text-base font-semibold text-slate-100 transition hover:border-white/10 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => {
                      setTitleDraft(active?.note.title ?? "");
                      setEditingTitle(true);
                    }}
                    disabled={!activeId}
                    title={active ? `Path: ${active.note.path}` : ""}
                  >
                    {active?.note.title ?? "No note selected"}
                  </button>
                )}
              </div>

              <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
                {(["edit", "split", "preview"] as const).map((mode) => (
                  <button
                    key={mode}
                    className={[
                      "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                      viewMode === mode
                        ? "bg-sky-400/20 text-slate-100"
                        : "text-slate-200/80 hover:bg-white/5 hover:text-slate-100",
                    ].join(" ")}
                    onClick={() => setViewMode(mode)}
                    title={mode === "edit" ? "Editor" : mode === "split" ? "Split view" : "Preview"}
                  >
                    {mode === "edit" ? "Edit" : mode === "split" ? "Split" : "Preview"}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-2 truncate text-xs text-slate-300/80">
              {saving ? "Saving…" : active ? active.note.updated_at : ""}
              {active?.note.tags?.length ? ` • #${active.note.tags.join(" #")}` : ""}
              {active?.note.frontmatter_error ? ` • ${active.note.frontmatter_error}` : ""}
              {active?.note.path ? ` • ${active.note.path}` : ""}
            </div>
          </div>

          <div
            className={[
              "grid flex-1 min-h-0",
              viewMode === "split" ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1",
            ].join(" ")}
          >
            {viewMode !== "preview" ? (
              <div
                className={[
                  "min-h-0",
                  viewMode === "split" ? "border-b border-white/10 lg:border-b-0 lg:border-r" : "",
                ].join(" ")}
              >
                <MarkdownEditor
                  value={editor}
                  onChange={(next) => {
                    setEditor(next);
                    scheduleSave(next);
                  }}
                />
              </div>
            ) : null}

            {viewMode !== "edit" ? (
              <div
                className={[
                  "min-h-0 overflow-auto px-5 py-4",
                  "prose prose-invert max-w-none",
                  "prose-a:text-sky-300 prose-a:underline prose-a:underline-offset-4 hover:prose-a:text-sky-200",
                  "prose-pre:border prose-pre:border-white/10 prose-pre:bg-black/40 prose-pre:rounded-xl",
                  "prose-code:before:content-[''] prose-code:after:content-['']",
                  "prose-code:rounded-md prose-code:bg-white/5 prose-code:px-1 prose-code:py-0.5",
                ].join(" ")}
                onClick={(e) => {
                  const a = (e.target as HTMLElement | null)?.closest?.("a") as HTMLAnchorElement | null;
                  if (!a) return;

                  const wikilink = a.getAttribute("data-wikilink");
                  if (wikilink) {
                    e.preventDefault();
                    void openOrCreateWiki(wikilink);
                    return;
                  }

                  const internalHref = a.getAttribute("data-internal-href");
                  const linkType = a.getAttribute("data-link-type");
                  if (linkType === "unsafe") {
                    e.preventDefault();
                    showToast("Blocked unsafe link.");
                    return;
                  }
                  if (internalHref) {
                    e.preventDefault();
                    if (linkType === "internal-file") {
                      showToast(`File link: ${internalHref}`);
                      return;
                    }
                    void openOrCreateInternalHref(internalHref);
                  }
                }}
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            ) : null}
          </div>
        </main>

        <aside className="hidden min-w-0 flex-col overflow-auto border-l border-white/10 bg-slate-900/50 backdrop-blur-xl xl:flex">
          <div className="border-b border-white/10 p-3">
            <div className="text-sm font-semibold">References</div>
            <div className="mt-2 flex flex-col gap-2">
              {references.internal.map((r) =>
                r.kind === "wikilink" ? (
                  <button
                    key={`wiki:${r.target}`}
                    className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-sm transition hover:border-white/20 hover:bg-white/10"
                    onClick={() => (r.resolvedId ? setActiveId(r.resolvedId) : void openOrCreateWiki(r.target))}
                  >
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-200/80">
                      Note
                    </span>
                    <span className="truncate">{r.label}</span>
                  </button>
                ) : (
                  <button
                    key={`href:${r.href}`}
                    className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-sm transition hover:border-white/20 hover:bg-white/10"
                    onClick={() => {
                      if (r.resolvedId) {
                        setActiveId(r.resolvedId);
                        return;
                      }
                      if (r.kind === "internal-file") {
                        showToast(`File link: ${r.href}`);
                        return;
                      }
                      void openOrCreateInternalHref(r.href);
                    }}
                  >
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-200/80">
                      {r.kind === "internal-file" ? "File" : "Note"}
                    </span>
                    <span className="truncate">{r.label}</span>
                  </button>
                ),
              )}

              {!references.internal.length ? <div className="text-xs text-slate-300/70">No internal references</div> : null}

              {references.external.map((r) => (
                <a
                  key={`ext:${r.href}`}
                  className="flex items-center gap-2 rounded-xl border border-sky-400/20 bg-sky-400/10 px-3 py-2 text-left text-sm transition hover:border-sky-300/40 hover:bg-sky-400/15"
                  href={r.href}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 text-xs text-slate-100">
                    Ext
                  </span>
                  <span className="truncate">{r.label}</span>
                </a>
              ))}
            </div>
          </div>

          <div className="border-b border-white/10 p-3">
            <div className="text-sm font-semibold">Backlinks</div>
            <div className="mt-2 flex flex-col gap-2">
              {(active?.backlinks ?? []).map((n) => (
                <button
                  key={n.id}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-sm transition hover:border-white/20 hover:bg-white/10"
                  onClick={() => setActiveId(n.id)}
                >
                  <span className="truncate">{n.title}</span>
                </button>
              ))}
              {!active?.backlinks?.length ? <div className="text-xs text-slate-300/70">None</div> : null}
            </div>
          </div>

          <div className="border-b border-white/10 p-3">
            <div className="text-sm font-semibold">Related</div>
            <div className="mt-2 flex flex-col gap-2">
              {(active?.related_notes ?? []).map((n) => (
                <button
                  key={n.id}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-sm transition hover:border-white/20 hover:bg-white/10"
                  onClick={() => setActiveId(n.id)}
                >
                  <span className="truncate">{n.title}</span>{" "}
                  <span className="text-xs text-slate-300/70">({n.score.toFixed(3)})</span>
                </button>
              ))}
              {!active?.related_notes?.length ? <div className="text-xs text-slate-300/70">None</div> : null}
            </div>
          </div>

          <div className="p-3">
            <div className="text-sm font-semibold">Local Graph</div>
            <div className="mt-2">
              <GraphPanel graph={graph} onOpenNote={(id) => setActiveId(id)} />
            </div>
          </div>
        </aside>
      </div>

      {toast ? (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/10 bg-slate-900/90 px-4 py-2 text-sm text-slate-100 shadow-lg backdrop-blur">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
