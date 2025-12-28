import React, { useEffect, useMemo, useRef, useState } from "react";
import type { LocalGraph, NoteGet, NoteSummary } from "./api";
import { createNote, deleteNote, getLocalGraph, getNote, listNotes, updateNote } from "./api";
import { GraphPanel } from "./GraphPanel";
import { renderMarkdown } from "./markdown";

function normalizeWikiTarget(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

function stem(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.endsWith(".md") ? base.slice(0, -3) : base;
}

export function App() {
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [active, setActive] = useState<NoteGet | null>(null);
  const [graph, setGraph] = useState<LocalGraph | null>(null);
  const [editor, setEditor] = useState("");
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<number | null>(null);

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

  function scheduleSave(next: string) {
    if (!activeId) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      try {
        setSaving(true);
        await updateNote(activeId, next);
        const [note, g] = await Promise.all([getNote(activeId), getLocalGraph(activeId)]);
        setActive(note);
        setGraph(g);
        await refreshList();
      } finally {
        setSaving(false);
      }
    }, 800);
  }

  async function onNewNote() {
    const title = window.prompt("New note title")?.trim();
    if (!title) return;
    const created = await createNote(title);
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
    const created = await createNote(target);
    await refreshList();
    setActiveId(created.id);
  }

  const previewHtml = useMemo(() => renderMarkdown(editor), [editor]);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="toolbar">
          <button onClick={() => void onNewNote()}>New</button>
          <button disabled={!activeId} onClick={() => void onDeleteNote()}>
            Delete
          </button>
        </div>
        <input
          className="search"
          placeholder="Search…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="list">
          {notes.map((n) => (
            <button
              key={n.id}
              className={`listItem ${n.id === activeId ? "active" : ""}`}
              onClick={() => setActiveId(n.id)}
            >
              <div className="title">{n.title}</div>
              <div className="meta">{n.path}</div>
            </button>
          ))}
        </div>
      </aside>

      <main className="main">
        <div className="mainHeader">
          <div className="mainTitle">{active?.note.title ?? "No note selected"}</div>
          <div className="mainMeta">
            {saving ? "Saving…" : active ? active.note.updated_at : ""}
            {active?.note.tags?.length ? ` • #${active.note.tags.join(" #")}` : ""}
            {active?.note.frontmatter_error ? ` • ${active.note.frontmatter_error}` : ""}
          </div>
        </div>
        <div className="panes">
          <textarea
            className="editor"
            value={editor}
            onChange={(e) => {
              const next = e.target.value;
              setEditor(next);
              scheduleSave(next);
            }}
          />
          <div
            className="preview"
            onClick={(e) => {
              const a = (e.target as HTMLElement | null)?.closest?.("a[data-wikilink]") as HTMLAnchorElement | null;
              if (!a) return;
              e.preventDefault();
              void openOrCreateWiki(a.dataset.wikilink ?? "");
            }}
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>
      </main>

      <aside className="sidebar right">
        <div className="panel">
          <div className="panelTitle">Backlinks</div>
          <div className="panelBody">
            {(active?.backlinks ?? []).map((n) => (
              <button key={n.id} className="link" onClick={() => setActiveId(n.id)}>
                {n.title}
              </button>
            ))}
            {!active?.backlinks?.length ? <div className="muted">None</div> : null}
          </div>
        </div>

        <div className="panel">
          <div className="panelTitle">Related</div>
          <div className="panelBody">
            {(active?.related_notes ?? []).map((n) => (
              <button key={n.id} className="link" onClick={() => setActiveId(n.id)}>
                {n.title} <span className="muted">({n.score.toFixed(3)})</span>
              </button>
            ))}
            {!active?.related_notes?.length ? <div className="muted">None</div> : null}
          </div>
        </div>

        <div className="panel">
          <div className="panelTitle">Local Graph</div>
          <GraphPanel graph={graph} onOpenNote={(id) => setActiveId(id)} />
        </div>
      </aside>
    </div>
  );
}

