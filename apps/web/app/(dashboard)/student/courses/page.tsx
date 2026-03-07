"use client";

import * as React from "react";
import Link from "next/link";
import {
    BookOpen,
    ChevronRight,
    Loader2,
    GraduationCap,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { studentCoursesApi } from "@/lib/api/academics";
import type { StudentCourseEnrollment } from "@/types/academics.types";
import { handleApiError } from "@/lib/api/axios";

// Group enrollments by semester
function groupBySemester(
    enrollments: StudentCourseEnrollment[],
): Array<{ semesterName: string; items: StudentCourseEnrollment[] }> {
    const map = new Map<string, StudentCourseEnrollment[]>();
    for (const e of enrollments) {
        if (!map.has(e.semester_name)) map.set(e.semester_name, []);
        map.get(e.semester_name)!.push(e);
    }
    return [...map.entries()].map(([semesterName, items]) => ({
        semesterName,
        items,
    }));
}

function statusVariant(status: string) {
    if (status === "Enrolled") return "default";
    if (status === "Completed") return "secondary";
    if (status === "Dropped" || status === "Failed") return "destructive";
    return "outline";
}

export default function StudentCoursesPage() {
    const [enrollments, setEnrollments] = React.useState<StudentCourseEnrollment[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        let mounted = true;

        async function fetchCourses() {
            try {
                setIsLoading(true);
                const data = await studentCoursesApi.listMyEnrollments();
                if (mounted) setEnrollments(data);
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

    const groups = groupBySemester(enrollments);

    return (
        <div className="flex flex-col gap-8 pb-8">
            {/* Header */}
            <div className="flex flex-col gap-2 border-b border-border/40 pb-6">
                <div>
                    <h1 className="text-2xl font-black tracking-tight">My Courses</h1>
                    <p className="text-sm text-muted-foreground">
                        All your enrolled courses across semesters.
                    </p>
                </div>
            </div>

            {error && (
                <div className="p-4 rounded-xl border border-error-border bg-error-muted text-error-muted-foreground text-sm">
                    {error}
                </div>
            )}

            {isLoading ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} className="h-48 rounded-xl" />
                    ))}
                </div>
            ) : enrollments.length === 0 ? (
                <Card className="border-dashed border-border/60 bg-background">
                    <CardContent className="flex flex-col items-center justify-center py-20 gap-4">
                        <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
                            <GraduationCap className="h-8 w-8 text-muted-foreground/50" />
                        </div>
                        <div className="text-center">
                            <p className="font-bold text-lg">No enrollments found</p>
                            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                                Contact your administrator if you believe you should be enrolled in courses.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <div className="flex flex-col gap-10">
                    {groups.map((group) => (
                        <div key={group.semesterName} className="flex flex-col gap-4">
                            {/* Semester heading */}
                            <div className="flex items-center gap-3">
                                <h2 className="text-lg font-bold tracking-tight">{group.semesterName}</h2>
                                <Badge variant="outline" className="text-xs">
                                    {group.items.length} course{group.items.length !== 1 ? "s" : ""}
                                </Badge>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {group.items.map((e) => (
                                    <Card
                                        key={e.course_instance_id}
                                        className="group border-border/60 hover:border-primary/30 hover:shadow-md transition-all duration-200 bg-background flex flex-col"
                                    >
                                        <CardContent className="p-6 flex flex-col gap-4 flex-1">
                                            <div className="flex items-start justify-between">
                                                <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center">
                                                    <span className="text-sm font-black text-secondary-foreground">
                                                        {e.course_code.slice(0, 2)}
                                                    </span>
                                                </div>
                                                <Badge variant={statusVariant(e.status) as "default" | "secondary" | "destructive" | "outline"}>
                                                    {e.status}
                                                </Badge>
                                            </div>

                                            <div className="flex-1">
                                                <h3 className="font-bold text-base leading-tight">{e.course_title}</h3>
                                                <p className="text-xs font-mono text-muted-foreground mt-1">
                                                    {e.course_code}
                                                </p>
                                                {e.course_credits && (
                                                    <p className="text-xs text-muted-foreground mt-0.5">
                                                        {e.course_credits} credit{e.course_credits !== 1 ? "s" : ""}
                                                    </p>
                                                )}
                                            </div>

                                            {e.final_grade && (
                                                <div className="flex items-center gap-2 text-sm bg-success-muted text-success-muted-foreground border border-success-border p-2 rounded-lg">
                                                    <span className="font-semibold">Grade:</span>
                                                    <span className="font-black">{e.final_grade}</span>
                                                </div>
                                            )}

                                            <Button
                                                className="w-full mt-auto group-hover:bg-primary"
                                                variant="outline"
                                                asChild
                                            >
                                                <Link href={`/student/courses/${e.course_instance_id}`}>
                                                    Open Course
                                                    <ChevronRight className="h-4 w-4 ml-2" />
                                                </Link>
                                            </Button>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
