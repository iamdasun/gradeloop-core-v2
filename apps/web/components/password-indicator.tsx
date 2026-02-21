"use client";

import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Requirement {
    label: string;
    regex: RegExp;
}

const requirements: Requirement[] = [
    { label: "At least 8 characters", regex: /.{8,}/ },
    { label: "At least one uppercase letter", regex: /[A-Z]/ },
    { label: "At least one lowercase letter", regex: /[a-z]/ },
    { label: "At least one number", regex: /[0-9]/ },
    { label: "At least one special character", regex: /[^A-Za-z0-9]/ },
];

interface PasswordIndicatorProps {
    password: string;
}

export function PasswordIndicator({ password }: PasswordIndicatorProps) {
    return (
        <div className="space-y-2 rounded-lg border bg-zinc-50/50 p-3 dark:bg-zinc-900/50">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Password Requirements
            </p>
            <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {requirements.map((req, index) => {
                    const isMet = req.regex.test(password);
                    return (
                        <li
                            key={index}
                            className={cn(
                                "flex items-center gap-2 text-xs transition-colors",
                                isMet ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-500"
                            )}
                        >
                            {isMet ? (
                                <Check className="h-3.5 w-3.5 shrink-0" />
                            ) : (
                                <div className="h-3.5 w-3.5 flex items-center justify-center">
                                    <div className="h-1 w-1 rounded-full bg-current opacity-40" />
                                </div>
                            )}
                            <span>{req.label}</span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
