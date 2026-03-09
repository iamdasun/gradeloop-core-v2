"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CodeIDE } from "@/components/ide";
import { studentAssessmentsApi } from "@/lib/api/assessments";
import {
  detectAICode,
  getSemanticSimilarity,
  saveSubmissionAnalysis,
} from "@/lib/api/cipas-client";
import type { AIDetectionResponse } from "@/types/cipas";
import type { AssignmentResponse } from "@/types/assessments.types";
import { Loader2, AlertCircle, ArrowLeft, BrainCircuit } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
import { AILikelihoodBadge } from "@/components/clone-detector/AILikelihoodBadge";
import { SemanticSimilarityScore } from "@/components/ui/semantic-similarity-score";

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
  // Analysis results shown to the student inside the submit dialog
  const [aiResult, setAiResult] = useState<AIDetectionResponse | null>(null);
  const [semanticScore, setSemanticScore] = useState<number | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    const fetchAssignment = async () => {
      if (!assignmentId) {
        setError("No assignment ID provided");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const data = await studentAssessmentsApi.getAssignment(assignmentId);
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

  const handleSubmit = async (code: string, language: number) => {
    setPendingSubmission({ code, language });
    setAiResult(null);
    setSemanticScore(null);
    setIsAnalyzing(true);
    setShowSubmitDialog(true);

    // Run AI detection and semantic similarity in parallel — failures are
    // surfaced as null so they never block the submission flow.
    const [aiRes, semRes] = await Promise.allSettled([
      detectAICode(code),
      // Fetch the sample answer from its dedicated table endpoint, then compute
      // semantic similarity only when a sample answer is configured.
      studentAssessmentsApi
        .getAssignmentSampleAnswer(assignmentId)
        .then(sa => (sa?.code ? getSemanticSimilarity(code, sa.code) : null))
        .catch(() => null),
    ]);

    setAiResult(aiRes.status === "fulfilled" ? aiRes.value : null);
    setSemanticScore(semRes.status === "fulfilled" ? semRes.value : null);
    setIsAnalyzing(false);
  };

  const confirmSubmit = async () => {
    if (!pendingSubmission || !assignmentId) return;

    try {
      setIsSubmitting(true);

      const response = await studentAssessmentsApi.submit({
        assignment_id: assignmentId,
        language: LANGUAGE_ID_TO_NAME[pendingSubmission.language] ?? "python",
        language_id: pendingSubmission.language,
        code: pendingSubmission.code,
      });

      // Persist the analysis so the instructor can view it
      if (response?.id) {
        saveSubmissionAnalysis(response.id, {
          ai_likelihood: aiResult?.ai_likelihood ?? 0,
          human_likelihood: aiResult?.human_likelihood ?? 1,
          is_ai_generated: aiResult?.is_ai_generated ?? false,
          ai_confidence: aiResult?.confidence ?? 0,
          semantic_similarity_score: semanticScore,
        }).catch(console.error);
      }

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
            initialLanguage={assignment.language_id}
            lockLanguage={true}
          />
        </div>
      </div>

      {/* Submit Confirmation Dialog */}
      <Dialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Submit Solution?</DialogTitle>
            <DialogDescription>
              Are you sure you want to submit this solution for grading? This
              will create a new submission version.
            </DialogDescription>
          </DialogHeader>

          {/* ── Analysis panel ─────────────────────────────────────────── */}
          {isAnalyzing ? (
            <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 p-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground shrink-0" />
              <div>
                <p className="text-sm font-medium">Analyzing your submission…</p>
                <p className="text-xs text-muted-foreground">
                  Checking for AI generation and similarity to the sample answer.
                </p>
              </div>
            </div>
          ) : (aiResult || semanticScore !== null) ? (
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-2">
                <BrainCircuit className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Submission Analysis
                </p>
              </div>

              {aiResult && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">AI Generation Likelihood</p>
                  <AILikelihoodBadge
                    aiLikelihood={aiResult.ai_likelihood}
                    humanLikelihood={aiResult.human_likelihood}
                    showLabel
                    size="md"
                  />
                </div>
              )}

              {semanticScore !== null && (
                <>
                  {aiResult && <Separator />}
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">
                      Similarity to sample answer
                    </p>
                    <SemanticSimilarityScore score={semanticScore} />
                  </div>
                </>
              )}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSubmitDialog(false)}
              disabled={isSubmitting || isAnalyzing}
            >
              Cancel
            </Button>
            <Button onClick={confirmSubmit} disabled={isSubmitting || isAnalyzing}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting…
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
