"use client";

import { Badge } from "@/components/ui/badge";
import { Clock, Database, Loader2 } from "lucide-react";
import type { StatusBarData, ExecutionStatus } from "./types";
import { STATUS_CONFIG } from "./constants";
import { cn } from "@/lib/utils";
import { LanguageSelector } from "./language-selector";

interface StatusBarProps {
  data: StatusBarData;
  isExecuting: boolean;
  language: number;
  onLanguageChange: (languageId: number) => void;
  languageSelectorDisabled?: boolean;
}

export function StatusBar({
  data,
  isExecuting,
  language,
  onLanguageChange,
  languageSelectorDisabled = false,
}: StatusBarProps) {
  const statusConfig = STATUS_CONFIG[data.status];

  const formatTime = (time: string | null) => {
    if (!time) return "—";
    const seconds = parseFloat(time);
    if (seconds < 0.01) return "< 0.01s";
    return `${seconds.toFixed(3)}s`;
  };

  const formatMemory = (memory: number | null) => {
    if (!memory) return "—";
    if (memory < 1024) return `${memory} KB`;
    return `${(memory / 1024).toFixed(2)} MB`;
  };

  return (
    <div className="flex items-center justify-between border-t bg-muted/20 px-3 py-1.5 text-xs">
      <div className="flex items-center gap-3">
        {/* Language / compiler selector */}
        <LanguageSelector
          value={language}
          onChange={onLanguageChange}
          disabled={languageSelectorDisabled}
          compact
        />
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Status:</span>
          {isExecuting ? (
            <Badge variant="secondary" className="gap-1 text-xs">
              <Loader2 className="h-3 w-3 animate-spin" />
              Running
            </Badge>
          ) : (
            <Badge
              variant="secondary"
              className={cn(
                "gap-1 text-xs",
                statusConfig.bgColor,
                statusConfig.color
              )}
            >
              {statusConfig.label}
            </Badge>
          )}
        </div>

        {!isExecuting && data.time !== null && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>Time:</span>
            <span className="font-mono font-medium text-foreground">
              {formatTime(data.time)}
            </span>
          </div>
        )}

        {!isExecuting && data.memory !== null && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Database className="h-3 w-3" />
            <span>Memory:</span>
            <span className="font-mono font-medium text-foreground">
              {formatMemory(data.memory)}
            </span>
          </div>
        )}
      </div>

      <div className="text-muted-foreground">
        {isExecuting ? (
          <span className="animate-pulse">Executing code...</span>
        ) : (
          <span>Press Cmd/Ctrl + Enter to run</span>
        )}
      </div>
    </div>
  );
}
