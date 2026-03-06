"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/lib/stores/uiStore";
import { useAssignmentCreateStore } from "@/lib/stores/assignmentCreateStore";

/**
 * SecondarySidebar — rendered at the dashboard-layout level, sitting between
 * the primary sidebar and <main>. Config is pushed into the uiStore by nested
 * layouts (e.g. course instance). When config is null the component renders
 * nothing, so it doesn't affect layouts that don't need it.
 *
 * Supports two modes:
 *  - 'nav'   (default) — renders a list of nav links
 *  - 'steps' — renders assignment-creation progress steps
 */
export function SecondarySidebar() {
    const config = useUIStore((s) => s.secondarySidebar);
    const pathname = usePathname();
    const { currentStep, steps, setStep, highestStepVisited } = useAssignmentCreateStore();

    if (!config) return null;

    const isStepsMode = config.mode === 'steps';

    return (
        <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r bg-sidebar-background h-full overflow-hidden">
            {/* Header */}
            <div className="flex h-16 flex-col justify-center w-full px-6 border-b border-sidebar-border gap-0.5 shrink-0">
                <Link
                    href={config.backHref}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ArrowLeft className="h-3 w-3" />
                    {config.backLabel}
                </Link>
                <h2 className="text-sm font-semibold tracking-tight text-foreground font-heading truncate leading-snug">
                    {config.subtitle && (
                        <span className="text-primary font-mono mr-1.5 text-[11px] font-bold uppercase">
                            {config.subtitle}
                        </span>
                    )}
                    {config.title}
                </h2>
            </div>

            {isStepsMode ? (
                /* ── Steps / progress mode ── */
                <ScrollArea className="flex-1 w-full px-4">
                    <div className="flex flex-col gap-1 w-full py-4 relative">
                        {/* Vertical connector line */}
                        <div className="absolute left-[27px] top-8 bottom-8 w-0.5 bg-border/60 -z-10" />
                        <div
                            className="absolute left-[27px] top-8 w-0.5 bg-primary -z-10 transition-all duration-300"
                            style={{
                                height: `calc(${((currentStep - 1) / Math.max(steps.length - 1, 1)) * 100}% - 16px)`,
                            }}
                        />
                        {steps.map((step, idx) => {
                            const num = idx + 1;
                            const isCompleted = num < currentStep;
                            const isCurrent = num === currentStep;
                            const isAccessible = num <= highestStepVisited;
                            return (
                                <button
                                    key={step.id}
                                    disabled={!isAccessible}
                                    onClick={() => { if (isAccessible) setStep(num); }}
                                    className={cn(
                                        "flex items-center gap-3 w-full px-3 py-2 rounded-lg text-left transition-all group",
                                        isCurrent
                                            ? "bg-primary/10"
                                            : isAccessible
                                                ? "hover:bg-sidebar-accent cursor-pointer"
                                                : "opacity-50 cursor-not-allowed"
                                    )}
                                >
                                    <div className={cn(
                                        "flex items-center justify-center w-6 h-6 rounded-full border-2 text-xs font-bold shrink-0 bg-background transition-colors",
                                        isCompleted
                                            ? "border-primary bg-primary text-primary-foreground"
                                            : isCurrent
                                                ? "border-primary text-primary"
                                                : "border-muted-foreground/40 text-muted-foreground"
                                    )}>
                                        {isCompleted
                                            ? <CheckCircle2 className="w-3 h-3" />
                                            : num}
                                    </div>
                                    <span className={cn(
                                        "text-sm font-medium truncate",
                                        isCurrent
                                            ? "text-primary"
                                            : isCompleted
                                                ? "text-foreground"
                                                : "text-muted-foreground"
                                    )}>
                                        {step.title}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </ScrollArea>
            ) : (
                /* ── Nav mode (default) ── */
                <ScrollArea className="flex-1 w-full px-4">
                    <div className="flex flex-col gap-1 w-full py-3">
                        {config.items.map(({ name, href }) => {
                            const isFirst = href === config.basePath;
                            const isActive = isFirst
                                ? pathname === config.basePath
                                : pathname.startsWith(href);
                            return (
                                <Link key={name} href={href} className="w-full text-left">
                                    <Button
                                        variant="ghost"
                                        className={cn(
                                            "h-10 w-full flex items-center rounded-lg transition-colors justify-start px-3",
                                            isActive
                                                ? "bg-primary/10 text-primary font-medium"
                                                : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                                        )}
                                    >
                                        <span className="truncate text-sm">{name}</span>
                                    </Button>
                                </Link>
                            );
                        })}
                    </div>
                </ScrollArea>
            )}
        </aside>
    );
}
