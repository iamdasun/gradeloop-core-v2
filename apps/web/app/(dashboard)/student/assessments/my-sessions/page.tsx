"use client";

import * as React from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
    Mic2,
    Clock,
    CheckCircle2,
    XCircle,
    Play,
    BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ivasApi } from "@/lib/ivas-api";
import { useAuthStore } from "@/lib/stores/authStore";
import type { StudentSessionSummary, IvasAssignment } from "@/types/ivas";

function StatusBadge({ status }: { status: string }) {
    if (status === "completed") {
        return (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                Completed
            </span>
        );
    }
    if (status === "in_progress") {
        return (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                <Clock className="h-3 w-3" />
                Active
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            <XCircle className="h-3 w-3" />
            Abandoned
        </span>
    );
}

export default function MyVivaSessionsPage() {
    const user = useAuthStore((s) => s.user);
    const [sessions, setSessions] = React.useState<StudentSessionSummary[]>([]);
    const [assignments, setAssignments] = React.useState<IvasAssignment[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!user?.id) return;
        let mounted = true;
        async function load() {
            try {
                setLoading(true);
                const [sess, asgns] = await Promise.allSettled([
                    ivasApi.getStudentSessions(user!.id),
                    ivasApi.getAssignments(),
                ]);
                if (!mounted) return;
                if (sess.status === "fulfilled") setSessions(sess.value);
                if (asgns.status === "fulfilled") setAssignments(asgns.value);
            } catch {
                if (mounted) setError("Failed to load your sessions.");
            } finally {
                if (mounted) setLoading(false);
            }
        }
        load();
        return () => { mounted = false; };
    }, [user?.id]);

    const assignmentMap = React.useMemo(
        () => new Map(assignments.map((a) => [a.assignment_id, a.title])),
        [assignments]
    );

    return (
        <div className="flex flex-col gap-8 pb-8">
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-border/40 pb-6">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Mic2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                    <h1 className="text-2xl font-black tracking-tight">My Viva Assessments</h1>
                    <p className="text-sm text-muted-foreground">
                        View your past and active oral assessment sessions.
                    </p>
                </div>
            </div>

            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-20 rounded-xl" />
                    ))}
                </div>
            ) : sessions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 p-12 text-center text-muted-foreground">
                    <Mic2 className="h-8 w-8 mx-auto mb-3 opacity-40" />
                    <p className="text-sm">No viva sessions yet.</p>
                    <p className="text-xs mt-1">Your sessions will appear here once an instructor assigns a viva assessment.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {sessions.map((s) => (
                        <div
                            key={s.session_id}
                            className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-card px-5 py-4"
                        >
                            <div className="flex-1 min-w-0 space-y-1">
                                <p className="font-semibold text-sm truncate">
                                    {assignmentMap.get(s.assignment_id) ?? s.assignment_id}
                                </p>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                                    <StatusBadge status={s.status} />
                                    <span>{format(new Date(s.started_at), "MMM d, yyyy")}</span>
                                    <span>{s.responses_given}/{s.questions_asked} questions answered</span>
                                </div>
                            </div>
                            <div className="flex gap-2 shrink-0">
                                {s.status === "in_progress" ? (
                                    <Button asChild size="sm">
                                        <Link href={`/student/assessments/viva/${s.session_id}`}>
                                            <Play className="h-3.5 w-3.5 mr-1" />
                                            Continue
                                        </Link>
                                    </Button>
                                ) : s.status === "completed" ? (
                                    <Button asChild size="sm" variant="outline">
                                        <Link href={`/student/assessments/results/${s.session_id}`}>
                                            <BarChart3 className="h-3.5 w-3.5 mr-1" />
                                            View Results
                                        </Link>
                                    </Button>
                                ) : (
                                    <span className="text-xs text-muted-foreground px-2">Ended</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
