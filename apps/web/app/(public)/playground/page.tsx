"use client";

import { CodeIDE } from "@/components/ide";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Code2 } from "lucide-react";
import { useRouter } from "next/navigation";

export default function PlaygroundPage() {
  const router = useRouter();

  const handleBack = () => {
    router.push("/");
  };

  return (
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
          <div className="flex items-center gap-2">
            <Code2 className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-lg font-semibold">Code Playground</h1>
              <p className="text-sm text-muted-foreground">
                Write and execute code in 20+ programming languages
              </p>
            </div>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
          <kbd className="px-2 py-1 rounded bg-muted border text-xs font-mono">
            Cmd+Enter
          </kbd>
          <span>to run</span>
        </div>
      </div>

      {/* IDE Container */}
      <div className="flex-1 overflow-hidden">
        <CodeIDE
          showSubmitButton={false}
          showAIAssistant={true}
        />
      </div>
    </div>
  );
}
