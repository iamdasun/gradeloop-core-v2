"use client";

import type { SubmissionGrade } from "@/types/assessments.types";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
    Trophy,
    Cpu, Sparkles, FlaskConical, PenLine,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface GradeResultPanelProps {
    grade: SubmissionGrade | null;
    isLoading?: boolean;
    /**
     * When true shows the per-criterion `reason` (technical justification),
     * grading-mode badges, confidence flags, and band labels.
     * Students see the score per criterion but never the internal reasoning.
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

function BandBadge({ band }: { band: string }) {
    const colors: Record<string, string> = {
        excellent:       "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
        good:            "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
        satisfactory:    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
        unsatisfactory:  "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    };
    return (
        <span className={cn(
            "inline-block text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-sm",
            colors[band] ?? "bg-muted text-muted-foreground"
        )}>
            {band}
        </span>
    );
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
// Structured feedback cards — three pedagogical sections
// ─────────────────────────────────────────────────────────────────────────────



// ─────────────────────────────────────────────────────────────────────────────
// Loading skeleton
// ─────────────────────────────────────────────────────────────────────────────

function GradeResultSkeleton({ compact }: { compact?: boolean }) {
    return (
        <div className={cn("flex flex-col gap-4", compact ? "p-3" : "p-4")}>
            <Skeleton className="h-20 rounded-xl" />
            <div className="flex flex-col gap-2">
                <Skeleton className="h-16 rounded-lg" />
                <Skeleton className="h-16 rounded-lg" />
                <Skeleton className="h-16 rounded-lg" />
            </div>
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

    // Use instructor_override_score if present, otherwise ACAFS total
    const effectiveScore = grade.instructor_override_score ?? grade.total_score;
    const percentage =
        grade.max_total_score > 0
            ? Math.round((effectiveScore / grade.max_total_score) * 100)
            : 0;
    const hasOverride = grade.instructor_override_score !== undefined && grade.instructor_override_score !== null;

    return (
        <div className={cn("flex flex-col gap-4", compact ? "p-3" : "p-4", className)}>
            {/* ── Total score header ───────────────────────────────────────── */}
            <div className="flex items-center gap-4 p-4 rounded-xl bg-primary/5 border border-primary/10">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Trophy className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-end gap-1">
                        <span className={cn("text-3xl font-black font-heading leading-none", scoreColorClass(percentage))}>
                            {effectiveScore}
                        </span>
                        <span className="text-sm text-muted-foreground mb-0.5">
                            &nbsp;/ {grade.max_total_score}
                        </span>
                        {hasOverride && (
                            <span className="mb-0.5 ml-1 text-xs text-muted-foreground line-through">
                                AI: {grade.total_score}
                            </span>
                        )}
                    </div>
                    {/* Progress bar */}
                    <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                                className={cn("h-full rounded-full transition-all duration-700", progressBarClass(percentage))}
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
                            {hasOverride && grade.override_by && (
                                <> · Override by {grade.override_by}</>
                            )}
                        </p>
                    )}
                </div>
            </div>

            {/* ── AI Feedback ──────────────────────────────────────────────── */}
            {grade.holistic_feedback && (
                <div className="p-4 rounded-xl border border-border/60 bg-muted/30">
                    <div className={cn(
                        "prose prose-sm dark:prose-invert max-w-none",
                        "prose-p:leading-relaxed prose-p:my-2 first:prose-p:mt-0 last:prose-p:mb-0",
                        "prose-code:text-[0.8em] prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:before:content-none prose-code:after:content-none",
                        "prose-pre:bg-muted prose-pre:border prose-pre:border-border/60 prose-pre:rounded-lg prose-pre:text-xs",
                        "prose-strong:text-foreground prose-em:text-muted-foreground",
                        "prose-headings:text-foreground prose-headings:font-semibold",
                        "prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5",
                        "prose-blockquote:border-l-primary/40 prose-blockquote:text-muted-foreground",
                    )}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {grade.holistic_feedback}
                        </ReactMarkdown>
                    </div>
                </div>
            )}

            {/* ── Instructor Feedback (below ACAFS feedback) ───────────────── */}
            {grade.instructor_holistic_feedback && (
                <div className="p-4 rounded-xl border border-purple-200 bg-purple-50/60 dark:border-purple-800/40 dark:bg-purple-900/10">
                    <div className="flex items-center gap-1.5 mb-2">
                        <PenLine className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-purple-700 dark:text-purple-400">
                            Instructor Feedback
                        </span>
                    </div>
                    <p className="text-sm leading-relaxed text-foreground">
                        {grade.instructor_holistic_feedback}
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
                        const effectiveCritScore =
                            criterion.instructor_override_score ?? criterion.score;
                        const critPct =
                            criterion.max_score > 0
                                ? Math.round((effectiveCritScore / criterion.max_score) * 100)
                                : 0;
                        const hasCritOverride =
                            criterion.instructor_override_score !== undefined &&
                            criterion.instructor_override_score !== null;
                        const isLowConfidence =
                            instructorView &&
                            criterion.confidence !== undefined &&
                            criterion.confidence !== null &&
                            criterion.confidence < 0.6;

                        return (
                            <div
                                key={i}
                                className={cn(
                                    "p-3 rounded-lg border bg-card",
                                    isLowConfidence
                                        ? "border-amber-300 dark:border-amber-700"
                                        : "border-border/60"
                                )}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-semibold leading-snug">
                                                {criterion.name}
                                            </span>
                                            {instructorView && (
                                                <>
                                                    <GradingModeBadge mode={criterion.grading_mode} />
                                                    {criterion.band_selected && (
                                                        <BandBadge band={criterion.band_selected} />
                                                    )}
                                                    {isLowConfidence && (
                                                        <span className="text-[9px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                                                            ⚠ Low confidence
                                                        </span>
                                                    )}
                                                </>
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
                                        {/* Instructor override reason */}
                                        {instructorView && criterion.instructor_override_reason && (
                                            <p className="text-xs text-purple-700 dark:text-purple-400 mt-1 leading-relaxed">
                                                Override note: {criterion.instructor_override_reason}
                                            </p>
                                        )}
                                    </div>
                                    <div className="text-right shrink-0 min-w-[4rem]">
                                        <span className={cn("font-black text-lg font-heading leading-none", scoreColorClass(critPct))}>
                                            {effectiveCritScore}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {" "}/ {criterion.max_score}
                                        </span>
                                        {hasCritOverride && (
                                            <p className="text-[9px] text-muted-foreground line-through">
                                                AI: {criterion.score}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                {/* Mini progress */}
                                <div className="mt-2.5 h-1 rounded-full bg-muted overflow-hidden">
                                    <div
                                        className={cn("h-full rounded-full transition-all duration-500", progressBarClass(critPct))}
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




