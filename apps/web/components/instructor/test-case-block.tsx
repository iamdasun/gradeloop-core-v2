"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, Trash2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EditorPanel } from "@/components/ide/editor-panel";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import type { TestCase } from "@/lib/stores/assignmentCreateStore";

// ─── Run result shape (passed in from page) ───────────────────────────────────

export interface TestCaseRunResult {
    test_case_id: number;
    passed: boolean;
    actual_output: string;
    status: { id: number; description: string };
    time: string | null;
    error?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface TestCaseBlockProps {
    testCase: TestCase;
    isExpanded: boolean;
    runResult?: TestCaseRunResult;
    onToggle: () => void;
    onChange: (updated: TestCase) => void;
    onRemove: () => void;
}

export function TestCaseBlock({
    testCase,
    isExpanded,
    runResult,
    onToggle,
    onChange,
    onRemove,
}: TestCaseBlockProps) {
    const { theme: systemTheme } = useTheme();
    const editorTheme = (systemTheme === "dark" ? "dark" : "light") as "dark" | "light";

    return (
        <div
            className={cn(
                "border rounded-xl bg-card overflow-hidden transition-colors",
                isExpanded ? "border-primary/30 shadow-sm" : "border-border/60",
                runResult?.passed === true && "border-emerald-300 dark:border-emerald-800",
                runResult?.passed === false && "border-red-300 dark:border-red-800",
            )}
        >
            {/* ── Header ── */}
            <div
                className="flex items-center gap-3 p-4 cursor-pointer select-none hover:bg-muted/20 transition-colors"
                onClick={onToggle}
            >
                {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}

                <span className="flex-1 font-semibold text-sm">
                    Test #{testCase.test_case_id}
                    {testCase.description && (
                        <span className="ml-2 text-muted-foreground font-normal text-xs">
                            — {testCase.description}
                        </span>
                    )}
                </span>

                <div className="flex items-center gap-2 shrink-0">
                    {runResult && (
                        runResult.passed ? (
                            <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Passed
                                {runResult.time && (
                                    <span className="text-muted-foreground font-normal">
                                        {runResult.time}s
                                    </span>
                                )}
                            </span>
                        ) : (
                            <span className="flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                                <XCircle className="h-3.5 w-3.5" />
                                Failed
                            </span>
                        )
                    )}
                    <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => { e.stopPropagation(); onRemove(); }}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>

            {/* ── Body ── */}
            {isExpanded && (
                <div className="px-5 pb-5 border-t border-border/40 space-y-4 pt-5">
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Description</Label>
                        <Input
                            placeholder="Briefly describe what this test case validates…"
                            value={testCase.description}
                            className="h-9"
                            onChange={(e) => onChange({ ...testCase, description: e.target.value })}
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">
                                Input <span className="text-[10px]">(stdin)</span>
                            </Label>
                            <div className="h-[140px] border border-border/60 rounded-lg overflow-hidden">
                                <EditorPanel
                                    value={testCase.test_case_input}
                                    onChange={(v) => onChange({ ...testCase, test_case_input: v })}
                                    language={43}
                                    fontSize={12}
                                    theme={editorTheme}
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Expected Output</Label>
                            <div className="h-[140px] border border-border/60 rounded-lg overflow-hidden">
                                <EditorPanel
                                    value={testCase.expected_output}
                                    onChange={(v) => onChange({ ...testCase, expected_output: v })}
                                    language={43}
                                    fontSize={12}
                                    theme={editorTheme}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Run result detail */}
                    {runResult && !runResult.passed && (
                        <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 p-3 space-y-2">
                            <p className="text-xs font-semibold text-red-700 dark:text-red-400">
                                Actual Output
                            </p>
                            <pre className="text-xs font-mono text-red-600 dark:text-red-300 whitespace-pre-wrap break-all">
                                {runResult.actual_output || runResult.error || "(empty)"}
                            </pre>
                            {runResult.status.id !== 3 && (
                                <Badge variant="destructive" className="text-[10px]">
                                    {runResult.status.description}
                                </Badge>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
