"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { instructorAssessmentsApi } from "@/lib/api/assessments";
import type { AssignmentResponse, SubmissionResponse } from "@/types/assessments.types";
import { handleApiError } from "@/lib/api/axios";
import { Loader2, ArrowLeft, Terminal, Calendar, Users, Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import Link from "next/link";

export default function InstructorAssignmentDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const assignmentId = params.assignmentId as string;

    const [assignment, setAssignment] = React.useState<AssignmentResponse | null>(null);
    const [submissions, setSubmissions] = React.useState<SubmissionResponse[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        let mounted = true;

        async function fetchData() {
            try {
                setIsLoading(true);
                // The instructor doesn't have permissions to GET /assignments/:id directly.
                // We must fetch from the scoped list and filter.
                const myAssignments = await instructorAssessmentsApi.listMyAssignments();
                const found = myAssignments.find(a => a.id === assignmentId);

                if (!found) {
                    if (mounted) setError("Assignment not found or you do not have permission to view it.");
                    return;
                }

                if (mounted) setAssignment(found);

                // Fetch submissions for this assignment
                try {
                    const subs = await instructorAssessmentsApi.listSubmissions(assignmentId);
                    if (mounted) setSubmissions(subs);
                } catch (subErr) {
                    // Log but don't fail the whole page if submissions can't be loaded
                    console.error('Failed to load submissions:', subErr);
                    if (mounted) setSubmissions([]);
                }

            } catch (err) {
                if (mounted) setError(handleApiError(err));
            } finally {
                if (mounted) setIsLoading(false);
            }
        }

        if (assignmentId) {
            fetchData();
        }

        return () => { mounted = false; };
    }, [assignmentId]);

    if (isLoading) {
        return (
            <div className="flex justify-center p-20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (error || !assignment) {
        return (
            <div className="flex flex-col gap-4 p-8">
                <Button variant="ghost" className="w-fit mb-4" onClick={() => router.back()}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm">
                    {error || "Assignment not found"}
                </div>
            </div>
        );
    }

    // Identify latest submissions per student/group for clean display
    const latestSubmissionsMap = new Map<string, SubmissionResponse>();
    submissions.forEach(sub => {
        const key = sub.group_id || sub.user_id || sub.id; // Unique identifier for the submitter
        if (!latestSubmissionsMap.has(key) || sub.version > latestSubmissionsMap.get(key)!.version) {
            latestSubmissionsMap.set(key, sub);
        }
    });
    const latestSubmissions = Array.from(latestSubmissionsMap.values()).sort((a, b) =>
        new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
    );

    return (
        <div className="flex flex-col gap-8 pb-8">
            {/* Header */}
            <div>
                <Button variant="ghost" className="mb-4 pl-0 text-muted-foreground hover:bg-transparent hover:text-foreground" onClick={() => router.push('/instructor/assessments')}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Assessments
                </Button>
                <div className="flex flex-col gap-4 border-b border-border/40 pb-6">
                    <div className="flex items-center gap-2 mb-2">
                        {assignment.is_active ? (
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-green-200">Active</Badge>
                        ) : (
                            <Badge variant="secondary">Draft</Badge>
                        )}
                        <Badge variant="outline" className="text-secondary-foreground">
                            {assignment.code.toUpperCase()}
                        </Badge>
                    </div>
                    <h1 className="text-3xl font-black tracking-tight">{assignment.title}</h1>
                    <p className="text-sm text-muted-foreground">
                        {assignment.description || "No description provided."}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 flex flex-col gap-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold">Submissions</h2>
                        <Badge variant="secondary">{submissions.length} Total Submissions</Badge>
                    </div>

                    {latestSubmissions.length === 0 ? (
                        <Card className="border-dashed border-border/60 bg-background">
                            <CardContent className="flex flex-col items-center justify-center py-20 gap-4 text-center">
                                <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
                                    <Clock className="h-8 w-8 text-muted-foreground/50" />
                                </div>
                                <div>
                                    <p className="font-bold text-lg">No submissions yet</p>
                                    <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                                        Students have not submitted any work for this assignment.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="border rounded-xl bg-card overflow-hidden">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
                                    <tr>
                                        <th className="px-6 py-4 font-semibold">Submitter</th>
                                        <th className="px-6 py-4 font-semibold hidden md:table-cell">Version / Status</th>
                                        <th className="px-6 py-4 font-semibold text-right">Submitted At</th>
                                        <th className="px-6 py-4 font-semibold text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {latestSubmissions.map((sub) => (
                                        <tr key={sub.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center">
                                                    <div>
                                                        <div className="font-medium truncate max-w-[150px]" title={sub.user_id || sub.group_id}>
                                                            {sub.user_id ? 'User' : 'Group'}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground font-mono truncate max-w-[150px]">
                                                            {sub.user_id || sub.group_id}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 hidden md:table-cell">
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="outline" className="font-mono text-[10px]">
                                                        v{sub.version}
                                                    </Badge>
                                                    <Badge variant={sub.status === 'Evaluating' ? 'default' : 'secondary'} className="text-[10px]">
                                                        {sub.status}
                                                    </Badge>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right text-muted-foreground">
                                                {format(new Date(sub.submitted_at), 'MMM d, yyyy HH:mm')}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <Button variant="outline" size="sm" asChild>
                                                    <Link href={`/instructor/assessments/${assignmentId}/submissions/${sub.id}`}>
                                                        View Code
                                                    </Link>
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Sidebar Configuration */}
                <div className="flex flex-col gap-4">
                    <Card>
                        <CardHeader className="pb-3 border-b border-border/40">
                            <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground font-bold">Configuration</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 flex flex-col gap-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-md bg-muted text-muted-foreground">
                                    <Terminal className="h-4 w-4" />
                                </div>
                                <div className="text-sm">
                                    <p className="font-semibold text-foreground">Language</p>
                                    <p className="text-muted-foreground capitalize">{assignment.code || "unknown"}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-md bg-muted text-muted-foreground">
                                    <Calendar className="h-4 w-4" />
                                </div>
                                <div className="text-sm">
                                    <p className="font-semibold text-foreground">Due Date</p>
                                    <p className="text-muted-foreground">
                                        {assignment.due_at ? format(new Date(assignment.due_at), 'PP p') : "No due date"}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-md bg-muted text-muted-foreground">
                                    <Users className="h-4 w-4" />
                                </div>
                                <div className="text-sm">
                                    <p className="font-semibold text-foreground">Group Work</p>
                                    <p className="text-muted-foreground">
                                        {assignment.allow_group_submission ? `Allowed (Max ${assignment.max_group_size})` : "Individual only"}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-md bg-muted text-muted-foreground">
                                    <AlertCircle className="h-4 w-4" />
                                </div>
                                <div className="text-sm">
                                    <p className="font-semibold text-foreground">Late Submissions</p>
                                    <p className="text-muted-foreground">
                                        {assignment.allow_late_submissions ? "Allowed" : "Not allowed"}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
