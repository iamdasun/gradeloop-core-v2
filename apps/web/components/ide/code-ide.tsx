"use client";

import { useState, useEffect, useCallback } from "react";
import { EditorPanel } from "./editor-panel";
import { LanguageSelector } from "./language-selector";
import { ExecutionPanel } from "./execution-panel";
import { StatusBar } from "./status-bar";
import { Toolbar } from "./toolbar";
import { AIAssistantPanel } from "./ai-assistant-panel";
import { useCodeExecution } from "@/lib/hooks/use-code-execution";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Terminal, Sparkles } from "lucide-react";
import type { CodeIDEProps, ExecutionStatus } from "./types";
import {
  DEFAULT_LANGUAGE_ID,
  DEFAULT_FONT_SIZE,
  STORAGE_KEYS,
  STATUS_MAP,
  STARTER_CODE,
} from "./constants";
import { useTheme } from "next-themes";

export function CodeIDE({
  assignmentId,
  initialCode,
  initialLanguage = DEFAULT_LANGUAGE_ID,
  onExecute,
  onSubmit,
  readOnly = false,
  showSubmitButton = false,
  showAIAssistant = false,
}: CodeIDEProps) {
  const { theme: systemTheme } = useTheme();
  const theme = (systemTheme === "dark" ? "dark" : "light") as "dark" | "light";

  // Editor state
  const [code, setCode] = useState<string>(
    initialCode || STARTER_CODE[initialLanguage] || "// Start coding here...\n"
  );
  const [language, setLanguage] = useState<number>(initialLanguage);
  const [stdin, setStdin] = useState<string>("");
  const [fontSize, setFontSize] = useState<number>(DEFAULT_FONT_SIZE);

  // Code execution
  const { execute, isExecuting, result, error } = useCodeExecution({
    assignmentId,
    onSuccess: (result) => {
      onExecute?.(result);
    },
  });

  // Load saved preferences from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedFontSize = localStorage.getItem(STORAGE_KEYS.FONT_SIZE);
      if (savedFontSize) {
        setFontSize(parseInt(savedFontSize, 10));
      }

      const savedLanguage = localStorage.getItem(STORAGE_KEYS.LAST_LANGUAGE);
      if (savedLanguage && !initialLanguage) {
        setLanguage(parseInt(savedLanguage, 10));
      }
    }
  }, [initialLanguage]);

  // Save font size to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEYS.FONT_SIZE, fontSize.toString());
    }
  }, [fontSize]);

  // Save last language to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEYS.LAST_LANGUAGE, language.toString());
    }
  }, [language]);

  // Update code when language changes (load starter code)
  const handleLanguageChange = useCallback(
    (newLanguage: number) => {
      setLanguage(newLanguage);
      
      // If code is empty or default, load starter code for new language
      if (!code.trim() || code === "// Start coding here...\n") {
        const starterCode = STARTER_CODE[newLanguage];
        if (starterCode) {
          setCode(starterCode);
        }
      }
    },
    [code]
  );

  const handleRun = useCallback(() => {
    execute({
      sourceCode: code,
      languageId: language,
      stdin,
    });
  }, [code, language, stdin, execute]);

  const handleSubmit = useCallback(() => {
    if (onSubmit) {
      onSubmit(code, language);
    }
  }, [code, language, onSubmit]);

  const handleSave = useCallback(() => {
    // Save draft to localStorage
    if (typeof window !== "undefined" && assignmentId) {
      const draftKey = `${STORAGE_KEYS.LAST_LANGUAGE}-draft-${assignmentId}`;
      localStorage.setItem(draftKey, JSON.stringify({ code, language, stdin }));
      
      // Show toast notification
      import("sonner").then(({ toast }) => {
        toast.success("Draft saved locally");
      });
    }
  }, [code, language, stdin, assignmentId]);

  const handleOpenInNewWindow = useCallback(() => {
    if (typeof window !== "undefined" && assignmentId) {
      const url = `/ide/student/${assignmentId}?inline=true`;
      window.open(url, "gradeloop-ide", "width=1400,height=900");
    }
  }, [assignmentId]);

  // Calculate execution status
  const getExecutionStatus = (): ExecutionStatus => {
    if (isExecuting) return "running";
    if (!result) return "idle";
    return STATUS_MAP[result.status.id] || "idle";
  };

  const statusBarData = {
    status: getExecutionStatus(),
    time: result?.time || null,
    memory: result?.memory || null,
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header with Language Selector and Toolbar */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <LanguageSelector
          value={language}
          onChange={handleLanguageChange}
          disabled={readOnly || isExecuting}
        />
        <Toolbar
          onRun={handleRun}
          onSubmit={showSubmitButton ? handleSubmit : undefined}
          onSave={handleSave}
          onOpenInNewWindow={assignmentId ? handleOpenInNewWindow : undefined}
          isExecuting={isExecuting}
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
          showSubmitButton={showSubmitButton}
          disabled={readOnly}
        />
      </div>

      {/* Main content area with 2-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Editor (60%) */}
        <div className="flex flex-1 flex-col">
          <EditorPanel
            value={code}
            onChange={setCode}
            language={language}
            fontSize={fontSize}
            readOnly={readOnly}
            theme={theme}
            onRun={handleRun}
            onSave={handleSave}
          />
        </div>
        
        {/* Right: Tabbed Panel (40%) */}
        <div className="w-[400px]">
          <Tabs defaultValue="input-output" className="flex h-full flex-col">
            <TabsList className="grid w-full grid-cols-2 rounded-none border-b border-l">
              <TabsTrigger value="input-output" className="gap-2 rounded-none">
                <Terminal className="h-4 w-4" />
                Input / Output
              </TabsTrigger>
              {showAIAssistant && (
                <TabsTrigger value="ai-assistant" className="gap-2 rounded-none">
                  <Sparkles className="h-4 w-4" />
                  AI Assistant
                </TabsTrigger>
              )}
            </TabsList>
            
            <TabsContent value="input-output" className="flex-1 m-0 overflow-hidden">
              <ExecutionPanel
                stdin={stdin}
                onStdinChange={setStdin}
                result={result}
                isExecuting={isExecuting}
              />
            </TabsContent>
            
            {showAIAssistant && (
              <TabsContent value="ai-assistant" className="flex-1 m-0 overflow-hidden">
                <AIAssistantPanel />
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>

      {/* Status bar */}
      <StatusBar data={statusBarData} isExecuting={isExecuting} />
    </div>
  );
}
