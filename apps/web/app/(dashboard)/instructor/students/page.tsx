"use client";

import * as React from "react";
import { GraduationCap, AlertCircle, Info, Loader2, BookOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { instructorCoursesApi } from "@/lib/api/academics";
import type { CourseInstructor, Enrollment } from "@/types/academics.types";
import { handleApiError } from "@/lib/api/axios";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function InstructorStudentsPage() {
    const [courses, setCourses] = React.useState<CourseInstructor[]>([]);
    const [selectedCourseId, setSelectedCourseId] = React.useState<string>("");

    const [students, setStudents] = React.useState<Enrollment[]>([]);
    const [isLoadingCourses, setIsLoadingCourses] = React.useState(true);
    const [isLoadingStudents, setIsLoadingStudents] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        let mounted = true;

        async function fetchCourses() {
            try {
                setIsLoadingCourses(true);
                const assigned = await instructorCoursesApi.listMyCourses();
                if (mounted) {
                    setCourses(assigned);
                    if (assigned.length > 0) {
                        setSelectedCourseId(assigned[0].course_instance_id);
                    }
                }
            } catch (err) {
                if (mounted) setError(handleApiError(err));
            } finally {
                if (mounted) setIsLoadingCourses(false);
            }
        }

        fetchCourses();
        return () => { mounted = false; };
    }, []);

    React.useEffect(() => {
        let mounted = true;

        async function fetchStudents(instanceId: string) {
            try {
                setIsLoadingStudents(true);
                const enrollments = await instructorCoursesApi.listMyStudents(instanceId);
                if (mounted) {
                    setStudents(enrollments);
                }
            } catch (err) {
                if (mounted) setError(handleApiError(err));
            } finally {
                if (mounted) setIsLoadingStudents(false);
            }
        }

        if (selectedCourseId) {
            fetchStudents(selectedCourseId);
        }

        return () => { mounted = false; };
    }, [selectedCourseId]);

    const enrolledStudents = students.filter(s => ['Enrolled', 'Completed'].includes(s.status));

    return (
        <div className="flex flex-col gap-8 pb-8">
            {/* Header */}
            <div className="flex flex-col gap-4 border-b border-border/40 pb-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <GraduationCap className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black tracking-tight">Students</h1>
                            <p className="text-sm text-muted-foreground">
                                View students enrolled in your assigned courses.
                            </p>
                        </div>
                    </div>
                </div>

                {!isLoadingCourses && courses.length > 0 && (
                    <div className="flex flex-col gap-2 mt-2">
                        <label className="text-sm font-semibold text-muted-foreground">Select Course Instance</label>
                        <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
                            <SelectTrigger className="w-full sm:w-[400px]">
                                <SelectValue placeholder="Select a course instance" />
                            </SelectTrigger>
                            <SelectContent>
                                {courses.map((course) => (
                                    <SelectItem key={course.course_instance_id} value={course.course_instance_id}>
                                        <div className="flex items-center gap-2">
                                            <BookOpen className="h-4 w-4 text-muted-foreground" />
                                            <span>{course.course_instance_id}</span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}
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
                        Enrollments are managed by administrators
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
                        Students are assigned to course instances by the system administration. You can view their status here to assist with handling submissions.
                    </p>
                </div>
            </div>

            {isLoadingCourses ? (
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
                                Enrolled students will appear here once you are assigned.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            ) : isLoadingStudents ? (
                <div className="flex justify-center p-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : students.length === 0 ? (
                <Card className="border-dashed border-border/60 bg-background">
                    <CardContent className="flex flex-col items-center justify-center py-20 gap-4">
                        <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
                            <GraduationCap className="h-8 w-8 text-muted-foreground/50" />
                        </div>
                        <div className="text-center">
                            <p className="font-bold text-lg">No students enrolled</p>
                            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                                There are no students enrolled in the selected course instance.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <div className="flex flex-col gap-4">
                    <div className="text-sm text-muted-foreground font-medium">
                        Showing {enrolledStudents.length} active students
                    </div>
                    {/* View options: Here we could have table/grid toggles, but grid is nice for now */}
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {students.map((student) => (
                            <Card key={student.user_id} className="border-border/60 hover:border-primary/30 transition-all bg-card flex flex-col items-center p-6 gap-4 text-center">
                                <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center border-4 border-background shadow-sm">
                                    <GraduationCap className="h-8 w-8 text-muted-foreground" />
                                </div>
                                <div>
                                    <p className="font-semibold truncate w-full" title={student.user_id}>Student Profile</p>
                                    <p className="text-xs font-mono text-muted-foreground mt-1 truncate max-w-[200px]" title={student.user_id}>{student.user_id}</p>
                                </div>
                                <div className="flex flex-col gap-2 mt-2 w-full">
                                    <div className="flex justify-between items-center text-sm border-b pb-2">
                                        <span className="text-muted-foreground">Status</span>
                                        <Badge variant={student.status === 'Enrolled' ? 'default' : 'secondary'}>{student.status}</Badge>
                                    </div>
                                    <div className="flex justify-between items-center text-sm pt-1">
                                        <span className="text-muted-foreground">Enrolled</span>
                                        <span>{format(new Date(student.enrolled_at), 'MMM d, yyyy')}</span>
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
