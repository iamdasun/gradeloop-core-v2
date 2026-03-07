"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
    ArrowLeft,
    BookOpen,
    Users,
    FileText,
    Loader2,
    Calendar,
    ChevronRight,
    Clock,
    Code2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { studentCoursesApi } from "@/lib/api/academics";
import { studentAssessmentsApi } from "@/lib/api/assessments";
import type { StudentCourseEnrollment, CourseInstructor } from "@/types/academics.types";
import type { AssignmentResponse } from "@/types/assessments.types";
import { handleApiError } from "@/lib/api/axios";
import { useUIStore } from "@/lib/stores/uiStore";
import { format, isPast, isToday, isTomorrow } from "date-fns";

const LANGUAGE_ID_TO_NAME: Record<number, string> = {
    71: "Python", 62: "Java", 54: "C++", 76: "C++",
    50: "C", 75: "C", 51: "C#", 63: "JavaScript",
    74: "TypeScript", 60: "Go", 73: "Rust", 72: "Ruby",
    68: "PHP", 83: "Swift", 78: "Kotlin", 81: "Scala",
    80: "R", 61: "Haskell", 82: "SQL",
};

function dueBadge(dateStr?: string) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isPast(d)) return { label: "Overdue", variant: "destructive" as const };
    if (isToday(d)) return { label: "Due today", variant: "destructive" as const };
    if (isTomorrow(d)) return { label: "Due tomorrow", variant: "secondary" as const };
    return null;
}

export default function StudentCourseDetailPage() {
    const params = useParams();
    const router = useRouter();
    const instanceId = params.instanceId as string;
    const setPageTitle = useUIStore((s) => s.setPageTitle);

    const [enrollment, setEnrollment] = React.useState<StudentCourseEnrollment | null>(null);
    const [instructors, setInstructors] = React.useState<CourseInstructor[]>([]);
    const [assignments, setAssignments] = React.useState<AssignmentResponse[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        let mounted = true;

        async function fetchData() {
            try {
                setIsLoading(true);
                const [enrollmentData, instructorData, assignmentData] = await Promise.all([
                    studentCoursesApi.getCourseInstance(instanceId),
                    studentCoursesApi.getCourseInstructors(instanceId),
                    studentAssessmentsApi.listAssignmentsForCourse(instanceId),
                ]);
                if (mounted) {
                    setEnrollment(enrollmentData);
                    setInstructors(instructorData);
                    setAssignments(assignmentData);
                    setPageTitle(enrollmentData.course_title);
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

    // Clear topbar title when leaving this page
    React.useEffect(() => () => { setPageTitle(null); }, []);

    if (isLoading) {
        return (
            <div className="flex flex-col gap-8 pb-8">
                <Skeleton className="h-8 w-32" />
                <div className="grid gap-4 sm:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-32 rounded-xl" />
                    ))}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col gap-4 p-8">
                <Button
                    variant="ghost"
                    className="w-fit mb-4 pl-0"
                    onClick={() => router.back()}
                >
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <div className="p-4 rounded-xl border border-error-border bg-error-muted text-error-muted-foreground text-sm">
                    {error}
                </div>
            </div>
        );
    }

    const leadInstructors = instructors.filter((i) => i.role === "Lead Instructor");
    const otherInstructors = instructors.filter((i) => i.role !== "Lead Instructor");

    return (
        <div className="flex flex-col gap-8 pb-8">
            {/* Back navigation */}
            <div>
                <Button
                    variant="ghost"
                    className="mb-4 pl-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
                    onClick={() => router.push("/student/courses")}
                >
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to My Courses
                </Button>

                {/* Course Header */}
                <div className="flex flex-col gap-4 border-b border-border/40 pb-6">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4">
                            <div className="h-12 w-12 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                                <span className="text-sm font-black text-secondary-foreground">
                                    {enrollment?.course_code.slice(0, 2) ?? "—"}
                                </span>
                            </div>
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <Badge variant="outline" className="text-xs font-mono">
                                        {enrollment?.course_code}
                                    </Badge>
                                    <Badge variant="secondary" className="text-xs">
                                        {enrollment?.semester_name}
                                    </Badge>
                                </div>
                                <h1 className="text-2xl font-black tracking-tight">
                                    {enrollment?.course_title}
                                </h1>
                                {enrollment?.course_description && (
                                    <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                                        {enrollment.course_description}
                                    </p>
                                )}
                            </div>
                        </div>
                        {enrollment?.final_grade && (
                            <div className="flex flex-col items-end gap-1 shrink-0">
                                <span className="text-xs text-muted-foreground uppercase tracking-wide">
                                    Final Grade
                                </span>
                                <span className="font-heading text-3xl font-black text-primary">
                                    {enrollment.final_grade}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="assignments" className="w-full">
                <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0 mb-6">
                    <TabsTrigger
                        value="assignments"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 pb-3 pt-2 font-semibold"
                    >
                        <FileText className="h-4 w-4 mr-2" />
                        Assignments
                        <Badge variant="secondary" className="ml-2 bg-muted-foreground/15 text-muted-foreground">
                            {assignments.length}
                        </Badge>
                    </TabsTrigger>
                    <TabsTrigger
                        value="team"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 pb-3 pt-2 font-semibold"
                    >
                        <Users className="h-4 w-4 mr-2" />
                        Instructor Team
                    </TabsTrigger>
                </TabsList>

                {/* Assignments Tab */}
                <TabsContent value="assignments" className="mt-0 outline-none">
                    {assignments.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center border rounded-xl border-dashed">
                            <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
                            <p className="font-semibold text-lg">No assignments yet</p>
                            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                                Assignments for this course will appear here once your instructor publishes them.
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {assignments.map((assignment) => {
                                const badge = dueBadge(assignment.due_at);
                                return (
                                    <Link
                                        key={assignment.id}
                                        href={`/student/courses/${instanceId}/assignments/${assignment.id}`}
                                        className="group flex items-center gap-4 p-4 rounded-xl border border-border/60 hover:border-primary/30 hover:shadow-sm bg-card transition-all"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="font-semibold group-hover:text-primary transition-colors truncate">
                                                    {assignment.title}
                                                </p>
                                                {assignment.language_id && LANGUAGE_ID_TO_NAME[assignment.language_id] && (
                                                    <Badge variant="outline" className="text-xs shrink-0 gap-1">
                                                        <Code2 className="h-3 w-3" />
                                                        {LANGUAGE_ID_TO_NAME[assignment.language_id]}
                                                    </Badge>
                                                )}
                                                {badge && (
                                                    <Badge variant={badge.variant} className="text-xs shrink-0">
                                                        {badge.label}
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                                                {assignment.due_at && (
                                                    <span className="flex items-center gap-1">
                                                        <Calendar className="h-3 w-3" />
                                                        Due {format(new Date(assignment.due_at), "MMM d, yyyy 'at' h:mm a")}
                                                    </span>
                                                )}
                                                {assignment.allow_late_submissions && (
                                                    <span className="flex items-center gap-1 text-warning-muted-foreground">
                                                        <Clock className="h-3 w-3" />
                                                        Late submissions allowed
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </TabsContent>

                {/* Team Tab */}
                <TabsContent value="team" className="mt-0 outline-none">
                    {instructors.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center border rounded-xl border-dashed">
                            <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
                            <p className="font-semibold text-lg">No instructors assigned</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-6">
                            {leadInstructors.length > 0 && (
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                                        Lead Instructor
                                    </p>
                                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                        {leadInstructors.map((instructor) => (
                                            <InstructorCard key={instructor.user_id} instructor={instructor} />
                                        ))}
                                    </div>
                                </div>
                            )}
                            {otherInstructors.length > 0 && (
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                                        Teaching Assistants & Instructors
                                    </p>
                                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                        {otherInstructors.map((instructor) => (
                                            <InstructorCard key={instructor.user_id} instructor={instructor} />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}

function InstructorCard({ instructor }: { instructor: CourseInstructor }) {
    const initials = instructor.full_name
        ? instructor.full_name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()
        : "??";

    return (
        <Card className="border-border/60 bg-card p-5 flex items-start gap-4">
            <div className="h-12 w-12 bg-primary/10 rounded-full flex shrink-0 items-center justify-center text-primary font-bold text-sm">
                {initials}
            </div>
            <div className="overflow-hidden">
                <p className="font-semibold truncate">{instructor.full_name || "Instructor"}</p>
                <p className="text-xs text-muted-foreground truncate" title={instructor.designation}>
                    {instructor.designation}
                </p>
                <p className="text-xs text-muted-foreground truncate">{instructor.email}</p>
                <Badge variant="secondary" className="mt-2 text-xs">
                    {instructor.role}
                </Badge>
            </div>
        </Card>
    );
}
