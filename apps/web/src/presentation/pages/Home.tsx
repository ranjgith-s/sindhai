import React, { useEffect, useMemo, useRef, useState } from "react";
import type { LocalGraph, NoteGet, NoteSummary } from "../../domain/models";
import {
  aiSummarize,
  aiSuggestLinks,
  aiSuggestTags,
  createNote,
  deleteNote,
  getLocalGraph,
  getNote,
  listNotesFiltered,
  openaiChat,
  updateNote,
} from "../../infrastructure/api/client";
import { GraphPanel } from "../features/graph/GraphPanel";
import type { MarkdownEditorHandle } from "../features/editor/MarkdownEditor";
import { MarkdownEditor } from "../features/editor/MarkdownEditor";
import { Sidebar } from "../features/sidebar/Sidebar";
import { NoteList } from "../features/sidebar/NoteList";
import { MainLayout } from "../layouts/MainLayout";
import { extractLinks, renderMarkdown } from "../../infrastructure/markdown";
import { cn } from "../utils";
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

const _memoryStorage = new Map<string, string>();

function safeStorageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return _memoryStorage.get(key) ?? null;
  }
}

function safeStorageSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    _memoryStorage.set(key, value);
  }
}

export function Home() {
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [active, setActive] = useState<NoteGet | null>(null);
  const [graph, setGraph] = useState<LocalGraph | null>(null);
  const [editor, setEditor] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingNote, setLoadingNote] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [page, setPage] = useState<"note" | "graph" | "settings">("note");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(() => safeStorageGet("sindhai:showAdvanced") === "true");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [aiWriteScope, setAiWriteScope] = useState<"selection" | "note">("selection");
  const [aiWriteAction, setAiWriteAction] = useState<"rewrite" | "expand" | "fix" | "continue">("rewrite");
  const [aiWriteInstruction, setAiWriteInstruction] = useState("");
  const [aiWriteLoading, setAiWriteLoading] = useState(false);
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
    if (activeId) safeStorageSet("sindhai:lastNoteId", activeId);
  }, [activeId]);

  useEffect(() => {
    safeStorageSet("sindhai:showAdvanced", showAdvanced ? "true" : "false");
  }, [showAdvanced]);

  useEffect(() => {
    const last = safeStorageGet("sindhai:lastNoteId");
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

  function aiWriteInstructionFor(action: "rewrite" | "expand" | "fix" | "continue", extra: string): string {
    const suffix = extra.trim() ? `\n\nAdditional instruction:\n${extra.trim()}\n` : "";
    if (action === "rewrite") return `Rewrite the provided text for clarity and flow. Keep meaning and preserve Markdown.${suffix}`;
    if (action === "expand") return `Expand the provided text with more detail and structure. Preserve Markdown.${suffix}`;
    if (action === "fix") return `Fix grammar, spelling, and punctuation. Preserve tone and Markdown.${suffix}`;
    return `Continue writing from the provided text. Preserve Markdown.${suffix}`;
  }

  function aiWriteErrorMessage(e: unknown): string {
    const raw = e instanceof Error ? e.message : String(e);
    if (raw.includes("403")) return "External AI is disabled on the server.";
    if (raw.includes("provider_not_configured")) return "OpenAI is not configured on the server.";
    if (raw.includes("external_payload_too_large")) return "Selection is too large to send.";
    return "AI writing failed.";
  }

  async function runAiWrite() {
    if (!activeId) return;
    const editorHandle = editorHandleRef.current;
    const selection = editorHandle?.getSelection().text ?? "";
    const context = (aiWriteScope === "selection" ? selection : editor).trim();
    if (!context) {
      showToast(aiWriteScope === "selection" ? "Select text to use AI writing." : "Note is empty.");
      return;
    }

    const isWholeNote = aiWriteScope === "note";
    if (isWholeNote) {
      const actionLabel =
        aiWriteAction === "rewrite"
          ? "rewrite"
          : aiWriteAction === "expand"
            ? "expand"
            : aiWriteAction === "fix"
              ? "fix"
              : "continue";
      const title = active?.note.title ? `"${active.note.title}"` : "this note";
      if (
        !window.confirm(
          `Send ${title} (${context.length} chars) to OpenAI to ${actionLabel}? This content will leave the system.`,
        )
      ) {
        return;
      }
    }

    setAiWriteLoading(true);
    try {
      const res = await openaiChat({
        context,
        messages: [{ role: "user", content: aiWriteInstructionFor(aiWriteAction, aiWriteInstruction) }],
      });
      const out = (res.content || "").trim();
      if (!out) {
        showToast("AI returned empty output.");
        return;
      }

      if (aiWriteAction === "continue") {
        const prefix = editor && !editor.endsWith("\n") ? "\n\n" : "\n\n";
        if (editorHandle) editorHandle.insertText(prefix + out);
        else {
          const next = editor + prefix + out;
          setEditor(next);
          scheduleSave(next);
        }
        showToast(`Inserted (${res.provider}).`);
        return;
      }

      if (aiWriteScope === "selection") {
        if (!editorHandle) {
          showToast("Editor is not ready.");
          return;
        }
        editorHandle.replaceSelection(out);
        showToast(`Replaced selection (${res.provider}).`);
        return;
      }

      setEditor(out);
      scheduleSave(out);
      showToast(`Rewrote note (${res.provider}).`);
    } catch (e) {
      console.error(e);
      showToast(aiWriteErrorMessage(e));
    } finally {
      setAiWriteLoading(false);
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

  function onPreviewClick(e: React.MouseEvent) {
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
  }

  const sidebarContent = (
    <Sidebar
      onNewNote={() => void onNewNote()}
      onDeleteNote={() => void onDeleteNote()}
      activeNoteId={activeId}
      searchQuery={query}
      onSearchChange={setQuery}
      tags={tagCounts.map(([tag, count]) => ({ tag, count }))}
      selectedTag={tagFilter}
      onTagSelect={setTagFilter}
      className="h-full border-none bg-transparent block"
    >
      <NoteList
        notes={notes}
        activeNoteId={activeId}
        onSelectNote={(id) => void navigateToNote(id)}
      />
    </Sidebar>
  );

  const rightPanelContent = activeId ? (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border p-3 bg-muted/20">
        <span className="font-semibold text-sm">Graph</span>
      </div>
      <div className="flex-1 overflow-hidden p-3 relative">
        <GraphPanel
          graph={graph}
          onOpenNote={(id) => void navigateToNote(id)}
          className="bg-transparent border-none h-full w-full"
          heightClassName="h-full"
        />
      </div>
      <div className="border-t border-border p-3 text-xs text-muted-foreground bg-muted/10">
        <div className="mb-2 font-semibold">Backlinks</div>
        <div className="flex flex-col gap-1 max-h-[200px] overflow-y-auto">
          {active?.backlinks?.map((bl) => (
            <button
              key={bl.id}
              onClick={() => void navigateToNote(bl.id)}
              className="text-left hover:text-primary truncate transition-colors"
            >
              {bl.title || bl.path}
            </button>
          )) ?? "None"}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <MainLayout sidebar={sidebarContent} rightPanel={rightPanelContent}>
      {page === "graph" ? (
        <div className="flex h-full flex-col p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Global Graph</h2>
            {activeId && <button onClick={() => setPage("note")} className="text-sm text-primary hover:underline">Back to Note</button>}
          </div>
          <GraphPanel graph={graph} onOpenNote={(id) => void navigateToNote(id)} heightClassName="h-full" />
        </div>
      ) : page === "settings" ? (
        <div className="p-8 text-foreground max-w-3xl mx-auto">
          <h1 className="mb-6 text-3xl font-bold tracking-tight">Settings</h1>
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showAdvanced}
                onChange={(e) => setShowAdvanced(e.target.checked)}
                className="h-4 w-4 rounded border-input bg-background text-primary focus:ring-primary"
              />
              <span>Show advanced AI options & Metadata</span>
            </div>

            <div className="rounded-xl border bg-card p-4 text-card-foreground shadow-sm">
              <h3 className="font-semibold mb-2">Display</h3>
              <p className="text-sm text-muted-foreground">Customize your viewing experience.</p>
            </div>

            <div className="rounded-xl border bg-card p-4 text-card-foreground shadow-sm">
              <h3 className="font-semibold mb-2">Manual Import</h3>
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

            <div className="pt-4">
              <button
                onClick={() => navigate("/")}
                className="rounded-xl border border-input bg-background px-4 py-2 hover:bg-accent hover:text-accent-foreground"
              >
                Back to Notes
              </button>
            </div>
          </div>
        </div>
      ) : (
        activeId ? (
          <div className="relative flex h-full flex-col bg-background">
            {/* Editor Toolbar */}
            <div className="flex items-center justify-between border-b border-border bg-background/50 backdrop-blur-sm p-2 sticky top-0 z-10">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {editingTitle ? (
                  <input
                    autoFocus
                    className="bg-transparent px-2 py-1 font-bold text-lg focus:outline-none focus:ring-1 focus:ring-primary rounded w-full"
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={() => void commitTitle()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void commitTitle();
                      if (e.key === "Escape") setEditingTitle(false);
                    }}
                  />
                ) : (
                  <h1
                    className="cursor-pointer px-2 py-1 font-bold text-lg hover:bg-muted/10 rounded truncate"
                    onClick={() => setEditingTitle(true)}
                    title={active?.note.title || "Untitled"}
                  >
                    {active?.note.title || "Untitled"}
                  </h1>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setPreviewOpen(!previewOpen)}
                  className={cn("text-xs border px-3 py-1.5 rounded-md font-medium transition-colors", previewOpen ? "bg-primary/10 text-primary border-primary/20" : "hover:bg-accent")}
                >
                  {previewOpen ? "Edit" : "Preview"}
                </button>
                <button
                  onClick={() => void navigateToSettings()}
                  className="text-xs border px-3 py-1.5 rounded-md font-medium hover:bg-accent"
                >
                  Settings
                </button>
                {saving && <span className="text-xs text-muted-foreground animate-pulse">Saving...</span>}
              </div>
            </div>

            {/* Editor Content */}
            <div className="flex-1 overflow-auto">
              {previewOpen ? (
                <div className="prose prose-invert max-w-none p-8 mx-auto" dangerouslySetInnerHTML={{ __html: previewHtml }} onClick={onPreviewClick} />
              ) : (
                <div className="h-full" onClick={onPreviewClick}>
                  <MarkdownEditor
                    ref={editorHandleRef}
                    value={editor}
                    onChange={(v) => {
                      setEditor(v);
                      scheduleSave(v);
                    }}
                    wikiLinkCandidates={wikiLinkCandidates}
                  />
                </div>
              )}
            </div>

            {/* Floating AI / Tools */}
            <div className="absolute bottom-6 right-6 flex gap-2">
              {/* Could add a floating action button here later */}
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground bg-muted/5">
            <div className="text-center">
              <div className="mb-4 text-6xl opacity-20">📝</div>
              <p className="mb-2 text-lg font-medium">No note selected</p>
              <p className="text-sm">Select a note from the sidebar or create a new one.</p>
              <button onClick={() => void onNewNote()} className="mt-4 text-primary hover:underline">Create Note</button>
            </div>
          </div>
        )
      )}
      {toast && (
        <div className="absolute bottom-4 right-4 z-50 rounded-lg bg-primary px-4 py-2 text-primary-foreground shadow-lg animate-in slide-in-from-bottom-2 fade-in">
          {toast}
        </div>
      )}
    </MainLayout>
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
