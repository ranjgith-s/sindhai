import React from "react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "../../utils";
import type { NoteSummary } from "../../../domain/models";

interface NoteListProps {
    notes: NoteSummary[];
    activeNoteId: string | null;
    onSelectNote: (id: string) => void;
    className?: string;
}

export function NoteList({
    notes,
    activeNoteId,
    onSelectNote,
    className,
}: NoteListProps) {
    if (notes.length === 0) {
        return (
            <div className={cn("p-4 text-center text-sm text-muted-foreground", className)}>
                No notes found.
            </div>
        );
    }

    return (
        <div className={cn("flex flex-col gap-1 p-2", className)}>
            {notes.map((note) => (
                <button
                    key={note.id}
                    onClick={() => onSelectNote(note.id)}
                    className={cn(
                        "flex flex-col items-start gap-1 rounded-lg p-3 text-left transition-colors hover:bg-accent hover:text-accent-foreground",
                        activeNoteId === note.id ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                    )}
                >
                    <div className="font-semibold leading-none tracking-tight">
                        {note.title || "Untitled"}
                    </div>
                    <div className="line-clamp-2 text-xs text-muted-foreground/60 w-full flex justify-between">
                        <span>{note.path}</span>
                        {note.updated_at && (
                            <span>{formatDistanceToNow(new Date(note.updated_at), { addSuffix: true })}</span>
                        )}
                    </div>
                </button>
            ))}
        </div>
    );
}
