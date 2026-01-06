import React from "react";
import { Plus, Trash2, Search, X } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { cn } from "../../utils";

interface SidebarProps {
    onNewNote: () => void;
    onDeleteNote: () => void;
    activeNoteId: string | null;
    searchQuery: string;
    onSearchChange: (q: string) => void;
    tags: { tag: string; count: number }[];
    selectedTag: string | null;
    onTagSelect: (tag: string | null) => void;
    className?: string;
    children?: React.ReactNode;
}

export function Sidebar({
    onNewNote,
    onDeleteNote,
    activeNoteId,
    searchQuery,
    onSearchChange,
    tags,
    selectedTag,
    onTagSelect,
    className,
    children,
}: SidebarProps) {
    return (
        <aside
            className={cn(
                "flex h-full min-w-0 flex-col border-r bg-muted/30 backdrop-blur-xl",
                className,
            )}
        >
            <div className="flex items-center gap-2 border-b p-3">
                <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 bg-background/50"
                    onClick={onNewNote}
                >
                    <Plus className="mr-2 h-4 w-4" />
                    New
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    disabled={!activeNoteId}
                    onClick={onDeleteNote}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>

            <div className="p-3">
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        className="pl-9 bg-background/50"
                        placeholder="Search notes..."
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        aria-label="Search notes"
                    />
                    {searchQuery && (
                        <button
                            className="absolute right-2 top-2.5 rounded-sm opacity-50 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                            onClick={() => onSearchChange("")}
                            aria-label="Clear search"
                        >
                            <X className="h-4 w-4" />
                            <span className="sr-only">Clear search</span>
                        </button>
                    )}
                </div>

                {tags.length > 0 && (
                    <div className="mt-3">
                        <div className="mb-2 text-xs font-semibold text-muted-foreground">
                            Tags
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {tags.map(({ tag, count }) => (
                                <button
                                    key={tag}
                                    onClick={() =>
                                        onTagSelect(selectedTag === tag ? null : tag)
                                    }
                                    className={cn(
                                        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                                        selectedTag === tag
                                            ? "border-transparent bg-primary text-primary-foreground hover:bg-primary/80"
                                            : "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
                                    )}
                                >
                                    #{tag}
                                    <span className="ml-1 opacity-70">({count})</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-auto">{children}</div>
        </aside>
    );
}
