"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { instructorAssessmentsApi } from "@/lib/api/assessments";
import type { AssignmentResponse } from "@/types/assessments.types";
import { handleApiError } from "@/lib/api/axios";
import {
    LayoutDashboard,
    CheckCircle2,
    Clock,
    Users,
    ArrowRight,
    AlertCircle,
    BookOpen,
    Settings2,
    Mic2,
} from "lucide-react";
import { StatsCard } from "@/components/instructor/stats-card";
import { SectionHeader } from "@/components/instructor/section-header";
import { StatusBadge } from "@/components/instructor/status-badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export default function InstructorAssignmentDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const assignmentId = params.assignmentId as string;
    const instanceId = params.instanceId as string;

    const [assignment, setAssignment] = React.useState<AssignmentResponse | null>(null);
    const [rubric, setRubric] = React.useState<{ criteria: { name: string; weight: number; description?: string }[] } | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        let mounted = true;

        async function fetchAssignment() {
            try {
                setIsLoading(true);
                const [all, rubricData] = await Promise.all([
                    instructorAssessmentsApi.listMyAssignments(),
                    instructorAssessmentsApi.getRubric(assignmentId),
                ]);
                const found = all.find((a) => a.id === assignmentId);

                if (mounted) {
                    if (found) setAssignment(found);
                    else setError("Assignment not found");
                    setRubric(rubricData);
                }
            } catch (err) {
                if (mounted) setError(handleApiError(err));
            } finally {
                if (mounted) setIsLoading(false);
            }
        }

        if (assignmentId) fetchAssignment();

        return () => {
            mounted = false;
        };
    }, [assignmentId]);

    if (error) {
        return (
            <div className="flex gap-3 p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
            </div>
        );
    }

    // Derive status
    let status = "Draft";
    if (assignment?.is_active) {
        status = assignment.due_at && new Date(assignment.due_at) < new Date() ? "Closed" : "Active";
    }

    const enabledTools = [];
    if (assignment?.enable_ai_assistant) enabledTools.push("ACAFS", "CIPAS");
    if (assignment?.allow_group_submission) enabledTools.push("Group Submission");

    return (
        <div className="flex flex-col gap-8 pb-8 h-full">
            <SectionHeader
                title="Assignment Overview"
                description={assignment?.title || "View metrics and key details for this assignment."}
                action={
                    isLoading ? (
                        <Skeleton className="h-6 w-16 rounded-full" />
                    ) : (
                        <StatusBadge status={status} variant="default" className="text-xs px-3 py-1" />
                    )
                }
            />

            {/* KPI Stats */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatsCard
                    title="Submissions"
                    icon={CheckCircle2}
                    value="—"
                    subtitle="Total received"
                    isLoading={isLoading}
                />
                <StatsCard
                    title="Graded"
                    icon={CheckCircle2}
                    value="—"
                    subtitle="Ready to publish"
                    isLoading={isLoading}
                />
                <StatsCard
                    title="Avg. Score"
                    icon={LayoutDashboard}
                    value="—"
                    subtitle="Out of 100"
                    isLoading={isLoading}
                />
                <StatsCard
                    title="Late"
                    icon={Clock}
                    value="—"
                    subtitle="After deadline"
                    isLoading={isLoading}
                    badge="0"
                    badgeVariant="destructive"
                />
            </div>

            {/* Info Cards Grid */}
            <div className="grid gap-6 md:grid-cols-2">
                {/* Key Details */}
                <Card className="border-border/60 bg-background">
                    <CardContent className="p-6">
                        <h3 className="font-bold font-heading text-lg mb-4">Key Details</h3>
                        {isLoading ? (
                            <div className="space-y-3">
                                {[1, 2, 3, 4].map((i) => (
                                    <Skeleton key={i} className="h-6 w-full rounded-md" />
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex justify-between items-center py-2 border-b border-border/40">
                                    <span className="text-muted-foreground text-sm">Type</span>
                                    <span className="font-semibold text-sm">
                                        {assignment?.assessment_type || "—"}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-border/40">
                                    <span className="text-muted-foreground text-sm">Total Marks</span>
                                    <span className="font-mono font-semibold text-sm">
                                        {assignment?.total_marks ?? "—"}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-border/40">
                                    <span className="text-muted-foreground text-sm">Deadline</span>
                                    <span className="font-semibold text-sm">
                                        {assignment?.due_at
                                            ? format(new Date(assignment.due_at), "MMM d, yyyy • h:mm a")
                                            : "No deadline"}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-border/40">
                                    <span className="text-muted-foreground text-sm">Time Limit</span>
                                    <span className="font-semibold text-sm">
                                        {assignment?.enforce_time_limit
                                            ? `${Math.round(assignment.enforce_time_limit / 60)} minutes`
                                            : "No limit"}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center py-2">
                                    <span className="text-muted-foreground text-sm">Submissions Allowed</span>
                                    <StatusBadge
                                        status={assignment?.submission_config?.submission_allowed ? "Allowed" : "Not Allowed"}
                                    />
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Rubric Summary */}
                <Card className="border-border/60 bg-background">
                    <CardContent className="p-6">
                        <h3 className="font-bold font-heading text-lg mb-4 flex items-center gap-2">
                            <BookOpen className="h-5 w-5 text-primary" />
                            Grading Rubric
                        </h3>
                        {isLoading ? (
                            <div className="space-y-2">
                                {[1, 2].map((i) => (
                                    <Skeleton key={i} className="h-12 w-full rounded-md" />
                                ))}
                            </div>
                        ) : !rubric || rubric.criteria.length === 0 ? (
                            <div className="text-sm text-muted-foreground text-center py-6">
                                No rubric configured yet.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {rubric.criteria.map((c, i) => (
                                    <div
                                        key={i}
                                        className="flex items-center justify-between py-2 border-b last:border-0 border-border/40"
                                    >
                                        <div>
                                            <p className="font-semibold text-sm">{c.name}</p>
                                            {c.description && (
                                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                                    {c.description}
                                                </p>
                                            )}
                                        </div>
                                        <Badge variant="outline" className="font-mono text-xs shrink-0 ml-4">
                                            {c.weight}%
                                        </Badge>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Tool Configuration */}
                <Card className="border-border/60 bg-primary/5 border-primary/20">
                    <CardContent className="p-6 flex flex-col items-center justify-center text-center h-full gap-4">
                        <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                            <Settings2 className="h-8 w-8 text-primary" />
                        </div>
                        <div>
                            <h3 className="font-bold font-heading text-xl">Tool Configuration</h3>
                            <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
                                AI tools and features enabled for this assignment.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2 justify-center">
                            {enabledTools.length === 0 ? (
                                <span className="text-sm text-muted-foreground">No special tools enabled.</span>
                            ) : (
                                enabledTools.map((t) => (
                                    <Badge
                                        key={t}
                                        className="bg-primary/10 text-primary border-primary/20 font-semibold text-xs"
                                    >
                                        {t}
                                    </Badge>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Call to Submissions */}
                <Card className="border-border/60 bg-primary/5 border-primary/20">
                    <CardContent className="p-6 flex flex-col items-center justify-center text-center h-full gap-4">
                        <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                            <Users className="h-8 w-8 text-primary" />
                        </div>
                        <div>
                            <h3 className="font-bold font-heading text-xl">Review Submissions</h3>
                            <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
                                Ready to start grading? View all submitted work, run plagiarism checks, and evaluate rubrics.
                            </p>
                        </div>
                        <Button className="mt-2 w-full max-w-[200px]" asChild>
                            <Link
                                href={`/instructor/courses/${instanceId}/assignments/${assignmentId}/submissions`}
                            >
                                Go to Submissions
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Link>
                        </Button>
                    </CardContent>
                </Card>

                {/* Viva Setup */}
                <Card className="border-border/60 bg-primary/5 border-primary/20">
                    <CardContent className="p-6 flex flex-col items-center justify-center text-center h-full gap-4">
                        <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                            <Mic2 className="h-8 w-8 text-primary" />
                        </div>
                        <div>
                            <h3 className="font-bold font-heading text-xl">Viva Setup</h3>
                            <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
                                Configure questions, grading criteria, and settings for the viva assessment.
                            </p>
                        </div>
                        <Button className="mt-2 w-full max-w-[200px]" asChild>
                            <Link href={`/instructor/assessments/setup/${assignmentId}`}>
                                Setup Viva
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
