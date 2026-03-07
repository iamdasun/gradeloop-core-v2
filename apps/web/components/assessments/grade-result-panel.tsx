"use client";

import type { SubmissionGrade } from "@/types/assessments.types";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Trophy, MessageSquare, Cpu, Sparkles, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface GradeResultPanelProps {
    grade: SubmissionGrade | null;
    isLoading?: boolean;
    /**
     * When true shows the per-criterion `reason` (technical justification)
     * and grading-mode badges — intended for instructors only.
     * Students see the score per criterion but never the reasoning.
     */
    instructorView?: boolean;
    /** Tighter padding for embedding inside narrow panels (e.g. IDE). */
    compact?: boolean;
    className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function GradingModeBadge({ mode }: { mode: string }) {
    switch (mode) {
        case "deterministic":
            return (
                <Badge variant="outline" className="gap-1 text-[10px] font-mono px-1.5 py-0 h-4">
                    <FlaskConical className="h-2.5 w-2.5" />
                    Tests
                </Badge>
            );
        case "llm":
            return (
                <Badge variant="outline" className="gap-1 text-[10px] font-mono px-1.5 py-0 h-4">
                    <Sparkles className="h-2.5 w-2.5" />
                    AI
                </Badge>
            );
        case "llm_ast":
            return (
                <Badge variant="outline" className="gap-1 text-[10px] font-mono px-1.5 py-0 h-4">
                    <Cpu className="h-2.5 w-2.5" />
                    AI + AST
                </Badge>
            );
        default:
            return null;
    }
}

function scoreColorClass(percentage: number): string {
    if (percentage >= 75) return "text-green-600 dark:text-green-400";
    if (percentage >= 50) return "text-amber-600 dark:text-amber-400";
    return "text-destructive";
}

function progressBarClass(percentage: number): string {
    if (percentage >= 75) return "bg-green-500 dark:bg-green-400";
    if (percentage >= 50) return "bg-amber-500 dark:bg-amber-400";
    return "bg-destructive";
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading skeleton
// ─────────────────────────────────────────────────────────────────────────────

function GradeResultSkeleton({ compact }: { compact?: boolean }) {
    return (
        <div className={cn("flex flex-col gap-4", compact ? "p-3" : "p-4")}>
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-16 rounded-lg" />
                <Skeleton className="h-16 rounded-lg" />
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function GradeResultPanel({
    grade,
    isLoading,
    instructorView = false,
    compact = false,
    className,
}: GradeResultPanelProps) {
    if (isLoading) return <GradeResultSkeleton compact={compact} />;
    if (!grade) return null;

    const percentage =
        grade.max_total_score > 0
            ? Math.round((grade.total_score / grade.max_total_score) * 100)
            : 0;

    return (
        <div className={cn("flex flex-col gap-4", compact ? "p-3" : "p-4", className)}>
            {/* ── Total score header ───────────────────────────────────────── */}
            <div className="flex items-center gap-4 p-4 rounded-xl bg-primary/5 border border-primary/10">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Trophy className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-end gap-1">
                        <span
                            className={cn(
                                "text-3xl font-black font-heading leading-none",
                                scoreColorClass(percentage)
                            )}
                        >
                            {grade.total_score}
                        </span>
                        <span className="text-sm text-muted-foreground mb-0.5">
                            &nbsp;/ {grade.max_total_score}
                        </span>
                    </div>
                    {/* Progress bar */}
                    <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                                className={cn(
                                    "h-full rounded-full transition-all duration-700",
                                    progressBarClass(percentage)
                                )}
                                style={{ width: `${percentage}%` }}
                            />
                        </div>
                        <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                            {percentage}%
                        </span>
                    </div>
                    {!compact && (
                        <p className="text-[10px] text-muted-foreground/70 mt-1">
                            Graded {format(new Date(grade.graded_at), "MMM d, yyyy 'at' h:mm a")}
                        </p>
                    )}
                </div>
            </div>

            {/* ── Holistic feedback ────────────────────────────────────────── */}
            {grade.holistic_feedback && (
                <div className="p-4 rounded-xl border border-border/60 bg-muted/30">
                    <div className="flex items-center gap-1.5 mb-2">
                        <MessageSquare className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Feedback
                        </span>
                    </div>
                    <p className="text-sm leading-relaxed text-foreground">
                        {grade.holistic_feedback}
                    </p>
                </div>
            )}

            {/* ── Criteria breakdown ───────────────────────────────────────── */}
            {grade.criteria_scores.length > 0 && (
                <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Criteria Breakdown
                    </p>
                    {grade.criteria_scores.map((criterion, i) => {
                        const critPct =
                            criterion.max_score > 0
                                ? Math.round((criterion.score / criterion.max_score) * 100)
                                : 0;
                        return (
                            <div
                                key={i}
                                className="p-3 rounded-lg border border-border/60 bg-card"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-semibold leading-snug">
                                                {criterion.name}
                                            </span>
                                            {instructorView && (
                                                <GradingModeBadge mode={criterion.grading_mode} />
                                            )}
                                        </div>
                                        {/* Reason — instructor only */}
                                        {instructorView && criterion.reason && (
                                            <>
                                                <Separator className="my-2" />
                                                <p className="text-xs text-muted-foreground leading-relaxed">
                                                    {criterion.reason}
                                                </p>
                                            </>
                                        )}
                                    </div>
                                    <div className="text-right shrink-0 min-w-[4rem]">
                                        <span
                                            className={cn(
                                                "font-black text-lg font-heading leading-none",
                                                scoreColorClass(critPct)
                                            )}
                                        >
                                            {criterion.score}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {" "}/ {criterion.max_score}
                                        </span>
                                    </div>
                                </div>
                                {/* Mini progress */}
                                <div className="mt-2.5 h-1 rounded-full bg-muted overflow-hidden">
                                    <div
                                        className={cn(
                                            "h-full rounded-full transition-all duration-500",
                                            progressBarClass(critPct)
                                        )}
                                        style={{ width: `${critPct}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
