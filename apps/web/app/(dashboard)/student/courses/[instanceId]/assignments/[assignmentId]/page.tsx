"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
    ArrowLeft,
    FileText,
    Calendar,
    Clock,
    Code2,
    Play,
    Send,
    History,
    CheckCircle2,
    AlertCircle,
    Loader2,
    ChevronDown,
    ChevronUp,
    Trophy,
    Users,
    Mic2,
    BrainCircuit,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { studentAssessmentsApi, acafsApi } from "@/lib/api/assessments";
import { useAuthStore } from "@/lib/stores/authStore";
import type { AssignmentResponse, SubmissionResponse, SubmissionGrade } from "@/types/assessments.types";
import { handleApiError } from "@/lib/api/axios";
import { useUIStore } from "@/lib/stores/uiStore";
import { GradeResultPanel } from "@/components/assessments/grade-result-panel";
import { AILikelihoodBadge } from "@/components/clone-detector/AILikelihoodBadge";
import { SemanticSimilarityScore } from "@/components/ui/semantic-similarity-score";
import { format, formatDistanceToNow, isPast } from "date-fns";

function submissionStatusBadge(status: string, executionStatus?: string) {
    switch (status.toLowerCase()) {
        case "graded":
        case "marked":
            return <Badge className="bg-success text-success-foreground">{status}</Badge>;
        case "accepted":
            return <Badge className="bg-success text-success-foreground">{executionStatus ?? status}</Badge>;
        case "submitted":
            return <Badge variant="secondary">{status}</Badge>;
        case "draft":
            return <Badge variant="outline" className="text-warning-muted-foreground border-warning-border">{status}</Badge>;
        case "rejected":
            return (
                <Badge variant="destructive" className="gap-1">
                    {executionStatus ?? "Rejected"}
                </Badge>
            );
        default:
            return <Badge variant="outline">{executionStatus ?? status}</Badge>;
    }
}

export default function StudentAssignmentDetailPage() {
    const params = useParams();
    const router = useRouter();
    const instanceId = params.instanceId as string;
    const assignmentId = params.assignmentId as string;
    const setPageTitle = useUIStore((s) => s.setPageTitle);
    const user = useAuthStore((s) => s.user);

    const [assignment, setAssignment] = React.useState<AssignmentResponse | null>(null);
    const [submissions, setSubmissions] = React.useState<SubmissionResponse[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [historyExpanded, setHistoryExpanded] = React.useState(false);
    const [latestGrade, setLatestGrade] = React.useState<SubmissionGrade | null>(null);
    const [isGradeLoading, setIsGradeLoading] = React.useState(false);
    const [selectedGrade, setSelectedGrade] = React.useState<SubmissionGrade | null>(null);
    const [selectedGradeLoading, setSelectedGradeLoading] = React.useState(false);
    const [startingViva, setStartingViva] = React.useState(false);
    const [vivaError, setVivaError] = React.useState<string | null>(null);

    React.useEffect(() => {
        let mounted = true;

        async function fetchData() {
            try {
                setIsLoading(true);
                const [assignmentData, submissionsData] = await Promise.all([
                    studentAssessmentsApi.getAssignment(assignmentId),
                    studentAssessmentsApi.listMySubmissions(assignmentId),
                ]);
                if (mounted) {
                    setAssignment(assignmentData);
                    setPageTitle(assignmentData.title);
                    setSubmissions(submissionsData.sort((a, b) => b.version - a.version));

                    // Eagerly fetch grade for the latest submission (may be 404 if not graded yet).
                    const latestSub = submissionsData.find((s) => s.is_latest);
                    if (latestSub) {
                        setIsGradeLoading(true);
                        acafsApi.getSubmissionGrade(latestSub.id)
                            .then((g) => { if (mounted) setLatestGrade(g); })
                            .catch(() => { /* not graded yet — silent */ })
                            .finally(() => { if (mounted) setIsGradeLoading(false); });
                    }
                }
            } catch (err) {
                if (mounted) setError(handleApiError(err));
            } finally {
                if (mounted) setIsLoading(false);
            }
        }

        if (assignmentId) fetchData();
        return () => {
            mounted = false;
        };
    }, [assignmentId]);

    // Clear topbar title when leaving this page
    React.useEffect(() => () => { setPageTitle(null); }, []);

    if (isLoading) {
        return (
            <div className="flex flex-col gap-6 pb-8">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-48 rounded-xl" />
                <Skeleton className="h-32 rounded-xl" />
            </div>
        );
    }

    if (error || !assignment) {
        return (
            <div className="flex flex-col gap-4 p-8">
                <Button variant="ghost" className="w-fit pl-0" onClick={() => router.back()}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <div className="p-4 rounded-xl border border-error-border bg-error-muted text-error-muted-foreground text-sm">
                    {error ?? "Assignment not found"}
                </div>
            </div>
        );
    }

    const latestSubmission = submissions.find((s) => s.is_latest);
    const isOverdue = assignment.due_at ? isPast(new Date(assignment.due_at)) : false;

    const visibleHistory = historyExpanded ? submissions : submissions.slice(0, 3);

    // Handler for lazy-loading a non-latest submission’s grade
    const handleViewGrade = (sub: SubmissionResponse) => {
        setSelectedGrade(null);
        setSelectedGradeLoading(true);
        acafsApi.getSubmissionGrade(sub.id)
            .then(setSelectedGrade)
            .catch(() => setSelectedGrade(null))
            .finally(() => setSelectedGradeLoading(false));
    };

    const handleStartViva = async () => {
        if (!user?.id) return;
        try {
            setStartingViva(true);
            setVivaError(null);
            // Navigate to the viva page with "new" session — the viva page handles triggering
            router.push(`/student/assessments/viva/new?assignmentId=${assignmentId}`);
        } catch (err) {
            setVivaError(err instanceof Error ? err.message : "Failed to start viva.");
            setStartingViva(false);
        }
    };

    return (
        <>
        <div className="flex flex-col gap-8 pb-8">
            {/* Back navigation */}
            <div>
                <Button
                    variant="ghost"
                    className="mb-4 pl-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
                    onClick={() => router.push(`/student/courses/${instanceId}`)}
                >
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Course
                </Button>

                {/* Assignment Header */}
                <div className="flex flex-col gap-4 border-b border-border/40 pb-6">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                            <div>
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <Badge variant="outline" className="text-xs font-mono">
                                        {assignment.code}
                                    </Badge>
                                    {isOverdue && (
                                        <Badge variant="destructive" className="text-xs">Closed</Badge>
                                    )}
                                    {assignment.allow_group_submission && (
                                        <Badge variant="secondary" className="text-xs gap-1">
                                            <Users className="h-3 w-3" /> Group
                                        </Badge>
                                    )}
                                </div>
                                <h1 className="text-2xl font-black tracking-tight">{assignment.title}</h1>
                            </div>
                        </div>

                        {/* CTA */}
                        <div className="flex gap-2 flex-wrap">
                            <Button asChild>
                                <Link href={`/student/courses/${instanceId}/assignments/${assignmentId}/attempt`} target="_blank" rel="noopener noreferrer">
                                    {latestSubmission?.status?.toLowerCase() === "draft" ? (
                                        <>
                                            <Play className="h-4 w-4 mr-2" />
                                            Continue Draft
                                        </>
                                    ) : latestSubmission ? (
                                        <>
                                            <Send className="h-4 w-4 mr-2" />
                                            Resubmit
                                        </>
                                    ) : (
                                        <>
                                            <Play className="h-4 w-4 mr-2" />
                                            Start Attempt
                                        </>
                                    )}
                                </Link>
                            </Button>
                            <Button
                                variant="outline"
                                onClick={handleStartViva}
                                disabled={startingViva}
                            >
                                {startingViva ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                    <Mic2 className="h-4 w-4 mr-2" />
                                )}
                                Start Viva
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Grade panel — shown whenever ACAFS has a result, regardless of submission status */}
            {(isGradeLoading || latestGrade) && (
                <Card className="border-border/60">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Trophy className="h-4 w-4 text-primary" />
                            Your Grade
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <GradeResultPanel
                            grade={latestGrade}
                            isLoading={isGradeLoading}
                            instructorView={false}
                        />
                    </CardContent>
                </Card>
            )}

            {/* Main 2-column layout */}
            <div className="grid gap-6 lg:grid-cols-3">
                {/* Left: Assignment info */}
                <div className="lg:col-span-2 flex flex-col gap-6">
                    {/* Description */}
                    <Card className="border-border/60">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <FileText className="h-4 w-4 text-primary" />
                                Assignment Brief
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="prose prose-sm max-w-none dark:prose-invert">
                                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground bg-transparent p-0 border-0">
                                    {assignment.description || "No description provided."}
                                </pre>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Submission History */}
                    <Card className="border-border/60">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <History className="h-4 w-4 text-primary" />
                                    Submission History
                                    {submissions.length > 0 && (
                                        <Badge variant="secondary" className="ml-1">
                                            {submissions.length}
                                        </Badge>
                                    )}
                                </CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {submissions.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
                                    <History className="h-8 w-8 text-muted-foreground/40" />
                                    <p className="text-sm text-muted-foreground">No submissions yet</p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {visibleHistory.map((sub) => (
                                        <div
                                            key={sub.id}
                                            className="flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-muted/30"
                                        >
                                            <div className="flex flex-col items-center gap-0.5 shrink-0 w-10 text-center">
                                                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">v</span>
                                                <span className="font-heading text-lg font-black text-foreground leading-none">
                                                    {sub.version}
                                                </span>
                                            </div>
                                            <Separator orientation="vertical" className="h-10" />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {submissionStatusBadge(sub.status, sub.execution_status)}
                                                    {sub.is_latest && (
                                                        <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                                                            Latest
                                                        </Badge>
                                                    )}
                                                </div>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    {format(new Date(sub.submitted_at), "MMM d, yyyy 'at' h:mm a")}
                                                    {" · "}
                                                    {formatDistanceToNow(new Date(sub.submitted_at), { addSuffix: true })}
                                                </p>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                asChild
                                                className="shrink-0 text-xs"
                                            >
                                                <Link
                                                    href={`/student/courses/${instanceId}/assignments/${assignmentId}/attempt?submission=${sub.id}`}
                                                >
                                                    View Code
                                                </Link>
                                            </Button>
                                            {!sub.is_latest && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="shrink-0 text-xs"
                                                    onClick={() => handleViewGrade(sub)}
                                                >
                                                    View Grade
                                                </Button>
                                            )}
                                        </div>
                                    ))}
                                    {submissions.length > 3 && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setHistoryExpanded(!historyExpanded)}
                                            className="self-start text-xs text-muted-foreground"
                                        >
                                            {historyExpanded ? (
                                                <>
                                                    <ChevronUp className="h-3 w-3 mr-1" /> Show less
                                                </>
                                            ) : (
                                                <>
                                                    <ChevronDown className="h-3 w-3 mr-1" />
                                                    Show {submissions.length - 3} more
                                                </>
                                            )}
                                        </Button>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Right sidebar: metadata + rubric */}
                <div className="flex flex-col gap-4">
                    {/* Stats */}
                    <Card className="border-border/60">
                        <CardContent className="p-5 flex flex-col gap-3">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Assignment Details
                            </p>
                            <DetailRow
                                icon={Code2}
                                label="Language"
                                value={assignment.code.toUpperCase()}
                            />
                            {assignment.due_at && (
                                <DetailRow
                                    icon={Calendar}
                                    label="Due date"
                                    value={format(new Date(assignment.due_at), "MMM d, yyyy")}
                                    sub={formatDistanceToNow(new Date(assignment.due_at), { addSuffix: true })}
                                    urgent={isOverdue}
                                />
                            )}
                            {assignment.allow_late_submissions && assignment.late_due_at && (
                                <DetailRow
                                    icon={Clock}
                                    label="Late deadline"
                                    value={format(new Date(assignment.late_due_at), "MMM d, yyyy")}
                                />
                            )}
                            {assignment.allow_group_submission && (
                                <DetailRow
                                    icon={Users}
                                    label="Max group size"
                                    value={`${assignment.max_group_size} members`}
                                />
                            )}
                            {assignment.enforce_time_limit && (
                                <DetailRow
                                    icon={Clock}
                                    label="Time limit"
                                    value={`${assignment.enforce_time_limit} minutes`}
                                />
                            )}
                        </CardContent>
                    </Card>

                    {/* Current status */}
                    {latestSubmission && (
                        <Card className="border-border/60">
                            <CardContent className="p-5">
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                                    Your Status
                                </p>
                                <div className="flex items-center gap-3">
                                    {latestGrade ? (
                                        <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                                    ) : latestSubmission.status.toLowerCase() === "accepted" ? (
                                        <Send className="h-5 w-5 text-primary shrink-0" />
                                    ) : (
                                        <AlertCircle className="h-5 w-5 text-warning-muted-foreground shrink-0" />
                                    )}
                                    <div>
                                        <p className="font-semibold text-sm">
                                            {latestGrade ? "Graded" : latestSubmission.status}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            Version {latestSubmission.version} ·{" "}
                                            {formatDistanceToNow(new Date(latestSubmission.submitted_at), {
                                                addSuffix: true,
                                            })}
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* AI Analysis */}
                    {latestSubmission?.ai_likelihood !== undefined && (
                        <Card className="border-border/60">
                            <CardContent className="p-5 flex flex-col gap-3">
                                <div className="flex items-center gap-2">
                                    <BrainCircuit className="h-4 w-4 text-muted-foreground" />
                                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                        AI Analysis
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground mb-2">AI Generation Likelihood</p>
                                    <AILikelihoodBadge
                                        aiLikelihood={latestSubmission.ai_likelihood}
                                        humanLikelihood={latestSubmission.human_likelihood ?? (1 - latestSubmission.ai_likelihood)}
                                        showLabel
                                        size="md"
                                    />
                                </div>
                                {latestSubmission.semantic_similarity_score !== undefined && latestSubmission.semantic_similarity_score !== null && (
                                    <>
                                        <Separator />
                                        <div>
                                            <p className="text-xs text-muted-foreground mb-2">Similarity to sample answer</p>
                                            <SemanticSimilarityScore score={latestSubmission.semantic_similarity_score} />
                                        </div>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* Viva Assessment */}
                    <Card className="border-primary/20 bg-primary/5">
                        <CardContent className="p-5 flex flex-col gap-3">
                            <div className="flex items-center gap-2">
                                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                    <Mic2 className="h-4 w-4 text-primary" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold">Oral Viva</p>
                                    <p className="text-xs text-muted-foreground">AI-powered oral assessment</p>
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Answer questions about your code verbally. The AI will ask follow-up questions based on your responses.
                            </p>
                            {vivaError && (
                                <p className="text-xs text-destructive">{vivaError}</p>
                            )}
                            <Button
                                className="w-full"
                                onClick={handleStartViva}
                                disabled={startingViva}
                            >
                                {startingViva ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                    <Mic2 className="h-4 w-4 mr-2" />
                                )}
                                {startingViva ? "Starting…" : "Start Viva"}
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>

        {/* Sheet — view grade of a non-latest submission */}
        <Sheet
            open={selectedGrade !== null || selectedGradeLoading}
            onOpenChange={(open) => {
                if (!open) {
                    setSelectedGrade(null);
                    setSelectedGradeLoading(false);
                }
            }}
        >
            <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
                <SheetHeader className="mb-4">
                    <SheetTitle className="flex items-center gap-2">
                        <Trophy className="h-5 w-5 text-primary" />
                        Submission Grade
                    </SheetTitle>
                </SheetHeader>
                {selectedGradeLoading && !selectedGrade ? (
                    <GradeResultPanel grade={null} isLoading />
                ) : selectedGrade ? (
                    <GradeResultPanel
                        grade={selectedGrade}
                        isLoading={false}
                        instructorView={false}
                    />
                ) : (
                    <p className="text-sm text-muted-foreground">
                        No grade available for this submission yet.
                    </p>
                )}
            </SheetContent>
        </Sheet>
        </>
    );
}

// ── Helper components ─────────────────────────────────────────────────────────

function DetailRow({
    icon: Icon,
    label,
    value,
    sub,
    urgent,
}: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string;
    sub?: string;
    urgent?: boolean;
}) {
    return (
        <div className="flex items-start gap-3">
            <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-sm font-semibold ${urgent ? "text-destructive" : ""}`}>{value}</p>
                {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
            </div>
        </div>
    );
}


