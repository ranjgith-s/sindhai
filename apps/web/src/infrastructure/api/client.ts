import type {
  NoteSummary,
  NoteDetail,
  NoteGet,
  LocalGraph,
  ChatMessage,
  SearchItem,
  PerplexityAskIn,
  PerplexityAskOut,
} from "../../domain/models";

export type { NoteSummary, NoteDetail, NoteGet, LocalGraph, ChatMessage };

const BASE_URL = import.meta.env.VITE_API_URL || "";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  // path should start with /
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
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

export async function search(
  query: string,
  mode: "hybrid" | "keyword" | "semantic" = "hybrid",
  limit = 20
): Promise<SearchItem[]> {
  const params = new URLSearchParams({ query, mode, limit: String(limit) });
  const data = await api<{ items: SearchItem[] }>(`/search?${params.toString()}`);
  return data.items;
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

export async function openaiChat(payload: {
  messages: ChatMessage[];
  context?: string;
}): Promise<{ provider: string; content: string; save_markdown: string }> {
  return api("/integrations/openai/chat", { method: "POST", body: JSON.stringify(payload) });
}

export async function perplexityAsk(payload: PerplexityAskIn): Promise<PerplexityAskOut> {
  return api("/integrations/perplexity/ask", { method: "POST", body: JSON.stringify(payload) });
}
