"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
    ArrowLeft,
    Send,
    Save,
    FileText,
    AlertCircle,
    Loader2,
    CheckCircle2,
    X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CodeIDE } from "@/components/ide";
import { studentAssessmentsApi, acafsApi } from "@/lib/api/assessments";
import type { AssignmentResponse, SubmissionGrade } from "@/types/assessments.types";
import { handleApiError } from "@/lib/api/axios";
import { useAuthStore } from "@/lib/stores/authStore";
import { useUIStore } from "@/lib/stores/uiStore";
import { toast } from "sonner";
import { format, isPast } from "date-fns";

// Map assignment language code strings to Judge0 language IDs.
// Only IDs verified to exist on this Judge0 instance (/languages) are used.
const LANGUAGE_CODE_TO_ID: Record<string, number> = {
    python: 71,
    python3: 71,
    py: 71,
    go: 60,
    golang: 60,
    javascript: 63,
    js: 63,
    typescript: 74,
    ts: 74,
    java: 62,
    c: 50,
    clang_c: 75,
    cpp: 54,
    "c++": 54,
    clang_cpp: 76,
    csharp: 51,
    "c#": 51,
    rust: 73,
    ruby: 72,
    php: 68,
    swift: 83,
    kotlin: 78,
    scala: 81,
    haskell: 61,
    r: 80,
};

// Reverse map: Judge0 language ID → canonical language name string.
// IDs 91/92/93/94/95/105 removed — they do NOT exist on this Judge0 instance.
const LANGUAGE_ID_TO_NAME: Record<number, string> = {
    71: "python",
    62: "java",
    54: "cpp",
    76: "cpp",
    50: "c",
    75: "c",
    51: "csharp",
    63: "javascript",
    74: "typescript",
    60: "go",
    73: "rust",
    72: "ruby",
    68: "php",
    83: "swift",
    78: "kotlin",
    81: "scala",
    61: "haskell",
    80: "r",
};

function getLanguageId(code: string): number {
    return LANGUAGE_CODE_TO_ID[code.toLowerCase().trim()] ?? 71;
}

export default function StudentAttemptPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user } = useAuthStore();
    const setPageTitle = useUIStore((s) => s.setPageTitle);
    const instanceId = params.instanceId as string;
    const assignmentId = params.assignmentId as string;
    const viewSubmissionId = searchParams.get("submission");

    const [assignment, setAssignment] = React.useState<AssignmentResponse | null>(null);
    const [initialCode, setInitialCode] = React.useState<string | undefined>(undefined);
    const [isLoading, setIsLoading] = React.useState(true);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [submittedVersion, setSubmittedVersion] = React.useState<number | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [showBrief, setShowBrief] = React.useState(true);

    // Grade polling state
    // gradedSubmissionId is set after a new submit OR pre-set to viewSubmissionId
    // so that read-only views can also show a pre-existing grade.
    const [gradedSubmissionId, setGradedSubmissionId] = React.useState<string | null>(
        viewSubmissionId ?? null
    );
    const [grade, setGrade] = React.useState<SubmissionGrade | null>(null);
    const [isGrading, setIsGrading] = React.useState(false);

    // Poll ACAFS for grade results with exponential back-off.
    // ACAFS returns 404 while grading is pending; 200 when complete.
    React.useEffect(() => {
        if (!gradedSubmissionId) return;
        let cancelled = false;
        let attempts = 0;
        const MAX_ATTEMPTS = 45; // ~3 min cap

        setGrade(null);
        setIsGrading(true);

        async function poll() {
            if (cancelled) return;
            if (attempts >= MAX_ATTEMPTS) {
                setIsGrading(false);
                return;
            }
            attempts++;
            try {
                const g = await acafsApi.getSubmissionGrade(gradedSubmissionId!);
                if (!cancelled) {
                    setGrade(g);
                    setIsGrading(false);
                }
            } catch (e) {
                if (cancelled) return;
                if (e instanceof Error && e.message === "GRADING_PENDING") {
                    // Exponential back-off: 3s, 4.5s, 6.75s … capped at 30s
                    const delay = Math.min(3000 * Math.pow(1.5, Math.min(attempts - 1, 7)), 30000);
                    setTimeout(poll, delay);
                } else {
                    // Non-404 error or grading not enabled — stop quietly
                    setIsGrading(false);
                }
            }
        }

        // Small initial delay to let the worker start
        const timer = setTimeout(poll, 3000);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [gradedSubmissionId]);

    React.useEffect(() => {
        let mounted = true;

        async function fetchData() {
            try {
                setIsLoading(true);

                // Fetch assignment details
                const asgn = await studentAssessmentsApi.getAssignment(assignmentId);
                if (!mounted) return;
                setAssignment(asgn);
                setPageTitle(asgn.title);

                if (viewSubmissionId) {
                    // Viewing a specific submission version
                    const codeData = await studentAssessmentsApi.getSubmissionCode(viewSubmissionId);
                    if (mounted) setInitialCode(codeData.code);
                } else {
                    // Load latest submission/draft code
                    const latest = await studentAssessmentsApi.getMyLatestSubmission(assignmentId);
                    if (mounted && latest) {
                        // Try to get the code
                        try {
                            const codeData = await studentAssessmentsApi.getSubmissionCode(latest.id);
                            if (mounted) setInitialCode(codeData.code);
                        } catch {
                            // Code not available, start fresh
                        }
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
    }, [assignmentId, viewSubmissionId]);

    // Clear topbar title when leaving this page
    React.useEffect(() => () => { setPageTitle(null); }, []);

    const handleSubmit = async (code: string, languageId: number) => {
        if (!assignment) return;
        try {
            setIsSubmitting(true);
            setError(null);
            const submission = await studentAssessmentsApi.submit({
                assignment_id: assignment.id,
                language: LANGUAGE_ID_TO_NAME[languageId] ?? "python",
                language_id: languageId,
                code,
            });
            setSubmittedVersion(submission.version);
            // Trigger grade polling for this new submission
            setGradedSubmissionId(submission.id);
            toast.success(`Submitted successfully! Version ${submission.version}`);
        } catch (err) {
            const msg = handleApiError(err);
            setError(msg);
            toast.error(msg);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="fixed inset-0 z-50 bg-background flex flex-col gap-4 p-6">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="flex-1 rounded-xl" />
            </div>
        );
    }

    if (!assignment) {
        return (
            <div className="fixed inset-0 z-50 bg-background flex flex-col gap-4 p-8">
                <Button variant="ghost" className="w-fit pl-0" onClick={() => router.back()}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <div className="p-4 rounded-xl border border-error-border bg-error-muted text-error-muted-foreground text-sm">
                    Assignment not found
                </div>
            </div>
        );
    }

    const isReadOnly = !!viewSubmissionId;
    const isOverdue = assignment.due_at ? isPast(new Date(assignment.due_at)) : false;
	// Use the language_id stored on the assignment (set by the instructor).
	// Fall back to 71 (Python) only if missing (e.g. old assignments without the field).
	const languageId = assignment.language_id || getLanguageId(assignment.code);

    return (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
            {/* Top bar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60 bg-background shrink-0">
                <div className="flex items-center gap-3">
                    <Button
                        variant="ghost"
                        size="sm"
                        asChild
                        className="text-muted-foreground"
                    >
                        <Link href={`/student/courses/${instanceId}/assignments/${assignmentId}`}>
                            <ArrowLeft className="h-4 w-4 mr-1.5" />
                            Back
                        </Link>
                    </Button>
                    <div className="w-px h-5 bg-border" />
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate max-w-xs">
                            {assignment.title}
                        </span>
                        <Badge variant="outline" className="text-xs font-mono shrink-0">
                            {assignment.code.toUpperCase()}
                        </Badge>
                        {isReadOnly && (
                            <Badge variant="secondary" className="text-xs shrink-0">
                                Read-only
                            </Badge>
                        )}
                        {isOverdue && !assignment.allow_late_submissions && (
                            <Badge variant="destructive" className="text-xs shrink-0">
                                Closed
                            </Badge>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {assignment.due_at && (
                        <span className="text-xs text-muted-foreground hidden sm:block">
                            Due {format(new Date(assignment.due_at), "MMM d, h:mm a")}
                        </span>
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowBrief(!showBrief)}
                        className="text-xs"
                    >
                        {showBrief ? <X className="h-3.5 w-3.5 mr-1.5" /> : <FileText className="h-3.5 w-3.5 mr-1.5" />}
                        {showBrief ? "Hide brief" : "Show brief"}
                    </Button>
                </div>
            </div>

            {/* Submission success banner */}
            {submittedVersion !== null && (
                <div className="flex items-center gap-3 px-4 py-3 bg-success-muted border-b border-success-border text-success-muted-foreground shrink-0">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <p className="text-sm font-medium">
                        Submitted as version {submittedVersion}.{" "}
                        <Link
                            href={`/student/courses/${instanceId}/assignments/${assignmentId}`}
                            className="underline"
                        >
                            View submission history
                        </Link>
                    </p>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="ml-auto h-6 w-6 hover:bg-success/20"
                        onClick={() => setSubmittedVersion(null)}
                    >
                        <X className="h-3.5 w-3.5" />
                    </Button>
                </div>
            )}

            {/* Error banner */}
            {error && (
                <div className="flex items-center gap-3 px-4 py-3 bg-error-muted border-b border-error-border text-error-muted-foreground shrink-0">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <p className="text-sm">{error}</p>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="ml-auto h-6 w-6"
                        onClick={() => setError(null)}
                    >
                        <X className="h-3.5 w-3.5" />
                    </Button>
                </div>
            )}

            {/* Main area: optional assignment brief + IDE */}
            <div className="flex flex-1 overflow-hidden">
                {/* Assignment Brief Panel */}
                {showBrief && (
                    <div className="w-80 shrink-0 border-r border-border/60 overflow-y-auto bg-sidebar-background">
                        <div className="p-4 flex flex-col gap-4">
                            <div>
                                <h2 className="font-bold text-sm text-foreground mb-2">
                                    Assignment Brief
                                </h2>
                                <pre className="whitespace-pre-wrap font-sans text-xs text-muted-foreground leading-relaxed">
                                    {assignment.description || "No description provided."}
                                </pre>
                            </div>

                            {assignment.due_at && (
                                <div className="rounded-lg border border-border/60 bg-background p-3">
                                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                                        Due Date
                                    </p>
                                    <p className={`text-sm font-semibold ${isOverdue ? "text-destructive" : ""}`}>
                                        {format(new Date(assignment.due_at), "MMM d, yyyy 'at' h:mm a")}
                                    </p>
                                </div>
                            )}

                            {assignment.allow_late_submissions && assignment.late_due_at && (
                                <div className="rounded-lg border border-warning-border bg-warning-muted p-3">
                                    <p className="text-[10px] uppercase tracking-wider text-warning-muted-foreground mb-1">
                                        Late Deadline
                                    </p>
                                    <p className="text-sm font-semibold text-warning-muted-foreground">
                                        {format(new Date(assignment.late_due_at), "MMM d, yyyy 'at' h:mm a")}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* IDE */}
                <div className="flex-1 overflow-hidden">
                    <CodeIDE
                        assignmentId={assignment.id}
                        assignmentTitle={assignment.title}
                        assignmentDescription={assignment.description}
                        userId={user?.id ?? "anonymous"}
                        initialCode={initialCode}
                        initialLanguage={languageId}
                        lockLanguage={true}
                        readOnly={isReadOnly}
                        showSubmitButton={!isReadOnly && (!isOverdue || assignment.allow_late_submissions)}
                        showAIAssistant={assignment.enable_ai_assistant}
                        showGradePanel={true}
                        grade={grade}
                        isGrading={isGrading}
                        onSubmit={handleSubmit}
                    />
                </div>
            </div>

            {/* Submitting overlay */}
            {isSubmitting && (
                <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-50">
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-sm font-medium">Submitting your solution…</p>
                    </div>
                </div>
            )}
        </div>
    );
}
