"use client";

import { useState, useEffect, useCallback } from "react";
import { EditorPanel } from "./editor-panel";
import { ExecutionPanel } from "./execution-panel";
import { StatusBar } from "./status-bar";
import { Toolbar } from "./toolbar";
import { AIAssistantPanel } from "./ai-assistant-panel";
import { GradeResultPanel } from "@/components/assessments/grade-result-panel";
import { AILikelihoodBadge } from "@/components/clone-detector/AILikelihoodBadge";
import { SemanticSimilarityScore } from "@/components/ui/semantic-similarity-score";
import { Separator } from "@/components/ui/separator";
import { useCodeExecution } from "@/lib/hooks/use-code-execution";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Terminal, Sparkles, BarChart2, Loader2, AlertCircle, BrainCircuit } from "lucide-react";
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
  assignmentTitle,
  assignmentDescription,
  userId,
  initialCode,
  initialLanguage = DEFAULT_LANGUAGE_ID,
  onExecute,
  onSubmit,
  readOnly = false,
  showSubmitButton = false,
  showAIAssistant = false,
  showGradePanel = false,
  lockLanguage = false,
  expectedLanguageId,
  grade = null,
  isGrading = false,
  gradingFailed = false,
  submissionAnalysis = null,
  isAnalyzing = false,
}: CodeIDEProps) {
  const { theme: systemTheme } = useTheme();
  const theme = (systemTheme === "dark" ? "dark" : "light") as "dark" | "light";

  // Controlled tab state so we can auto-switch to "results" when grade arrives.
  const [activeTab, setActiveTab] = useState<string>("input-output");

  // Auto-switch to the Results tab as soon as grading starts or a grade arrives.
  useEffect(() => {
    if (isGrading || grade) setActiveTab("results");
  }, [isGrading, grade]);

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
    // When the language is locked, guard the run hook against mismatches.
    expectedLanguageId: lockLanguage ? (expectedLanguageId ?? initialLanguage) : undefined,
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
      if (savedLanguage && !initialLanguage && !lockLanguage) {
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
      {/* Toolbar */}
      <Toolbar
        onRun={handleRun}
        onSubmit={showSubmitButton ? handleSubmit : undefined}
        onSave={handleSave}
        isExecuting={isExecuting}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
        showSubmitButton={showSubmitButton}
        disabled={readOnly}
      />

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
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full flex-col">
            <TabsList
              className={`grid w-full rounded-none border-b border-l ${
                showGradePanel
                  ? showAIAssistant ? "grid-cols-4" : "grid-cols-3"
                  : showAIAssistant ? "grid-cols-2" : "grid-cols-1"
              }`}
            >
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
              {showGradePanel && (
                <TabsTrigger value="results" className="gap-2 rounded-none">
                  <BarChart2 className="h-4 w-4" />
                  Results
                  {isGrading && (
                    <Loader2 className="h-3 w-3 animate-spin ml-0.5" />
                  )}
                </TabsTrigger>
              )}
              {showGradePanel && (
                <TabsTrigger value="analysis" className="gap-2 rounded-none">
                  <BrainCircuit className="h-4 w-4" />
                  Analysis
                  {isAnalyzing && !submissionAnalysis && (
                    <Loader2 className="h-3 w-3 animate-spin ml-0.5" />
                  )}
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
                <AIAssistantPanel
                  assignmentId={assignmentId}
                  assignmentTitle={assignmentTitle}
                  assignmentDescription={assignmentDescription}
                  userId={userId}
                  studentCode={code}
                />
              </TabsContent>
            )}

            {showGradePanel && (
              <TabsContent value="results" className="flex-1 m-0 overflow-y-auto">
                {isGrading && !grade ? (
                  <div className="flex flex-col items-center justify-center gap-3 h-full min-h-[200px] text-center p-6">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm font-medium">Autograding your submission…</p>
                    <p className="text-xs text-muted-foreground">
                      Running test cases and AI rubric analysis. This usually takes 15–60 seconds.
                    </p>
                  </div>
                ) : grade ? (
                  <GradeResultPanel grade={grade} compact instructorView={false} />
                ) : gradingFailed ? (
                  <div className="flex flex-col items-center justify-center gap-3 h-full min-h-[200px] text-center p-6">
                    <AlertCircle className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm font-medium text-muted-foreground">Grading results not available</p>
                    <p className="text-xs text-muted-foreground">
                      The AI grader may still be processing, or no rubric is configured for this assignment.
                      Check back later or contact your instructor.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 h-full min-h-[200px] text-center p-6">
                    <BarChart2 className="h-8 w-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">
                      Submit your code to see AI-generated feedback and marks.
                    </p>
                  </div>
                )}
              </TabsContent>
            )}

            {showGradePanel && (
              <TabsContent value="analysis" className="flex-1 m-0 overflow-y-auto">
                {isAnalyzing && !submissionAnalysis ? (
                  <div className="flex flex-col items-center justify-center gap-3 h-full min-h-[200px] text-center p-6">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm font-medium">Analyzing your submission…</p>
                    <p className="text-xs text-muted-foreground">
                      Running AI detection and semantic similarity checks.
                    </p>
                  </div>
                ) : submissionAnalysis ? (
                  <div className="px-4 py-4 flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                      <BrainCircuit className="h-3.5 w-3.5 text-muted-foreground" />
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Submission Analysis
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">AI Generation Likelihood</p>
                      <AILikelihoodBadge
                        aiLikelihood={submissionAnalysis.aiLikelihood}
                        humanLikelihood={submissionAnalysis.humanLikelihood}
                        showLabel
                        size="sm"
                      />
                    </div>
                    <Separator />
                    {submissionAnalysis.semanticSimilarityScore != null ? (
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">Similarity to sample answer</p>
                        <SemanticSimilarityScore
                          score={submissionAnalysis.semanticSimilarityScore}
                          compact
                        />
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">
                        No sample answer configured — similarity score unavailable.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 h-full min-h-[200px] text-center p-6">
                    <BrainCircuit className="h-8 w-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">
                      Submit your code to see AI detection and similarity analysis.
                    </p>
                  </div>
                )}
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>

      {/* Status bar */}
      <StatusBar
        data={statusBarData}
        isExecuting={isExecuting}
        language={language}
        onLanguageChange={handleLanguageChange}
        languageSelectorDisabled={readOnly || isExecuting || lockLanguage}
      />
    </div>
  );
}
