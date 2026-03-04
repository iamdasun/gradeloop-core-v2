"use client";

import { Badge } from "@/components/ui/badge";
import { Clock, Database, Loader2 } from "lucide-react";
import type { StatusBarData, ExecutionStatus } from "./types";
import { STATUS_CONFIG } from "./constants";
import { cn } from "@/lib/utils";

interface StatusBarProps {
  data: StatusBarData;
  isExecuting: boolean;
}

export function StatusBar({ data, isExecuting }: StatusBarProps) {
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
    <div className="flex items-center justify-between border-t bg-muted/20 px-4 py-1.5 text-xs">
      <div className="flex items-center gap-4">
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
