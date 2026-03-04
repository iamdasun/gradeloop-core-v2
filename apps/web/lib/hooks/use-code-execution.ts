"use client";

import { useState, useCallback } from "react";
import { assessmentsApi } from "@/lib/api/assessments";
import type { RunCodeRequest, RunCodeResponse } from "@/types/assessments.types";
import type { ExecutionResult } from "@/components/ide/types";
import { toast } from "sonner";

interface UseCodeExecutionOptions {
  assignmentId?: string;
  onSuccess?: (result: ExecutionResult) => void;
  onError?: (error: Error) => void;
}

interface UseCodeExecutionReturn {
  execute: (params: {
    sourceCode: string;
    languageId: number;
    stdin?: string;
  }) => Promise<void>;
  isExecuting: boolean;
  result: ExecutionResult | null;
  error: Error | null;
  reset: () => void;
}

export function useCodeExecution({
  assignmentId,
  onSuccess,
  onError,
}: UseCodeExecutionOptions = {}): UseCodeExecutionReturn {
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(
    async ({
      sourceCode,
      languageId,
      stdin = "",
    }: {
      sourceCode: string;
      languageId: number;
      stdin?: string;
    }) => {
      if (!sourceCode.trim()) {
        toast.error("Cannot run empty code");
        return;
      }

      try {
        setIsExecuting(true);
        setError(null);

        const request: RunCodeRequest = {
          assignment_id: assignmentId,
          language_id: languageId,
          source_code: sourceCode,
          stdin: stdin || undefined,
        };

        const response: RunCodeResponse = await assessmentsApi.runCode(request);

        const executionResult: ExecutionResult = {
          stdout: response.stdout,
          stderr: response.stderr,
          compile_output: response.compile_output,
          status: response.status,
          time: response.time,
          memory: response.memory,
          exit_code: response.exit_code,
          exit_signal: response.exit_signal,
        };

        setResult(executionResult);

        // Show success toast if execution completed
        if (response.status.id === 3) {
          toast.success("Code executed successfully");
        } else if (response.status.id === 6) {
          toast.error("Compilation failed");
        } else if (response.status.id >= 7 && response.status.id <= 12) {
          toast.error("Runtime error occurred");
        } else if (response.status.id === 5) {
          toast.error("Time limit exceeded");
        }

        onSuccess?.(executionResult);
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Failed to execute code");
        setError(error);
        
        console.error("Code execution error:", err);
        toast.error(error.message || "Failed to execute code");
        
        onError?.(error);
      } finally {
        setIsExecuting(false);
      }
    },
    [assignmentId, onSuccess, onError]
  );

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return {
    execute,
    isExecuting,
    result,
    error,
    reset,
  };
}
