import React from "react";
import { cn } from "../utils";

interface MainLayoutProps {
    sidebar: React.ReactNode;
    children: React.ReactNode; // Main content
    rightPanel?: React.ReactNode;
    className?: string;
}

export function MainLayout({ sidebar, children, rightPanel, className }: MainLayoutProps) {
    return (
        <div
            className={cn(
                "grid h-screen w-full grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_360px]",
                "bg-background text-foreground overflow-hidden",
                className
            )}
        >
            <div className="hidden border-r border-border bg-muted/10 md:flex flex-col h-full min-w-0 overflow-hidden">
                {sidebar}
            </div>

            <main className="flex flex-col h-full min-w-0 overflow-hidden relative">
                {children}
            </main>

            {rightPanel && (
                <div className="hidden border-l border-border bg-muted/10 xl:flex flex-col h-full min-w-0 overflow-hidden">
                    {rightPanel}
                </div>
            )}
        </div>
    );
}
