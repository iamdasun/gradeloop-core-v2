"use client";

import * as React from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
    Mic2,
    Loader2,
    Search,
    Filter,
    CheckCircle2,
    Clock,
    XCircle,
    Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ivasApi } from "@/lib/ivas-api";
import { useAuthStore } from "@/lib/stores/authStore";
import type { InstructorAssessmentSummary, IvasAssignment } from "@/types/ivas";

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

export default function VivaAssessmentDashboard() {
    const user = useAuthStore((s) => s.user);
    const [sessions, setSessions] = React.useState<InstructorAssessmentSummary[]>([]);
    const [assignments, setAssignments] = React.useState<IvasAssignment[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    // Filters
    const [searchStudent, setSearchStudent] = React.useState("");
    const [filterStatus, setFilterStatus] = React.useState("all");
    const [filterAssignment, setFilterAssignment] = React.useState("all");

    React.useEffect(() => {
        if (!user?.id) return;
        let mounted = true;
        async function load() {
            try {
                setLoading(true);
                const [sess, asgns] = await Promise.allSettled([
                    ivasApi.getInstructorAssessments(user!.id),
                    ivasApi.getAssignments(),
                ]);
                if (!mounted) return;
                if (sess.status === "fulfilled") setSessions(sess.value);
                if (asgns.status === "fulfilled") setAssignments(asgns.value);
            } catch {
                if (mounted) setError("Failed to load assessment data.");
            } finally {
                if (mounted) setLoading(false);
            }
        }
        load();
        return () => { mounted = false; };
    }, [user?.id]);

    const applyFilters = async () => {
        if (!user?.id) return;
        try {
            setLoading(true);
            setError(null);
            const filtered = await ivasApi.getInstructorAssessments(user.id, {
                assignment_id: filterAssignment !== "all" ? filterAssignment : undefined,
                student_id: searchStudent.trim() || undefined,
                status: filterStatus !== "all" ? filterStatus : undefined,
            });
            setSessions(filtered);
        } catch {
            setError("Failed to filter sessions.");
        } finally {
            setLoading(false);
        }
    };

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
                    <h1 className="text-2xl font-black tracking-tight">Viva Dashboard</h1>
                    <p className="text-sm text-muted-foreground">
                        Monitor all student oral assessment sessions.
                    </p>
                </div>
            </div>

            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                    {error}
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[200px]">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by student ID…"
                            className="pl-9"
                            value={searchStudent}
                            onChange={(e) => setSearchStudent(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                        />
                    </div>
                </div>
                <Select value={filterAssignment} onValueChange={setFilterAssignment}>
                    <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="All assignments" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All assignments</SelectItem>
                        {assignments.map((a) => (
                            <SelectItem key={a.assignment_id} value={a.assignment_id}>
                                {a.title}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="in_progress">Active</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="abandoned">Abandoned</SelectItem>
                    </SelectContent>
                </Select>
                <Button onClick={applyFilters} disabled={loading}>
                    <Filter className="h-4 w-4 mr-2" />
                    Apply
                </Button>
            </div>

            {/* Table */}
            <div className="rounded-xl border border-border/60 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/40 border-b border-border/60">
                            <tr>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Session</th>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Student</th>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Assignment</th>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Progress</th>
                                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i}>
                                        {Array.from({ length: 7 }).map((_, j) => (
                                            <td key={j} className="px-4 py-3">
                                                <Skeleton className="h-4 w-full" />
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : sessions.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                                        No sessions found.
                                    </td>
                                </tr>
                            ) : (
                                sessions.map((s) => (
                                    <tr
                                        key={s.session_id}
                                        className="hover:bg-muted/30 transition-colors"
                                    >
                                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                                            {format(new Date(s.started_at), "MMM d, yyyy")}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                                            {s.session_id.slice(0, 8)}…
                                        </td>
                                        <td className="px-4 py-3 font-medium">{s.student_id}</td>
                                        <td className="px-4 py-3">
                                            {assignmentMap.get(s.assignment_id) ?? s.assignment_id}
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge status={s.status} />
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {s.responses_given}/{s.questions_asked} answered
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <Button asChild size="sm" variant="outline">
                                                <Link href={`/instructor/assessments/review/${s.session_id}`}>
                                                    <Eye className="h-3.5 w-3.5 mr-1" />
                                                    Review
                                                </Link>
                                            </Button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                {!loading && sessions.length > 0 && (
                    <div className="px-4 py-3 border-t border-border/40 bg-muted/20 text-xs text-muted-foreground">
                        {sessions.length} session{sessions.length !== 1 ? "s" : ""}
                    </div>
                )}
            </div>
        </div>
    );
}
