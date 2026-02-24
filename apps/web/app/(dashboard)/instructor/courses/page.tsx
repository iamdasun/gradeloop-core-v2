"use client";

import * as React from "react";
import { BookOpen, AlertCircle, Info, Loader2, Users, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { instructorCoursesApi } from "@/lib/api/academics";
import type { CourseInstructor } from "@/types/academics.types";
import { handleApiError } from "@/lib/api/axios";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface CourseWithStats extends CourseInstructor {
    studentCount: number;
}

export default function InstructorCoursesPage() {
    const [courses, setCourses] = React.useState<CourseWithStats[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        let mounted = true;

        async function fetchCourses() {
            try {
                setIsLoading(true);
                const assigned = await instructorCoursesApi.listMyCourses();

                // Fetch student count for each course
                const fullCourses = await Promise.all(
                    assigned.map(async (course) => {
                        try {
                            const students = await instructorCoursesApi.listMyStudents(course.course_instance_id);
                            return { ...course, studentCount: students.length };
                        } catch (err) {
                            // If students fetch fails, just default to 0 to not break the whole list Let's ignore it here
                            return { ...course, studentCount: 0 };
                        }
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
        return () => { mounted = false; };
    }, []);

    return (
        <div className="flex flex-col gap-8 pb-8">
            {/* Header */}
            <div className="flex flex-col gap-2 border-b border-border/40 pb-6">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <BookOpen className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black tracking-tight">My Courses</h1>
                        <p className="text-sm text-muted-foreground">
                            Courses you are assigned to instruct this semester.
                        </p>
                    </div>
                </div>
            </div>

            {error && (
                <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm">
                    {error}
                </div>
            )}

            {/* Informational state */}
            <div className="flex gap-3 rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 p-4">
                <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div>
                    <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                        Course metadata is administrator-managed
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
                        As an instructor, you can view the instances you are assigned to and manage student submissions. Full course metadata is restricted to administrators.
                    </p>
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center p-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : courses.length === 0 ? (
                <Card className="border-dashed border-border/60 bg-background">
                    <CardContent className="flex flex-col items-center justify-center py-20 gap-4">
                        <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
                            <BookOpen className="h-8 w-8 text-muted-foreground/50" />
                        </div>
                        <div className="text-center">
                            <p className="font-bold text-lg">No courses assigned yet</p>
                            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                                Contact your administrator to be assigned to a course instance.
                                Assigned courses and their enrolled students will appear here.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {courses.map((course) => (
                        <Card key={course.course_instance_id} className="group border-border/60 hover:border-primary/30 hover:shadow-md transition-all duration-200 bg-background flex flex-col">
                            <CardContent className="p-6 flex flex-col gap-4 flex-1">
                                <div className="flex items-start justify-between">
                                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                        <BookOpen className="h-5 w-5 text-primary" />
                                    </div>
                                    <Badge variant="secondary" className="font-semibold">
                                        {course.role}
                                    </Badge>
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-bold text-lg">Course Instance</h3>
                                    <p className="text-xs font-mono text-muted-foreground mt-1 truncate" title={course.course_instance_id}>
                                        {course.course_instance_id}
                                    </p>
                                </div>

                                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-2 rounded-lg">
                                    <Users className="h-4 w-4" />
                                    <span>{course.studentCount} student{course.studentCount !== 1 ? 's' : ''}</span>
                                </div>

                                <Button className="w-full mt-2 group-hover:bg-primary" variant="outline" asChild>
                                    <Link href={`/instructor/courses/${course.course_instance_id}`}>
                                        View Details
                                        <ChevronRight className="h-4 w-4 ml-2" />
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
