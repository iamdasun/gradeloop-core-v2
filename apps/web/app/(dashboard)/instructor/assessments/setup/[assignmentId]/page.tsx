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
    Trash2,
    CheckCircle2,
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
import { instructorAssessmentsApi, assessmentsApi } from "@/lib/api/assessments";
import type { AssignmentResponse } from "@/types/assessments.types";
import { useToast } from "@/components/ui/toaster";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BulkActionToolbar } from "@/components/instructor/BulkActionToolbar";
import { SelectCheckbox } from "@/components/instructor/SelectCheckbox";
import type {
    GradingCriteria,
    IvasQuestion,
    UpdateGradingCriteriaRequest,
    UpdateQuestionRequest,
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
    onDelete: (id: string) => void;
    selected: boolean;
    onSelectedChange: (checked: boolean) => void;
}

function CriteriaRow({ criteria, onUpdate, onDelete, selected, onSelectedChange }: CriteriaCardProps) {
    const [editing, setEditing] = React.useState(false);
    const [expanded, setExpanded] = React.useState(false);
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
        <tbody>
            <tr className={cn("border-b border-border/40 hover:bg-muted/30 transition-colors", selected && "bg-primary/5")}>
                <td className="w-8 px-3 py-3">
                    <SelectCheckbox
                        id={`criteria-${criteria.id}`}
                        checked={selected}
                        onCheckedChange={onSelectedChange}
                    />
                </td>
                <td className="px-3 py-3 font-semibold text-sm max-w-[180px]">
                    {editing ? (
                        <Input
                            value={form.competency ?? ""}
                            onChange={(e) => setForm((f) => ({ ...f, competency: e.target.value }))}
                            className="h-7 text-sm"
                        />
                    ) : (
                        <span className="block truncate" title={criteria.competency}>{criteria.competency}</span>
                    )}
                </td>
                <td className="px-3 py-3">
                    <DifficultyBadge level={criteria.difficulty_level} />
                </td>
                <td className="px-3 py-3 text-sm text-muted-foreground">
                    {editing ? (
                        <Input
                            value={form.level_label ?? ""}
                            onChange={(e) => setForm((f) => ({ ...f, level_label: e.target.value }))}
                            className="h-7 text-xs w-28"
                        />
                    ) : (
                        criteria.level_label
                    )}
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground">{criteria.programming_language}</td>
                <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-1">
                        <Button
                            size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => setExpanded((v) => !v)}
                            title={expanded ? "Collapse" : "Expand details"}
                        >
                            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </Button>
                        {editing ? (
                            <>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleSave} disabled={saving}>
                                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(false)}>
                                    <X className="h-3.5 w-3.5" />
                                </Button>
                            </>
                        ) : (
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(true)}>
                                <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => onDelete(criteria.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </td>
            </tr>
            {expanded && (
                <tr className="bg-muted/20 border-b border-border/40">
                    <td colSpan={6} className="px-6 py-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Level Description</p>
                                {editing ? (
                                    <Textarea rows={2} value={form.level_description ?? ""}
                                        onChange={(e) => setForm((f) => ({ ...f, level_description: e.target.value }))} />
                                ) : (
                                    <p className="text-sm text-foreground/80">{criteria.level_description}</p>
                                )}
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Marking Criteria</p>
                                {editing ? (
                                    <Textarea rows={3} value={form.marking_criteria ?? ""}
                                        onChange={(e) => setForm((f) => ({ ...f, marking_criteria: e.target.value }))} />
                                ) : (
                                    <p className="text-sm text-foreground/80">{criteria.marking_criteria}</p>
                                )}
                            </div>
                            {criteria.learning_objectives.length > 0 && (
                                <div className="sm:col-span-2">
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Learning Objectives</p>
                                    <ul className="list-disc pl-4 space-y-0.5">
                                        {criteria.learning_objectives.map((obj, i) => (
                                            <li key={i} className="text-sm text-foreground/80">{obj}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </td>
                </tr>
            )}
        </tbody>
    );
}

interface QuestionCardProps {
    question: IvasQuestion;
    onUpdate: (id: string, data: UpdateQuestionRequest) => Promise<void>;
    onDelete: (id: string) => void;
    selected: boolean;
    onSelectedChange: (checked: boolean) => void;
}

function QuestionRow({ question, onUpdate, onDelete, selected, onSelectedChange }: QuestionCardProps) {
    const [expanded, setExpanded] = React.useState(false);
    const [editing, setEditing] = React.useState(false);
    const [form, setForm] = React.useState<UpdateQuestionRequest>({
        question_text: question.question_text,
        expected_answer: question.expected_answer,
        competency: question.competency,
        difficulty: question.difficulty,
        max_points: question.max_points,
        status: question.status as "draft" | "approved" | "rejected",
    });

    const handleSave = async () => {
        try {
            await onUpdate(question.id, form);
            setEditing(false);
        } catch (error) {
            console.error("Failed to update question:", error);
        }
    };

    return (
        <tbody>
            <tr className={cn("border-b border-border/40 hover:bg-muted/30 transition-colors", selected && "bg-primary/5")}>
                <td className="w-8 px-3 py-3">
                    <SelectCheckbox
                        id={`question-${question.id}`}
                        checked={selected}
                        onCheckedChange={onSelectedChange}
                    />
                </td>
                <td className="px-3 py-3 text-sm font-medium max-w-[260px]">
                    {editing ? (
                        <Input
                            value={form.question_text}
                            onChange={(e) => setForm((f) => ({ ...f, question_text: e.target.value }))}
                            className="h-7 text-sm"
                        />
                    ) : (
                        <span className="block truncate" title={question.question_text}>{question.question_text}</span>
                    )}
                </td>
                <td className="px-3 py-3">
                    <Badge variant="outline" className="text-xs whitespace-nowrap">{question.competency}</Badge>
                </td>
                <td className="px-3 py-3">
                    <DifficultyBadge level={question.difficulty} />
                </td>
                <td className="px-3 py-3 text-sm text-center font-mono">{question.max_points}</td>
                <td className="px-3 py-3">
                    <Badge
                        variant="outline"
                        className={cn(
                            "text-xs cursor-pointer select-none",
                            question.status === "approved"
                                ? "border-emerald-500 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                                : "border-amber-500 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                        )}
                        onClick={() => !editing && onUpdate(question.id, {
                            status: question.status === "approved" ? "draft" : "approved"
                        })}
                    >
                        {question.status}
                    </Badge>
                </td>
                <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-1">
                        <Button
                            size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => setExpanded((v) => !v)}
                            title={expanded ? "Hide answer" : "Show expected answer"}
                        >
                            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </Button>
                        {editing ? (
                            <>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleSave}>
                                    <Save className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(false)}>
                                    <X className="h-3.5 w-3.5" />
                                </Button>
                            </>
                        ) : (
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(true)}>
                                <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => onDelete(question.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </td>
            </tr>
            {expanded && (
                <tr className="bg-muted/20 border-b border-border/40">
                    <td colSpan={7} className="px-6 py-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Expected Answer</p>
                        {editing ? (
                            <Textarea
                                rows={3}
                                value={form.expected_answer ?? ""}
                                onChange={(e) => setForm((f) => ({ ...f, expected_answer: e.target.value }))}
                            />
                        ) : (
                            <p className="text-sm text-foreground/80 border-l-2 border-border pl-3">{question.expected_answer}</p>
                        )}
                    </td>
                </tr>
            )}
        </tbody>
    );
}

export default function VivaSetupPage() {
    const params = useParams<{ assignmentId: string }>();
    const assignmentId = params.assignmentId;
    const { addToast } = useToast();

    const [realAssignment, setRealAssignment] = React.useState<AssignmentResponse | null>(null);
    const [criteria, setCriteria] = React.useState<GradingCriteria[]>([]);
    const [questions, setQuestions] = React.useState<IvasQuestion[]>([]);
    const [assignmentText, setAssignmentText] = React.useState("");
    const [loadingInitial, setLoadingInitial] = React.useState(true);
    const [generatingCriteria, setGeneratingCriteria] = React.useState(false);
    const [generatingQuestions, setGeneratingQuestions] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

    // Bulk selection state
    const [selectedCriteria, setSelectedCriteria] = React.useState<Set<string>>(new Set());
    const [selectedQuestions, setSelectedQuestions] = React.useState<Set<string>>(new Set());
    const [bulkLoading, setBulkLoading] = React.useState(false);

    // Delete confirmation dialogs
    const [deleteDialog, setDeleteDialog] = React.useState<{
        open: boolean;
        type: 'criteria' | 'question';
        id?: string;
    }>({ open: false, type: 'criteria' });

    const showSuccess = (msg: string) => {
        addToast({ title: msg, variant: "success" });
    };

    const showError = (msg: string) => {
        addToast({ title: msg, variant: "error" });
    };

    React.useEffect(() => {
        let mounted = true;
        async function load() {
            try {
                setLoadingInitial(true);
                const [realAsgn, crit, qs] = await Promise.allSettled([
                    assessmentsApi.getAssignment(assignmentId),
                    ivasApi.getCriteria(assignmentId),
                    ivasApi.getQuestions(assignmentId),
                ]);
                if (!mounted) return;
                if (realAsgn.status === "fulfilled") {
                    setRealAssignment(realAsgn.value);
                    // Auto-populate the assignment text from the real assignment description
                    if (realAsgn.value.description) {
                        setAssignmentText(realAsgn.value.description);
                    }
                }
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
        try {
            const updated = await ivasApi.updateCriteria(id, data);
            setCriteria((prev) => prev.map((c) => (c.id === id ? updated : c)));
            showSuccess("Criteria updated.");
        } catch (error) {
            showError("Failed to update criteria.");
            throw error;
        }
    };

    const handleDeleteCriteria = (id: string) => {
        setDeleteDialog({ open: true, type: 'criteria', id });
    };

    const handleBulkDeleteCriteria = async () => {
        if (selectedCriteria.size === 0) return;
        try {
            setBulkLoading(true);
            await ivasApi.batchDeleteCriteria(assignmentId, Array.from(selectedCriteria));
            setCriteria((prev) => prev.filter((c) => !selectedCriteria.has(c.id)));
            setSelectedCriteria(new Set());
            showSuccess(`Deleted ${selectedCriteria.size} criteria.`);
        } catch (error) {
            showError("Failed to delete criteria.");
            throw error;
        } finally {
            setBulkLoading(false);
        }
    };

    const handleUpdateQuestion = async (id: string, data: UpdateQuestionRequest) => {
        try {
            const updated = await ivasApi.updateQuestion(id, data);
            setQuestions((prev) => prev.map((q) => (q.id === id ? updated : q)));
            showSuccess("Question updated.");
        } catch (error) {
            showError("Failed to update question.");
            throw error;
        }
    };

    const handleDeleteQuestion = (id: string) => {
        setDeleteDialog({ open: true, type: 'question', id });
    };

    const handleBulkDeleteQuestions = async () => {
        if (selectedQuestions.size === 0) return;
        try {
            setBulkLoading(true);
            await ivasApi.batchDeleteQuestions(Array.from(selectedQuestions));
            setQuestions((prev) => prev.filter((q) => !selectedQuestions.has(q.id)));
            setSelectedQuestions(new Set());
            showSuccess(`Deleted ${selectedQuestions.size} questions.`);
        } catch (error) {
            showError("Failed to delete questions.");
            throw error;
        } finally {
            setBulkLoading(false);
        }
    };

    const handleBulkApproveQuestions = async () => {
        if (selectedQuestions.size === 0) return;
        try {
            setBulkLoading(true);
            await ivasApi.batchUpdateQuestions(Array.from(selectedQuestions), { status: "approved" });
            setQuestions((prev) => prev.map((q) =>
                selectedQuestions.has(q.id) ? { ...q, status: "approved" } : q
            ));
            setSelectedQuestions(new Set());
            showSuccess(`Approved ${selectedQuestions.size} questions.`);
        } catch (error) {
            showError("Failed to approve questions.");
            throw error;
        } finally {
            setBulkLoading(false);
        }
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
                            <h2 className="text-lg font-semibold">
                                {realAssignment?.title ?? assignmentId}
                            </h2>
                            {realAssignment?.description && (
                                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                                    {realAssignment.description}
                                </p>
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
                        <BulkActionToolbar
                            selectedCount={selectedCriteria.size}
                            onBulkDelete={handleBulkDeleteCriteria}
                            onClearSelection={() => setSelectedCriteria(new Set())}
                            isLoading={bulkLoading}
                        />
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
                            <div className="rounded-xl border border-border/60 overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/50">
                                        <tr className="border-b border-border/60">
                                            <th className="w-8 px-3 py-2" />
                                            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Competency</th>
                                            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Difficulty</th>
                                            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Level</th>
                                            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Language</th>
                                            <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                                        </tr>
                                    </thead>
                                    {criteria.map((c) => (
                                        <CriteriaRow
                                            key={c.id}
                                            criteria={c}
                                            onUpdate={handleUpdateCriteria}
                                            onDelete={handleDeleteCriteria}
                                            selected={selectedCriteria.has(c.id)}
                                            onSelectedChange={(checked) => {
                                                const next = new Set(selectedCriteria);
                                                if (checked) next.add(c.id); else next.delete(c.id);
                                                setSelectedCriteria(next);
                                            }}
                                        />
                                    ))}
                                </table>
                            </div>
                        )}
                    </section>

                    {/* Questions */}
                    <section>
                        <BulkActionToolbar
                            selectedCount={selectedQuestions.size}
                            onBulkDelete={handleBulkDeleteQuestions}
                            onBulkApprove={handleBulkApproveQuestions}
                            onClearSelection={() => setSelectedQuestions(new Set())}
                            isLoading={bulkLoading}
                        />
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
                            <div className="rounded-xl border border-border/60 overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/50">
                                        <tr className="border-b border-border/60">
                                            <th className="w-8 px-3 py-2" />
                                            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Question</th>
                                            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Competency</th>
                                            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Difficulty</th>
                                            <th className="px-3 py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pts</th>
                                            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                                            <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                                        </tr>
                                    </thead>
                                    {questions.map((q) => (
                                        <QuestionRow
                                            key={q.id}
                                            question={q}
                                            onUpdate={handleUpdateQuestion}
                                            onDelete={handleDeleteQuestion}
                                            selected={selectedQuestions.has(q.id)}
                                            onSelectedChange={(checked) => {
                                                const next = new Set(selectedQuestions);
                                                if (checked) next.add(q.id); else next.delete(q.id);
                                                setSelectedQuestions(next);
                                            }}
                                        />
                                    ))}
                                </table>
                            </div>
                        )}
                    </section>
                </div>
            </div>

            {/* Delete Confirmation Dialogs */}
            <ConfirmDialog
                open={deleteDialog.open && deleteDialog.type === 'criteria'}
                onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}
                title="Delete Grading Criteria"
                description={`Are you sure you want to delete this grading criteria? This action cannot be undone.`}
                variant="destructive"
                confirmText="Delete"
                onConfirm={async () => {
                    if (deleteDialog.id) {
                        await handleDeleteCriteria(deleteDialog.id);
                    }
                }}
            />
            <ConfirmDialog
                open={deleteDialog.open && deleteDialog.type === 'question'}
                onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}
                title="Delete Question"
                description={`Are you sure you want to delete this question? This action cannot be undone.`}
                variant="destructive"
                confirmText="Delete"
                onConfirm={async () => {
                    if (deleteDialog.id) {
                        await handleDeleteQuestion(deleteDialog.id);
                    }
                }}
            />
        </div>
    );
}
