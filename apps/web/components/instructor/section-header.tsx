import * as React from "react";
import { cn } from "@/lib/utils";

interface SectionHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
    title: string;
    description?: string;
    icon?: React.ComponentType<{ className?: string }>;
    action?: React.ReactNode;
}

export function SectionHeader({
    title,
    description,
    icon: Icon,
    action,
    className,
    ...props
}: SectionHeaderProps) {
    return (
        <div
            className={cn("flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-6", className)}
            {...props}
        >
            <div className="flex items-start sm:items-center gap-3">
                {Icon && (
                    <div className="h-10 w-10 sm:h-12 sm:w-12 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center mt-1 sm:mt-0">
                        <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                    </div>
                )}
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">
                        {title}
                    </h1>
                    {description && (
                        <p className="text-sm text-muted-foreground max-w-2xl">
                            {description}
                        </p>
                    )}
                </div>
            </div>
            {action && (
                <div className="shrink-0 flex items-center">
                    {action}
                </div>
            )}
        </div>
    );
}
