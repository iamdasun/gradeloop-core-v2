"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { format, differenceInMinutes } from "date-fns";
import {
    Mic2,
    Loader2,
    CheckCircle2,
    Clock,
    XCircle,
    MessageSquare,
    User,
    CornerDownRight,
    AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ivasApi } from "@/lib/ivas-api";
import type {
    AssessmentTranscriptOut,
    ExchangeOut,
    CompetencySummary,
} from "@/types/ivas";

function ScoreBadge({ score }: { score: number | null }) {
    if (score === null) return null;
    const color =
        score >= 7
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
            : score >= 4
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    return (
        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", color)}>
            {score}/10
        </span>
    );
}

function CompetencyBar({ item }: { item: CompetencySummary }) {
    const pct = item.max_score > 0 ? (item.score / item.max_score) * 100 : 0;
    const barColor = pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500";
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{item.competency}</span>
                <span className="text-muted-foreground">
                    {item.score}/{item.max_score} · {item.questions_asked} Q
                </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

function ExchangeCard({ exchange, index }: { exchange: ExchangeOut; index: number }) {
    const isFollowUp = exchange.is_follow_up;
    return (
        <div className={cn("space-y-3", isFollowUp && "pl-6 border-l-2 border-primary/20")}>
            {isFollowUp && (
                <div className="flex items-center gap-1 text-xs text-primary/70">
                    <CornerDownRight className="h-3 w-3" />
                    Follow-up
                </div>
            )}

            {/* Question bubble */}
            <div className="flex gap-3">
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <MessageSquare className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="flex-1 rounded-2xl rounded-tl-sm bg-muted/50 p-3 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-xs">{exchange.competency}</Badge>
                        <span className="text-xs text-muted-foreground">Difficulty {exchange.difficulty}</span>
                        {exchange.question_type !== "new" && (
                            <span className="text-xs text-muted-foreground capitalize">
                                ({exchange.question_type.replace("_", " ")})
                            </span>
                        )}
                    </div>
                    <p className="text-sm">{exchange.question_text}</p>
                </div>
            </div>

            {/* Answer bubble */}
            {exchange.student_answer && (
                <div className="flex gap-3 flex-row-reverse">
                    <div className="h-7 w-7 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center shrink-0 mt-0.5">
                        <User className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 rounded-2xl rounded-tr-sm bg-primary/5 border border-primary/10 p-3 space-y-1">
                        <p className="text-sm">{exchange.student_answer}</p>
                        {exchange.response_time_seconds > 0 && (
                            <p className="text-xs text-muted-foreground">
                                {exchange.response_time_seconds}s response time
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* Evaluation card */}
            {(exchange.evaluation_score !== null || exchange.feedback_text) && (
                <div className="ml-10 rounded-xl border border-border/60 bg-card p-3 space-y-2">
                    <div className="flex items-center gap-2">
                        <ScoreBadge score={exchange.evaluation_score} />
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
                            <div className="text-xs text-amber-700 dark:text-amber-400">
                                <span className="font-medium">Misconceptions: </span>
                                {exchange.detected_misconceptions.join(", ")}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function SessionReviewPage() {
    const params = useParams<{ sessionId: string }>();
    const sessionId = params.sessionId;

    const [transcript, setTranscript] = React.useState<AssessmentTranscriptOut | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        let mounted = true;
        async function load() {
            try {
                setLoading(true);
                const data = await ivasApi.getTranscript(sessionId);
                if (mounted) setTranscript(data);
            } catch (err) {
                if (mounted) setError(err instanceof Error ? err.message : "Failed to load session.");
            } finally {
                if (mounted) setLoading(false);
            }
        }
        load();
        return () => { mounted = false; };
    }, [sessionId]);

    const durationMinutes = React.useMemo(() => {
        if (!transcript?.started_at || !transcript?.completed_at) return null;
        return differenceInMinutes(
            new Date(transcript.completed_at),
            new Date(transcript.started_at)
        );
    }, [transcript]);

    if (loading) {
        return (
            <div className="flex flex-col gap-8 pb-8">
                <Skeleton className="h-10 w-64" />
                <div className="grid gap-4 sm:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
                </div>
                <div className="space-y-6">
                    {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
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

    if (!transcript) return null;

    const statusInfo =
        transcript.status === "completed"
            ? { icon: CheckCircle2, label: "Completed", color: "text-emerald-600" }
            : transcript.status === "in_progress"
                ? { icon: Clock, label: "Active", color: "text-blue-600" }
                : { icon: XCircle, label: "Abandoned", color: "text-zinc-500" };
    const StatusIcon = statusInfo.icon;

    return (
        <div className="flex flex-col gap-8 pb-8">
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-border/40 pb-6">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Mic2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                    <h1 className="text-2xl font-black tracking-tight">Session Review</h1>
                    <p className="text-sm text-muted-foreground font-mono">
                        {sessionId.slice(0, 16)}…
                    </p>
                </div>
            </div>

            {/* Meta Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-border/60 bg-card px-4 py-3 space-y-1">
                    <p className="text-xs text-muted-foreground">Student</p>
                    <p className="font-semibold text-sm">{transcript.student_id}</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-card px-4 py-3 space-y-1">
                    <p className="text-xs text-muted-foreground">Status</p>
                    <p className={cn("font-semibold text-sm flex items-center gap-1.5", statusInfo.color)}>
                        <StatusIcon className="h-4 w-4" />
                        {statusInfo.label}
                    </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-card px-4 py-3 space-y-1">
                    <p className="text-xs text-muted-foreground">Duration</p>
                    <p className="font-semibold text-sm">
                        {durationMinutes !== null ? `${durationMinutes} min` : "—"}
                    </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-card px-4 py-3 space-y-1">
                    <p className="text-xs text-muted-foreground">Final Score</p>
                    <p className="font-semibold text-sm">
                        {transcript.final_score !== null && transcript.max_score !== null
                            ? `${transcript.final_score}/${transcript.max_score} (${Math.round((transcript.final_score / transcript.max_score) * 100)}%)`
                            : "—"}
                    </p>
                </div>
            </div>

            {/* Competency Breakdown */}
            {transcript.competency_summary && transcript.competency_summary.length > 0 && (
                <section className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
                    <h2 className="text-base font-semibold">Competency Breakdown</h2>
                    <div className="space-y-3">
                        {transcript.competency_summary.map((item) => (
                            <CompetencyBar key={item.competency} item={item} />
                        ))}
                    </div>
                </section>
            )}

            {/* Transcript */}
            <section className="space-y-4">
                <h2 className="text-base font-semibold">
                    Transcript
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                        ({transcript.exchanges.length} exchange{transcript.exchanges.length !== 1 ? "s" : ""})
                    </span>
                </h2>
                {transcript.exchanges.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-muted-foreground text-sm">
                        No exchanges recorded yet.
                    </div>
                ) : (
                    <div className="space-y-6">
                        {transcript.exchanges.map((exchange, i) => (
                            <ExchangeCard key={i} exchange={exchange} index={i} />
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
