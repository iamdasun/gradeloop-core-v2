"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import {
    Loader2,
    Mic2,
    ChevronDown,
    ChevronUp,
    Edit2,
    Save,
    X,
    RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ivasApi } from "@/lib/ivas-api";
import type {
    IvasAssignment,
    GradingCriteria,
    IvasQuestion,
    UpdateGradingCriteriaRequest,
} from "@/types/ivas";

const DIFFICULTY_LABELS: Record<number, { label: string; color: string }> = {
    1: { label: "Beginner", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
    2: { label: "Easy", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
    3: { label: "Medium", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
    4: { label: "Hard", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
    5: { label: "Expert", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

function DifficultyBadge({ level }: { level: number }) {
    const info = DIFFICULTY_LABELS[level] ?? { label: `L${level}`, color: "bg-zinc-100 text-zinc-700" };
    return (
        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", info.color)}>
            {info.label}
        </span>
    );
}

interface CriteriaCardProps {
    criteria: GradingCriteria;
    onUpdate: (id: string, data: UpdateGradingCriteriaRequest) => Promise<void>;
}

function CriteriaCard({ criteria, onUpdate }: CriteriaCardProps) {
    const [editing, setEditing] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const [form, setForm] = React.useState<UpdateGradingCriteriaRequest>({
        competency: criteria.competency,
        difficulty_level: criteria.difficulty_level,
        level_label: criteria.level_label,
        level_description: criteria.level_description,
        marking_criteria: criteria.marking_criteria,
        programming_language: criteria.programming_language,
        learning_objectives: [...criteria.learning_objectives],
    });

    const handleSave = async () => {
        try {
            setSaving(true);
            await onUpdate(criteria.id, form);
            setEditing(false);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card className="border border-border/60">
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-1 min-w-0">
                        {editing ? (
                            <Input
                                value={form.competency ?? ""}
                                onChange={(e) => setForm((f) => ({ ...f, competency: e.target.value }))}
                                className="text-base font-semibold h-8"
                            />
                        ) : (
                            <CardTitle className="text-base font-semibold truncate">{criteria.competency}</CardTitle>
                        )}
                        <div className="flex items-center gap-2 flex-wrap">
                            <DifficultyBadge level={criteria.difficulty_level} />
                            {editing ? (
                                <Input
                                    value={form.level_label ?? ""}
                                    onChange={(e) => setForm((f) => ({ ...f, level_label: e.target.value }))}
                                    className="h-6 text-xs w-32"
                                    placeholder="Level label"
                                />
                            ) : (
                                <span className="text-xs text-muted-foreground">{criteria.level_label}</span>
                            )}
                            <span className="text-xs text-muted-foreground">{criteria.programming_language}</span>
                        </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                        {editing ? (
                            <>
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleSave} disabled={saving}>
                                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(false)}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </>
                        ) : (
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(true)}>
                                <Edit2 className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
                <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Level Description</p>
                    {editing ? (
                        <Textarea
                            rows={2}
                            value={form.level_description ?? ""}
                            onChange={(e) => setForm((f) => ({ ...f, level_description: e.target.value }))}
                        />
                    ) : (
                        <p className="text-zinc-700 dark:text-zinc-300">{criteria.level_description}</p>
                    )}
                </div>
                <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Marking Criteria</p>
                    {editing ? (
                        <Textarea
                            rows={3}
                            value={form.marking_criteria ?? ""}
                            onChange={(e) => setForm((f) => ({ ...f, marking_criteria: e.target.value }))}
                        />
                    ) : (
                        <p className="text-zinc-700 dark:text-zinc-300">{criteria.marking_criteria}</p>
                    )}
                </div>
                {criteria.learning_objectives.length > 0 && (
                    <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Learning Objectives</p>
                        <ul className="list-disc pl-4 space-y-0.5">
                            {criteria.learning_objectives.map((obj, i) => (
                                <li key={i} className="text-zinc-700 dark:text-zinc-300">{obj}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

interface QuestionCardProps {
    question: IvasQuestion;
}

function QuestionCard({ question }: QuestionCardProps) {
    const [expanded, setExpanded] = React.useState(false);
    return (
        <div className="rounded-lg border border-border/60 p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 flex-1">{question.question_text}</p>
                <div className="flex items-center gap-2 shrink-0">
                    <DifficultyBadge level={question.difficulty} />
                    <Badge variant="outline" className="text-xs">{question.competency}</Badge>
                    <Badge
                        variant="outline"
                        className={cn("text-xs", question.status === "approved"
                            ? "border-emerald-500 text-emerald-600"
                            : "border-amber-500 text-amber-600")}
                    >
                        {question.status}
                    </Badge>
                </div>
            </div>
            <button
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setExpanded((v) => !v)}
            >
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                Expected answer
            </button>
            {expanded && (
                <p className="text-sm text-muted-foreground border-l-2 border-border pl-3">
                    {question.expected_answer}
                </p>
            )}
        </div>
    );
}

export default function VivaSetupPage() {
    const params = useParams<{ assignmentId: string }>();
    const assignmentId = params.assignmentId;

    const [assignment, setAssignment] = React.useState<IvasAssignment | null>(null);
    const [criteria, setCriteria] = React.useState<GradingCriteria[]>([]);
    const [questions, setQuestions] = React.useState<IvasQuestion[]>([]);
    const [assignmentText, setAssignmentText] = React.useState("");
    const [loadingInitial, setLoadingInitial] = React.useState(true);
    const [generatingCriteria, setGeneratingCriteria] = React.useState(false);
    const [generatingQuestions, setGeneratingQuestions] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

    const showSuccess = (msg: string) => {
        setSuccessMsg(msg);
        setTimeout(() => setSuccessMsg(null), 4000);
    };

    React.useEffect(() => {
        let mounted = true;
        async function load() {
            try {
                setLoadingInitial(true);
                const [asgn, crit, qs] = await Promise.allSettled([
                    ivasApi.getAssignment(assignmentId),
                    ivasApi.getCriteria(assignmentId),
                    ivasApi.getQuestions(assignmentId),
                ]);
                if (!mounted) return;
                if (asgn.status === "fulfilled") setAssignment(asgn.value);
                if (crit.status === "fulfilled") setCriteria(crit.value);
                if (qs.status === "fulfilled") setQuestions(qs.value);
            } catch {
                if (mounted) setError("Failed to load assignment data.");
            } finally {
                if (mounted) setLoadingInitial(false);
            }
        }
        load();
        return () => { mounted = false; };
    }, [assignmentId]);

    const handleGenerateCriteria = async () => {
        if (!assignmentText.trim()) {
            setError("Please enter assignment text before generating criteria.");
            return;
        }
        try {
            setError(null);
            setGeneratingCriteria(true);
            await ivasApi.generateCriteria(assignmentId, {
                assignment_text: assignmentText,
                num_criteria: 5,
                replace_existing: true,
            });
            const fresh = await ivasApi.getCriteria(assignmentId);
            setCriteria(fresh);
            showSuccess(`Generated ${fresh.length} grading criteria successfully.`);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to generate criteria.");
        } finally {
            setGeneratingCriteria(false);
        }
    };

    const handleGenerateQuestions = async () => {
        if (!assignmentText.trim()) {
            setError("Please enter assignment text before generating questions.");
            return;
        }
        try {
            setError(null);
            setGeneratingQuestions(true);
            await ivasApi.generateQuestions(assignmentId, {
                assignment_text: assignmentText,
                num_questions: 2,
            });
            const fresh = await ivasApi.getQuestions(assignmentId);
            setQuestions(fresh);
            showSuccess(`Generated ${fresh.length} questions successfully.`);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to generate questions.");
        } finally {
            setGeneratingQuestions(false);
        }
    };

    const handleUpdateCriteria = async (id: string, data: UpdateGradingCriteriaRequest) => {
        const updated = await ivasApi.updateCriteria(id, data);
        setCriteria((prev) => prev.map((c) => (c.id === id ? updated : c)));
        showSuccess("Criteria updated.");
    };

    return (
        <div className="flex flex-col gap-8 pb-8">
            {/* Page Header */}
            <div className="flex items-center gap-3 border-b border-border/40 pb-6">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Mic2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                    <h1 className="text-2xl font-black tracking-tight">Viva Setup</h1>
                    <p className="text-sm text-muted-foreground">
                        Configure AI-generated grading criteria and questions for this assignment&apos;s oral viva.
                    </p>
                </div>
            </div>

            {/* Feedback */}
            {error && (
                <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                    {error}
                </div>
            )}
            {successMsg && (
                <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-900/20 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
                    {successMsg}
                </div>
            )}

            <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
                {/* Left Panel */}
                <div className="space-y-6">
                    {loadingInitial ? (
                        <div className="space-y-3">
                            <Skeleton className="h-6 w-48" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-3/4" />
                        </div>
                    ) : (
                        <div>
                            <h2 className="text-lg font-semibold">{assignment?.title ?? assignmentId}</h2>
                            {assignment && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {assignment.competencies.map((c) => (
                                        <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="assignment-text">Assignment Text</Label>
                        <Textarea
                            id="assignment-text"
                            rows={10}
                            placeholder="Paste the full assignment description here. This text is used by the AI to generate relevant criteria and questions..."
                            value={assignmentText}
                            onChange={(e) => setAssignmentText(e.target.value)}
                            className="resize-none"
                        />
                        <p className="text-xs text-muted-foreground">
                            The AI uses this text to extract competencies and generate viva questions.
                        </p>
                    </div>

                    <div className="flex flex-col gap-3">
                        <Button
                            onClick={handleGenerateCriteria}
                            disabled={generatingCriteria || !assignmentText.trim()}
                            className="w-full"
                        >
                            {generatingCriteria ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Generating criteria…
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="h-4 w-4 mr-2" />
                                    Generate Grading Criteria
                                </>
                            )}
                        </Button>
                        <Button
                            variant="outline"
                            onClick={handleGenerateQuestions}
                            disabled={generatingQuestions || criteria.length === 0 || !assignmentText.trim()}
                            className="w-full"
                        >
                            {generatingQuestions ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Generating questions…
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="h-4 w-4 mr-2" />
                                    Generate Questions
                                </>
                            )}
                        </Button>
                        {criteria.length === 0 && !generatingCriteria && (
                            <p className="text-xs text-muted-foreground text-center">
                                Generate grading criteria first to unlock question generation.
                            </p>
                        )}
                    </div>
                </div>

                {/* Right Panel */}
                <div className="space-y-8">
                    {/* Grading Criteria */}
                    <section>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-semibold">
                                Grading Criteria
                                {criteria.length > 0 && (
                                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                                        ({criteria.length})
                                    </span>
                                )}
                            </h3>
                        </div>
                        {loadingInitial ? (
                            <div className="space-y-3">
                                {Array.from({ length: 3 }).map((_, i) => (
                                    <Skeleton key={i} className="h-32 w-full rounded-xl" />
                                ))}
                            </div>
                        ) : criteria.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-muted-foreground text-sm">
                                No criteria yet. Enter the assignment text and click &quot;Generate Grading Criteria&quot;.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {criteria.map((c) => (
                                    <CriteriaCard key={c.id} criteria={c} onUpdate={handleUpdateCriteria} />
                                ))}
                            </div>
                        )}
                    </section>

                    {/* Questions */}
                    <section>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-semibold">
                                Generated Questions
                                {questions.length > 0 && (
                                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                                        ({questions.length})
                                    </span>
                                )}
                            </h3>
                        </div>
                        {loadingInitial ? (
                            <div className="space-y-3">
                                {Array.from({ length: 2 }).map((_, i) => (
                                    <Skeleton key={i} className="h-20 w-full rounded-xl" />
                                ))}
                            </div>
                        ) : questions.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-muted-foreground text-sm">
                                No questions yet. Generate criteria first, then click &quot;Generate Questions&quot;.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {questions.map((q) => (
                                    <QuestionCard key={q.id} question={q} />
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}
