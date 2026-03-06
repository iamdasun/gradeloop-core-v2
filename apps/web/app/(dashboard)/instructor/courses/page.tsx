"use client";

import * as React from "react";
import {
    BookOpen,
    Info,
    Users,
    ChevronRight,
    LayoutGrid,
    List,
    FileText,
    AlertCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { instructorCoursesApi } from "@/lib/api/academics";
import { instructorAssessmentsApi } from "@/lib/api/assessments";
import type { CourseInstructor } from "@/types/academics.types";
import { handleApiError } from "@/lib/api/axios";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/instructor/section-header";
import { EmptyStateCard } from "@/components/instructor/empty-state";
import { StatusBadge } from "@/components/instructor/status-badge";
import { DataTable, type ColumnDef } from "@/components/instructor/data-table";

interface CourseWithStats extends CourseInstructor {
    studentCount: number;
    assignmentCount: number;
    status: string;
}

export default function InstructorCoursesPage() {
    const [courses, setCourses] = React.useState<CourseWithStats[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [viewMode, setViewMode] = React.useState<"grid" | "list">("grid");

    const courseColumns: ColumnDef<CourseWithStats, any>[] = [
        {
            accessorKey: "course_code",
            header: "Code",
            cell: ({ row }) => (
                <span className="font-mono font-bold text-primary text-sm uppercase">
                    {row.getValue("course_code")}
                </span>
            ),
        },
        {
            accessorKey: "course_title",
            header: "Course Title",
            cell: ({ row }) => (
                <Link
                    href={`/instructor/courses/${row.original.course_instance_id}`}
                    className="font-semibold text-foreground hover:text-primary transition-colors"
                >
                    {row.getValue("course_title")}
                </Link>
            ),
        },
        {
            accessorKey: "role",
            header: "Role",
            cell: ({ row }) => (
                <Badge variant="secondary" className="font-semibold text-xs">
                    {row.getValue("role")}
                </Badge>
            ),
        },
        {
            accessorKey: "status",
            header: "Status",
            cell: ({ row }) => <StatusBadge status={row.getValue("status")} />,
        },
        {
            accessorKey: "studentCount",
            header: "Students",
            cell: ({ row }) => (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    <span className="font-medium text-foreground">{row.getValue("studentCount")}</span>
                </div>
            ),
        },
        {
            accessorKey: "assignmentCount",
            header: "Assignments",
            cell: ({ row }) => (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    <span className="font-medium text-foreground">{row.getValue("assignmentCount")}</span>
                </div>
            ),
        },
        {
            id: "actions",
            cell: ({ row }) => (
                <Button variant="ghost" size="sm" asChild className="ml-auto flex">
                    <Link href={`/instructor/courses/${row.original.course_instance_id}`}>
                        View <ChevronRight className="h-4 w-4 ml-1" />
                    </Link>
                </Button>
            ),
        },
    ];

    React.useEffect(() => {
        let mounted = true;

        async function fetchCourses() {
            try {
                setIsLoading(true);
                const [assigned, allAssignments] = await Promise.all([
                    instructorCoursesApi.listMyCourses(),
                    instructorAssessmentsApi.listMyAssignments(),
                ]);

                const fullCourses = await Promise.all(
                    assigned.map(async (course) => {
                        let studentCount = 0;
                        try {
                            const students = await instructorCoursesApi.listMyStudents(
                                course.course_instance_id
                            );
                            studentCount = students.length;
                        } catch {
                            // silent
                        }
                        const assignmentCount = allAssignments.filter(
                            (a) => a.course_instance_id === course.course_instance_id
                        ).length;
                        return { ...course, studentCount, assignmentCount, status: "Active" };
                    })
                );

                if (mounted) {
                    setCourses(fullCourses);
                }
            } catch (err) {
                if (mounted) setError(handleApiError(err));
            } finally {
                if (mounted) setIsLoading(false);
            }
        }

        fetchCourses();
        return () => {
            mounted = false;
        };
    }, []);

    return (
        <div className="flex flex-col gap-8 pb-8">
            <SectionHeader
                title="My Courses"
                description="Courses you are assigned to instruct this semester."
                action={
                    <div className="flex items-center p-1 bg-muted/50 rounded-xl border border-border/40 shrink-0">
                        <Button
                            variant={viewMode === "grid" ? "default" : "ghost"}
                            size="sm"
                            className="h-8 rounded-lg shadow-none px-3"
                            onClick={() => setViewMode("grid")}
                        >
                            <LayoutGrid className="h-4 w-4 sm:mr-2" />
                            <span className="hidden sm:inline">Grid</span>
                        </Button>
                        <Button
                            variant={viewMode === "list" ? "default" : "ghost"}
                            size="sm"
                            className="h-8 rounded-lg shadow-none px-3"
                            onClick={() => setViewMode("list")}
                        >
                            <List className="h-4 w-4 sm:mr-2" />
                            <span className="hidden sm:inline">List</span>
                        </Button>
                    </div>
                }
            />

            {error && (
                <div className="flex gap-3 p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive text-sm">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                </div>
            )}

            {/* Loading skeletons */}
            {isLoading ? (
                viewMode === "grid" ? (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {[1, 2, 3].map((i) => (
                            <Skeleton key={i} className="h-[260px] rounded-xl" />
                        ))}
                    </div>
                ) : (
                    <div className="space-y-2">
                        {[1, 2, 3, 4].map((i) => (
                            <Skeleton key={i} className="h-14 w-full rounded-xl" />
                        ))}
                    </div>
                )
            ) : courses.length === 0 ? (
                <EmptyStateCard
                    icon={BookOpen}
                    title="No courses assigned yet"
                    description="Contact your administrator to be assigned to a course instance. Assigned courses and their enrolled students will appear here."
                />
            ) : viewMode === "list" ? (
                <DataTable
                    columns={courseColumns}
                    data={courses}
                    searchKey="course_title"
                    searchPlaceholder="Search courses..."
                />
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {courses.map((course) => (
                        <Card
                            key={course.course_instance_id}
                            className="group border-border/60 hover:border-primary/30 hover:shadow-md transition-all duration-200 bg-background flex flex-col"
                        >
                            <CardContent className="p-6 flex flex-col gap-4 flex-1">
                                {/* Top row */}
                                <div className="flex items-start justify-between gap-3">
                                    <div className="h-10 w-10 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center">
                                        <BookOpen className="h-5 w-5 text-primary" />
                                    </div>
                                    <div className="flex flex-col items-end gap-1 shrink-0">
                                        <Badge
                                            variant="secondary"
                                            className="font-semibold text-[10px] uppercase tracking-wider"
                                        >
                                            {course.role}
                                        </Badge>
                                        <StatusBadge status={course.status} />
                                    </div>
                                </div>

                                {/* Title */}
                                <div className="flex-1 mt-1">
                                    <div
                                        className="text-xs font-mono font-bold text-primary/80 mb-1 truncate"
                                        title={course.course_code}
                                    >
                                        {course.course_code}
                                    </div>
                                    <h3
                                        className="font-bold font-heading text-lg leading-tight line-clamp-2"
                                        title={course.course_title}
                                    >
                                        {course.course_title}
                                    </h3>
                                </div>

                                {/* Stats row */}
                                <div className="grid grid-cols-2 gap-2 mt-2">
                                    <div className="flex items-center gap-2 text-sm bg-muted/40 border border-border/40 px-3 py-2 rounded-lg">
                                        <Users className="h-3.5 w-3.5 text-primary/60 shrink-0" />
                                        <span className="font-semibold text-foreground">{course.studentCount}</span>
                                        <span className="text-muted-foreground text-xs">students</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm bg-muted/40 border border-border/40 px-3 py-2 rounded-lg">
                                        <FileText className="h-3.5 w-3.5 text-primary/60 shrink-0" />
                                        <span className="font-semibold text-foreground">{course.assignmentCount}</span>
                                        <span className="text-muted-foreground text-xs">assignments</span>
                                    </div>
                                </div>

                                <Button
                                    className="w-full mt-2 group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                                    variant="outline"
                                    asChild
                                >
                                    <Link href={`/instructor/courses/${course.course_instance_id}`}>
                                        View Details
                                        <ChevronRight className="h-4 w-4 ml-1" />
                                    </Link>
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
