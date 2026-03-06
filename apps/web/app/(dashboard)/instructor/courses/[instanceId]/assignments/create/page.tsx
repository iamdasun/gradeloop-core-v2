"use client";

import * as React from "react";
import { useRouter, useParams } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
    useAssignmentCreateStore,
    DEFAULT_CRITERIA,
    type RubricCriterion,
    type TestCase,
} from "@/lib/stores/assignmentCreateStore";
import { useUIStore } from "@/lib/stores/uiStore";
import { instructorAssessmentsApi, assessmentsApi } from "@/lib/api/assessments";
import { handleApiError } from "@/lib/api/axios";
import { cn } from "@/lib/utils";
import { RubricCriterionBlock } from "@/components/instructor/rubric-criterion-block";
import { TestCaseBlock, type TestCaseRunResult } from "@/components/instructor/test-case-block";
import { EditorPanel } from "@/components/ide/editor-panel";
import { LanguageSelector } from "@/components/ide/language-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Loader2,
    Plus,
    Info,
    AlertCircle,
    CheckCircle2,
    FlaskConical,
    BookOpen,
    Play,
    Pencil,
    Save,
} from "lucide-react";

// ─── Allowed Judge0 language IDs for assignment creation ─────────────────────
// C (GCC 9.2.0, Clang 7.0.1), C++ (GCC 9.2.0, GCC 14.1.0),
// C# (Mono 6.6.0.161), Python (3.8.1, 3.11.2), Java (OpenJDK 13, JDK 17)
const ALLOWED_LANGUAGE_IDS = [50, 75, 54, 105, 51, 71, 92, 62, 91];

// ─── Assessment type grid options ─────────────────────────────────────────────

const ASSIGNMENT_TYPES = [
    {
        id: "lab" as const,
        label: "Lab",
        description: "Practical programming exercise with hands-on coding",
        icon: FlaskConical,
    },
    {
        id: "exam" as const,
        label: "Exam",
        description: "Formal timed assessment with structured questions",
        icon: BookOpen,
    },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSlug(name: string) {
    return name
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .slice(0, 80);
}

function makeId() {
    return Math.random().toString(36).slice(2, 10);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CreateAssignmentPage() {
    const router = useRouter();
    const params = useParams();
    const instanceId = params.instanceId as string;
    const { theme: systemTheme } = useTheme();
    const editorTheme = (systemTheme === "dark" ? "dark" : "light") as "dark" | "light";

    // ── Store ──────────────────────────────────────────────────────────────────
    const {
        currentStep,
        steps,
        setStep,
        assignment,
        settings,
        criteria,
        testCases,
        sampleAnswer,
        updateAssignment,
        updateSettings,
        setCriteria,
        setTestCases,
        updateSampleAnswer,
        reset,
    } = useAssignmentCreateStore();

    const pushSecondarySidebar = useUIStore((s) => s.pushSecondarySidebar);
    const popSecondarySidebar = useUIStore((s) => s.popSecondarySidebar);
    const setPageTitle = useUIStore((s) => s.setPageTitle);

    // ── Mount ──────────────────────────────────────────────────────────────────
    React.useEffect(() => {
        setPageTitle("Create Assignment");
        pushSecondarySidebar({
            title: "Create Assignment",
            subtitle: undefined,
            backHref: `/instructor/courses/${instanceId}/assignments`,
            backLabel: "Cancel",
            basePath: `/instructor/courses/${instanceId}/assignments/create`,
            items: [],
            mode: "steps",
        });
        return () => {
            popSecondarySidebar();
            setPageTitle(null);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [instanceId]);

    // ── Local UI state ─────────────────────────────────────────────────────────
    const [expandedCriterionId, setExpandedCriterionId] = React.useState<string | null>(
        criteria[0]?.id ?? null,
    );
    const [expandedTestCaseId, setExpandedTestCaseId] = React.useState<number | null>(null);
    const [testResults, setTestResults] = React.useState<TestCaseRunResult[]>([]);
    const [isRunning, setIsRunning] = React.useState(false);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [submitError, setSubmitError] = React.useState<string | null>(null);

    // ── Derived rubric weight ──────────────────────────────────────────────────
    const totalWeight = criteria.reduce((acc, c) => acc + (Number(c.weight) || 0), 0);
    const weightValid = totalWeight === 100;

    // ── Rubric helpers ─────────────────────────────────────────────────────────
    const addCriterion = () => {
        const id = makeId();
        const next: RubricCriterion = {
            id,
            name: "",
            description: "",
            grading_mode: "llm",
            weight: 0,
            bands: {
                excellent:      { description: "", mark_range: { min: 85, max: 100 } },
                good:           { description: "", mark_range: { min: 70, max: 84 } },
                satisfactory:   { description: "", mark_range: { min: 50, max: 69 } },
                unsatisfactory: { description: "", mark_range: { min: 0,  max: 49 } },
            },
        };
        setCriteria([...criteria, next]);
        setExpandedCriterionId(id);
    };

    const updateCriterion = (id: string, updated: RubricCriterion) =>
        setCriteria(criteria.map((c) => (c.id === id ? updated : c)));

    const removeCriterion = (id: string) => {
        setCriteria(criteria.filter((c) => c.id !== id));
        if (expandedCriterionId === id) setExpandedCriterionId(null);
    };

    const moveCriterion = (id: string, dir: "up" | "down") => {
        const idx = criteria.findIndex((c) => c.id === id);
        if (idx < 0) return;
        const next = [...criteria];
        const swap = dir === "up" ? idx - 1 : idx + 1;
        if (swap < 0 || swap >= next.length) return;
        [next[idx], next[swap]] = [next[swap], next[idx]];
        setCriteria(next);
    };

    // ── Test case helpers ──────────────────────────────────────────────────────
    const addTestCase = () => {
        const nextId = testCases.length > 0 ? Math.max(...testCases.map((t) => t.test_case_id)) + 1 : 1;
        const next: TestCase = {
            test_case_id: nextId,
            description: "",
            test_case_input: "",
            expected_output: "",
        };
        setTestCases([...testCases, next]);
        setExpandedTestCaseId(nextId);
        setTestResults([]);
    };

    const updateTestCase = (id: number, updated: TestCase) =>
        setTestCases(testCases.map((t) => (t.test_case_id === id ? updated : t)));

    const removeTestCase = (id: number) => {
        setTestCases(testCases.filter((t) => t.test_case_id !== id));
        if (expandedTestCaseId === id) setExpandedTestCaseId(null);
        setTestResults((prev) => prev.filter((r) => r.test_case_id !== id));
    };

    // ── Sample answer runner ───────────────────────────────────────────────────
    const runSampleAnswer = async () => {
        if (!sampleAnswer.code.trim() || testCases.length === 0) return;
        setIsRunning(true);
        setTestResults([]);
        const results: TestCaseRunResult[] = [];

        for (const tc of testCases) {
            try {
                const res = await assessmentsApi.runCode({
                    language_id: sampleAnswer.language_id,
                    source_code: sampleAnswer.code,
                    stdin: tc.test_case_input,
                });
                const actual = (res.stdout ?? "").trimEnd();
                const expected = tc.expected_output.trimEnd();
                results.push({
                    test_case_id: tc.test_case_id,
                    passed: actual === expected,
                    actual_output: actual,
                    status: res.status,
                    time: res.time,
                });
            } catch (err) {
                results.push({
                    test_case_id: tc.test_case_id,
                    passed: false,
                    actual_output: "",
                    status: { id: -1, description: "Error" },
                    time: null,
                    error: handleApiError(err),
                });
            }
        }

        setTestResults(results);
        setIsRunning(false);

        const passed = results.filter((r) => r.passed).length;
        toast[passed === results.length ? "success" : "warning"](
            `${passed} / ${results.length} test cases passed`,
        );
    };

    // ── Navigation ─────────────────────────────────────────────────────────────
    const handleNext = () => {
        if (currentStep < steps.length) setStep(currentStep + 1);
    };
    const handleBack = () => {
        if (currentStep > 1) setStep(currentStep - 1);
    };

    // ── Publish ────────────────────────────────────────────────────────────────
    const handlePublish = async () => {
        setIsSubmitting(true);
        setSubmitError(null);
        try {
            const result = await instructorAssessmentsApi.createAssignment({
                course_instance_id: instanceId,
                title: assignment.name.trim(),
                description: assignment.description.trim(),
                code: makeSlug(assignment.name),
                release_at: settings.release_date ? new Date(settings.release_date).toISOString() : null,
                due_at: settings.due_date ? new Date(settings.due_date).toISOString() : null,
                late_due_at:
                    settings.allow_late_submission && settings.late_due_date
                        ? new Date(settings.late_due_date).toISOString()
                        : null,
                allow_late_submissions: settings.allow_late_submission,
                enforce_time_limit:
                    settings.time_limit_enabled && settings.time_limit_minutes
                        ? settings.time_limit_minutes * 60
                        : null,
                allow_group_submission: settings.group_submission,
                max_group_size: settings.group_submission ? 5 : null,
                // TODO [ACAFS]: enable_ai_assistant will activate rubric-based LLM evaluation.
                // Requires assessment-service to store & forward rubric to ACAFS queue message.
                enable_ai_assistant: true,
                // TODO [ACAFS]: enable_socratic_feedback is pending ACAFS feedback pipeline.
                // Set to true once ACAFS can generate per-criteria socratic hints.
                enable_socratic_feedback: false,
                allow_regenerate: settings.multiple_submissions,
                // ── Fields not yet supported by assessment-service backend ──────────────
                // TODO [assessment-service]: Add `assessment_type` column (lab | exam).
                // assessment_type: assignment.type,
                //
                // TODO [assessment-service]: Add `objective` column (LLM context).
                // objective: assignment.objective,
                //
                // TODO [assessment-service]: Store rubric JSON in assignment row or
                // separate rubric table. POST /instructor-assignments/:id/rubric endpoint.
                // rubric: { criteria },
                //
                // TODO [assessment-service]: Store test_cases JSON or separate table.
                // POST /instructor-assignments/:id/test-cases endpoint.
                // test_cases: testCases,
                //
                // TODO [assessment-service]: Store sample answer (language + code) in
                // MinIO or dedicated table. POST /instructor-assignments/:id/sample-answer.
                // sample_answer: sampleAnswer,
            });
            reset();
            router.push(`/instructor/courses/${instanceId}/assignments/${result.id}`);
        } catch (err) {
            setSubmitError(handleApiError(err));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSaveDraft = () => {
        // Draft is auto-persisted by assignmentCreateStore via localStorage.
        // This button provides explicit user confirmation.
        toast.success("Draft saved — you can safely close this page.");
    };

    // ── Per-step next button state ─────────────────────────────────────────────
    const nextDisabled =
        isSubmitting ||
        (currentStep === 1 && !assignment.name.trim()) ||
        (currentStep === 3 && !weightValid);

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────────────────

    return (
        <div className="max-w-3xl mx-auto w-full flex flex-col min-h-[calc(100vh-140px)] animate-in fade-in duration-300 pb-4">

            {/* ── Page header ── */}
            <div className="mb-7">
                <h1 className="text-2xl font-bold font-heading tracking-tight">
                    {steps[currentStep - 1]?.title}
                </h1>
                {steps[currentStep - 1]?.description && (
                    <p className="text-sm text-muted-foreground mt-1">
                        {steps[currentStep - 1].description}
                    </p>
                )}
            </div>

            {/* ── Step content ── */}
            <div className="flex-1 space-y-4">

                {/* ════════════════════════════════════════════════════════
                    STEP 1 — CREATE ASSIGNMENT
                ════════════════════════════════════════════════════════ */}
                {currentStep === 1 && (
                    <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">

                        {/* Assignment Name */}
                        <div className="bg-card border border-border/60 rounded-xl p-6 space-y-3">
                            <Label htmlFor="name" className="text-base font-semibold">
                                Assignment Name <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="name"
                                className="h-11"
                                placeholder="e.g. Midterm Lab — Sorting Algorithms"
                                value={assignment.name}
                                onChange={(e) => updateAssignment({ name: e.target.value })}
                            />
                        </div>

                        {/* Assignment Type */}
                        <div className="bg-card border border-border/60 rounded-xl p-6 space-y-4">
                            <Label className="text-base font-semibold">Assignment Type</Label>
                            <div className="grid grid-cols-2 gap-4">
                                {ASSIGNMENT_TYPES.map((type) => {
                                    const Icon = type.icon;
                                    const selected = assignment.type === type.id;
                                    return (
                                        <button
                                            key={type.id}
                                            type="button"
                                            onClick={() => updateAssignment({ type: type.id })}
                                            className={cn(
                                                "flex flex-col items-start gap-3 p-5 rounded-xl border-2 text-left transition-all",
                                                selected
                                                    ? "border-primary bg-primary/5 shadow-sm"
                                                    : "border-border/60 hover:border-border hover:bg-muted/30",
                                            )}
                                        >
                                            <div
                                                className={cn(
                                                    "flex items-center justify-center h-10 w-10 rounded-lg transition-colors",
                                                    selected
                                                        ? "bg-primary text-primary-foreground"
                                                        : "bg-muted text-muted-foreground",
                                                )}
                                            >
                                                <Icon className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <div className="font-semibold">{type.label}</div>
                                                <div className="text-xs text-muted-foreground mt-0.5">
                                                    {type.description}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Description & Objective */}
                        <div className="bg-card border border-border/60 rounded-xl p-6 space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="description" className="text-base font-semibold">
                                    Description
                                </Label>
                                <p className="text-xs text-muted-foreground -mt-1">
                                    Visible to students. Explain the purpose, expectations, and requirements.
                                </p>
                                <Textarea
                                    id="description"
                                    placeholder="Describe what students need to do…"
                                    className="min-h-[120px] resize-y"
                                    value={assignment.description}
                                    onChange={(e) => updateAssignment({ description: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2 pt-5 border-t border-border/40">
                                <div className="flex items-center gap-2">
                                    <Label htmlFor="objective" className="text-base font-semibold">
                                        Assignment Objective
                                    </Label>
                                    <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
                                        AI Context
                                    </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground -mt-1">
                                    Used by the AI evaluation engine to understand learning outcomes.{" "}
                                    <span className="font-medium">Not visible to students.</span>
                                </p>
                                <Textarea
                                    id="objective"
                                    placeholder="e.g. Students should demonstrate understanding of sorting algorithms and Big-O analysis…"
                                    className="min-h-[100px] resize-y"
                                    value={assignment.objective}
                                    onChange={(e) => updateAssignment({ objective: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* ════════════════════════════════════════════════════════
                    STEP 2 — ASSIGNMENT SETTINGS
                ════════════════════════════════════════════════════════ */}
                {currentStep === 2 && (
                    <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">

                        {/* Programming Language */}
                        <div className="bg-card border border-border/60 rounded-xl p-6 space-y-3">
                            <div>
                                <Label className="text-base font-semibold">Programming Language</Label>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Sets the default language for submissions and the sample answer editor.
                                </p>
                            </div>
                            <LanguageSelector
                                value={settings.language_id}
                                allowedIds={ALLOWED_LANGUAGE_IDS}
                                onChange={(id) => {
                                    updateSettings({ language_id: id });
                                    // Sync sample answer language unless user already changed it
                                    updateSampleAnswer({ language_id: id });
                                }}
                            />
                        </div>

                        {/* Dates */}
                        <div className="bg-card border border-border/60 rounded-xl p-6 space-y-4">
                            <Label className="text-base font-semibold">Dates</Label>
                            <div className="grid sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="release-date" className="text-sm text-muted-foreground">
                                        Release Date
                                    </Label>
                                    <Input
                                        id="release-date"
                                        type="datetime-local"
                                        className="h-11"
                                        value={settings.release_date}
                                        onChange={(e) => updateSettings({ release_date: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="due-date" className="text-sm text-muted-foreground">
                                        Due Date
                                    </Label>
                                    <Input
                                        id="due-date"
                                        type="datetime-local"
                                        className="h-11"
                                        value={settings.due_date}
                                        onChange={(e) => updateSettings({ due_date: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Submission settings */}
                        <div className="bg-card border border-border/60 rounded-xl p-6 space-y-3">
                            <Label className="text-base font-semibold">Submission Settings</Label>

                            {/* Late Submissions */}
                            <div
                                className={cn(
                                    "rounded-xl border p-4 space-y-3 transition-colors",
                                    settings.allow_late_submission
                                        ? "border-primary/30 bg-primary/5"
                                        : "border-border/60",
                                )}
                            >
                                <label className="flex items-center justify-between cursor-pointer">
                                    <div>
                                        <div className="font-medium text-sm">Allow Late Submissions</div>
                                        <div className="text-xs text-muted-foreground mt-0.5">
                                            Accept submissions after the due date
                                        </div>
                                    </div>
                                    <Switch
                                        checked={settings.allow_late_submission}
                                        onCheckedChange={(v) => updateSettings({ allow_late_submission: v })}
                                    />
                                </label>
                                {settings.allow_late_submission && (
                                    <div className="space-y-2 pt-3 border-t border-border/40">
                                        <Label htmlFor="late-due" className="text-sm text-muted-foreground">
                                            Late Due Date
                                        </Label>
                                        <Input
                                            id="late-due"
                                            type="datetime-local"
                                            className="h-10"
                                            value={settings.late_due_date}
                                            onChange={(e) => updateSettings({ late_due_date: e.target.value })}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Time Limit */}
                            <div
                                className={cn(
                                    "rounded-xl border p-4 space-y-3 transition-colors",
                                    settings.time_limit_enabled
                                        ? "border-primary/30 bg-primary/5"
                                        : "border-border/60",
                                )}
                            >
                                <label className="flex items-center justify-between cursor-pointer">
                                    <div>
                                        <div className="font-medium text-sm">Enable Time Limit</div>
                                        <div className="text-xs text-muted-foreground mt-0.5">
                                            Restrict to a fixed duration after the student opens the assignment
                                        </div>
                                    </div>
                                    <Switch
                                        checked={settings.time_limit_enabled}
                                        onCheckedChange={(v) => updateSettings({ time_limit_enabled: v })}
                                    />
                                </label>
                                {settings.time_limit_enabled && (
                                    <div className="flex items-center gap-3 pt-3 border-t border-border/40">
                                        <Input
                                            type="number"
                                            min={1}
                                            value={settings.time_limit_minutes ?? ""}
                                            onChange={(e) =>
                                                updateSettings({
                                                    time_limit_minutes:
                                                        e.target.value === "" ? null : Number(e.target.value),
                                                })
                                            }
                                            className="h-10 w-28"
                                        />
                                        <span className="text-sm text-muted-foreground">minutes</span>
                                    </div>
                                )}
                            </div>

                            {/* Group Submission */}
                            <label className="flex items-center justify-between p-4 rounded-xl border border-border/60 cursor-pointer hover:border-border transition-colors">
                                <div>
                                    <div className="font-medium text-sm">Group Submission</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                        Allow students to submit as a team (up to 5)
                                    </div>
                                </div>
                                <Switch
                                    checked={settings.group_submission}
                                    onCheckedChange={(v) => updateSettings({ group_submission: v })}
                                />
                            </label>

                            {/* Multiple Submissions */}
                            <label className="flex items-center justify-between p-4 rounded-xl border border-border/60 cursor-pointer hover:border-border transition-colors">
                                <div>
                                    <div className="font-medium text-sm">Enable Multiple Submissions</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                        Allow students to resubmit and improve their work
                                    </div>
                                </div>
                                <Switch
                                    checked={settings.multiple_submissions}
                                    onCheckedChange={(v) => updateSettings({ multiple_submissions: v })}
                                />
                            </label>
                        </div>
                    </div>
                )}

                {/* ════════════════════════════════════════════════════════
                    STEP 3 — RUBRIC
                ════════════════════════════════════════════════════════ */}
                {currentStep === 3 && (
                    <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">

                        {/* Toolbar */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                {/* Weight progress */}
                                <span className="text-sm">
                                    <span className="text-muted-foreground">Total: </span>
                                    <span
                                        className={cn(
                                            "font-bold",
                                            weightValid
                                                ? "text-emerald-600 dark:text-emerald-400"
                                                : totalWeight > 100
                                                    ? "text-red-500"
                                                    : "text-foreground",
                                        )}
                                    >
                                        {totalWeight} / 100%
                                    </span>
                                    {weightValid && (
                                        <span className="ml-1 text-emerald-500">✓</span>
                                    )}
                                </span>
                                <div className="h-2 w-28 rounded-full bg-muted overflow-hidden">
                                    <div
                                        className={cn(
                                            "h-full rounded-full transition-all duration-300",
                                            totalWeight > 100
                                                ? "bg-red-500"
                                                : weightValid
                                                    ? "bg-emerald-500"
                                                    : "bg-primary",
                                        )}
                                        style={{ width: `${Math.min(100, totalWeight)}%` }}
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                {/* Rubric Writing Guide */}
                                <Dialog>
                                    <DialogTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="gap-1.5 text-muted-foreground text-xs"
                                        >
                                            <Info className="h-3.5 w-3.5" />
                                            Writing Guide
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-lg">
                                        <DialogHeader>
                                            <DialogTitle>Rubric Writing Guidelines</DialogTitle>
                                        </DialogHeader>
                                        <div className="space-y-4 text-sm text-muted-foreground">
                                            <p>A well-written rubric gives the AI grading engine clear, objective expectations for each level of performance.</p>
                                            <ul className="space-y-2 list-disc list-inside">
                                                <li><strong>All weights must sum to exactly 100.</strong> Each criterion's weight reflects its share of the total grade.</li>
                                                <li><strong>Use concrete, observable descriptions</strong> for each band — avoid vague language like "good effort".</li>
                                                <li><strong>LLM mode</strong> uses GPT to evaluate code against your descriptions. Best for qualitative criteria like code quality or design.</li>
                                                <li><strong>LLM + AST mode</strong> enriches LLM evaluation with structural code analysis — ideal for correctness and complexity criteria.</li>
                                                <li><strong>Deterministic mode</strong> relies entirely on test case output matching. Use for exact-output problems.</li>
                                                <li><strong>Band ranges</strong> define what percentage of the criterion's weight a submission receives (e.g. 85–100% of the criterion weight for Excellent).</li>
                                            </ul>
                                        </div>
                                    </DialogContent>
                                </Dialog>

                                <Button variant="outline" size="sm" onClick={addCriterion} type="button">
                                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                                    Add Criterion
                                </Button>
                            </div>
                        </div>

                        {/* Criteria list */}
                        {criteria.length === 0 ? (
                            <div className="border border-dashed border-border/60 rounded-xl p-10 text-center text-muted-foreground bg-muted/5">
                                <p className="text-sm">No criteria yet. Add your first criterion above.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {criteria.map((c, idx) => (
                                    <RubricCriterionBlock
                                        key={c.id}
                                        criterion={c}
                                        isExpanded={expandedCriterionId === c.id}
                                        isFirst={idx === 0}
                                        isLast={idx === criteria.length - 1}
                                        onToggle={() =>
                                            setExpandedCriterionId(
                                                expandedCriterionId === c.id ? null : c.id,
                                            )
                                        }
                                        onChange={(updated) => updateCriterion(c.id, updated)}
                                        onRemove={() => removeCriterion(c.id)}
                                        onMoveUp={() => moveCriterion(c.id, "up")}
                                        onMoveDown={() => moveCriterion(c.id, "down")}
                                    />
                                ))}
                            </div>
                        )}

                        {!weightValid && criteria.length > 0 && (
                            <p className="text-xs text-red-500 flex items-center gap-1.5">
                                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                Criteria weights must sum to 100% before proceeding.
                                Currently {totalWeight > 100 ? "over" : "under"} by{" "}
                                {Math.abs(100 - totalWeight)}%.
                            </p>
                        )}
                    </div>
                )}

                {/* ════════════════════════════════════════════════════════
                    STEP 4 — TEST CASES
                ════════════════════════════════════════════════════════ */}
                {currentStep === 4 && (
                    <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">

                        {/* Toolbar */}
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-muted-foreground">
                                {testCases.length === 0
                                    ? "No test cases yet. Test cases enable automated grading."
                                    : `${testCases.length} test case${testCases.length !== 1 ? "s" : ""} defined`}
                            </p>
                            <div className="flex items-center gap-2">
                                {/* Test Case Writing Guide */}
                                <Dialog>
                                    <DialogTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="gap-1.5 text-muted-foreground text-xs"
                                        >
                                            <Info className="h-3.5 w-3.5" />
                                            Writing Guide
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-lg">
                                        <DialogHeader>
                                            <DialogTitle>Test Case Writing Guidelines</DialogTitle>
                                        </DialogHeader>
                                        <div className="space-y-4 text-sm text-muted-foreground">
                                            <p>Test cases are run via <strong>Judge0</strong> — each test case sends your input to the student's code via stdin and compares stdout to your expected output.</p>
                                            <ul className="space-y-2 list-disc list-inside">
                                                <li><strong>Input format</strong>: exactly what the program reads from stdin. One value per line for multiple inputs.</li>
                                                <li><strong>Expected output</strong>: exact stdout expected, including newlines. Trailing whitespace is ignored during comparison.</li>
                                                <li><strong>Edge cases matter</strong>: include boundary inputs (empty input, maximum values, invalid data).</li>
                                                <li><strong>Start with simple cases</strong>, then add complexity. Test case #1 should validate basic functionality.</li>
                                                <li>Use the <em>Sample Answer</em> step to verify your test cases are correct before publishing.</li>
                                            </ul>
                                        </div>
                                    </DialogContent>
                                </Dialog>

                                <Button variant="outline" size="sm" onClick={addTestCase} type="button">
                                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                                    Add Test Case
                                </Button>
                            </div>
                        </div>

                        {/* Test case list */}
                        {testCases.length > 0 && (
                            <div className="space-y-3">
                                {testCases.map((tc) => (
                                    <TestCaseBlock
                                        key={tc.test_case_id}
                                        testCase={tc}
                                        isExpanded={expandedTestCaseId === tc.test_case_id}
                                        onToggle={() =>
                                            setExpandedTestCaseId(
                                                expandedTestCaseId === tc.test_case_id
                                                    ? null
                                                    : tc.test_case_id,
                                            )
                                        }
                                        onChange={(updated) => updateTestCase(tc.test_case_id, updated)}
                                        onRemove={() => removeTestCase(tc.test_case_id)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ════════════════════════════════════════════════════════
                    STEP 5 — SAMPLE ANSWER
                ════════════════════════════════════════════════════════ */}
                {currentStep === 5 && (
                    <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">

                        {/* Language + Run bar */}
                        <div className="bg-card border border-border/60 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                            <div className="flex-1 space-y-1.5">
                                <Label className="text-sm font-semibold">Language</Label>
                                <LanguageSelector
                                    value={sampleAnswer.language_id}
                                    allowedIds={ALLOWED_LANGUAGE_IDS}
                                    onChange={(id) => updateSampleAnswer({ language_id: id })}
                                />
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                disabled={isRunning || !sampleAnswer.code.trim() || testCases.length === 0}
                                onClick={runSampleAnswer}
                                className="shrink-0 gap-2 self-end sm:self-auto sm:mt-6"
                            >
                                {isRunning ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Running…
                                    </>
                                ) : (
                                    <>
                                        <Play className="h-4 w-4" />
                                        Run against test cases
                                    </>
                                )}
                            </Button>
                        </div>

                        {testCases.length === 0 && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1.5 px-1">
                                <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                No test cases defined — add them in Step 4 to enable the run feature.
                            </p>
                        )}

                        {/* Code editor */}
                        <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 bg-muted/20">
                                <span className="text-xs font-medium text-muted-foreground">
                                    Reference implementation
                                </span>
                                <span className="text-xs text-muted-foreground">Ctrl+Enter to run</span>
                            </div>
                            <div className="h-[420px]">
                                <EditorPanel
                                    value={sampleAnswer.code}
                                    onChange={(v) => updateSampleAnswer({ code: v })}
                                    language={sampleAnswer.language_id}
                                    fontSize={14}
                                    theme={editorTheme}
                                    onRun={runSampleAnswer}
                                />
                            </div>
                        </div>

                        {/* Test case results */}
                        {testResults.length > 0 && (
                            <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
                                <div className="flex items-center justify-between px-5 py-3 border-b border-border/40">
                                    <span className="text-sm font-semibold">Test Results</span>
                                    <span className="text-xs text-muted-foreground">
                                        {testResults.filter((r) => r.passed).length}/{testResults.length} passed
                                    </span>
                                </div>
                                <div className="divide-y divide-border/40">
                                    {testResults.map((r) => {
                                        const tc = testCases.find((t) => t.test_case_id === r.test_case_id);
                                        return (
                                            <div
                                                key={r.test_case_id}
                                                className="flex items-start gap-4 px-5 py-3"
                                            >
                                                {r.passed ? (
                                                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                                                ) : (
                                                    <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                                                )}
                                                <div className="flex-1 min-w-0 space-y-1">
                                                    <p className="text-sm font-medium">
                                                        Test #{r.test_case_id}
                                                        {tc?.description && (
                                                            <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                                                                {tc.description}
                                                            </span>
                                                        )}
                                                    </p>
                                                    {!r.passed && (
                                                        <div className="grid grid-cols-2 gap-3 mt-2">
                                                            <div>
                                                                <p className="text-xs text-muted-foreground mb-1">Expected</p>
                                                                <pre className="text-xs font-mono bg-muted/40 rounded p-2 whitespace-pre-wrap break-all">
                                                                    {tc?.expected_output || "(empty)"}
                                                                </pre>
                                                            </div>
                                                            <div>
                                                                <p className="text-xs text-muted-foreground mb-1">Got</p>
                                                                <pre className="text-xs font-mono bg-destructive/5 text-destructive rounded p-2 whitespace-pre-wrap break-all">
                                                                    {r.error || r.actual_output || r.status.description}
                                                                </pre>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="text-xs text-muted-foreground shrink-0">
                                                    {r.time ? `${r.time}s` : ""}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ════════════════════════════════════════════════════════
                    STEP 6 — REVIEW & PUBLISH
                ════════════════════════════════════════════════════════ */}
                {currentStep === 6 && (
                    <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">

                        {submitError && (
                            <div className="flex gap-2 p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive text-sm font-medium">
                                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                                <span>{submitError}</span>
                            </div>
                        )}

                        {/* Assignment Details */}
                        <ReviewCard
                            title="Assignment Details"
                            onEdit={() => setStep(1)}
                        >
                            <ReviewRow label="Name" value={assignment.name || "—"} />
                            <ReviewRow
                                label="Type"
                                value={
                                    <Badge variant="outline" className="capitalize">
                                        {assignment.type}
                                    </Badge>
                                }
                            />
                            {assignment.description && (
                                <ReviewRow
                                    label="Description"
                                    value={
                                        <span className="text-sm line-clamp-3 text-muted-foreground">
                                            {assignment.description}
                                        </span>
                                    }
                                />
                            )}
                            {assignment.objective && (
                                <ReviewRow
                                    label="Objective"
                                    value={
                                        <span className="text-sm line-clamp-3 text-muted-foreground">
                                            {assignment.objective}
                                        </span>
                                    }
                                />
                            )}
                        </ReviewCard>

                        {/* Settings */}
                        <ReviewCard title="Assignment Settings" onEdit={() => setStep(2)}>
                            <ReviewRow
                                label="Release"
                                value={
                                    settings.release_date
                                        ? new Date(settings.release_date).toLocaleString()
                                        : "Immediate"
                                }
                            />
                            <ReviewRow
                                label="Due Date"
                                value={
                                    settings.due_date
                                        ? new Date(settings.due_date).toLocaleString()
                                        : "No deadline"
                                }
                            />
                            <ReviewRow
                                label="Late Submissions"
                                value={settings.allow_late_submission ? "Allowed" : "Not allowed"}
                            />
                            <ReviewRow
                                label="Time Limit"
                                value={
                                    settings.time_limit_enabled && settings.time_limit_minutes
                                        ? `${settings.time_limit_minutes} min`
                                        : "None"
                                }
                            />
                            <ReviewRow
                                label="Group Submission"
                                value={settings.group_submission ? "Enabled (up to 5)" : "Disabled"}
                            />
                            <ReviewRow
                                label="Multiple Submissions"
                                value={settings.multiple_submissions ? "Enabled" : "Disabled"}
                            />
                        </ReviewCard>

                        {/* Rubric */}
                        <ReviewCard
                            title="Rubric"
                            onEdit={() => setStep(3)}
                            badge={
                                weightValid ? (
                                    <Badge className="bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border-0 text-xs">
                                        100%
                                    </Badge>
                                ) : (
                                    <Badge variant="destructive" className="text-xs">
                                        {totalWeight}% / 100%
                                    </Badge>
                                )
                            }
                        >
                            {criteria.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No criteria defined.</p>
                            ) : (
                                <div className="space-y-2">
                                    {criteria.map((c) => (
                                        <div
                                            key={c.id}
                                            className="flex items-center justify-between text-sm bg-muted/20 px-3 py-2 rounded-lg"
                                        >
                                            <span className="font-medium">{c.name || "Unnamed"}</span>
                                            <div className="flex items-center gap-2">
                                                <Badge variant="secondary" className="text-[10px] uppercase">
                                                    {c.grading_mode.replace("_", "+")}
                                                </Badge>
                                                <Badge variant="outline" className="font-mono text-xs">
                                                    {c.weight}%
                                                </Badge>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </ReviewCard>

                        {/* Test Cases */}
                        <ReviewCard title="Test Cases" onEdit={() => setStep(4)}>
                            {testCases.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No test cases defined.</p>
                            ) : (
                                <p className="text-sm">
                                    {testCases.length} test case{testCases.length !== 1 ? "s" : ""} defined.
                                </p>
                            )}
                        </ReviewCard>

                        {/* Sample Answer */}
                        <ReviewCard title="Sample Answer" onEdit={() => setStep(5)}>
                            {sampleAnswer.code.trim() ? (
                                <p className="text-sm text-muted-foreground">
                                    {sampleAnswer.code.trim().split("\n").length} lines of code.
                                </p>
                            ) : (
                                <p className="text-sm text-muted-foreground">No sample answer provided.</p>
                            )}
                        </ReviewCard>
                    </div>
                )}
            </div>

            {/* ── Bottom navigation ── */}
            <div className="py-6 flex items-center justify-between sticky bottom-0 bg-background/95 backdrop-blur border-t border-border/40 mt-8">
                <Button
                    variant="outline"
                    type="button"
                    onClick={
                        currentStep === 1
                            ? () => router.push(`/instructor/courses/${instanceId}/assignments`)
                            : handleBack
                    }
                    disabled={isSubmitting}
                    className="h-11 px-8 rounded-full"
                >
                    {currentStep === 1 ? "Cancel" : "Back"}
                </Button>

                <div className="flex items-center gap-3">
                    {/* Save draft — available from step 2 onwards */}
                    {currentStep >= 2 && (
                        <Button
                            variant="ghost"
                            type="button"
                            onClick={handleSaveDraft}
                            className="h-11 px-5 rounded-full gap-2 text-muted-foreground hover:text-foreground"
                        >
                            <Save className="h-4 w-4" />
                            Save Draft
                        </Button>
                    )}

                    {currentStep < steps.length ? (
                        <Button
                            type="button"
                            onClick={handleNext}
                            disabled={nextDisabled}
                            className="h-11 px-8 rounded-full min-w-[120px]"
                        >
                            Next Step
                        </Button>
                    ) : (
                        <Button
                            type="button"
                            onClick={handlePublish}
                            disabled={isSubmitting || !weightValid || !assignment.name.trim()}
                            className="h-11 px-8 rounded-full min-w-[160px]"
                        >
                            {isSubmitting ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                                "Publish Assignment"
                            )}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Review card helper components ───────────────────────────────────────────

function ReviewCard({
    title,
    children,
    onEdit,
    badge,
}: {
    title: string;
    children: React.ReactNode;
    onEdit: () => void;
    badge?: React.ReactNode;
}) {
    return (
        <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/40 bg-muted/20">
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{title}</span>
                    {badge}
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onEdit}
                    className="h-7 px-3 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                >
                    <Pencil className="h-3 w-3" />
                    Edit
                </Button>
            </div>
            <div className="px-5 py-4 space-y-2">{children}</div>
        </div>
    );
}

function ReviewRow({
    label,
    value,
}: {
    label: string;
    value: React.ReactNode;
}) {
    return (
        <div className="flex items-start gap-4 text-sm">
            <span className="text-muted-foreground w-36 shrink-0">{label}</span>
            <span className="font-medium flex-1">{value}</span>
        </div>
    );
}
