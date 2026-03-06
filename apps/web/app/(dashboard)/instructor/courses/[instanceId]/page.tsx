"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { instructorCoursesApi } from "@/lib/api/academics";
import { instructorAssessmentsApi } from "@/lib/api/assessments";
import type { Enrollment, CourseInstructor } from "@/types/academics.types";
import { handleApiError } from "@/lib/api/axios";
import {
    GraduationCap,
    Users,
    FileText,
    Calendar,
    AlertCircle,
    Mail,
    BadgeCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
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
                <h2 className="text-lg font-bold font-heading">Teaching Team</h2>

                {isLoading ? (
                    <div className="rounded-xl border border-border/60 overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/40 hover:bg-muted/40">
                                    <TableHead className="w-[40%]">Instructor</TableHead>
                                    <TableHead className="w-[25%]">Designation</TableHead>
                                    <TableHead className="w-[20%]">Email</TableHead>
                                    <TableHead className="w-[15%]">Role</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {[1, 2].map((i) => (
                                    <TableRow key={i}>
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                                                <div className="space-y-1.5">
                                                    <Skeleton className="h-3.5 w-32" />
                                                    <Skeleton className="h-3 w-20" />
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
                                        <TableCell><Skeleton className="h-3.5 w-36" /></TableCell>
                                        <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                ) : instructors.length === 0 ? (
                    <div className="p-8 border border-dashed border-border/60 rounded-xl text-center">
                        <p className="text-sm text-muted-foreground">No instructor data available for this instance.</p>
                    </div>
                ) : (
                    <div className="rounded-xl border border-border/60 overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/40 hover:bg-muted/40">
                                    <TableHead className="w-[35%]">Instructor</TableHead>
                                    <TableHead className="w-[20%]">Designation</TableHead>
                                    <TableHead className="w-[30%]">Email</TableHead>
                                    <TableHead className="w-[15%]">Role</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {instructors.map((instructor) => {
                                    const initials = (instructor.full_name || instructor.role || "?")
                                        .split(" ")
                                        .filter(Boolean)
                                        .slice(0, 2)
                                        .map((w) => w[0].toUpperCase())
                                        .join("");

                                    const roleBadgeVariant =
                                        instructor.role === "Lead Instructor"
                                            ? "default"
                                            : instructor.role === "TA"
                                            ? "secondary"
                                            : "outline";

                                    return (
                                        <TableRow key={instructor.user_id} className="hover:bg-muted/30">
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <div className="h-9 w-9 rounded-full bg-primary/10 flex shrink-0 items-center justify-center text-primary font-bold text-sm">
                                                        {initials}
                                                    </div>
                                                    <span className="font-semibold text-sm text-foreground">
                                                        {instructor.full_name || "Instructor"}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                                    <BadgeCheck className="h-3.5 w-3.5 shrink-0" />
                                                    <span>{instructor.designation || "—"}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                                    <Mail className="h-3.5 w-3.5 shrink-0" />
                                                    <a
                                                        href={`mailto:${instructor.email}`}
                                                        className="hover:text-foreground hover:underline transition-colors truncate max-w-[200px]"
                                                        title={instructor.email}
                                                    >
                                                        {instructor.email || "—"}
                                                    </a>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={roleBadgeVariant} className="text-xs font-medium capitalize whitespace-nowrap">
                                                    {instructor.role}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </div>
        </div>
    );
}