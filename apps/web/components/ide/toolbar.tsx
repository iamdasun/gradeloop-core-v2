"use client";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Play,
  Loader2,
  Save,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Send,
} from "lucide-react";
import { MIN_FONT_SIZE, MAX_FONT_SIZE, DEFAULT_FONT_SIZE } from "./constants";
import { cn } from "@/lib/utils";

interface ToolbarProps {
  onRun: () => void;
  onSubmit?: () => void;
  onSave?: () => void;
  isExecuting: boolean;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  showSubmitButton?: boolean;
  disabled?: boolean;
}

export function Toolbar({
  onRun,
  onSubmit,
  onSave,
  isExecuting,
  fontSize,
  onFontSizeChange,
  showSubmitButton = false,
  disabled = false,
}: ToolbarProps) {
  const handleFontSizeIncrease = () => {
    if (fontSize < MAX_FONT_SIZE) {
      onFontSizeChange(fontSize + 2);
    }
  };

  const handleFontSizeDecrease = () => {
    if (fontSize > MIN_FONT_SIZE) {
      onFontSizeChange(fontSize - 2);
    }
  };

  const handleFontSizeReset = () => {
    onFontSizeChange(DEFAULT_FONT_SIZE);
  };

  return (
    <div className="flex items-center justify-between border-b bg-background px-4 py-2">
      {/* Left: Save + Font controls */}
      <div className="flex items-center gap-2">
        {onSave && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={onSave}
                  disabled={disabled}
                  variant="outline"
                  size="icon"
                >
                  <Save className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Save draft (Cmd/Ctrl + S)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-1">Font:</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleFontSizeDecrease}
                  disabled={fontSize <= MIN_FONT_SIZE}
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                >
                  <ZoomOut className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Decrease font size (Cmd/Ctrl + -)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <span className="min-w-[2.5rem] text-center text-xs font-mono">
            {fontSize}px
          </span>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleFontSizeIncrease}
                  disabled={fontSize >= MAX_FONT_SIZE}
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                >
                  <ZoomIn className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Increase font size (Cmd/Ctrl + +)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleFontSizeReset}
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Reset font size (Cmd/Ctrl + 0)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Right: Run + Submit (icon-only) */}
      <div className="flex items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={onRun}
                disabled={disabled || isExecuting}
                size="icon"
              >
                {isExecuting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{isExecuting ? "Running…" : "Run Code (Cmd/Ctrl + Enter)"}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {showSubmitButton && onSubmit && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={onSubmit}
                  disabled={disabled || isExecuting}
                  size="icon"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Submit Solution</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}
