"use client";

import { CodeIDE } from "@/components/ide";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Code2, Github } from "lucide-react";
import Link from "next/link";

export default function PublicIDEPage() {
  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-background px-6 py-3 shadow-sm">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Home
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Code2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">GradeLoop Code Editor</h1>
              <p className="text-sm text-muted-foreground">
                Online IDE with support for 20+ languages
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
            <kbd className="px-2 py-1 rounded bg-muted border text-xs font-mono">
              Cmd+Enter
            </kbd>
            <span>to run code</span>
          </div>
        </div>
      </div>

      {/* IDE Container */}
      <div className="flex-1 overflow-hidden">
        <CodeIDE
          showSubmitButton={false}
          showAIAssistant={true}
        />
      </div>

      {/* Footer */}
      <div className="border-t bg-muted/30 px-6 py-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div>
            Powered by <span className="font-semibold">Judge0</span> and{" "}
            <span className="font-semibold">Monaco Editor</span>
          </div>
          <div>
            No account required • Free to use
          </div>
        </div>
      </div>
    </div>
  );
}
