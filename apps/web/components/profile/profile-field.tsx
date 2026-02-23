"use client";

import { LucideIcon } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface ProfileFieldProps {
    label: string;
    value?: string;
    icon: LucideIcon;
    className?: string;
}

export function ProfileField({ label, value, icon: Icon, className }: ProfileFieldProps) {
    return (
        <div className={cn("space-y-2.5", className)}>
            <Label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                <Icon className="h-3.5 w-3.5" />
                {label}
            </Label>
            <div className="relative group">
                <div className="flex h-11 w-full items-center rounded-xl bg-zinc-100/50 px-4 text-sm font-medium text-zinc-900 border border-transparent transition-colors group-hover:border-zinc-200 dark:bg-zinc-800/50 dark:text-zinc-100 dark:group-hover:border-zinc-700">
                    {value || "Not specified"}
                </div>
                <div className="absolute top-1/2 right-3 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 bg-white/80 dark:bg-zinc-900/80 px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-700">
                        Read only
                    </span>
                </div>
            </div>
        </div>
    );
}
