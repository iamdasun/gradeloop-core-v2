"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { instructorCoursesApi } from "@/lib/api/academics";
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
    LayoutDashboard,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeader } from "@/components/instructor/section-header";
import { StatsCard } from "@/components/instructor/stats-card";
import { StatusBadge } from "@/components/instructor/status-badge";

export default function InstructorCourseDetailsPage() {
    const params = useParams();
    const instanceId = params.instanceId as string;
    const params = useParams();
    const instanceId = params.instanceId as string;

    const [students, setStudents] = React.useState<Enrollment[]>([]);
    const [instructors, setInstructors] = React.useState<CourseInstructor[]>([]);
    const [assignmentCount, setAssignmentCount] = React.useState(0);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        let mounted = true;
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
        if (instanceId) fetchData();

        return () => {
            mounted = false;
        };
    }, [instanceId]);
        return () => {
            mounted = false;
        };
    }, [instanceId]);

    const enrolledStudents = students.filter((s) =>
        ["Enrolled", "Completed"].includes(s.status)
    );

    const courseCode = instructors.length > 0 ? instructors[0].course_code : instanceId;

    if (error) {
        return (
            <div className="flex gap-3 p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
            </div>
        );
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
                icon={LayoutDashboard}
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
                <h2 className="text-lg font-bold font-heading">Teaching Team</h2>

                {isLoading ? (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {[1, 2].map((i) => (
                            <Skeleton key={i} className="h-32 rounded-xl" />
                        ))}
                    </div>
                ) : instructors.length === 0 ? (
                    <div className="p-8 border border-dashed border-border/60 rounded-xl text-center">
                        <p className="text-sm text-muted-foreground">No instructor data available for this instance.</p>
                    </div>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {instructors.map((instructor) => (
                            <Card
                                key={instructor.user_id}
                                className="border-border/60 bg-card hover:border-primary/30 transition-colors"
                            >
                                <CardContent className="p-5 flex flex-col gap-3">
                                    <div className="flex items-start justify-between">
                                        <div className="h-11 w-11 bg-primary/10 rounded-full flex shrink-0 items-center justify-center text-primary font-bold text-base">
                                            {(instructor.full_name || instructor.role || "?")
                                                .charAt(0)
                                                .toUpperCase()}
                                        </div>
                                        <StatusBadge status={instructor.role} />
                                    </div>
                                    <div className="overflow-hidden">
                                        <p className="font-bold text-base truncate">
                                            {instructor.full_name || "Instructor"}
                                        </p>
                                        <p
                                            className="text-sm text-muted-foreground truncate mt-0.5"
                                            title={instructor.designation}
                                        >
                                            {instructor.designation || "—"}
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}