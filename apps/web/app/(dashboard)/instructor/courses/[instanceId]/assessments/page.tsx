"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { FileText, Loader2, Plus, Calendar, Clock, Terminal, ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { instructorAssessmentsApi } from "@/lib/api/assessments";
import { instructorCoursesApi } from "@/lib/api/academics";
import type { AssignmentResponse } from "@/types/assessments.types";
import type { CourseInstructor } from "@/types/academics.types";
import { handleApiError } from "@/lib/api/axios";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export default function CourseInstanceAssessmentsPage() {
    const params = useParams();
    const router = useRouter();
    const instanceId = params.instanceId as string;

    const [assignments, setAssignments] = React.useState<AssignmentResponse[]>([]);
    const [courseInfo, setCourseInfo] = React.useState<CourseInstructor | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    // Create Form State
    const [isCreateOpen, setIsCreateOpen] = React.useState(false);
    const [isCreating, setIsCreating] = React.useState(false);
    const [createError, setCreateError] = React.useState<string | null>(null);

    // Form fields
    const [title, setTitle] = React.useState("");
    const [description, setDescription] = React.useState("");
    const [languageCode, setLanguageCode] = React.useState("go");
    const [allowLateSubmissions, setAllowLateSubmissions] = React.useState(false);
    const [allowGroupSubmission, setAllowGroupSubmission] = React.useState(false);

    React.useEffect(() => {
        let mounted = true;

        async function fetchData() {
            if (!instanceId || typeof instanceId !== 'string') {
                if (mounted) setError('Invalid course instance ID');
                if (mounted) setIsLoading(false);
                return;
            }

            try {
                setIsLoading(true);
                
                // Fetch assignments for this course instance
                const [myAssignments, myCourses] = await Promise.all([
                    instructorAssessmentsApi.listMyAssignments(instanceId),
                    instructorCoursesApi.listMyCourses()
                ]);

                if (mounted) {
                    setAssignments(myAssignments);
                    // Find the course info for this instance
                    const course = myCourses.find(c => c.course_instance_id === instanceId);
                    setCourseInfo(course || null);
                }
            } catch (err) {
                if (mounted) setError(handleApiError(err));
            } finally {
                if (mounted) setIsLoading(false);
            }
        }

        fetchData();
        return () => { mounted = false; };
    }, [instanceId]);

    const handleCreateAssignment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!instanceId || !title || !languageCode) return;

        try {
            setIsCreating(true);
            setCreateError(null);

            const created = await instructorAssessmentsApi.createAssignment({
                course_instance_id: instanceId,
                title,
                description,
                code: languageCode,
                allow_late_submissions: allowLateSubmissions,
                allow_group_submission: allowGroupSubmission,
                enable_ai_assistant: false,
                enable_socratic_feedback: false,
                allow_regenerate: false
            });

            setAssignments(prev => [created, ...prev]);
            setIsCreateOpen(false);

            // Reset form
            setTitle("");
            setDescription("");
            setLanguageCode("go");
            setAllowLateSubmissions(false);
            setAllowGroupSubmission(false);
        } catch (err) {
            setCreateError(handleApiError(err));
        } finally {
            setIsCreating(false);
        }
    };

    const courseName = courseInfo 
        ? `${courseInfo.course_code} - ${courseInfo.course_title}`
        : instanceId;

    return (
        <div className="flex flex-col gap-8 pb-8">
            {/* Back Button */}
            <Button
                variant="ghost"
                className="w-fit pl-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
                onClick={() => router.push(`/instructor/courses/${instanceId}`)}
            >
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Course
            </Button>

            {/* Header */}
            <div className="flex flex-col gap-4 border-b border-border/40 pb-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <FileText className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black tracking-tight">Assessments</h1>
                            <p className="text-sm text-muted-foreground">
                                {courseName}
                            </p>
                        </div>
                    </div>

                    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="h-4 w-4 mr-2" />
                                Create Assignment
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[500px]">
                            <form onSubmit={handleCreateAssignment}>
                                <DialogHeader>
                                    <DialogTitle>Create Assignment</DialogTitle>
                                    <DialogDescription>
                                        Define a new programming assignment for {courseInfo?.course_code || 'this course'}.
                                    </DialogDescription>
                                </DialogHeader>

                                <div className="grid gap-4 py-4">
                                    {createError && (
                                        <div className="p-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg">
                                            {createError}
                                        </div>
                                    )}

                                    <div className="grid gap-2">
                                        <Label htmlFor="title">Assignment Title</Label>
                                        <Input
                                            id="title"
                                            value={title}
                                            onChange={(e) => setTitle(e.target.value)}
                                            placeholder="e.g. Lab 1: Data Structures"
                                            required
                                        />
                                    </div>

                                    <div className="grid gap-2">
                                        <Label htmlFor="description">Description</Label>
                                        <textarea
                                            id="description"
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            placeholder="Detailed instructions for the assignment..."
                                            rows={4}
                                            className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                                        />
                                    </div>

                                    <div className="grid gap-2">
                                        <Label htmlFor="language">Programming Language</Label>
                                        <Select value={languageCode} onValueChange={setLanguageCode}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select language" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="go">Go (1.21)</SelectItem>
                                                <SelectItem value="python">Python (3.11)</SelectItem>
                                                <SelectItem value="cpp">C++ (GCC 12)</SelectItem>
                                                <SelectItem value="java">Java (JDK 17)</SelectItem>
                                                <SelectItem value="javascript">JavaScript (Node.js)</SelectItem>
                                                <SelectItem value="rust">Rust (1.75)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="flex items-center justify-between border rounded-lg p-3">
                                        <div className="space-y-0.5">
                                            <Label>Late Submissions</Label>
                                            <p className="text-[10px] text-muted-foreground">Allow submissions after the due date</p>
                                        </div>
                                        <Switch
                                            checked={allowLateSubmissions}
                                            onCheckedChange={setAllowLateSubmissions}
                                        />
                                    </div>

                                    <div className="flex items-center justify-between border rounded-lg p-3">
                                        <div className="space-y-0.5">
                                            <Label>Group Submission</Label>
                                            <p className="text-[10px] text-muted-foreground">Allow students to work in teams</p>
                                        </div>
                                        <Switch
                                            checked={allowGroupSubmission}
                                            onCheckedChange={setAllowGroupSubmission}
                                        />
                                    </div>
                                </div>

                                <DialogFooter>
                                    <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                                        Cancel
                                    </Button>
                                    <Button type="submit" disabled={isCreating || !title}>
                                        {isCreating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                                        Create
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {error && (
                <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm">
                    {error}
                </div>
            )}

            {isLoading ? (
                <div className="flex justify-center p-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : assignments.length === 0 ? (
                <Card className="border-dashed border-border/60 bg-background">
                    <CardContent className="flex flex-col items-center justify-center py-20 gap-4">
                        <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
                            <FileText className="h-8 w-8 text-muted-foreground/50" />
                        </div>
                        <div className="text-center">
                            <p className="font-bold text-lg">No assignments found</p>
                            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                                You have not created any assignments for this course yet. Click &quot;Create Assignment&quot; to get started.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {assignments.map((assignment) => (
                        <Link key={assignment.id} href={`/instructor/assessments/${assignment.id}`} prefetch={false} className="block group">
                            <Card className="h-full border-border/60 hover:border-primary/30 hover:shadow-md transition-all duration-200 bg-background flex flex-col">
                                <CardContent className="p-6 flex flex-col gap-4 flex-1">
                                    <div className="flex items-start justify-between">
                                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                                            <FileText className="h-5 w-5 text-primary" />
                                        </div>
                                        {assignment.is_active ? (
                                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Active</Badge>
                                        ) : (
                                            <Badge variant="secondary">Draft</Badge>
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-bold text-lg line-clamp-1" title={assignment.title}>{assignment.title}</h3>
                                        {assignment.description && (
                                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{assignment.description}</p>
                                        )}
                                    </div>

                                    <div className="flex flex-col gap-2 mt-2">
                                        <div className="flex items-center text-xs text-muted-foreground">
                                            <Terminal className="h-3 w-3 mr-1.5" />
                                            <span>Language: <span className="font-semibold text-foreground capitalize">{assignment.code}</span></span>
                                        </div>
                                        <div className="flex items-center text-xs text-muted-foreground">
                                            <Calendar className="h-3 w-3 mr-1.5" />
                                            <span>Created: {format(new Date(assignment.created_at), 'MMM d, yyyy')}</span>
                                        </div>
                                        {assignment.due_at && (
                                            <div className="flex items-center text-xs text-muted-foreground">
                                                <Clock className="h-3 w-3 mr-1.5" />
                                                <span>Due: {format(new Date(assignment.due_at), 'MMM d, yyyy')}</span>
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
