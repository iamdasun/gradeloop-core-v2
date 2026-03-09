import type { SubmissionGrade } from "@/types/assessments.types";

export interface CodeIDEProps {
  assignmentId?: string;
  assignmentTitle?: string;
  assignmentDescription?: string;
  userId?: string;
  initialCode?: string;
  initialLanguage?: number;
  onExecute?: (result: ExecutionResult) => void;
  onSubmit?: (code: string, languageId: number) => void;
  readOnly?: boolean;
  theme?: "light" | "dark";
  showSubmitButton?: boolean;
  showAIAssistant?: boolean;
  /** When true the language selector is disabled — language is fixed by the assignment. */
  lockLanguage?: boolean;
  /** The assignment's required language ID — used to guard run/submit against language mismatches. */
  expectedLanguageId?: number;
  /** When true a "Results" tab is shown in the right panel. */
  showGradePanel?: boolean;
  /** The grading result from ACAFS. Null while pending or unavailable. */
  grade?: SubmissionGrade | null;
  /** True while the autograder is running (shows a spinner in the Results tab). */
  isGrading?: boolean;
  /** True when the autograder polling has timed out with no result. */
  gradingFailed?: boolean;
  /** CIPAS analysis results to display alongside the grade. */
  submissionAnalysis?: {
    aiLikelihood: number;
    humanLikelihood: number;
    semanticSimilarityScore?: number | null;
  } | null;
  /** True while CIPAS analysis (AI detection + semantic similarity) is running in the background. */
  isAnalyzing?: boolean;
}

export interface ExecutionResult {
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  status: {
    id: number;
    description: string;
  };
  time: string | null;
  memory: number | null;
  exit_code: number | null;
  exit_signal: number | null;
}

export interface LanguageOption {
  id: number;
  name: string;
  is_archived: boolean;
  source_file?: string;
}

export interface PanelSizeState {
  editorWidth: number;
  executionWidth: number;
}

export interface EditorState {
  code: string;
  language: number;
  stdin: string;
  fontSize: number;
}

export type ExecutionStatus = 
  | "idle"
  | "running"
  | "accepted"
  | "wrong_answer"
  | "time_limit_exceeded"
  | "compilation_error"
  | "runtime_error"
  | "internal_error";

export interface StatusBarData {
  status: ExecutionStatus;
  time: string | null;
  memory: number | null;
}
