"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { instructorCoursesApi } from "@/lib/api/academics";
import type { Enrollment, CourseInstructor } from "@/types/academics.types";
import { handleApiError } from "@/lib/api/axios";
import { Loader2, GraduationCap, Users, ArrowLeft, Calendar, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function InstructorCourseDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const instanceId = params.instanceId as string;

    const [students, setStudents] = React.useState<Enrollment[]>([]);
    const [instructors, setInstructors] = React.useState<CourseInstructor[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        let mounted = true;

        async function fetchData() {
            try {
                setIsLoading(true);
                const [studs, insts] = await Promise.all([
                    instructorCoursesApi.listMyStudents(instanceId),
                    instructorCoursesApi.listMyInstructors(instanceId),
                ]);

                if (mounted) {
                    setStudents(studs);
                    setInstructors(insts);
                }
            } catch (err) {
                if (mounted) setError(handleApiError(err));
            } finally {
                if (mounted) setIsLoading(false);
            }
        }

        if (instanceId) {
            fetchData();
        }

        return () => { mounted = false; };
    }, [instanceId]);

    if (isLoading) {
        return (
            <div className="flex justify-center p-20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col gap-4 p-8">
                <Button variant="ghost" className="w-fit mb-4" onClick={() => router.back()}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm">
                    {error}
                </div>
            </div>
        );
    }

    const enrolledStudents = students.filter(s => ['Enrolled', 'Completed'].includes(s.status));

    return (
        <div className="flex flex-col gap-8 pb-8">
            {/* Header */}
            <div>
                <Button variant="ghost" className="mb-4 pl-0 text-muted-foreground hover:bg-transparent hover:text-foreground" onClick={() => router.push('/instructor/courses')}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to My Courses
                </Button>
                <div className="flex flex-col gap-4 border-b border-border/40 pb-6">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="text-secondary-foreground bg-secondary/30 border-secondary/50">
                                Instance ID
                            </Badge>
                        </div>
                        <h1 className="text-2xl font-black tracking-tight font-mono">{instanceId}</h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Use this identifier to correspond with administrators if course details updates are needed.
                        </p>
                    </div>
                </div>
            </div>

            <Tabs defaultValue="students" className="w-full">
                <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0 mb-6">
                    <TabsTrigger value="students" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 pb-3 pt-2 font-semibold">
                        <GraduationCap className="h-4 w-4 mr-2" />
                        Students
                        <Badge variant="secondary" className="ml-2 bg-muted-foreground/15 text-muted-foreground">{enrolledStudents.length}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="team" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 pb-3 pt-2 font-semibold">
                        <Users className="h-4 w-4 mr-2" />
                        Team
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="students" className="mt-0 outline-none">
                    {students.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center border rounded-xl border-dashed">
                            <GraduationCap className="h-12 w-12 text-muted-foreground/50 mb-4" />
                            <p className="font-semibold text-lg">No students enrolled</p>
                            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                                There are currently no students enrolled in this course instance.
                            </p>
                        </div>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {students.map((student) => (
                                <Card key={student.user_id} className="border-border/60 hover:border-primary/30 transition-all bg-card flex flex-col items-center p-6 gap-4 text-center">
                                    <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center border-4 border-background shadow-sm">
                                        <GraduationCap className="h-8 w-8 text-muted-foreground" />
                                    </div>
                                    <div>
                                        <p className="font-semibold truncate w-full" title={student.user_id}>Student ID</p>
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
                    )}
                </TabsContent>

                <TabsContent value="team" className="mt-0 outline-none">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {instructors.map((instructor) => (
                            <Card key={instructor.user_id} className="border-border/60 bg-card p-6 flex items-start gap-4">
                                <div className="h-12 w-12 bg-primary/10 rounded-full flex shrink-0 items-center justify-center text-primary font-bold">
                                    {instructor.role.substring(0, 1)}
                                </div>
                                <div className="overflow-hidden">
                                    <p className="font-semibold truncate">Instructor</p>
                                    <p className="text-xs font-mono text-muted-foreground truncate" title={instructor.user_id}>{instructor.user_id}</p>
                                    <Badge variant="secondary" className="mt-2 text-xs">
                                        {instructor.role}
                                    </Badge>
                                </div>
                            </Card>
                        ))}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
