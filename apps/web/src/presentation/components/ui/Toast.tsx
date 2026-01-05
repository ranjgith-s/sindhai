import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { cn } from "../../utils";
import { X } from "lucide-react";

export type ToastType = "success" | "error" | "info";

export interface ToastAction {
    label: string;
    onClick: () => void;
}

export interface ToastMessage {
    id: string;
    message: string;
    type?: ToastType;
    duration?: number;
    action?: ToastAction;
}

interface ToastContextType {
    toast: (message: string, options?: { type?: ToastType; duration?: number; action?: ToastAction }) => void;
    removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error("useToast must be used within a ToastProvider");
    }
    return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const toast = useCallback(
        (message: string, options: { type?: ToastType; duration?: number; action?: ToastAction } = {}) => {
            const id = crypto.randomUUID();
            const duration = options.duration ?? 3000;

            const newToast: ToastMessage = {
                id,
                message,
                type: options.type ?? "info",
                duration,
                action: options.action,
            };

            setToasts((prev) => [...prev, newToast]);

            if (duration > 0) {
                setTimeout(() => {
                    removeToast(id);
                }, duration);
            }
        },
        [removeToast]
    );

    return (
        <ToastContext.Provider value={{ toast, removeToast }}>
            {children}
            <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        className={cn(
                            "pointer-events-auto flex items-center gap-2 min-w-[300px] max-w-[400px] rounded-lg p-4 shadow-lg transition-all animate-in slide-in-from-right-full fade-in duration-300",
                            t.type === "error" ? "bg-destructive text-destructive-foreground" : "bg-card text-card-foreground border border-border"
                        )}
                    >
                        <div className="flex-1 text-sm">{t.message}</div>
                        {t.action && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    t.action?.onClick();
                                    removeToast(t.id);
                                }}
                                className="text-xs font-semibold underline hover:no-underline"
                            >
                                {t.action.label}
                            </button>
                        )}
                        <button
                            onClick={() => removeToast(t.id)}
                            className="text-muted-foreground hover:text-foreground"
                        >
                            <X size={16} />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}
