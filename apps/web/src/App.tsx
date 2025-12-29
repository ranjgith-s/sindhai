import React, { useEffect, useMemo, useRef, useState } from "react";
import type { LocalGraph, NoteGet, NoteSummary } from "./api";
import {
  aiSummarize,
  aiSuggestLinks,
  aiSuggestTags,
  createNote,
  deleteNote,
  getLocalGraph,
  getNote,
  listNotesFiltered,
  updateNote,
} from "./api";
import { GraphPanel } from "./GraphPanel";
import type { MarkdownEditorHandle } from "./MarkdownEditor";
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
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [active, setActive] = useState<NoteGet | null>(null);
  const [graph, setGraph] = useState<LocalGraph | null>(null);
  const [editor, setEditor] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingNote, setLoadingNote] = useState(false);
  const [viewMode, setViewMode] = useState<"split" | "edit" | "preview">("split");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [page, setPage] = useState<"note" | "graph" | "settings">("note");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [aiSummary, setAiSummary] = useState<{ provider: string; markdown: string } | null>(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [suggestedLinks, setSuggestedLinks] = useState<Array<{ id: string; score: number }>>([]);
  const [suggestedTags, setSuggestedTags] = useState<Array<{ tag: string; confidence: number }>>([]);
  const [aiSuggestLoading, setAiSuggestLoading] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const toastTimer = useRef<number | null>(null);
  const saveCounterRef = useRef(0);
  const activeSaveTokenRef = useRef(0);
  const savingTokenRef = useRef<number | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const queryRef = useRef("");
  const tagRef = useRef<string | null>(null);
  const pendingSaveRef = useRef<{ noteId: string; content: string; token: number } | null>(null);
  const draftsRef = useRef(new Map<string, string>());
  const editorHandleRef = useRef<MarkdownEditorHandle | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const notesById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);

  function parseLocation(): { page: "note" | "graph" | "settings"; noteId: string | null } {
    const path = window.location.pathname || "/";
    if (path.startsWith("/note/")) {
      const id = path.slice("/note/".length);
      return { page: "note", noteId: decodeURIComponent(id) || null };
    }
    if (path === "/graph") {
      const params = new URLSearchParams(window.location.search);
      const nid = params.get("noteId");
      return { page: "graph", noteId: nid };
    }
    if (path === "/settings") return { page: "settings", noteId: null };
    return { page: "note", noteId: null };
  }

  function navigate(path: string, opts: { replace?: boolean } = {}) {
    const target = path.startsWith("/") ? path : `/${path}`;
    if (opts.replace) window.history.replaceState({}, "", target);
    else window.history.pushState({}, "", target);
  }

  async function navigateToNote(noteId: string, opts: { replace?: boolean } = {}) {
    setPage("note");
    navigate(`/note/${encodeURIComponent(noteId)}`, opts);
    await switchToNote(noteId);
  }

  function navigateToGraph(opts: { replace?: boolean } = {}) {
    setPage("graph");
    const params = new URLSearchParams();
    if (activeIdRef.current) params.set("noteId", activeIdRef.current);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    navigate(`/graph${suffix}`, opts);
  }

  function navigateToSettings(opts: { replace?: boolean } = {}) {
    setPage("settings");
    navigate("/settings", opts);
  }

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of notes) {
      for (const t of n.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
  }, [notes]);

  const wikiLinkCandidates = useMemo(() => {
    const out: Array<{ label: string; target: string; detail?: string }> = [];
    const seen = new Set<string>();
    for (const n of notes) {
      const add = (target: string, label: string, detail?: string) => {
        const key = `${target}\n${detail ?? ""}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ label, target, detail });
      };
      add(n.title, n.title);
      const s = stem(n.path);
      if (s && s !== n.title) add(s, s, n.title);
      for (const a of n.aliases ?? []) {
        if (!a || a === n.title) continue;
        add(a, a, n.title);
      }
    }
    return out;
  }, [notes]);

  function insertWikiLink(target: string) {
    const text = `[[${target}]]`;
    if (editorHandleRef.current) {
      editorHandleRef.current.insertText(text);
      return;
    }
    const sep = editor && !editor.endsWith("\n") ? "\n" : "";
    const next = `${editor}${sep}${text}`;
    setEditor(next);
    scheduleSave(next);
  }

  function insertWikiLinkForNote(noteId: string) {
    const n = notesById.get(noteId);
    if (!n) return;
    insertWikiLink(n.title);
  }

  function normalizeFrontmatterTags(frontmatter: Record<string, unknown>): string[] {
    const raw = frontmatter.tags;
    if (typeof raw === "string") return raw.split(/[,\\n]/).map((t) => t.trim()).filter(Boolean);
    if (Array.isArray(raw)) return raw.filter((t): t is string => typeof t === "string").map((t) => t.trim()).filter(Boolean);
    return [];
  }

  function moveSelection(delta: number) {
    if (!notes.length) return;
    setSelectedIndex((idx) => Math.max(0, Math.min(notes.length - 1, idx + delta)));
  }

  function openSelected() {
    const id = notes[selectedIndex]?.id;
    if (id) void navigateToNote(id);
  }

  async function refreshListNow() {
    const items = await listNotesFiltered({ q: queryRef.current, tag: tagRef.current ?? undefined });
    setNotes(items);
    if (!activeIdRef.current && items[0] && page === "note") void navigateToNote(items[0].id, { replace: true });
  }

  useEffect(() => {
    const t = window.setTimeout(() => void refreshListNow(), 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, tagFilter, page]);

  useEffect(() => {
    activeIdRef.current = activeId;
    if (activeId) window.localStorage.setItem("sindhai:lastNoteId", activeId);
  }, [activeId]);

  useEffect(() => {
    const last = window.localStorage.getItem("sindhai:lastNoteId");
    const loc = parseLocation();
    setPage(loc.page);
    if (loc.noteId) {
      void switchToNote(loc.noteId);
    } else if (last) {
      void navigateToNote(last, { replace: true });
    } else {
      // Stay on the note list.
      navigate("/", { replace: true });
    }

    const onPop = () => {
      const next = parseLocation();
      setPage(next.page);
      if (next.noteId && next.noteId !== activeIdRef.current) {
        void switchToNote(next.noteId);
      }
    };
    window.addEventListener("popstate", onPop);
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  useEffect(() => {
    tagRef.current = tagFilter;
  }, [tagFilter]);

  useEffect(() => {
    if (!notes.length) return;
    if (!activeIdRef.current) {
      setSelectedIndex(0);
      return;
    }
    const idx = notes.findIndex((n) => n.id === activeIdRef.current);
    if (idx >= 0) setSelectedIndex(idx);
  }, [notes, activeId]);

  useEffect(() => {
    if (!activeId) {
      setActive(null);
      setGraph(null);
      setEditor("");
      setLoadingNote(false);
      return;
    }
    (async () => {
      setLoadingNote(true);
      const [note, g] = await Promise.all([getNote(activeId), getLocalGraph(activeId)]);
      setActive(note);
      setGraph(g);
      const draft = draftsRef.current.get(activeId);
      if (draft !== undefined) {
        setEditor(draft);
      } else {
        draftsRef.current.set(activeId, note.note.content_markdown);
        setEditor(note.note.content_markdown);
      }
      setLoadingNote(false);
    })().catch((e) => {
      console.error(e);
      setActive(null);
      setGraph(null);
      setLoadingNote(false);
    });
  }, [activeId]);

  useEffect(() => {
    setEditingTitle(false);
    setTitleDraft(active?.note.title ?? "");
  }, [active?.note.id, active?.note.title]);

  useEffect(() => {
    if (!activeId) {
      setAiSummary(null);
      setSuggestedLinks([]);
      setSuggestedTags([]);
      return;
    }
    setAiSuggestLoading(true);
    void Promise.all([aiSuggestLinks(activeId, 8), aiSuggestTags(activeId, 12)])
      .then(([links, tags]) => {
        setSuggestedLinks(links.items ?? []);
        setSuggestedTags(tags.items ?? []);
      })
      .catch((e) => {
        console.error(e);
        setSuggestedLinks([]);
        setSuggestedTags([]);
      })
      .finally(() => setAiSuggestLoading(false));
  }, [activeId]);

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2500);
  }

  async function runSummarize() {
    if (!activeId) return;
    setAiSummaryLoading(true);
    try {
      const res = await aiSummarize({ noteId: activeId, mode: "local" });
      setAiSummary({ provider: res.provider, markdown: res.summary_markdown });
    } catch (e) {
      console.error(e);
      showToast("Summarize failed.");
      setAiSummary(null);
    } finally {
      setAiSummaryLoading(false);
    }
  }

  async function saveSummaryAsNote() {
    if (!active || !aiSummary) return;
    const title = `Summary - ${active.note.title}`;
    const created = await createNote({ title });
    const now = new Date().toISOString();
    await updateNote(created.id, {
      content_markdown: aiSummary.markdown || "",
      frontmatter: {
        tags: ["summary"],
        source_note_id: active.note.id,
        source_note_path: active.note.path,
        generated_at: now,
        provider: aiSummary.provider,
      },
    });
    await refreshListNow();
    draftsRef.current.set(created.id, aiSummary.markdown || "");
    void navigateToNote(created.id);
  }

  async function acceptSuggestedTag(tag: string) {
    if (!activeId || !active) return;
    const frontmatter = (active.note.frontmatter ?? {}) as Record<string, unknown>;
    const existing = normalizeFrontmatterTags(frontmatter).map((t) => t.toLowerCase());
    if (existing.includes(tag.toLowerCase())) return;
    const mergedTags = [...normalizeFrontmatterTags(frontmatter), tag];
    const nextFrontmatter = { ...frontmatter, tags: mergedTags };
    await updateNote(activeId, { content_markdown: editor, frontmatter: nextFrontmatter });
    showToast(`Added tag #${tag}`);
    await refreshListNow();
    const [note, g] = await Promise.all([getNote(activeId), getLocalGraph(activeId)]);
    setActive(note);
    setGraph(g);
  }

  async function saveNote(noteId: string, content: string, token: number) {
    const isStillActive = activeIdRef.current === noteId;
    try {
      if (isStillActive) {
        savingTokenRef.current = token;
        setSaving(true);
      }

      await updateNote(noteId, { content_markdown: content });
      draftsRef.current.set(noteId, content);

      if (activeIdRef.current === noteId && activeSaveTokenRef.current === token) {
        const [note, g] = await Promise.all([getNote(noteId), getLocalGraph(noteId)]);
        setActive(note);
        setGraph(g);
        setEditor(note.note.content_markdown);
      }

      await refreshListNow();
    } finally {
      if (savingTokenRef.current === token) {
        savingTokenRef.current = null;
        setSaving(false);
      }
      if (pendingSaveRef.current?.noteId === noteId && pendingSaveRef.current?.token === token) {
        pendingSaveRef.current = null;
      }
    }
  }

  function scheduleSave(next: string) {
    if (!activeId) return;
    const noteId = activeId;
    const token = (saveCounterRef.current += 1);
    activeSaveTokenRef.current = token;
    draftsRef.current.set(noteId, next);

    const pending = pendingSaveRef.current;
    if (pending && pending.noteId !== noteId) {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      void saveNote(pending.noteId, pending.content, pending.token);
    }
    pendingSaveRef.current = { noteId, content: next, token };

    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const latest = pendingSaveRef.current;
      if (!latest || latest.noteId !== noteId || latest.token !== token) return;
      await saveNote(noteId, latest.content, token);
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
    pendingSaveRef.current = null;
    const noteId = activeId;
    const token = (saveCounterRef.current += 1);
    activeSaveTokenRef.current = token;
    const frontmatter = (active.note.frontmatter ?? {}) as Record<string, unknown>;
    const merged = { ...frontmatter, title: nextTitle };
    try {
      savingTokenRef.current = token;
      setSaving(true);
      await updateNote(noteId, { content_markdown: editor, frontmatter: merged });
      draftsRef.current.set(noteId, editor);

      if (activeIdRef.current === noteId && activeSaveTokenRef.current === token) {
        const [note, g] = await Promise.all([getNote(noteId), getLocalGraph(noteId)]);
        setActive(note);
        setGraph(g);
        setEditor(note.note.content_markdown);
      }

      await refreshListNow();
    } finally {
      if (savingTokenRef.current === token) {
        savingTokenRef.current = null;
        setSaving(false);
      }
    }
  }

  async function onNewNote() {
    const title = window.prompt("New note title")?.trim();
    if (!title) return;
    const created = await createNote({ title });
    await refreshListNow();
    draftsRef.current.set(created.id, created.content_markdown);
    void navigateToNote(created.id);
  }

  async function onDeleteNote() {
    if (!activeId) return;
    const title = notesById.get(activeId)?.title ?? "this note";
    if (!window.confirm(`Delete ${title}?`)) return;
    await deleteNote(activeId);
    const items = await listNotesFiltered({ q: queryRef.current, tag: tagRef.current ?? undefined });
    setNotes(items);
    const next = items[0]?.id ?? null;
    if (next) void navigateToNote(next, { replace: true });
    else {
      setActiveId(null);
      navigate("/", { replace: true });
    }
  }

  function resolveWikiLink(target: string): string | null {
    const t = normalizeWikiTarget(target);
    for (const n of notes) {
      if (normalizeWikiTarget(n.title) === t) return n.id;
      for (const a of n.aliases ?? []) {
        if (normalizeWikiTarget(a) === t) return n.id;
      }
      if (stem(n.path) === t) return n.id;
    }
    return null;
  }

  async function openOrCreateWiki(target: string) {
    const resolved = resolveWikiLink(target);
    if (resolved) {
      void navigateToNote(resolved);
      return;
    }
    if (!window.confirm(`Create note "${target}"?`)) return;
    const created = await createNote({ title: target });
    await refreshListNow();
    draftsRef.current.set(created.id, created.content_markdown);
    void navigateToNote(created.id);
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
      void navigateToNote(resolved);
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
    await refreshListNow();
    draftsRef.current.set(created.id, created.content_markdown);
    void navigateToNote(created.id);
  }

  async function switchToNote(nextId: string) {
    const currentId = activeIdRef.current;
    if (currentId && currentId !== nextId) {
      draftsRef.current.set(currentId, editor);
      const pending = pendingSaveRef.current;
      if (pending && pending.noteId === currentId) {
        pendingSaveRef.current = null;
        if (saveTimer.current) window.clearTimeout(saveTimer.current);
        await saveNote(pending.noteId, pending.content, pending.token);
      }
    }

    setActive(null);
    setGraph(null);
    setLoadingNote(true);
    setActiveId(nextId);
    const draft = draftsRef.current.get(nextId);
    setEditor(draft ?? "");
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
              ref={searchInputRef}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:border-sky-400/50 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
              placeholder="Search…"
              aria-label="Search notes"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  moveSelection(1);
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  moveSelection(-1);
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  openSelected();
                } else if (e.key === "Escape") {
                  setQuery("");
                  setTagFilter(null);
                }
              }}
            />
            <div className="mt-3">
              <div className="mb-2 text-xs font-semibold text-slate-200/80">Tags</div>
              <div className="flex flex-wrap gap-2">
                <button
                  className={[
                    "rounded-full border px-3 py-1 text-xs transition",
                    tagFilter === null
                      ? "border-sky-400/40 bg-sky-400/10 text-slate-100"
                      : "border-white/10 bg-white/5 text-slate-200/80 hover:border-white/20 hover:bg-white/10",
                  ].join(" ")}
                  onClick={() => setTagFilter(null)}
                >
                  All
                </button>
                {tagCounts.map(([tag, count]) => (
                  <button
                    key={tag}
                    className={[
                      "rounded-full border px-3 py-1 text-xs transition",
                      tagFilter === tag
                        ? "border-sky-400/40 bg-sky-400/10 text-slate-100"
                        : "border-white/10 bg-white/5 text-slate-200/80 hover:border-white/20 hover:bg-white/10",
                    ].join(" ")}
                    onClick={() => setTagFilter((cur) => (cur === tag ? null : tag))}
                    title={`${count} note${count === 1 ? "" : "s"}`}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto px-2 pb-3">
            <div className="flex flex-col gap-2" role="listbox" aria-label="Note list">
              {notes.map((n) => {
                const isActive = n.id === activeId;
                const isSelected = n.id === notes[selectedIndex]?.id;
                return (
                  <button
                    key={n.id}
                    className={[
                      "w-full rounded-xl border px-3 py-2 text-left transition active:translate-y-px",
                      isActive
                        ? "border-sky-400/40 bg-sky-400/10 ring-1 ring-sky-400/20"
                        : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10",
                      isSelected ? "outline outline-2 outline-sky-400/30" : "",
                    ].join(" ")}
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={isSelected ? 0 : -1}
                    onClick={() => void navigateToNote(n.id)}
                    onMouseEnter={() => setSelectedIndex(notes.findIndex((x) => x.id === n.id))}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        moveSelection(1);
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        moveSelection(-1);
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        void navigateToNote(n.id);
                      }
                    }}
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

              <div className="inline-flex gap-2">
                <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
                  {(
                    [
                      { key: "note" as const, label: "Note", onClick: () => (activeId ? void navigateToNote(activeId) : navigate("/", { replace: false })) },
                      { key: "graph" as const, label: "Graph", onClick: () => navigateToGraph() },
                      { key: "settings" as const, label: "Settings", onClick: () => navigateToSettings() },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.key}
                      className={[
                        "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                        page === item.key
                          ? "bg-sky-400/20 text-slate-100"
                          : "text-slate-200/80 hover:bg-white/5 hover:text-slate-100",
                      ].join(" ")}
                      onClick={item.onClick}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {page === "note" ? (
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
                ) : null}
              </div>
            </div>

            <div className="mt-2 truncate text-xs text-slate-300/80">
              {saving ? "Saving…" : loadingNote ? "Loading…" : active ? active.note.updated_at : ""}
              {active?.note.tags?.length ? ` • #${active.note.tags.join(" #")}` : ""}
              {active?.note.frontmatter_error ? ` • ${active.note.frontmatter_error}` : ""}
              {active?.note.path ? ` • ${active.note.path}` : ""}
            </div>
          </div>

          {page === "settings" ? (
            <div className="flex-1 min-h-0 overflow-auto p-5">
              <div className="max-w-2xl">
                <div className="text-lg font-semibold">Settings</div>
                <div className="mt-2 text-sm text-slate-300/80">
                  Vault path and external AI enablement are server-side for MVP. Use <code>AI_EXTERNAL_ENABLED</code> to
                  control external providers.
                </div>

                <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-sm font-semibold">Keyboard</div>
                  <div className="mt-2 text-sm text-slate-300/80">
                    <code>Ctrl/⌘+K</code> focuses search. Arrow keys navigate the note list; <code>Enter</code> opens.
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-sm font-semibold">Manual Import</div>
                  <div className="mt-2 text-sm text-slate-300/80">
                    Paste text (and optional URLs). Saves as a new note tagged <code>imported</code>.
                  </div>
                  <ManualImport
                    onSave={async (title, body, urls) => {
                      const created = await createNote({ title });
                      const now = new Date().toISOString();
                      const refs = urls.length ? `\n\n## References\n\n${urls.map((u) => `- ${u}`).join("\n")}\n` : "";
                      await updateNote(created.id, {
                        content_markdown: `${body.trim()}\n${refs}`.trim() + "\n",
                        frontmatter: { tags: ["imported"], imported_at: now, import_source: "manual" },
                      });
                      await refreshListNow();
                      draftsRef.current.set(created.id, body);
                      void navigateToNote(created.id);
                    }}
                  />
                </div>
              </div>
            </div>
          ) : page === "graph" ? (
            <div className="flex-1 min-h-0 overflow-auto p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">Graph</div>
                {activeId ? (
                  <button
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200/80 hover:border-white/20 hover:bg-white/10"
                    onClick={() => void navigateToNote(activeId)}
                  >
                    Back to note
                  </button>
                ) : null}
              </div>
              <GraphPanel graph={graph} onOpenNote={(id) => void navigateToNote(id)} heightClassName="h-[70vh]" />
              <div className="mt-3 text-xs text-slate-300/70">Local graph (1-hop) for the current note.</div>
            </div>
          ) : (
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
                    ref={(h) => {
                      editorHandleRef.current = h;
                    }}
                    wikiLinkCandidates={wikiLinkCandidates}
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
                  aria-label="Preview"
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
                >
                  {active?.note.tags?.length ? (
                    <div className="mb-3 flex flex-wrap gap-2 not-prose">
                      {active.note.tags.map((t) => (
                        <button
                          key={t}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200/80 hover:border-white/20 hover:bg-white/10"
                          onClick={() => setTagFilter(t)}
                          title="Filter by tag"
                        >
                          #{t}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                </div>
              ) : null}
            </div>
          )}
        </main>

        {page === "note" ? (
        <aside className="hidden min-w-0 flex-col overflow-auto border-l border-white/10 bg-slate-900/50 backdrop-blur-xl xl:flex">
          <div className="border-b border-white/10 p-3">
            <div className="text-sm font-semibold">References</div>
            <div className="mt-2 flex flex-col gap-2">
              {references.internal.map((r) =>
                r.kind === "wikilink" ? (
                  <button
                    key={`wiki:${r.target}`}
                    className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-sm transition hover:border-white/20 hover:bg-white/10"
                    onClick={() => (r.resolvedId ? void navigateToNote(r.resolvedId) : void openOrCreateWiki(r.target))}
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
                        void navigateToNote(r.resolvedId);
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
                  onClick={() => void navigateToNote(n.id)}
                >
                  <span className="truncate">{n.title}</span>
                </button>
              ))}
              {!active?.backlinks?.length ? <div className="text-xs text-slate-300/70">None</div> : null}
            </div>
          </div>

          <div className="border-b border-white/10 p-3">
            <div className="text-sm font-semibold">AI</div>
            <div className="mt-2 flex flex-col gap-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-200/80">Summarize</div>
                  <button
                    className="rounded-lg border border-sky-400/30 bg-sky-400/10 px-2 py-1 text-xs font-semibold hover:border-sky-300/50 hover:bg-sky-400/15 disabled:opacity-50"
                    onClick={() => void runSummarize()}
                    disabled={!activeId || aiSummaryLoading}
                  >
                    {aiSummaryLoading ? "…" : "Run"}
                  </button>
                </div>
                {aiSummary ? (
                  <div className="mt-2">
                    <div className="text-xs text-slate-300/70">Provider: {aiSummary.provider}</div>
                    <div
                      className={[
                        "mt-2 max-h-40 overflow-auto rounded-lg border border-white/10 bg-black/20 p-2",
                        "prose prose-invert max-w-none text-sm",
                      ].join(" ")}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(aiSummary.markdown) }}
                    />
                    <button
                      className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold hover:border-white/20 hover:bg-white/10"
                      onClick={() => void saveSummaryAsNote()}
                    >
                      Save summary as note
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-200/80">Suggested links</div>
                  <div className="text-xs text-slate-300/70">{aiSuggestLoading ? "…" : ""}</div>
                </div>
                <div className="mt-2 flex flex-col gap-2">
                  {suggestedLinks.map((s) => {
                    const n = notesById.get(s.id);
                    if (!n) return null;
                    return (
                      <div key={s.id} className="flex items-center gap-2">
                        <button
                          className="flex-1 truncate rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-xs hover:border-white/20 hover:bg-white/10"
                          onClick={() => void navigateToNote(s.id)}
                          title={n.path}
                        >
                          {n.title} <span className="text-slate-300/70">({s.score.toFixed(3)})</span>
                        </button>
                        <button
                          className="rounded-lg border border-sky-400/30 bg-sky-400/10 px-2 py-2 text-xs font-semibold hover:border-sky-300/50 hover:bg-sky-400/15"
                          onClick={() => {
                            insertWikiLinkForNote(s.id);
                            showToast(`Inserted [[${n.title}]]`);
                          }}
                          title="Insert link at cursor"
                        >
                          Insert
                        </button>
                      </div>
                    );
                  })}
                  {!suggestedLinks.length ? <div className="text-xs text-slate-300/70">None</div> : null}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-200/80">Suggested tags</div>
                  <div className="text-xs text-slate-300/70">{aiSuggestLoading ? "…" : ""}</div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {suggestedTags.map((t) => (
                    <button
                      key={t.tag}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200/80 hover:border-white/20 hover:bg-white/10"
                      onClick={() => void acceptSuggestedTag(t.tag)}
                      title={`Confidence ${t.confidence.toFixed(2)}`}
                    >
                      #{t.tag}
                    </button>
                  ))}
                  {!suggestedTags.length ? <div className="text-xs text-slate-300/70">None</div> : null}
                </div>
              </div>
            </div>
          </div>

          <div className="border-b border-white/10 p-3">
            <div className="text-sm font-semibold">Related</div>
            <div className="mt-2 flex flex-col gap-2">
              {(active?.related_notes ?? []).map((n) => (
                <div key={n.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <button className="min-w-0 flex-1 truncate text-left text-sm" onClick={() => void navigateToNote(n.id)}>
                      {n.title} <span className="text-xs text-slate-300/70">({n.score.toFixed(3)})</span>
                    </button>
                    <button
                      className="rounded-lg border border-sky-400/30 bg-sky-400/10 px-2 py-1 text-xs font-semibold hover:border-sky-300/50 hover:bg-sky-400/15"
                      onClick={() => {
                        insertWikiLinkForNote(n.id);
                        showToast(`Inserted [[${n.title}]]`);
                      }}
                      title="Insert link at cursor"
                    >
                      Insert
                    </button>
                  </div>
                  {n.snippet ? <div className="mt-2 text-xs text-slate-300/70">{n.snippet}</div> : null}
                </div>
              ))}
              {!active?.related_notes?.length ? <div className="text-xs text-slate-300/70">None</div> : null}
            </div>
          </div>

          <div className="p-3">
            <div className="text-sm font-semibold">Local Graph</div>
            <div className="mt-2">
              <GraphPanel graph={graph} onOpenNote={(id) => void navigateToNote(id)} />
            </div>
          </div>
        </aside>
        ) : null}
      </div>

      {toast ? (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/10 bg-slate-900/90 px-4 py-2 text-sm text-slate-100 shadow-lg backdrop-blur">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function ManualImport({
  onSave,
}: {
  onSave: (title: string, body: string, urls: string[]) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [urls, setUrls] = useState("");
  const [saving, setSaving] = useState(false);

  const parsedUrls = useMemo(() => {
    return urls
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean);
  }, [urls]);

  return (
    <div className="mt-4 space-y-3">
      <input
        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:border-sky-400/50 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="h-40 w-full resize-y rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:border-sky-400/50 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
        placeholder="Paste imported text…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <textarea
        className="h-24 w-full resize-y rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:border-sky-400/50 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
        placeholder="Optional URLs (one per line)…"
        value={urls}
        onChange={(e) => setUrls(e.target.value)}
      />
      <button
        className="inline-flex items-center justify-center rounded-xl border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-sky-300/50 hover:bg-sky-400/15 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!title.trim() || !body.trim() || saving}
        onClick={async () => {
          setSaving(true);
          try {
            await onSave(title.trim(), body, parsedUrls);
            setTitle("");
            setBody("");
            setUrls("");
          } finally {
            setSaving(false);
          }
        }}
      >
        {saving ? "Saving…" : "Save import"}
      </button>
    </div>
  );
}
