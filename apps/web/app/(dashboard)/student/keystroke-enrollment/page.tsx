"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/authStore";
import { useKeystrokeEnrollmentStore } from "@/lib/stores/keystrokeEnrollmentStore";
import { keystrokeApi } from "@/lib/api/keystroke";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PhaseRecorderDialog } from "@/components/keystroke/phase-recorder-dialog";
import {
    Fingerprint,
    CheckCircle2,
    Clock,
    ShieldCheck,
    BookOpen,
    Zap,
    ChevronRight,
    Loader2,
    AlertCircle,
} from "lucide-react";

// ─── Phase definitions ────────────────────────────────────────────────────────

const PHASES = [
    {
        id: "baseline",
        label: "Baseline",
        description: "Type naturally to establish your base typing rhythm.",
        minutes: 3,
        icon: Fingerprint,
        color: "text-blue-600 bg-blue-50 dark:bg-blue-950/40",
    },
    {
        id: "transcription",
        label: "Transcription",
        description: "Copy a short passage to capture your copy-typing pattern.",
        minutes: 3,
        icon: BookOpen,
        color: "text-purple-600 bg-purple-50 dark:bg-purple-950/40",
    },
    {
        id: "stress",
        label: "Stress",
        description: "Complete a timed task to record your under-pressure typing.",
        minutes: 2,
        icon: Zap,
        color: "text-orange-600 bg-orange-50 dark:bg-orange-950/40",
    },
    {
        id: "cognitive",
        label: "Cognitive Load",
        description: "Solve a short problem while typing to simulate exam conditions.",
        minutes: 3,
        icon: ShieldCheck,
        color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40",
    },
] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export default function KeystrokeEnrollmentPage() {
    const router = useRouter();
    const user = useAuthStore((s) => s.user);
    const isHydrated = useAuthStore((s) => s.isHydrated);
    const { setEnrolled, isEnrolled } = useKeystrokeEnrollmentStore();

    const [progress, setProgress] = React.useState<{
        phases_complete: string[];
        enrollment_complete: boolean;
    } | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [activePhase, setActivePhase] = React.useState<string | null>(null);

    const refreshProgress = React.useCallback(() => {
        if (!user) return;
        keystrokeApi
            .getEnrollmentProgress(user.id)
            .then((data) => {
                setProgress({
                    phases_complete: data.phases_complete ?? [],
                    enrollment_complete: data.enrollment_complete,
                });
                const allDone = data.enrollment_complete && (data.phases_complete ?? []).length >= 4;
                if (allDone) setEnrolled(user.id, true);
            })
            .catch(() => {});
    }, [user, setEnrolled]);

    // Fetch current progress on mount
    React.useEffect(() => {
        if (!isHydrated || !user) return;

        keystrokeApi
            .getEnrollmentProgress(user.id)
            .then((data) => {
                const phases = data.phases_complete ?? [];
                setProgress({
                    phases_complete: phases,
                    enrollment_complete: data.enrollment_complete,
                });
                const allDone = data.enrollment_complete && phases.length >= 4;
                // Sync store with live truth — clears any stale "enrolled" state
                setEnrolled(user.id, allDone);
            })
            .catch(() => {
                setError("Could not reach the keystroke service. Please try again later.");
            })
            .finally(() => setIsLoading(false));
    }, [isHydrated, user, setEnrolled]);

    // Already enrolled — redirect to profile only when live API confirms all 4 phases done
    React.useEffect(() => {
        if (progress?.enrollment_complete && (progress.phases_complete ?? []).length >= 4) {
            router.replace("/profile");
        }
    }, [progress, router]);

    if (!isHydrated || isLoading) {
        return (
            <div className="flex h-[60vh] items-center justify-center gap-3 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading enrollment status…</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="mx-auto max-w-lg pt-12">
                <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-900/30 dark:bg-red-900/10 flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="font-semibold text-red-800 dark:text-red-400">Service Unavailable</p>
                        <p className="mt-1 text-sm text-red-700 dark:text-red-300">{error}</p>
                        <Button
                            variant="outline"
                            size="sm"
                            className="mt-3"
                            onClick={() => router.back()}
                        >
                            Go Back
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    const phasesComplete = progress?.phases_complete ?? [];
    const completedCount = phasesComplete.length;
    const totalPhases = PHASES.length;
    const nextPhase = PHASES.find((p) => !phasesComplete.includes(p.id));
    const allDone = progress?.enrollment_complete ?? false;

    return (
        <div className="mx-auto max-w-2xl space-y-8 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Phase recorder dialog */}
            <PhaseRecorderDialog
                open={!!activePhase}
                phase={activePhase ?? "baseline"}
                onClose={() => setActivePhase(null)}
                onSuccess={(completedPhase) => {
                    setActivePhase(null);
                    // Optimistically mark phase as done then re-fetch
                    setProgress((prev) =>
                        prev
                            ? {
                                ...prev,
                                phases_complete: prev.phases_complete.includes(completedPhase)
                                    ? prev.phases_complete
                                    : [...prev.phases_complete, completedPhase],
                            }
                            : prev
                    );
                    refreshProgress();
                }}
            />
            {/* Header */}
            <div className="text-center space-y-2">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                    <Fingerprint className="h-8 w-8 text-primary" />
                </div>
                <h1 className="text-3xl font-bold tracking-tight">Keystroke Enrollment</h1>
                <p className="text-muted-foreground leading-relaxed max-w-md mx-auto">
                    Complete all 4 phases to build your unique typing profile.
                    This protects your identity during every assignment submission.
                </p>
            </div>

            {/* Progress bar */}
            <Card className="border-border/60 shadow-sm">
                <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-semibold text-foreground">Overall Progress</span>
                        <Badge variant={allDone ? "default" : "secondary"}>
                            {allDone ? "Complete ✓" : `${completedCount} / ${totalPhases} phases`}
                        </Badge>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div
                            className="h-full rounded-full bg-primary transition-all duration-700"
                            style={{ width: `${(completedCount / totalPhases) * 100}%` }}
                        />
                    </div>
                    {allDone && (
                        <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5">
                            <CheckCircle2 className="h-4 w-4" />
                            Enrollment complete — your keystroke profile is active.
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Phase list */}
            <div className="space-y-3">
                {PHASES.map((phase) => {
                    const done = phasesComplete.includes(phase.id);
                    const isNext = nextPhase?.id === phase.id;
                    const Icon = phase.icon;

                    return (
                        <Card
                            key={phase.id}
                            className={`border-border/60 shadow-sm transition-all duration-200 ${
                                isNext ? "ring-2 ring-primary/30 shadow-md" : ""
                            } ${done ? "opacity-70" : ""}`}
                        >
                            <CardContent className="p-4">
                                <div className="flex items-center gap-4">
                                    {/* Icon */}
                                    <div
                                        className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${phase.color}`}
                                    >
                                        {done ? (
                                            <CheckCircle2 className="h-5 w-5" />
                                        ) : (
                                            <Icon className="h-5 w-5" />
                                        )}
                                    </div>

                                    {/* Text */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="font-semibold text-sm">{phase.label}</p>
                                            {isNext && (
                                                <Badge variant="default" className="text-[10px] px-1.5 py-0">
                                                    Up Next
                                                </Badge>
                                            )}
                                            {done && (
                                                <Badge
                                                    variant="outline"
                                                    className="text-[10px] px-1.5 py-0 border-emerald-500 text-emerald-600"
                                                >
                                                    Done
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                                            {phase.description}
                                        </p>
                                    </div>

                                    {/* Duration + action */}
                                    <div className="flex flex-shrink-0 flex-col items-end gap-1">
                                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                            <Clock className="h-3 w-3" />
                                            {phase.minutes} min
                                        </span>
                                        {isNext && !done && (
                                            <Button
                                                size="sm"
                                                variant="default"
                                                className="h-7 px-2.5 text-xs"
                                                onClick={() => setActivePhase(phase.id)}
                                            >
                                                Start
                                                <ChevronRight className="ml-0.5 h-3 w-3" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Bottom CTA */}
            {allDone ? (
                <Button className="w-full" onClick={() => router.push("/student")}>
                    Go to Dashboard
                </Button>
            ) : (
                <p className="text-center text-xs text-muted-foreground">
                    You can leave and return at any time — completed phases are saved automatically.
                </p>
            )}
        </div>
    );
}
