"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { CodeIDE } from "@/components/ide";
import { assessmentsApi } from "@/lib/api/assessments";
import type { SubmissionCodeResponse } from "@/types/assessments.types";
import { Loader2, AlertCircle, ArrowLeft, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function InstructorIDEPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const submissionId = params.submissionId as string;

  const [submission, setSubmission] = useState<SubmissionCodeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSubmission = async () => {
      if (!submissionId) {
        setError("No submission ID provided");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const data = await assessmentsApi.getSubmissionCode(submissionId);
        setSubmission(data);
      } catch (err) {
        console.error("Failed to fetch submission:", err);
        setError("Failed to load submission. Please try again.");
        toast.error("Failed to load submission");
      } finally {
        setIsLoading(false);
      }
    };

    fetchSubmission();
  }, [submissionId]);

  const handleBack = () => {
    router.back();
  };

  // Extract language ID from language string (e.g., "language_71" -> 71)
  const getLanguageId = (language: string): number => {
    const match = language.match(/language_(\d+)/);
    return match ? parseInt(match[1], 10) : 71; // Default to Python
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-lg text-muted-foreground">Loading submission...</p>
        </div>
      </div>
    );
  }

  if (error || !submission) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-center">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <h2 className="text-2xl font-bold">Failed to Load Submission</h2>
          <p className="text-muted-foreground max-w-md">
            {error || "Submission not found"}
          </p>
          <Button onClick={handleBack} variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-background px-6 py-3">
        <div className="flex items-center gap-4">
          <Button
            onClick={handleBack}
            variant="ghost"
            size="sm"
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <User className="h-5 w-5" />
              Student Submission
            </h1>
            <p className="text-sm text-muted-foreground">
              Submission ID: {submission.submission_id} • Version: {submission.version}
            </p>
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          Read-only view
        </div>
      </div>

      {/* IDE Container (Read-only) */}
      <div className="flex-1 overflow-hidden">
        <CodeIDE
          assignmentId={submission.assignment_id}
          initialCode={submission.code}
          initialLanguage={getLanguageId(submission.language)}
          readOnly={true}
          showSubmitButton={false}
        />
      </div>
    </div>
  );
}
