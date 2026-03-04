export interface CodeIDEProps {
  assignmentId?: string;
  initialCode?: string;
  initialLanguage?: number;
  onExecute?: (result: ExecutionResult) => void;
  onSubmit?: (code: string, languageId: number) => void;
  readOnly?: boolean;
  theme?: "light" | "dark";
  showSubmitButton?: boolean;
  showAIAssistant?: boolean;
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
