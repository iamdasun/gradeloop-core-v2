"use client";

import * as React from "react";

export type ToastVariant = "default" | "success" | "error" | "warning";

export interface Toast {
    id: string;
    title: string;
    description?: string;
    variant?: ToastVariant;
}

interface ToastStore {
    toasts: Toast[];
    addToast: (toast: Omit<Toast, "id">) => void;
    removeToast: (id: string) => void;
}

const ToastContext = React.createContext<ToastStore | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = React.useState<Toast[]>([]);

    const addToast = React.useCallback((toast: Omit<Toast, "id">) => {
        const id = Math.random().toString(36).slice(2);
        setToasts((prev) => [...prev, { ...toast, id }]);
        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 5000);
    }, []);

    const removeToast = React.useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
            {children}
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = React.useContext(ToastContext);
    if (!context) {
        throw new Error("useToast must be used within a ToastProvider");
    }
    return context;
}

// Internal Toaster component that renders toasts
function ToastContainer() {
    const { toasts, removeToast } = useToast();

    if (toasts.length === 0) return null;

    return (
        <div
            aria-live="polite"
            aria-atomic="true"
            className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-sm pointer-events-none"
        >
            {toasts.map((t) => (
                <div
                    key={t.id}
                    className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg bg-white dark:bg-zinc-900 animate-in slide-in-from-right-5 fade-in-0 duration-300 ${
                        t.variant === "success"
                            ? "border-emerald-200 dark:border-emerald-800/60"
                            : t.variant === "error"
                              ? "border-red-200 dark:border-red-800/60"
                              : t.variant === "warning"
                                ? "border-amber-200 dark:border-amber-800/60"
                                : "border-zinc-200 dark:border-zinc-700"
                    }`}
                >
                    <span className="shrink-0 mt-0.5">
                        {t.variant === "success" && (
                            <svg className="h-5 w-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        )}
                        {t.variant === "error" && (
                            <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        )}
                        {t.variant === "warning" && (
                            <svg className="h-5 w-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        )}
                        {t.variant === "default" && (
                            <svg className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        )}
                    </span>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 leading-snug">
                            {t.title}
                        </p>
                        {t.description && (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug">
                                {t.description}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={() => removeToast(t.id)}
                        className="shrink-0 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                        aria-label="Dismiss"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            ))}
        </div>
    );
}

// Exported Toaster - just wraps ToastContainer with provider
export function Toaster() {
    return (
        <ToastProvider>
            <ToastContainer />
        </ToastProvider>
    );
}
