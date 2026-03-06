"use client";

import * as React from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAssignmentCreateStore } from "@/lib/stores/assignmentCreateStore";
import { useUIStore } from "@/lib/stores/uiStore";
import { instructorAssessmentsApi } from "@/lib/api/assessments";
import { handleApiError } from "@/lib/api/axios";
import { cn } from "@/lib/utils";
import { MultiSelectTagInput } from "@/components/instructor/multi-select-tag-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2, CheckCircle2, Eye, AlertCircle } from "lucide-react";

const ASSESSMENT_TYPES = ["Homework", "Quiz", "Midterm", "Final Exam", "Lab", "Project", "Assignment"];

interface RubricCriterion {
    id: string;
    name: string;
    description: string;
    weight: number;
}

interface ToolConfig {
    acafs: boolean;
    cipas: boolean;
    blaim: boolean;
    vivaVoce: boolean;
}

export default function CreateAssignmentPage() {
    const router = useRouter();
    const params = useParams();
    const instanceId = params.instanceId as string;

    const { currentStep, steps, setStep, setHighestStepVisited, reset } = useAssignmentCreateStore();
    const pushSecondarySidebar = useUIStore((s) => s.pushSecondarySidebar);
    const popSecondarySidebar = useUIStore((s) => s.popSecondarySidebar);
    const setPageTitle = useUIStore((s) => s.setPageTitle);

    // On mount, ensure we start at step 1
    React.useEffect(() => {
        reset();
        return () => reset(); // Cleanup on unmount
    }, [reset]);

    // Override the course sidebar with steps progress sidebar
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

    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [submitError, setSubmitError] = React.useState<string | null>(null);
    const [confirmed, setConfirmed] = React.useState(false);

    // Step 1: Basic Info
    const [title, setTitle] = React.useState("");
    const [assessmentType, setAssessmentType] = React.useState("Homework");
    const [description, setDescription] = React.useState("");

    // Step 2: Configuration
    const [deadline, setDeadline] = React.useState("");
    const [timeLimitMinutes, setTimeLimitMinutes] = React.useState<number | "">("");
    const [groupSubmission, setGroupSubmission] = React.useState(false);
    const [allowLateSubmissions, setAllowLateSubmissions] = React.useState(false);

    // Step 3: Tools Selection
    const [tools, setTools] = React.useState<ToolConfig>({
        acafs: false,
        cipas: false,
        blaim: false,
        vivaVoce: false,
    });

    // Step 4: Grading Settings
    const [rubricCriteria, setRubricCriteria] = React.useState<RubricCriterion[]>([
        { id: "1", name: "Correctness", description: "Accuracy of the solution.", weight: 60 },
        { id: "2", name: "Code Quality", description: "Readability and structure.", weight: 40 },
    ]);
    const [sampleAnswer, setSampleAnswer] = React.useState("");
    const [assignedTAs, setAssignedTAs] = React.useState<string[]>([]);
    const [assignedInstructors, setAssignedInstructors] = React.useState<string[]>([]);

    const totalWeight = rubricCriteria.reduce((acc, c) => acc + (Number(c.weight) || 0), 0);
    const weightValid = totalWeight === 100;

    const addCriterion = () => {
        setRubricCriteria((prev) => [
            ...prev,
            { id: Math.random().toString(36).slice(2), name: "", description: "", weight: 0 },
        ]);
    };

    const updateCriterion = (id: string, field: keyof RubricCriterion, value: any) => {
        setRubricCriteria((prev) =>
            prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
        );
    };

    const removeCriterion = (id: string) => {
        setRubricCriteria((prev) => prev.filter((c) => c.id !== id));
    };

    const handleNext = () => {
        if (currentStep < steps.length) {
            setStep(currentStep + 1);
            setHighestStepVisited(currentStep + 1);
        }
    };

    const handleBack = () => {
        if (currentStep > 1) {
            setStep(currentStep - 1);
        }
    };

    const handleSubmit = async () => {
        if (!confirmed) return;
        setIsSubmitting(true);
        setSubmitError(null);
        try {
            const result = await instructorAssessmentsApi.createAssignment({
                course_instance_id: instanceId,
                title: title.trim(),
                description: description.trim(),
                code: title.trim().toLowerCase().replace(/\s+/g, "-"),
                due_at: deadline ? new Date(deadline).toISOString() : null,
                allow_late_submissions: allowLateSubmissions,
                enforce_time_limit: timeLimitMinutes ? Number(timeLimitMinutes) * 60 : null,
                allow_group_submission: groupSubmission,
                max_group_size: groupSubmission ? 5 : null,
                enable_ai_assistant: tools.acafs || tools.cipas,
                enable_socratic_feedback: tools.cipas,
                allow_regenerate: false,
            });
            router.push(`/instructor/courses/${instanceId}/assignments/${result.id}`);
        } catch (err) {
            setSubmitError(handleApiError(err));
        } finally {
            setIsSubmitting(false);
        }
    };

    const staffOptions = [
        { label: "Dr. Ahmed Khan", value: "usr-001" },
        { label: "Prof. Sara Ali", value: "usr-002" },
        { label: "TA Hassan Raza", value: "usr-003" },
        { label: "TA Fatima Sheikh", value: "usr-004" },
    ];

    const enabledTools = Object.entries(tools)
        .filter(([, v]) => v)
        .map(([k]) => {
            const map: Record<string, string> = {
                acafs: "ACAFS",
                cipas: "CIPAS",
                blaim: "BLAIM",
                vivaVoce: "Viva VOCE",
            };
            return map[k];
        });

    return (
        <div className="max-w-4xl mx-auto w-full flex flex-col min-h-[calc(100vh-140px)] animate-in fade-in duration-300">
            <div className="mb-8">
                <h1 className="text-2xl font-bold font-heading tracking-tight">Create Assignment</h1>
                <p className="text-muted-foreground text-sm mt-1">
                    Step {currentStep} of {steps.length}: {steps[currentStep - 1]?.title}
                </p>
            </div>

            <div className="flex-1 bg-card border border-border/60 shadow-sm rounded-xl overflow-hidden p-6 md:p-8 relative">

                {/* ── Step 1: Basic Info ───────────────────────────── */}
                {currentStep === 1 && (
                    <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                        <div className="space-y-2">
                            <Label htmlFor="title" className="text-base font-semibold">
                                Assignment Title <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="title"
                                className="h-11"
                                placeholder="e.g. Midterm Project Part 1"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="type" className="text-base font-semibold">Assessment Type</Label>
                            <Select value={assessmentType} onValueChange={setAssessmentType}>
                                <SelectTrigger id="type" className="h-11">
                                    <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                                <SelectContent>
                                    {ASSESSMENT_TYPES.map((t) => (
                                        <SelectItem key={t} value={t}>
                                            {t}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description" className="text-base font-semibold">Description / Instructions</Label>
                            <Textarea
                                id="description"
                                placeholder="Provide instructions or context for students..."
                                className="min-h-[150px] resize-y"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                            />
                        </div>
                    </div>
                )}

                {/* ── Step 2: Configuration ───────────────────────────── */}
                {currentStep === 2 && (
                    <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                        <div className="grid sm:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="deadline" className="text-base font-semibold">Deadline</Label>
                                <Input
                                    id="deadline"
                                    type="datetime-local"
                                    className="h-11"
                                    value={deadline}
                                    onChange={(e) => setDeadline(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="time-limit" className="text-base font-semibold">Time Limit</Label>
                                <div className="flex items-center gap-3">
                                    <Input
                                        id="time-limit"
                                        type="number"
                                        min={0}
                                        placeholder="e.g. 90"
                                        value={timeLimitMinutes}
                                        onChange={(e) =>
                                            setTimeLimitMinutes(e.target.value === "" ? "" : Number(e.target.value))
                                        }
                                        className="h-11 flex-1"
                                    />
                                    <span className="text-sm text-muted-foreground whitespace-nowrap">min</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <label className="flex items-start gap-4 p-4 border border-border/60 rounded-xl bg-muted/20 cursor-pointer hover:border-primary/40 transition-colors">
                                <Switch
                                    checked={groupSubmission}
                                    onCheckedChange={setGroupSubmission}
                                    className="mt-1 shrink-0"
                                />
                                <div>
                                    <div className="font-semibold">Group Submission</div>
                                    <div className="text-sm text-muted-foreground">Allow students to submit in teams of up to 5</div>
                                </div>
                            </label>

                            <label className="flex items-start gap-4 p-4 border border-border/60 rounded-xl bg-muted/20 cursor-pointer hover:border-primary/40 transition-colors">
                                <Switch
                                    checked={allowLateSubmissions}
                                    onCheckedChange={setAllowLateSubmissions}
                                    className="mt-1 shrink-0"
                                />
                                <div>
                                    <div className="font-semibold">Late Submissions</div>
                                    <div className="text-sm text-muted-foreground">Accept submissions after the deadline</div>
                                </div>
                            </label>
                        </div>
                    </div>
                )}

                {/* ── Step 3: Tools Selection ───────────────────────────── */}
                {currentStep === 3 && (
                    <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                        <p className="text-muted-foreground mb-4">Select the AI-assisted tools to enable for this assignment.</p>

                        <div className="grid gap-4 sm:grid-cols-2">
                            {(
                                [
                                    {
                                        key: "acafs" as keyof ToolConfig,
                                        label: "ACAFS",
                                        desc: "Automated Code Analysis & Feedback System",
                                        status: "Available"
                                    },
                                    {
                                        key: "cipas" as keyof ToolConfig,
                                        label: "CIPAS",
                                        desc: "Code Integrity & Plagiarism Analysis System",
                                        status: "Available"
                                    },
                                    {
                                        key: "blaim" as keyof ToolConfig,
                                        label: "BLAIM",
                                        desc: "Behavioral Learning & Integrity Assessment Module",
                                        status: "Beta"
                                    },
                                    {
                                        key: "vivaVoce" as keyof ToolConfig,
                                        label: "Viva VOCE",
                                        desc: "AI-powered oral assessment integration",
                                        status: "Alpha"
                                    },
                                ] as const
                            ).map((tool) => (
                                <label key={tool.key} className={cn(
                                    "flex flex-col p-5 border rounded-xl transition-colors cursor-pointer relative",
                                    tools[tool.key] ? "border-primary bg-primary/5 shadow-sm" : "border-border/60 hover:border-border bg-card"
                                )}>
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold">{tool.label}</span>
                                            {tool.status !== "Available" && (
                                                <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">{tool.status}</Badge>
                                            )}
                                        </div>
                                        <Switch
                                            checked={tools[tool.key]}
                                            onCheckedChange={(v) =>
                                                setTools((prev) => ({ ...prev, [tool.key]: v }))
                                            }
                                        />
                                    </div>
                                    <p className="text-sm text-muted-foreground">{tool.desc}</p>
                                </label>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Step 4: Grading Settings ───────────────────────────── */}
                {currentStep === 4 && (
                    <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                        {/* Rubric */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Label className="text-base font-semibold">Grading Rubric</Label>
                                <Button variant="outline" size="sm" onClick={addCriterion} type="button">
                                    <Plus className="mr-2 h-4 w-4" /> Add Criterion
                                </Button>
                            </div>

                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Total Weight</span>
                                    <span className={weightValid ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-red-500 dark:text-red-400 font-bold"}>
                                        {totalWeight}% / 100%
                                        {weightValid ? " ✓" : " — must equal 100%"}
                                    </span>
                                </div>
                                <div className="h-2 rounded-full bg-muted overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-300 ${totalWeight > 100
                                            ? "bg-red-500"
                                            : weightValid
                                                ? "bg-emerald-500"
                                                : "bg-primary"
                                            }`}
                                        style={{ width: `${Math.min(100, totalWeight)}%` }}
                                    />
                                </div>
                            </div>

                            {rubricCriteria.length === 0 ? (
                                <div className="border border-dashed border-border/60 rounded-xl p-8 text-center text-muted-foreground bg-muted/5">
                                    No criteria yet. Add your first criterion above.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {rubricCriteria.map((criterion) => (
                                        <div
                                            key={criterion.id}
                                            className="p-4 border border-border/60 rounded-xl bg-card/50 space-y-3 relative group transition-colors hover:border-border"
                                        >
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                type="button"
                                                className="absolute top-2 right-2 h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive hover:bg-destructive/10"
                                                onClick={() => removeCriterion(criterion.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                            <div className="grid grid-cols-[1fr_100px] gap-4">
                                                <div className="space-y-1.5">
                                                    <Label className="text-xs text-muted-foreground">Criterion Name</Label>
                                                    <Input
                                                        placeholder="e.g. Correctness"
                                                        value={criterion.name}
                                                        onChange={(e) =>
                                                            updateCriterion(criterion.id, "name", e.target.value)
                                                        }
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label className="text-xs text-muted-foreground">Weight %</Label>
                                                    <Input
                                                        type="number"
                                                        min={0}
                                                        max={100}
                                                        value={criterion.weight}
                                                        onChange={(e) =>
                                                            updateCriterion(criterion.id, "weight", Number(e.target.value))
                                                        }
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className="text-xs text-muted-foreground">Description</Label>
                                                <Input
                                                    placeholder="What does a full-score look like?"
                                                    value={criterion.description}
                                                    onChange={(e) =>
                                                        updateCriterion(criterion.id, "description", e.target.value)
                                                    }
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Sample Answer */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label className="text-base font-semibold">Sample Answer</Label>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    type="button"
                                    disabled
                                    className="text-xs text-muted-foreground bg-muted/20"
                                >
                                    <Eye className="mr-2 h-3 w-3" />
                                    Autograder Preview (Coming Soon)
                                </Button>
                            </div>
                            <Textarea
                                placeholder="Provide a model answer or reference solution for autograding..."
                                className="min-h-[120px] resize-y font-mono text-sm"
                                value={sampleAnswer}
                                onChange={(e) => setSampleAnswer(e.target.value)}
                            />
                        </div>

                        {/* Assign Staff */}
                        <div className="space-y-4 pt-4 border-t border-border/50">
                            <Label className="text-base font-semibold">Staff Assignment</Label>
                            <div className="grid sm:grid-cols-2 gap-4 text-sm">
                                <div className="space-y-2">
                                    <Label className="text-muted-foreground">Teaching Assistants</Label>
                                    <MultiSelectTagInput
                                        options={staffOptions}
                                        value={assignedTAs}
                                        onChange={setAssignedTAs}
                                        placeholder="Select TAs..."
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-muted-foreground">Additional Instructors</Label>
                                    <MultiSelectTagInput
                                        options={staffOptions}
                                        value={assignedInstructors}
                                        onChange={setAssignedInstructors}
                                        placeholder="Select instructors..."
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Step 5: Review & Confirm ────────────────────────── */}
                {currentStep === 5 && (
                    <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                        {submitError && (
                            <div className="flex gap-2 p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive text-sm font-medium">
                                <AlertCircle className="h-5 w-5 shrink-0" />
                                <span>{submitError}</span>
                            </div>
                        )}

                        <div className="space-y-6">
                            {/* General */}
                            <div>
                                <h3 className="text-lg font-bold font-heading mb-3 border-b border-border/40 pb-2">1. General Details</h3>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-muted-foreground">Title</span>
                                        <span className="font-semibold">{title || "—"}</span>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-muted-foreground">Type</span>
                                        <span className="font-semibold">{assessmentType}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Config */}
                            <div>
                                <h3 className="text-lg font-bold font-heading mb-3 border-b border-border/40 pb-2">2. Configuration</h3>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-muted-foreground">Deadline</span>
                                        <span className="font-semibold">{deadline ? new Date(deadline).toLocaleString() : "None"}</span>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-muted-foreground">Time Limit</span>
                                        <span className="font-semibold">{timeLimitMinutes ? `${timeLimitMinutes} min` : "No limit"}</span>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-muted-foreground">Group Submission</span>
                                        <span className="font-semibold">{groupSubmission ? "Yes" : "No"}</span>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-muted-foreground">Late Submission</span>
                                        <span className="font-semibold">{allowLateSubmissions ? "Yes" : "No"}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Tools */}
                            <div>
                                <h3 className="text-lg font-bold font-heading mb-3 border-b border-border/40 pb-2">3. Tools</h3>
                                <div className="flex flex-wrap gap-2">
                                    {enabledTools.length === 0 ? (
                                        <span className="text-sm text-muted-foreground">No tools enabled.</span>
                                    ) : (
                                        enabledTools.map((t) => (
                                            <Badge key={t} className="bg-primary/10 text-primary border-primary/20 font-semibold">{t}</Badge>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Grading */}
                            <div>
                                <div className="flex items-center justify-between border-b border-border/40 pb-2 mb-3">
                                    <h3 className="text-lg font-bold font-heading">4. Grading</h3>
                                    <span className={`text-sm font-bold ${weightValid ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                                        Total Weight: {totalWeight}%
                                    </span>
                                </div>
                                <div className="space-y-2">
                                    {rubricCriteria.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">No criteria.</p>
                                    ) : (
                                        rubricCriteria.map((c) => (
                                            <div key={c.id} className="flex items-center justify-between text-sm bg-muted/20 p-2 rounded-lg">
                                                <span className="font-medium">{c.name || "Unnamed"}</span>
                                                <Badge variant="outline" className="font-mono text-xs">{c.weight}%</Badge>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 pt-6 border-t border-border/60">
                            <label className="flex items-start gap-4 p-5 rounded-xl border border-primary/20 bg-primary/5 cursor-pointer">
                                <Checkbox
                                    checked={confirmed}
                                    onCheckedChange={(v) => setConfirmed(v === true)}
                                    className="mt-1 h-5 w-5 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                />
                                <div>
                                    <div className="font-semibold text-lg">Ready to Publish</div>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        I confirm that the assignment details, rubric, and configuration above are correct.
                                        Once published, students will be notified according to the course settings.
                                    </p>
                                </div>
                            </label>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Actions Bar */}
            <div className="py-6 flex items-center justify-between sticky bottom-0 bg-background/95 backdrop-blur mt-auto">
                <Button
                    variant="outline"
                    type="button"
                    onClick={currentStep === 1 ? () => router.push(`/instructor/courses/${instanceId}/assignments`) : handleBack}
                    disabled={isSubmitting}
                    className="h-11 px-8 rounded-full"
                >
                    {currentStep === 1 ? "Cancel" : "Back"}
                </Button>

                <Button
                    type="button"
                    onClick={currentStep === 5 ? handleSubmit : handleNext}
                    disabled={
                        isSubmitting ||
                        (currentStep === 1 && !title.trim()) ||
                        (currentStep === 4 && !weightValid) ||
                        (currentStep === 5 && !confirmed)
                    }
                    className="h-11 px-8 rounded-full min-w-[140px]"
                >
                    {isSubmitting ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                    ) : currentStep === 5 ? (
                        "Create Assignment"
                    ) : (
                        "Next Step"
                    )}
                </Button>
            </div>
        </div>
    );
}
