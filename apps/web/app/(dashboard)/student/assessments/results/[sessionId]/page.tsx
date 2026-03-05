"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { format, differenceInMinutes } from "date-fns";
import {
    Mic2,
    CheckCircle2,
    Clock,
    XCircle,
    CornerDownRight,
    AlertTriangle,
    MessageSquare,
    User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ivasApi } from "@/lib/ivas-api";
import type {
    SessionDetailsOut,
    AssessmentTranscriptOut,
    CompetencySummary,
    ExchangeOut,
} from "@/types/ivas";

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreBarColor(pct: number) {
    if (pct >= 70) return "bg-emerald-500";
    if (pct >= 40) return "bg-amber-500";
    return "bg-red-500";
}

function scoreBadgeClass(score: number) {
    if (score >= 7) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    if (score >= 4) return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CompetencyBar({ item }: { item: CompetencySummary }) {
    const pct = item.max_score > 0 ? (item.score / item.max_score) * 100 : 0;
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{item.competency}</span>
                <span className="text-muted-foreground">
                    {item.score}/{item.max_score} ({Math.round(pct)}%) · {item.questions_asked}Q
                </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                    className={cn("h-full rounded-full transition-all", scoreBarColor(pct))}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
}

function ExchangeItem({ exchange }: { exchange: ExchangeOut }) {
    return (
        <div className={cn("space-y-3", exchange.is_follow_up && "pl-6 border-l-2 border-primary/20")}>
            {exchange.is_follow_up && (
                <div className="flex items-center gap-1 text-xs text-primary/70">
                    <CornerDownRight className="h-3 w-3" />
                    Follow-up question
                </div>
            )}

            {/* Question */}
            <div className="flex gap-3">
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <MessageSquare className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="flex-1 rounded-2xl rounded-tl-sm bg-muted/50 px-4 py-3 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-xs">{exchange.competency}</Badge>
                        <span className="text-xs text-muted-foreground">Difficulty {exchange.difficulty}</span>
                    </div>
                    <p className="text-sm">{exchange.question_text}</p>
                </div>
            </div>

            {/* Answer */}
            {exchange.student_answer && (
                <div className="flex gap-3 flex-row-reverse">
                    <div className="h-7 w-7 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center shrink-0 mt-0.5">
                        <User className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 max-w-[80%] rounded-2xl rounded-tr-sm bg-primary/5 border border-primary/10 px-4 py-3 space-y-1">
                        <p className="text-sm">{exchange.student_answer}</p>
                        {exchange.response_time_seconds > 0 && (
                            <p className="text-xs text-muted-foreground">{exchange.response_time_seconds}s</p>
                        )}
                    </div>
                </div>
            )}

            {/* Evaluation */}
            {(exchange.evaluation_score !== null || exchange.feedback_text) && (
                <div className="ml-10 rounded-xl border border-border/60 bg-card p-3 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                        {exchange.evaluation_score !== null && (
                            <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", scoreBadgeClass(exchange.evaluation_score))}>
                                {exchange.evaluation_score}/10
                            </span>
                        )}
                        {exchange.score_justification && (
                            <span className="text-xs text-muted-foreground">{exchange.score_justification}</span>
                        )}
                    </div>
                    {exchange.feedback_text && (
                        <p className="text-sm text-zinc-700 dark:text-zinc-300">{exchange.feedback_text}</p>
                    )}
                    {exchange.detected_misconceptions && exchange.detected_misconceptions.length > 0 && (
                        <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 px-3 py-2">
                            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-700 dark:text-amber-400">
                                <span className="font-medium">Misconceptions: </span>
                                {exchange.detected_misconceptions.join(", ")}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function VivaResultsPage() {
    const params = useParams<{ sessionId: string }>();
    const sessionId = params.sessionId;

    const [sessionDetails, setSessionDetails] = React.useState<SessionDetailsOut | null>(null);
    const [transcript, setTranscript] = React.useState<AssessmentTranscriptOut | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        let mounted = true;
        async function load() {
            try {
                setLoading(true);
                const [sess, trans] = await Promise.all([
                    ivasApi.getSession(sessionId),
                    ivasApi.getTranscript(sessionId),
                ]);
                if (!mounted) return;
                setSessionDetails(sess);
                setTranscript(trans);
            } catch (err) {
                if (mounted) setError(err instanceof Error ? err.message : "Failed to load results.");
            } finally {
                if (mounted) setLoading(false);
            }
        }
        load();
        return () => { mounted = false; };
    }, [sessionId]);

    if (loading) {
        return (
            <div className="flex flex-col gap-8 pb-8">
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-36 rounded-2xl" />
                <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                {error}
            </div>
        );
    }

    if (!sessionDetails || !transcript) return null;

    const session = sessionDetails.session;
    const hasScore = session.final_score !== null && session.max_score !== null;
    const scorePct = hasScore
        ? Math.round((session.final_score! / session.max_score!) * 100)
        : null;

    const statusIcon =
        session.status === "completed"
            ? { Icon: CheckCircle2, label: "Completed", color: "text-emerald-600" }
            : session.status === "in_progress"
                ? { Icon: Clock, label: "Active", color: "text-blue-600" }
                : { Icon: XCircle, label: "Abandoned", color: "text-zinc-500" };
    const StatusIcon = statusIcon.Icon;

    const durationMinutes =
        session.started_at && session.completed_at
            ? differenceInMinutes(new Date(session.completed_at), new Date(session.started_at))
            : null;

    return (
        <div className="flex flex-col gap-8 pb-8">
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-border/40 pb-6">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Mic2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                    <h1 className="text-2xl font-black tracking-tight">Viva Results</h1>
                    <p className="text-sm text-muted-foreground font-mono">{sessionId.slice(0, 16)}…</p>
                </div>
            </div>

            {/* Score hero */}
            <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        {hasScore ? (
                            <>
                                <p className="text-6xl font-black tabular-nums">
                                    {session.final_score}
                                    <span className="text-3xl text-muted-foreground">/{session.max_score}</span>
                                </p>
                                <p className="text-lg text-muted-foreground mt-1">{scorePct}% overall</p>
                            </>
                        ) : (
                            <p className="text-2xl font-semibold text-muted-foreground">Score not available</p>
                        )}
                    </div>
                    <div className="flex flex-col items-end gap-1 text-sm text-muted-foreground">
                        <span className={cn("flex items-center gap-1.5 font-medium", statusIcon.color)}>
                            <StatusIcon className="h-4 w-4" />
                            {statusIcon.label}
                        </span>
                        {session.started_at && (
                            <span>{format(new Date(session.started_at), "MMM d, yyyy · h:mm a")}</span>
                        )}
                        {durationMinutes !== null && (
                            <span>{durationMinutes} min</span>
                        )}
                    </div>
                </div>

                {session.competency_summary && session.competency_summary.length > 0 && (
                    <div className="space-y-3 pt-2 border-t border-border/40">
                        <p className="text-sm font-semibold">Competency Breakdown</p>
                        {session.competency_summary.map((item) => (
                            <CompetencyBar key={item.competency} item={item} />
                        ))}
                    </div>
                )}
            </div>

            {/* Exchange history */}
            <section className="space-y-4">
                <h2 className="text-base font-semibold">
                    Full Exchange History
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                        ({transcript.exchanges.length} exchange{transcript.exchanges.length !== 1 ? "s" : ""})
                    </span>
                </h2>
                {transcript.exchanges.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-muted-foreground text-sm">
                        No exchanges recorded.
                    </div>
                ) : (
                    <div className="space-y-6">
                        {transcript.exchanges.map((exchange, i) => (
                            <ExchangeItem key={i} exchange={exchange} />
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
