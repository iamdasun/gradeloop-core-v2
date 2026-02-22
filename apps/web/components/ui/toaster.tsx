'use client';

import { X, CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';
import { useToaster } from '@/lib/hooks/use-toast';
import { cn } from '@/lib/utils/cn';

export function Toaster() {
  const { toasts, dismiss } = useToaster();

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
          className={cn(
            'pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg',
            'bg-white dark:bg-zinc-900',
            'animate-in slide-in-from-right-5 fade-in-0 duration-300',
            t.variant === 'success' &&
              'border-green-200 dark:border-green-800/60',
            t.variant === 'error' && 'border-red-200 dark:border-red-800/60',
            t.variant === 'warning' &&
              'border-yellow-200 dark:border-yellow-800/60',
            t.variant === 'default' &&
              'border-zinc-200 dark:border-zinc-700',
          )}
        >
          <span className="shrink-0 mt-0.5">
            {t.variant === 'success' && (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            )}
            {t.variant === 'error' && (
              <XCircle className="h-5 w-5 text-red-500" />
            )}
            {t.variant === 'warning' && (
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
            )}
            {t.variant === 'default' && (
              <Info className="h-5 w-5 text-blue-500" />
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
            onClick={() => dismiss(t.id)}
            className="shrink-0 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
