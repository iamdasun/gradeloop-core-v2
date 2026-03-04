"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import type { ExecutionResult } from "./types";

interface ExecutionPanelProps {
  stdin: string;
  onStdinChange: (value: string) => void;
  result: ExecutionResult | null;
  isExecuting: boolean;
}

export function ExecutionPanel({
  stdin,
  onStdinChange,
  result,
  isExecuting,
}: ExecutionPanelProps) {
  const [copiedOutput, setCopiedOutput] = useState(false);

  const handleCopyOutput = async () => {
    const outputText = result?.stdout || result?.stderr || result?.compile_output || "";
    if (outputText) {
      await navigator.clipboard.writeText(outputText);
      setCopiedOutput(true);
      setTimeout(() => setCopiedOutput(false), 2000);
    }
  };

  const hasOutput = result?.stdout !== null && result?.stdout !== "";
  const hasErrors = Boolean(result?.stderr || result?.compile_output);

  return (
    <div className="flex h-full flex-col">
      {/* Input Section */}
      <div className="flex h-1/2 flex-col border-b">
        <div className="border-b bg-muted/30 px-4 py-2.5">
          <h3 className="text-xs font-semibold text-muted-foreground">Input</h3>
        </div>
        <div className="flex-1 overflow-hidden">
          <Textarea
            value={stdin}
            onChange={(e) => onStdinChange(e.target.value)}
            placeholder=""
            className="h-full w-full resize-none border-0 bg-transparent p-4 font-mono text-sm focus-visible:ring-0"
            disabled={isExecuting}
          />
        </div>
      </div>

      {/* Output Section */}
      <div className="flex h-1/2 flex-col">
        <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5">
          <h3 className="text-xs font-semibold text-muted-foreground">Output</h3>
          {(hasOutput || hasErrors) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyOutput}
              className="h-7 px-2 text-xs"
            >
              {copiedOutput ? (
                <>
                  <Check className="mr-1.5 h-3 w-3" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="mr-1.5 h-3 w-3" />
                  Copy
                </>
              )}
            </Button>
          )}
        </div>
        <div className="flex-1 overflow-auto p-4">
          {isExecuting ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted-foreground animate-pulse">
                Compiling and executing...
              </p>
            </div>
          ) : result ? (
            <div className="space-y-3">
              {/* Show stdout if available */}
              {result.stdout !== null && (
                <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
                  {result.stdout || ""}
                </pre>
              )}
              
              {/* Show errors if any */}
              {hasErrors && (
                <div className="space-y-2">
                  {result.compile_output && (
                    <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3">
                      <p className="mb-1.5 text-xs font-semibold text-destructive">
                        Compilation Error
                      </p>
                      <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-destructive/90">
                        {result.compile_output}
                      </pre>
                    </div>
                  )}
                  {result.stderr && !result.compile_output && (
                    <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3">
                      <p className="mb-1.5 text-xs font-semibold text-destructive">
                        Runtime Error
                      </p>
                      <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-destructive/90">
                        {result.stderr}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {/* Empty state */}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
