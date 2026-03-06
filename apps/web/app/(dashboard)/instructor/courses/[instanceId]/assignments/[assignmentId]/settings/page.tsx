"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { instructorAssessmentsApi } from "@/lib/api/assessments";
import type { AssignmentResponse } from "@/types/assessments.types";
import { handleApiError } from "@/lib/api/axios";
import { Settings2, Save, AlertTriangle, CheckCircle2 } from "lucide-react";
import { SectionHeader } from "@/components/instructor/section-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function AssignmentSettingsPage() {
    const params = useParams();
    const router = useRouter();
    const assignmentId = params.assignmentId as string;
    const instanceId = params.instanceId as string;

    const [assignment, setAssignment] = React.useState<AssignmentResponse | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const [isSaving, setIsSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);

    // Form states
    const [title, setTitle] = React.useState("");
    const [description, setDescription] = React.useState("");
    const [totalMarks, setTotalMarks] = React.useState(100);
    const [allowSubmissions, setAllowSubmissions] = React.useState(false);
    const [deadline, setDeadline] = React.useState("");
    const [timeLimitMinutes, setTimeLimitMinutes] = React.useState<number | "">("");
    const [groupSubmission, setGroupSubmission] = React.useState(false);
    const [enableAcafs, setEnableAcafs] = React.useState(false);
    const [enableCipas, setEnableCipas] = React.useState(false);
    const [enableBlaim, setEnableBlaim] = React.useState(false);
    const [enableVivaVoce, setEnableVivaVoce] = React.useState(false);

    React.useEffect(() => {
        let mounted = true;

        async function fetchAssignment() {
            try {
                setIsLoading(true);
                const all = await instructorAssessmentsApi.listMyAssignments();
                const found = all.find((a) => a.id === assignmentId);

                if (mounted && found) {
                    setAssignment(found);
                    setTitle(found.title);
                    setDescription(found.description || "");
                    setTotalMarks(found.total_marks ?? 100);
                    setAllowSubmissions(found.submission_config?.submission_allowed ?? false);
                    setGroupSubmission(found.allow_group_submission ?? false);
                    setTimeLimitMinutes(
                        found.enforce_time_limit ? Math.round(found.enforce_time_limit / 60) : ""
                    );
                    setEnableAcafs(found.enable_ai_assistant ?? false);
                    setEnableCipas(found.enable_socratic_feedback ?? false);

                    if (found.due_at) {
                        const d = new Date(found.due_at);
                        const tzOffset = d.getTimezoneOffset() * 60000;
                        const localISOTime = new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
                        setDeadline(localISOTime);
                    }
                }
            } catch (err) {
                if (mounted) setError(handleApiError(err));
            } finally {
                if (mounted) setIsLoading(false);
            }
        }

        if (assignmentId) fetchAssignment();

        return () => {
            mounted = false;
        };
    }, [assignmentId]);

    const handleSave = async () => {
        try {
            setIsSaving(true);
            setError(null);
            // TODO: Use real update endpoint when available
            // await instructorAssessmentsApi.updateAssignment(assignmentId, { ... })
            await new Promise((resolve) => setTimeout(resolve, 1000));
            alert("Settings saved successfully (mock)");
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        try {
            setIsSaving(true);
            // TODO: Use real delete endpoint when available
            await new Promise((resolve) => setTimeout(resolve, 1000));
            router.push(`/instructor/courses/${instanceId}`);
        } catch (err) {
            setError(handleApiError(err));
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="p-8 text-center text-muted-foreground animate-pulse">
                <Skeleton className="h-8 w-48 mx-auto mb-4 rounded-md" />
                <Skeleton className="h-6 w-full max-w-lg mx-auto mb-3 rounded-md" />
                <Skeleton className="h-6 w-full max-w-lg mx-auto rounded-md" />
            </div>
        );
    }

    const enabledTools = [];
    if (enableAcafs) enabledTools.push("ACAFS");
    if (enableCipas) enabledTools.push("CIPAS");
    if (enableBlaim) enabledTools.push("BLAIM");
    if (enableVivaVoce) enabledTools.push("Viva VOCE");

    return (
        <div className="flex flex-col gap-8 pb-8 h-full max-w-3xl">
            <SectionHeader
                title="Settings"
                description="Manage the configuration, deadlines, and parameters for this assignment."
                icon={Settings2}
                action={
                    <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                        ) : (
                            <><Save className="mr-2 h-4 w-4" /> Save Changes</>
                        )}
                    </Button>
                }
            />

            {error && (
                <div className="flex gap-3 p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive text-sm">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                </div>
            )}

            <div className="space-y-6">
                {/* General Information */}
                <section className="space-y-4">
                    <h3 className="font-bold font-heading text-lg border-b border-border/40 pb-2">General Information</h3>

                    <div className="space-y-2">
                        <Label htmlFor="title">Assignment Title</Label>
                        <Input
                            id="title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Description (Markdown Supported)</Label>
                        <Textarea
                            id="description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="min-h-[120px] resize-none"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="marks">Total Marks</Label>
                            <Input
                                id="marks"
                                type="number"
                                value={totalMarks}
                                onChange={(e) => setTotalMarks(Number(e.target.value))}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="deadline">Deadline</Label>
                            <Input
                                id="deadline"
                                type="datetime-local"
                                value={deadline}
                                onChange={(e) => setDeadline(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="time-limit">Time Limit</Label>
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
                                className="w-32"
                            />
                            <span className="text-sm text-muted-foreground">minutes (leave blank for no limit)</span>
                        </div>
                    </div>
                </section>

                {/* Configurations */}
                <section className="space-y-4">
                    <h3 className="font-bold font-heading text-lg border-b border-border/40 pb-2">Configurations</h3>

                    <Card className="border-border/60">
                        <CardContent className="p-5 space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <Label className="font-semibold">Allow Submissions</Label>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Students can submit their work for this assignment.
                                    </p>
                                </div>
                                <Switch checked={allowSubmissions} onCheckedChange={setAllowSubmissions} />
                            </div>

                            <div className="flex items-center justify-between">
                                <div>
                                    <Label className="font-semibold">Group Submission</Label>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Allow students to submit in groups.
                                    </p>
                                </div>
                                <Switch checked={groupSubmission} onCheckedChange={setGroupSubmission} />
                            </div>
                        </CardContent>
                    </Card>

                    {/* AI Tool Configuration */}
                    <Card className="border-border/60 bg-muted/10">
                        <CardContent className="p-5 space-y-4">
                            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">AI Tool Configuration</h4>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between py-1">
                                    <div>
                                        <Label className="font-semibold">ACAFS</Label>
                                        <p className="text-xs text-muted-foreground mt-0.5">Automated Code Analysis & Feedback System</p>
                                    </div>
                                    <Switch checked={enableAcafs} onCheckedChange={setEnableAcafs} />
                                </div>

                                <div className="flex items-center justify-between py-1">
                                    <div>
                                        <Label className="font-semibold">CIPAS</Label>
                                        <p className="text-xs text-muted-foreground mt-0.5">Code Integrity & Plagiarism Analysis System</p>
                                    </div>
                                    <Switch checked={enableCipas} onCheckedChange={setEnableCipas} />
                                </div>

                                <div className="flex items-center justify-between py-1">
                                    <div>
                                        <Label className="font-semibold flex items-center gap-2">
                                            BLAIM
                                            <Badge variant="outline" className="text-[10px] font-mono">Pro</Badge>
                                        </Label>
                                        <p className="text-xs text-muted-foreground mt-0.5">Behavioral Learning & Integrity Assessment Module</p>
                                    </div>
                                    <Switch checked={enableBlaim} onCheckedChange={setEnableBlaim} />
                                </div>

                                <div className="flex items-center justify-between py-1">
                                    <div>
                                        <Label className="font-semibold flex items-center gap-2">
                                            Viva VOCE
                                            <Badge variant="outline" className="text-[10px] font-mono">Pro</Badge>
                                        </Label>
                                        <p className="text-xs text-muted-foreground mt-0.5">AI-powered oral assessment integration</p>
                                    </div>
                                    <Switch checked={enableVivaVoce} onCheckedChange={setEnableVivaVoce} />
                                </div>
                            </div>

                            {enabledTools.length > 0 && (
                                <div className="pt-3 border-t border-border/40">
                                    <p className="text-xs text-muted-foreground mb-2">Enabled tools:</p>
                                    <div className="flex flex-wrap gap-2">
                                        {enabledTools.map((t) => (
                                            <Badge key={t} className="bg-primary/10 text-primary border-primary/20 font-semibold text-xs">
                                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                                {t}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </section>

                {/* Danger Zone */}
                <section className="pt-4 mt-6 border-t border-border/40">
                    <h3 className="font-bold font-heading text-lg text-destructive mb-4">Danger Zone</h3>

                    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between p-4 border border-destructive/30 rounded-xl bg-destructive/5">
                        <div className="space-y-0.5 max-w-lg">
                            <Label className="font-semibold text-destructive">Delete Assignment</Label>
                            <p className="text-sm text-destructive/80">
                                Permanently remove this assignment and all associated student submissions. This action cannot be undone.
                            </p>
                        </div>
                        <Button
                            variant="destructive"
                            className="shrink-0"
                            onClick={() => setIsDeleteDialogOpen(true)}
                        >
                            <AlertTriangle className="mr-2 h-4 w-4" /> Delete
                        </Button>
                        <ConfirmDialog
                            open={isDeleteDialogOpen}
                            onOpenChange={setIsDeleteDialogOpen}
                            title="Delete Assignment"
                            description="Are you absolutely sure? This will permanently delete the assignment, rubric, and all associated submissions."
                            confirmLabel="Delete Assignment"
                            destructive={true}
                            onConfirm={handleDelete}
                        />
                    </div>
                </section>
            </div>
        </div>
    );
}

function Loader2({ className }: { className?: string }) {
    return <svg className={className} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" /><path fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>;
}
