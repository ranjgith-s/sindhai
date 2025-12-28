export type NoteSummary = {
  id: string;
  title: string;
  path: string;
  updated_at: string;
  tags: string[];
};

export type RelatedNote = NoteSummary & { score: number; snippet: string };

export type NoteDetail = {
  id: string;
  title: string;
  path: string;
  content_markdown: string;
  frontmatter: Record<string, unknown>;
  tags: string[];
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
  const data = await api<{ items: NoteSummary[] }>(`/notes?${params.toString()}`);
  return data.items;
}

export async function createNote(title: string): Promise<NoteDetail> {
  return api<NoteDetail>("/notes", {
    method: "POST",
    body: JSON.stringify({ title, content_markdown: "" }),
  });
}

export async function getNote(id: string): Promise<NoteGet> {
  return api<NoteGet>(`/notes/${encodeURIComponent(id)}`);
}

export async function updateNote(id: string, content_markdown: string): Promise<NoteDetail> {
  return api<NoteDetail>(`/notes/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ content_markdown }),
  });
}

export async function deleteNote(id: string): Promise<void> {
  await api(`/notes/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function getLocalGraph(noteId: string): Promise<LocalGraph> {
  const params = new URLSearchParams({ noteId });
  return api<LocalGraph>(`/graph/local?${params.toString()}`);
}

