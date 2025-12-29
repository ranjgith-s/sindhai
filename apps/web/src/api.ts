export type NoteSummary = {
  id: string;
  title: string;
  path: string;
  created_at: string;
  updated_at: string;
  tags: string[];
  aliases: string[];
};

export type RelatedNote = NoteSummary & { score: number; snippet: string };

export type NoteDetail = {
  id: string;
  title: string;
  path: string;
  content_markdown: string;
  frontmatter: Record<string, unknown>;
  tags: string[];
  aliases: string[];
  created_at: string;
  updated_at: string;
  content_hash: string;
  frontmatter_error?: string | null;
};

export type NoteGet = {
  note: NoteDetail;
  backlinks: NoteSummary[];
  related_notes: RelatedNote[];
};

export type LocalGraph = {
  nodes: { id: string; title?: string; tags?: string[] }[];
  edges: { source: string; target: string; type: string }[];
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function listNotes(q?: string): Promise<NoteSummary[]> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  // Back-compat: keep `q` optional; callers can pass `tag` using overload below.
  const data = await api<{ items: NoteSummary[] }>(`/notes?${params.toString()}`);
  return data.items;
}

export async function listNotesFiltered(opts: { q?: string; tag?: string } = {}): Promise<NoteSummary[]> {
  const params = new URLSearchParams();
  if (opts.q) params.set("q", opts.q);
  if (opts.tag) params.set("tag", opts.tag);
  const data = await api<{ items: NoteSummary[] }>(`/notes?${params.toString()}`);
  return data.items;
}

export async function createNote(payload: { title: string; path?: string }): Promise<NoteDetail> {
  return api<NoteDetail>("/notes", {
    method: "POST",
    body: JSON.stringify({ title: payload.title, path: payload.path, content_markdown: "" }),
  });
}

export async function getNote(id: string): Promise<NoteGet> {
  return api<NoteGet>(`/notes/${encodeURIComponent(id)}`);
}

export async function updateNote(
  id: string,
  payload: { content_markdown?: string; path?: string; frontmatter?: Record<string, unknown> },
): Promise<NoteDetail> {
  return api<NoteDetail>(`/notes/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteNote(id: string): Promise<void> {
  await api(`/notes/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function getLocalGraph(noteId: string): Promise<LocalGraph> {
  const params = new URLSearchParams({ noteId });
  return api<LocalGraph>(`/graph/local?${params.toString()}`);
}

export async function aiSummarize(payload: {
  noteId: string;
  mode?: "local" | "external";
  provider?: string | null;
}): Promise<{ summary_markdown: string; provider: string }> {
  return api("/ai/summarize", { method: "POST", body: JSON.stringify(payload) });
}

export async function aiSuggestLinks(noteId: string, k = 5): Promise<{ items: { id: string; score: number }[] }> {
  const params = new URLSearchParams({ noteId, k: String(k) });
  return api(`/ai/suggest-links?${params.toString()}`);
}

export async function aiSuggestTags(noteId: string, k = 10): Promise<{ items: { tag: string; confidence: number }[] }> {
  const params = new URLSearchParams({ noteId, k: String(k) });
  return api(`/ai/suggest-tags?${params.toString()}`);
}
