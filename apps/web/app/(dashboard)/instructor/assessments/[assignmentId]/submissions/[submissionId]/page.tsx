"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { instructorAssessmentsApi, assessmentsApi } from "@/lib/api/assessments";
import type { SubmissionResponse, SubmissionCodeResponse, AssignmentResponse } from "@/types/assessments.types";
import { handleApiError } from "@/lib/api/axios";
import { Loader2, ArrowLeft, Terminal, FileCode2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function InstructorSubmissionViewerPage() {
    const params = useParams();
    const router = useRouter();
    const assignmentId = params.assignmentId as string;
    const submissionId = params.submissionId as string;

    const [assignment, setAssignment] = React.useState<AssignmentResponse | null>(null);
    const [submissionMeta, setSubmissionMeta] = React.useState<SubmissionResponse | null>(null);
    const [submissionCode, setSubmissionCode] = React.useState<SubmissionCodeResponse | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        let mounted = true;

        async function fetchData() {
            try {
                setIsLoading(true);

                // 1. Fetch assignment details (from the compiled list due to permissions)
                const myAssignments = await instructorAssessmentsApi.listMyAssignments();
                const foundAssignment = myAssignments.find(a => a.id === assignmentId);

                if (!foundAssignment) {
                    throw new Error("Assignment not found or permission denied.");
                }

                if (mounted) setAssignment(foundAssignment);

                // 2. Fetch submission metadata (from list due to generic instructor endpoints)
                const allSubs = await instructorAssessmentsApi.listSubmissions(assignmentId);
                const foundSub = allSubs.find(s => s.id === submissionId);

                if (!foundSub) {
                    throw new Error("Submission not found in this assignment.");
                }

                if (mounted) setSubmissionMeta(foundSub);

                // 3. Fetch submission code code directly 
                if (foundSub.status !== 'Queued') {
                    const codeData = await assessmentsApi.getSubmissionCode(submissionId);
                    if (mounted) setSubmissionCode(codeData);
                }

            } catch (err) {
                if (mounted) setError(handleApiError(err));
            } finally {
                if (mounted) setIsLoading(false);
            }
        }

        if (assignmentId && submissionId) {
            fetchData();
        }

        return () => { mounted = false; };
    }, [assignmentId, submissionId]);

    if (isLoading) {
        return (
            <div className="flex justify-center p-20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (error || !assignment || !submissionMeta) {
        return (
            <div className="flex flex-col gap-4 p-8">
                <Button variant="ghost" className="w-fit mb-4" onClick={() => router.back()}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm">
                    {error || "Submission viewer could not load."}
                </div>
            </div>
        );
    }

    const submitterId = submissionMeta.user_id || submissionMeta.group_id;
    const submitterType = submissionMeta.user_id ? "User" : "Group";

    return (
        <div className="flex flex-col gap-6 pb-8 h-full">
            {/* Header */}
            <div>
                <Button variant="ghost" className="mb-4 pl-0 text-muted-foreground hover:bg-transparent hover:text-foreground" onClick={() => router.push(`/instructor/assessments/${assignmentId}`)}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Assignment
                </Button>
                <div className="flex items-center justify-between border-b border-border/40 pb-4">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="text-secondary-foreground font-mono">
                                v{submissionMeta.version}
                            </Badge>
                            <Badge variant={submissionMeta.status === 'Evaluating' ? 'default' : 'secondary'}>
                                {submissionMeta.status}
                            </Badge>
                            {submissionMeta.is_latest && (
                                <Badge className="bg-green-100 text-green-800 border-none hover:bg-green-100">Latest</Badge>
                            )}
                        </div>
                        <h1 className="text-2xl font-black tracking-tight">{assignment.title}</h1>
                        <p className="text-sm text-muted-foreground font-mono mt-1">
                            {submitterType}: {submitterId}
                        </p>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-right">
                        <div className="flex flex-col">
                            <span className="text-muted-foreground font-semibold">Language</span>
                            <span className="capitalize flex items-center justify-end"><Terminal className="h-3 w-3 mr-1" /> {submissionMeta.language}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Code Viewer */}
            <Card className="flex-1 min-h-[500px] flex flex-col border-border/60 bg-[#1e1e1e] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 bg-[#2d2d2d] border-b border-[#404040]">
                    <div className="flex items-center gap-2 text-[#cccccc] text-xs font-mono">
                        <FileCode2 className="h-4 w-4" />
                        <span>source_code.{submissionMeta.language === 'python' ? 'py' : submissionMeta.language === 'javascript' ? 'js' : submissionMeta.language === 'go' ? 'go' : 'txt'}</span>
                    </div>
                </div>
                <CardContent className="p-0 flex-1 relative group overflow-auto">
                    {submissionCode ? (
                        <pre className="p-4 text-sm font-mono text-[#d4d4d4] w-full min-h-full">
                            <code>{submissionCode.code || "/* No code submitted or file is empty */"}</code>
                        </pre>
                    ) : submissionMeta.status === 'Queued' ? (
                        <div className="flex flex-col items-center justify-center p-20 text-center text-[#cccccc] h-full space-y-4">
                            <Loader2 className="h-8 w-8 animate-spin" />
                            <p>Code is being processed...</p>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center p-20 text-center text-[#cccccc] h-full">
                            <FileCode2 className="h-12 w-12 text-[#404040] mb-4" />
                            <p className="font-semibold">Code not available (Status: {submissionMeta.status})</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
