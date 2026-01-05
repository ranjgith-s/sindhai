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

export type ChatMessage = {
    role: "system" | "user" | "assistant";
    content: string;
};

export type SearchItem = {
    id: string;
    title: string;
    path: string;
    snippet?: string;
    score?: number;
};

export type PerplexityAskIn = {
    query: string;
    context?: string;
};

export type PerplexityAskOut = {
    provider: string;
    answer_markdown: string;
    citations?: string[];
    save_markdown: string;
};
