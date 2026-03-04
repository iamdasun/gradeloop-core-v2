"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { instructorCoursesApi, courseInstructorsApi } from "@/lib/api/academics";
import { instructorAssessmentsApi } from "@/lib/api/assessments";
import type { Enrollment, CourseInstructor } from "@/types/academics.types";
import { INSTRUCTOR_ROLES } from "@/types/academics.types";
import { handleApiError } from "@/lib/api/axios";
import {
    GraduationCap,
    Users,
    FileText,
    Calendar,
    AlertCircle,
    UserPlus,
    Trash2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { SectionHeader } from "@/components/instructor/section-header";
import { StatsCard } from "@/components/instructor/stats-card";
import { StatusBadge } from "@/components/instructor/status-badge";

export default function InstructorCourseDetailsPage() {
    const params = useParams();
    const instanceId = params.instanceId as string;

    const [students, setStudents] = React.useState<Enrollment[]>([]);
    const [instructors, setInstructors] = React.useState<CourseInstructor[]>([]);
    const [assignmentCount, setAssignmentCount] = React.useState(0);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    // Add instructor dialog state
    const [dialogOpen, setDialogOpen] = React.useState(false);
    const [newUserId, setNewUserId] = React.useState("");
    const [newRole, setNewRole] = React.useState<string>(INSTRUCTOR_ROLES[1]);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [submitError, setSubmitError] = React.useState<string | null>(null);
    const [removingId, setRemovingId] = React.useState<string | null>(null);

    React.useEffect(() => {
        let mounted = true;

        async function fetchData() {
            try {
                setIsLoading(true);
                const [studs, insts, assignments] = await Promise.all([
                    instructorCoursesApi.listMyStudents(instanceId),
                    instructorCoursesApi.listMyInstructors(instanceId),
                    instructorAssessmentsApi.listMyAssignments(),
                ]);

                if (mounted) {
                    setStudents(studs);
                    setInstructors(insts);
                    setAssignmentCount(
                        assignments.filter((a) => a.course_instance_id === instanceId).length
                    );
                }
            } catch (err) {
                if (mounted) setError(handleApiError(err));
            } finally {
                if (mounted) setIsLoading(false);
            }
        }

        if (instanceId) fetchData();

        return () => {
            mounted = false;
        };
    }, [instanceId]);

    const enrolledStudents = students.filter((s) =>
        ["Enrolled", "Completed"].includes(s.status)
    );

    const courseCode = instructors.length > 0 ? instructors[0].course_code : instanceId;

    async function handleAddInstructor(e: React.FormEvent) {
        e.preventDefault();
        if (!newUserId.trim()) return;
        setIsSubmitting(true);
        setSubmitError(null);
        try {
            const added = await courseInstructorsApi.assign({
                course_instance_id: instanceId,
                user_id: newUserId.trim(),
                role: newRole,
            });
            setInstructors((prev) => [...prev, added]);
            setDialogOpen(false);
            setNewUserId("");
            setNewRole(INSTRUCTOR_ROLES[1]);
        } catch (err) {
            setSubmitError(handleApiError(err));
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handleRemoveInstructor(userId: string) {
        setRemovingId(userId);
        try {
            await courseInstructorsApi.remove(instanceId, userId);
            setInstructors((prev) => prev.filter((i) => i.user_id !== userId));
        } catch {
            // silently ignore — could add toast here
        } finally {
            setRemovingId(null);
        }
    }

    if (error) {
        return (
            <div className="flex gap-3 p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-8 pb-8">
            <SectionHeader
                title="Course Overview"
                description={`${courseCode} — General stats, assigned instructors, and enrollment for this instance.`}
                action={
                    isLoading ? (
                        <Skeleton className="h-6 w-16 rounded-full" />
                    ) : (
                        <StatusBadge status="Active" variant="default" className="text-xs px-3 py-1" />
                    )
                }
            />

            {/* KPI Stats */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <StatsCard
                    title="Enrolled Students"
                    icon={GraduationCap}
                    value={enrolledStudents.length.toString()}
                    subtitle="Active students in this instance"
                    isLoading={isLoading}
                />
                <StatsCard
                    title="Assignments"
                    icon={FileText}
                    value={assignmentCount.toString()}
                    subtitle="Created for this course"
                    isLoading={isLoading}
                />
                <StatsCard
                    title="Teaching Team"
                    icon={Users}
                    value={instructors.length.toString()}
                    subtitle="Instructors and TAs"
                    isLoading={isLoading}
                />
            </div>

            {/* Course Info card */}
            <Card className="border-border/60 bg-background">
                <CardContent className="p-6">
                    <h3 className="font-bold font-heading text-lg mb-4">Course Information</h3>
                    <div className="grid sm:grid-cols-2 gap-y-3 gap-x-8 text-sm">
                        <div className="flex justify-between items-center py-2 border-b border-border/40">
                            <span className="text-muted-foreground">Course Code</span>
                            <span className="font-mono font-bold text-primary">{courseCode}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-border/40">
                            <span className="text-muted-foreground">Status</span>
                            <StatusBadge status="Active" />
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-border/40">
                            <span className="text-muted-foreground">Total Students</span>
                            <span className="font-semibold">{isLoading ? "—" : students.length}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-border/40">
                            <span className="text-muted-foreground">Enrolled</span>
                            <span className="font-semibold">{isLoading ? "—" : enrolledStudents.length}</span>
                        </div>
                        <div className="flex justify-between items-center py-2">
                            <span className="text-muted-foreground">Semester</span>
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                                <Calendar className="h-3.5 w-3.5" />
                                <span className="font-medium text-foreground">Current Term</span>
                            </div>
                        </div>
                        <div className="flex justify-between items-center py-2">
                            <span className="text-muted-foreground">Assignments Created</span>
                            <span className="font-semibold">{isLoading ? "—" : assignmentCount}</span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Teaching Team */}
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold font-heading">Teaching Team</h2>
                    <Button
                        size="sm"
                        onClick={() => { setDialogOpen(true); setSubmitError(null); }}
                        className="gap-2"
                    >
                        <UserPlus className="h-4 w-4" />
                        Add Instructor
                    </Button>
                </div>

                <Card className="border-border/60">
                    {isLoading ? (
                        <CardContent className="p-0 divide-y divide-border/40">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="flex items-center gap-4 px-5 py-4">
                                    <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                                    <div className="flex-1 space-y-1.5">
                                        <Skeleton className="h-3.5 w-32 rounded" />
                                        <Skeleton className="h-3 w-48 rounded" />
                                    </div>
                                    <Skeleton className="h-5 w-20 rounded-full" />
                                </div>
                            ))}
                        </CardContent>
                    ) : instructors.length === 0 ? (
                        <CardContent className="py-12 text-center">
                            <Users className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                            <p className="text-sm text-muted-foreground">No instructors assigned yet.</p>
                        </CardContent>
                    ) : (
                        <CardContent className="p-0 divide-y divide-border/40">
                            {instructors.map((instructor) => (
                                <div
                                    key={instructor.user_id}
                                    className="flex items-center gap-4 px-5 py-3.5 group hover:bg-muted/30 transition-colors"
                                >
                                    {/* Avatar */}
                                    <div className="h-9 w-9 bg-primary/10 rounded-full flex shrink-0 items-center justify-center text-primary font-bold text-sm">
                                        {(instructor.full_name || instructor.role || "?")
                                            .charAt(0)
                                            .toUpperCase()}
                                    </div>

                                    {/* Name + designation */}
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-sm truncate">
                                            {instructor.full_name || "Instructor"}
                                        </p>
                                        <p className="text-xs text-muted-foreground truncate">
                                            {instructor.email || instructor.designation || "—"}
                                        </p>
                                    </div>

                                    {/* Role badge */}
                                    <StatusBadge status={instructor.role} className="shrink-0" />

                                    {/* Remove */}
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                        disabled={removingId === instructor.user_id}
                                        onClick={() => handleRemoveInstructor(instructor.user_id)}
                                        title="Remove from team"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            ))}
                        </CardContent>
                    )}
                </Card>
            </div>

            {/* Add Instructor Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Add Instructor</DialogTitle>
                        <DialogDescription>
                            Assign an instructor or TA to this course instance.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleAddInstructor} className="flex flex-col gap-4 pt-1">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-sm font-medium" htmlFor="user-id">
                                User ID
                            </label>
                            <Input
                                id="user-id"
                                placeholder="Enter user UUID"
                                value={newUserId}
                                onChange={(e) => setNewUserId(e.target.value)}
                                required
                                autoComplete="off"
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-sm font-medium">Role</label>
                            <Select value={newRole} onValueChange={setNewRole}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select role" />
                                </SelectTrigger>
                                <SelectContent>
                                    {INSTRUCTOR_ROLES.map((r) => (
                                        <SelectItem key={r} value={r}>{r}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {submitError && (
                            <div className="flex gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
                                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                                {submitError}
                            </div>
                        )}
                        <DialogFooter className="pt-1">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setDialogOpen(false)}
                                disabled={isSubmitting}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isSubmitting || !newUserId.trim()}>
                                {isSubmitting ? "Adding…" : "Add Instructor"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>        </div>
    );
}