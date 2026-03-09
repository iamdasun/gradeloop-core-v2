"use client";

import { useState, useEffect, use } from "react";
import { useAuthStore } from "@/lib/stores/authStore";
import { acafsApi, instructorAssessmentsApi } from "@/lib/api/assessments";
import type { SubmissionGrade, SubmissionResponse } from "@/types/assessments.types";
import { GradeResultPanel } from "@/components/assessments/grade-result-panel";
import { InstructorGradeOverridePanel } from "@/components/instructor/instructor-grade-override-panel";
import { SemanticSimilarityScore, SemanticSimilarityBar } from "@/components/ui/semantic-similarity-score";
import { AILikelihoodBadge } from "@/components/clone-detector/AILikelihoodBadge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, BrainCircuit, RefreshCw } from "lucide-react";
import Link from "next/link";

interface PageProps {
    params: Promise<{ assignmentId: string; submissionId: string }>;
}

export default function SubmissionReviewPage({ params }: PageProps) {
    const { assignmentId, submissionId } = use(params);
    const user = useAuthStore((s) => s.user);

    const [submission, setSubmission] = useState<SubmissionResponse | null>(null);
    const [grade, setGrade] = useState<SubmissionGrade | null>(null);
    const [loadingGrade, setLoadingGrade] = useState(true);
    const [pollCount, setPollCount] = useState(0);
    const [gradeError, setGradeError] = useState<string | null>(null);

    // Fetch full submission metadata (includes CIPAS analysis fields)
    useEffect(() => {
        instructorAssessmentsApi
            .getSubmission(submissionId)
            .then((sub) => setSubmission(sub))
            .catch(() => {
                // Fallback: search through the list
                instructorAssessmentsApi
                    .listSubmissions(assignmentId)
                    .then((resp: SubmissionResponse[]) => {
                        const found = resp.find((s: SubmissionResponse) => s.id === submissionId);
                        if (found) setSubmission(found);
                    })
                    .catch(() => {/* non-critical */});
            });
    }, [assignmentId, submissionId]);

    // Poll for grade with exponential back-off
    useEffect(() => {
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout>;

        const delay = Math.min(2000 * Math.pow(1.5, pollCount), 30000);

        const fetch = async () => {
            try {
                const g = await acafsApi.getSubmissionGrade(submissionId);
                if (!cancelled) {
                    setGrade(g);
                    setLoadingGrade(false);
                }
            } catch (err) {
                if (err instanceof Error && err.message === "GRADING_PENDING") {
                    if (!cancelled) {
                        timer = setTimeout(() => setPollCount((n) => n + 1), delay);
                    }
                } else {
                    if (!cancelled) {
                        setGradeError("Could not load grade results.");
                        setLoadingGrade(false);
                    }
                }
            }
        };

        fetch();
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [submissionId, pollCount]);

    return (
        <div className="flex flex-col gap-6 max-w-3xl mx-auto py-6 px-4">
            {/* ── Back link ───────────────────────────────────────────────── */}
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" asChild>
                    <Link href={`/instructor/assessments`}>
                        <ArrowLeft className="h-4 w-4 mr-1" />
                        Back to assignments
                    </Link>
                </Button>
            </div>

            {/* ── Page title ──────────────────────────────────────────────── */}
            <div>
                <h1 className="text-xl font-bold font-heading">Submission Review</h1>
                {submission && (
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Submitted by <span className="font-medium">{submission.user_id}</span>
                        {" · "}
                        {new Date(submission.submitted_at).toLocaleString()}
                    </p>
                )}
            </div>

            {/* ── Grade result ────────────────────────────────────────────── */}
            <div className="rounded-2xl border border-border overflow-hidden bg-card">
                <div className="px-4 pt-4 pb-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                        AI Grading Result
                    </p>
                </div>
                {loadingGrade ? (
                    <div className="p-4 flex flex-col gap-3">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            Waiting for grading to complete…
                        </div>
                        <Skeleton className="h-20 rounded-xl" />
                        <Skeleton className="h-16 rounded-lg" />
                        <Skeleton className="h-16 rounded-lg" />
                    </div>
                ) : gradeError ? (
                    <div className="p-4 text-sm text-destructive">{gradeError}</div>
                ) : (
                    <GradeResultPanel
                        grade={grade}
                        instructorView
                        compact={false}
                    />
                )}
            </div>

            {/* ── Instructor override panel ───────────────────────────────── */}
            {grade && (
                <InstructorGradeOverridePanel
                    grade={grade}
                    submissionId={submissionId}
                    instructorName={user?.full_name ?? user?.email ?? "Instructor"}
                    onSaved={(updated) => setGrade(updated)}
                />
            )}

            {/* ── CIPAS Analysis ──────────────────────────────────────────── */}
            {submission?.ai_likelihood !== undefined && (
                <Card className="border-border/60">
                    <CardContent className="p-5 flex flex-col gap-4">
                        <div className="flex items-center gap-2">
                            <BrainCircuit className="h-4 w-4 text-muted-foreground" />
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                CIPAS Analysis
                            </p>
                        </div>

                        <div>
                            <p className="text-xs text-muted-foreground mb-2">AI Generation Likelihood</p>
                            <AILikelihoodBadge
                                aiLikelihood={submission.ai_likelihood}
                                humanLikelihood={submission.human_likelihood ?? (1 - submission.ai_likelihood)}
                                showLabel
                                size="md"
                            />
                        </div>

                        {submission.semantic_similarity_score !== undefined && submission.semantic_similarity_score !== null && (
                            <>
                                <Separator />
                                <div className="flex flex-col gap-2">
                                    <p className="text-xs text-muted-foreground">Similarity to sample answer</p>
                                    <SemanticSimilarityBar
                                        score={submission.semantic_similarity_score}
                                        height="md"
                                        showLabel
                                    />
                                    <SemanticSimilarityScore
                                        score={submission.semantic_similarity_score}
                                        size="sm"
                                        compact={false}
                                    />
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
