"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CodeIDE } from "@/components/ide";
import { assessmentsApi } from "@/lib/api/assessments";
import type { AssignmentResponse } from "@/types/assessments.types";
import { Loader2, AlertCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

export default function StudentIDEPage() {
  const params = useParams();
  const router = useRouter();
  const assignmentId = params.assignmentId as string;

  const [assignment, setAssignment] = useState<AssignmentResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingSubmission, setPendingSubmission] = useState<{
    code: string;
    language: number;
  } | null>(null);

  useEffect(() => {
    const fetchAssignment = async () => {
      if (!assignmentId) {
        setError("No assignment ID provided");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const data = await assessmentsApi.getAssignment(assignmentId);
        setAssignment(data);
      } catch (err) {
        console.error("Failed to fetch assignment:", err);
        setError("Failed to load assignment. Please try again.");
        toast.error("Failed to load assignment");
      } finally {
        setIsLoading(false);
      }
    };

    fetchAssignment();
  }, [assignmentId]);

  const handleSubmit = (code: string, language: number) => {
    setPendingSubmission({ code, language });
    setShowSubmitDialog(true);
  };

  const confirmSubmit = async () => {
    if (!pendingSubmission || !assignmentId) return;

    try {
      setIsSubmitting(true);
      
      await assessmentsApi.submitAssignment({
        assignment_id: assignmentId,
        language: LANGUAGE_ID_TO_NAME[pendingSubmission.language] ?? "python",
        language_id: pendingSubmission.language,
        code: pendingSubmission.code,
      });

      toast.success("Solution submitted successfully!");
      setShowSubmitDialog(false);
      
      // Redirect to submissions page or assignment details
      setTimeout(() => {
        router.push(`/student/assignments/${assignmentId}`);
      }, 1500);
    } catch (err) {
      console.error("Failed to submit:", err);
      toast.error("Failed to submit solution. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    router.back();
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-lg text-muted-foreground">Loading IDE...</p>
        </div>
      </div>
    );
  }

  if (error || !assignment) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-center">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <h2 className="text-2xl font-bold">Failed to Load IDE</h2>
          <p className="text-muted-foreground max-w-md">
            {error || "Assignment not found"}
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
    <>
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
              <h1 className="text-lg font-semibold">{assignment.title}</h1>
              <p className="text-sm text-muted-foreground">
                Assignment Code: {assignment.code}
              </p>
            </div>
          </div>
          {assignment.due_at && (
            <div className="text-sm text-muted-foreground">
              Due: {new Date(assignment.due_at).toLocaleDateString()}
            </div>
          )}
        </div>

        {/* IDE Container */}
        <div className="flex-1 overflow-hidden">
          <CodeIDE
            assignmentId={assignmentId}
            showSubmitButton={true}
            onSubmit={handleSubmit}
          />
        </div>
      </div>

      {/* Submit Confirmation Dialog */}
      <Dialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Solution?</DialogTitle>
            <DialogDescription>
              Are you sure you want to submit this solution for grading? This
              will create a new submission version.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSubmitDialog(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={confirmSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
