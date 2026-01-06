import React from "react";
import { cn } from "../utils";

interface SettingsProps {
    showAdvanced: boolean;
    onToggleAdvanced: (value: boolean) => void;
    totalNotes: number;
}

export function Settings({ showAdvanced, onToggleAdvanced, totalNotes }: SettingsProps) {
    return (
        <div className="flex flex-col h-full overflow-auto">
            <div className="p-6 border-b border-border">
                <h1 className="text-2xl font-bold">Settings</h1>
            </div>

            <div className="flex-1 overflow-auto p-6 space-y-8">
                {/* UI Preferences */}
                <section>
                    <h2 className="text-lg font-semibold mb-4">UI Preferences</h2>
                    <div className="space-y-3">
                        <label className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer">
                            <div>
                                <div className="font-medium">Show Advanced Metadata</div>
                                <div className="text-sm text-muted-foreground">
                                    Display file paths and IDs in the interface
                                </div>
                            </div>
                            <input
                                type="checkbox"
                                checked={showAdvanced}
                                onChange={(e) => onToggleAdvanced(e.target.checked)}
                                className="w-4 h-4"
                            />
                        </label>
                    </div>
                </section>

                {/* Vault Info */}
                <section>
                    <h2 className="text-lg font-semibold mb-4">Vault Information</h2>
                    <div className="space-y-2 p-4 rounded-lg border border-border bg-muted/20">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Total Notes:</span>
                            <span className="font-medium">{totalNotes}</span>
                        </div>
                    </div>
                </section>

                {/* AI Configuration */}
                <section>
                    <h2 className="text-lg font-semibold mb-4">AI Configuration</h2>
                    <div className="p-4 rounded-lg border border-border bg-muted/20">
                        <p className="text-sm text-muted-foreground">
                            AI settings are configured server-side. Check your deployment configuration
                            for external AI provider settings.
                        </p>
                        <div className="mt-3 text-xs">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-green-500" />
                                <span>Local AI features are always available</span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* About */}
                <section>
                    <h2 className="text-lg font-semibold mb-4">About</h2>
                    <div className="space-y-2 p-4 rounded-lg border border-border bg-muted/20">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Application:</span>
                            <span className="font-medium">Sindhai</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Version:</span>
                            <span className="font-medium">0.1.0 MVP</span>
                        </div>
                        <div className="mt-4 pt-4 border-t border-border">
                            <p className="text-sm text-muted-foreground">
                                A local-first Markdown vault with semantic search, backlinks, and AI augmentation.
                            </p>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
