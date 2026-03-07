"use client";

import * as React from "react";
import { instructorAssessmentsApi, assessmentsApi, acafsApi } from "@/lib/api/assessments";
import { usersApi } from "@/lib/api/users";
import type { SubmissionResponse, SubmissionGrade } from "@/types/assessments.types";
import type { UserListItem } from "@/types/auth.types";
import { Users, FileDown, SearchX, Filter, Loader2, AlertCircle } from "lucide-react";
import { SectionHeader } from "@/components/instructor/section-header";
import { DataTable, type ColumnDef } from "@/components/instructor/data-table";
import { StatusBadge } from "@/components/instructor/status-badge";
import { Button } from "@/components/ui/button";
import { EmptyStateCard } from "@/components/instructor/empty-state";
import { SideSheetForm } from "@/components/instructor/side-sheet-form";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { GradeResultPanel } from "@/components/assessments/grade-result-panel";

interface SubmissionWithMeta extends SubmissionResponse {
    studentName: string;
    studentId?: string;
}

export default function AssignmentSubmissionsPage({
    params,
}: {
    params: Promise<{ assignmentId: string }>;
}) {
    const { assignmentId } = React.use(params);

    const [submissions, setSubmissions] = React.useState<SubmissionWithMeta[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [selectedSubmission, setSelectedSubmission] = React.useState<SubmissionWithMeta | null>(null);
    const [submissionCode, setSubmissionCode] = React.useState<string | null>(null);
    const [isCodeLoading, setIsCodeLoading] = React.useState(false);
    const [submissionGrade, setSubmissionGrade] = React.useState<SubmissionGrade | null>(null);
    const [isGradeLoading, setIsGradeLoading] = React.useState(false);
    const [filter, setFilter] = React.useState<"all" | "pending" | "graded" | "late" | "missing">("all");

    React.useEffect(() => {
        let mounted = true;

        async function fetchSubmissions() {
            try {
                setIsLoading(true);
                setError(null);
                const subs = await instructorAssessmentsApi.listSubmissions(assignmentId);

                // Batch-fetch user profiles for all unique user IDs in parallel
                const uniqueUserIds = [
                    ...new Set(subs.map((s) => s.user_id).filter(Boolean) as string[]),
                ];
                const userMap = new Map<string, UserListItem>();
                await Promise.allSettled(
                    uniqueUserIds.map(async (uid) => {
                        try {
                            const user = await usersApi.get(uid);
                            userMap.set(uid, user);
                        } catch {
                            // user not found — fall back to placeholder below
                        }
                    })
                );

                const enriched: SubmissionWithMeta[] = subs.map((s, i) => {
                    const user = s.user_id ? userMap.get(s.user_id) : undefined;
                    return {
                        ...s,
                        studentName: user?.full_name ?? `Student ${i + 1}`,
                        studentId: user?.student_id,
                    };
                });

                if (mounted) setSubmissions(enriched);
            } catch (err) {
                console.error(err);
                if (mounted) setError("Failed to load submissions. Please try again.");
            } finally {
                if (mounted) setIsLoading(false);
            }
        }

        fetchSubmissions();
        return () => {
            mounted = false;
        };
    }, [assignmentId]);

    // Load actual submission code when the grading sheet opens
    React.useEffect(() => {
        if (!selectedSubmission || selectedSubmission.status === "Missing") {
            setSubmissionCode(null);
            return;
        }
        let mounted = true;
        setIsCodeLoading(true);
        assessmentsApi
            .getSubmissionCode(selectedSubmission.id)
            .then((res) => { if (mounted) setSubmissionCode(res.code); })
            .catch(() => { if (mounted) setSubmissionCode(null); })
            .finally(() => { if (mounted) setIsCodeLoading(false); });
        return () => { mounted = false; };
    }, [selectedSubmission]);

    // Load ACAFS grade when the sheet opens for a submitted assignment
    React.useEffect(() => {
        if (!selectedSubmission || selectedSubmission.status === "Missing") {
            setSubmissionGrade(null);
            return;
        }
        let mounted = true;
        setIsGradeLoading(true);
        setSubmissionGrade(null);
        acafsApi
            .getSubmissionGrade(selectedSubmission.id)
            .then((grade) => { if (mounted) setSubmissionGrade(grade); })
            .catch((err: Error) => {
                // 404 means not yet graded — not an error worth logging loudly
                if (mounted && err.message !== "GRADING_PENDING") {
                    console.error("Failed to load submission grade:", err);
                }
            })
            .finally(() => { if (mounted) setIsGradeLoading(false); });
        return () => { mounted = false; };
    }, [selectedSubmission]);

    const filtered = React.useMemo(() => {
        if (filter === "all") return submissions;
        return submissions.filter((s) => s.status.toLowerCase() === filter);
    }, [submissions, filter]);

    const columns: ColumnDef<SubmissionWithMeta, any>[] = [
        {
            accessorKey: "studentName",
            header: "Student",
            cell: ({ row }) => (
                <div className="flex flex-col">
                    <span className="font-semibold text-foreground">{row.getValue("studentName")}</span>
                    {row.original.studentId && (
                        <span className="text-xs text-muted-foreground font-mono">{row.original.studentId}</span>
                    )}
                </div>
            ),
        },
        {
            accessorKey: "status",
            header: "Status",
            cell: ({ row }) => <StatusBadge status={row.getValue("status")} />,
        },
        {
            accessorKey: "submitted_at",
            header: "Submitted",
            cell: ({ row }) => {
                const date = row.getValue("submitted_at") as string;
                if (!date) return <span className="text-muted-foreground">—</span>;
                return <span className="text-sm whitespace-nowrap">{format(new Date(date), "MMM d, yyyy • h:mm a")}</span>;
            },
        },
        {
            accessorKey: "language",
            header: "Language",
            cell: ({ row }) => <span className="font-mono text-sm">{row.getValue("language") || "—"}</span>,
        },
        {
            id: "actions",
            cell: ({ row }) => (
                <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSubmission(row.original);
                    }}
                >
                    {row.original.status === "Missing" ? "View Profile" : "Grade"}
                </Button>
            )
        }
    ];

    const exportToCsv = () => {
        const headers = ["Student ID", "Name", "Status", "Submitted At", "Language"];
        const rows = filtered.map((s) => [
            s.studentId ?? "",
            s.studentName ?? "",
            s.status ?? "",
            s.submitted_at ? format(new Date(s.submitted_at), "yyyy-MM-dd HH:mm:ss") : "",
            s.language ?? "",
        ]);
        const csv = [headers, ...rows]
            .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
            .join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `submissions-${assignmentId}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="flex flex-col gap-8 pb-8 h-full">
            <SectionHeader
                title="Submissions"
                description="Review student work, run plagiarism checks, and grade assignments."
                icon={Users}
                action={
                    <div className="flex items-center gap-2">
                        {!isLoading && filtered.length > 0 && (
                            <Badge variant="outline" className="font-semibold text-sm px-3 py-1">
                                {filtered.length} submission{filtered.length !== 1 ? "s" : ""}
                            </Badge>
                        )}
                        <Button variant="outline" size="sm" onClick={exportToCsv} disabled={isLoading || filtered.length === 0}>
                            <FileDown className="mr-2 h-4 w-4" /> Export CSV
                        </Button>
                    </div>
                }
            />

            {/* Filter Tabs */}
            {!isLoading && submissions.length > 0 && (
                <div className="flex items-center gap-3">
                    <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Tabs value={filter} onValueChange={(v) => setFilter(v as any)} className="w-full max-w-md">
                        <TabsList className="grid grid-cols-5 gap-1">
                            <TabsTrigger value="all">All</TabsTrigger>
                            <TabsTrigger value="pending">Pending</TabsTrigger>
                            <TabsTrigger value="graded">Graded</TabsTrigger>
                            <TabsTrigger value="late">Late</TabsTrigger>
                            <TabsTrigger value="missing">Missing</TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>
            )}

            {/* Error state */}
            {!isLoading && error && (
                <EmptyStateCard
                    icon={AlertCircle}
                    title="Something went wrong"
                    description={error}
                    action={
                        <Button variant="outline" onClick={() => window.location.reload()}>
                            Retry
                        </Button>
                    }
                />
            )}

            {/* No submissions at all */}
            {!isLoading && !error && submissions.length === 0 && (
                <EmptyStateCard
                    icon={SearchX}
                    title="No submissions yet"
                    description="Students haven't submitted any work for this assignment yet. Check back later."
                />
            )}

            {/* Filter returned nothing */}
            {!isLoading && !error && submissions.length > 0 && filtered.length === 0 && (
                <EmptyStateCard
                    icon={SearchX}
                    title={`No ${filter} submissions`}
                    description={`There are no submissions with "${filter}" status for this assignment.`}
                />
            )}

            {/* Submissions table */}
            {!error && (isLoading || filtered.length > 0) && (
                <DataTable
                    columns={columns}
                    data={filtered}
                    isLoading={isLoading}
                    searchKey="studentName"
                    searchPlaceholder="Search by student name..."
                    onRowClick={(row) => setSelectedSubmission(row)}
                />
            )}

            {/* Grading Review Sheet */}
            <SideSheetForm
                open={selectedSubmission !== null}
                onOpenChange={(open) => !open && setSelectedSubmission(null)}
                title={selectedSubmission ? `Grade: ${selectedSubmission.studentName}` : "Grade Submission"}
                description="Review the submission content, evaluate against the rubric, and assign a final score."
            >
                <div className="flex-1 overflow-y-auto space-y-6">
                    <div className="p-4 bg-muted/30 rounded-lg border border-border/40 space-y-3">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">Status</span>
                            <StatusBadge status={selectedSubmission?.status || "Pending"} />
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">Submitted</span>
                            <span className="font-medium text-foreground">
                                {selectedSubmission?.submitted_at
                                    ? format(new Date(selectedSubmission.submitted_at), "MMM d, yyyy • h:mm a")
                                    : "Not submitted"}
                            </span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">Language</span>
                            <span className="font-mono text-xs">{selectedSubmission?.language || "—"}</span>
                        </div>
                        {selectedSubmission?.version !== undefined && (
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">Version</span>
                                <span className="font-mono text-xs">v{selectedSubmission.version}</span>
                            </div>
                        )}
                    </div>

                    {selectedSubmission?.status !== "Missing" && (
                        <div className="space-y-4">
                            <div>
                                <h4 className="font-bold font-heading mb-2">Submission Code</h4>
                                {isCodeLoading ? (
                                    <div className="flex items-center justify-center h-[300px] border border-border/60 rounded-xl bg-card">
                                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                    </div>
                                ) : submissionCode !== null ? (
                                    <pre className="p-4 border border-border/60 rounded-xl bg-card text-sm font-mono h-[300px] overflow-y-auto text-foreground whitespace-pre-wrap break-all">
                                        {submissionCode}
                                    </pre>
                                ) : (
                                    <div className="p-4 border border-border/60 rounded-xl bg-muted/20 text-sm text-muted-foreground h-[300px] flex items-center justify-center">
                                        Code unavailable
                                    </div>
                                )}
                            </div>

                            <div>
                                <h4 className="font-bold font-heading mb-3">Autograder Results</h4>
                                <GradeResultPanel
                                    grade={submissionGrade}
                                    isLoading={isGradeLoading}
                                    instructorView={true}
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className="pt-6 mt-6 border-t border-border/40 flex items-center justify-end sticky bottom-0 bg-background/95 backdrop-blur py-4 z-10">
                    <Button variant="outline" onClick={() => setSelectedSubmission(null)}>
                        Close
                    </Button>
                </div>
            </SideSheetForm>
        </div>
    );
}
