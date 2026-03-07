"use client";

import * as React from "react";
import Link from "next/link";
import {
    ClipboardList,
    FileText,
    Loader2,
    Search,
    History,
    Send,
    BookOpen,
    ChevronRight,
    AlertCircle,
    SlidersHorizontal,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { studentCoursesApi } from "@/lib/api/academics";
import { studentAssessmentsApi } from "@/lib/api/assessments";
import type { StudentCourseEnrollment } from "@/types/academics.types";
import type { AssignmentResponse, SubmissionResponse } from "@/types/assessments.types";
import { handleApiError } from "@/lib/api/axios";
import { format, formatDistanceToNow } from "date-fns";

interface SubmissionWithContext extends SubmissionResponse {
    assignment_title: string;
    assignment_language: string;
    course_code: string;
    course_title: string;
    course_instance_id: string;
}

function statusBadge(status: string) {
    const s = status.toLowerCase();
    if (s === "graded" || s === "marked")
        return <Badge className="bg-success text-success-foreground text-xs">{status}</Badge>;
    if (s === "submitted")
        return <Badge variant="secondary" className="text-xs">{status}</Badge>;
    if (s === "draft")
        return <Badge variant="outline" className="text-xs text-warning-muted-foreground border-warning-border">{status}</Badge>;
    return <Badge variant="outline" className="text-xs">{status}</Badge>;
}

const STATUS_OPTIONS = ["all", "Draft", "Submitted", "Graded"] as const;

export default function StudentSubmissionsPage() {
    const [allSubmissions, setAllSubmissions] = React.useState<SubmissionWithContext[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    // Filters
    const [search, setSearch] = React.useState("");
    const [statusFilter, setStatusFilter] = React.useState<string>("all");
    const [courseFilter, setCourseFilter] = React.useState<string>("all");

    // Course list for filter dropdown
    const [courses, setCourses] = React.useState<StudentCourseEnrollment[]>([]);

    React.useEffect(() => {
        let mounted = true;

        async function fetchAll() {
            try {
                setIsLoading(true);

                // 1. Get enrollments
                const enrollments = await studentCoursesApi.listMyEnrollments();
                if (!mounted) return;
                setCourses(enrollments);

                // 2. For each active enrollment, get assignments, then get submissions
                const activeEnrollments = enrollments.filter((e) => e.status === "Enrolled");

                const allAssignmentResults = await Promise.allSettled(
                    activeEnrollments.map(async (e) => {
                        const assignments = await studentAssessmentsApi.listAssignmentsForCourse(
                            e.course_instance_id,
                        );
                        return { enrollment: e, assignments };
                    }),
                );

                const courseAssignments = allAssignmentResults
                    .filter((r) => r.status === "fulfilled")
                    .map((r) => (r as PromiseFulfilledResult<{ enrollment: StudentCourseEnrollment; assignments: AssignmentResponse[] }>).value);

                // 3. Fetch latest submission for each assignment
                const submissionResults = await Promise.allSettled(
                    courseAssignments.flatMap(({ enrollment, assignments }) =>
                        assignments.map(async (a) => {
                            const subs = await studentAssessmentsApi.listMySubmissions(a.id);
                            // Return only the latest version per assignment
                            const latest = subs.find((s) => s.is_latest) ?? subs[0];
                            if (!latest) return null;
                            return {
                                ...latest,
                                assignment_title: a.title,
                                assignment_language: a.code,
                                course_code: enrollment.course_code,
                                course_title: enrollment.course_title,
                                course_instance_id: enrollment.course_instance_id,
                            } as SubmissionWithContext;
                        }),
                    ),
                );

                const submissions = submissionResults
                    .filter((r) => r.status === "fulfilled" && r.value !== null)
                    .map((r) => (r as PromiseFulfilledResult<SubmissionWithContext>).value)
                    .sort(
                        (a, b) =>
                            new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime(),
                    );

                if (mounted) setAllSubmissions(submissions);
            } catch (err) {
                if (mounted) setError(handleApiError(err));
            } finally {
                if (mounted) setIsLoading(false);
            }
        }

        fetchAll();
        return () => {
            mounted = false;
        };
    }, []);

    // Filter & search
    const filtered = allSubmissions.filter((s) => {
        const matchesSearch =
            !search ||
            s.assignment_title.toLowerCase().includes(search.toLowerCase()) ||
            s.course_code.toLowerCase().includes(search.toLowerCase()) ||
            s.course_title.toLowerCase().includes(search.toLowerCase());
        const matchesStatus =
            statusFilter === "all" ||
            s.status.toLowerCase() === statusFilter.toLowerCase();
        const matchesCourse =
            courseFilter === "all" || s.course_instance_id === courseFilter;
        return matchesSearch && matchesStatus && matchesCourse;
    });

    const drafts = allSubmissions.filter(
        (s) => s.status.toLowerCase() === "draft",
    );

    const submittedCount = allSubmissions.filter(
        (s) => s.status.toLowerCase() === "submitted",
    ).length;

    const gradedCount = allSubmissions.filter(
        (s) => s.status.toLowerCase() === "graded" || s.status.toLowerCase() === "marked",
    ).length;

    return (
        <div className="flex flex-col gap-8 pb-8">
            {/* Header */}
            <div className="flex flex-col gap-2 border-b border-border/40 pb-6">
                <div>
                    <h1 className="text-2xl font-black tracking-tight">My Submissions</h1>
                    <p className="text-sm text-muted-foreground">
                        Track all your assignment submissions across courses.
                    </p>
                </div>
            </div>

            {error && (
                <div className="flex items-center gap-3 p-4 rounded-xl border border-error-border bg-error-muted text-error-muted-foreground text-sm">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {error}
                </div>
            )}

            {/* Summary stat mini-cards */}
            {!isLoading && (
                <div className="grid gap-4 sm:grid-cols-3">
                    {[
                        { label: "Total Submissions", value: allSubmissions.length, icon: ClipboardList },
                        { label: "Submitted", value: submittedCount, icon: Send },
                        { label: "Graded", value: gradedCount, icon: History },
                    ].map(({ label, value, icon: Icon }) => (
                        <Card key={label} className="border-border/60 shadow-sm">
                            <CardContent className="p-4 flex items-center gap-4">
                                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                    <Icon className="h-4 w-4 text-primary" />
                                </div>
                                <div>
                                    <p className="font-heading text-xl font-black">{value}</p>
                                    <p className="text-xs text-muted-foreground">{label}</p>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Drafts section */}
            {!isLoading && drafts.length > 0 && (
                <Card className="border-warning-border bg-warning-muted">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2 text-warning-muted-foreground">
                            <FileText className="h-4 w-4" />
                            Saved Drafts
                            <Badge variant="outline" className="ml-1 border-warning-border text-warning-muted-foreground">
                                {drafts.length}
                            </Badge>
                        </CardTitle>
                        <CardDescription className="text-warning-muted-foreground/70">
                            These assignments have unsaved progress. Continue before the deadline.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-col gap-2">
                            {drafts.map((draft) => (
                                <Link
                                    key={draft.id}
                                    href={`/student/courses/${draft.course_instance_id}/assignments/${draft.assignment_id}/attempt`}
                                    className="flex items-center gap-3 p-3 rounded-lg bg-background border border-warning-border hover:border-warning hover:shadow-sm transition-all group"
                                >
                                    <FileText className="h-4 w-4 text-warning shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium group-hover:text-warning-muted-foreground transition-colors truncate">
                                            {draft.assignment_title}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {draft.course_code} · Last saved {formatDistanceToNow(new Date(draft.submitted_at), { addSuffix: true })}
                                        </p>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="shrink-0 border-warning-border text-warning-muted-foreground hover:bg-warning/10"
                                    >
                                        Continue
                                        <ChevronRight className="h-3.5 w-3.5 ml-1.5" />
                                    </Button>
                                </Link>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Filters */}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search assignments or courses…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                    />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-40">
                        <SlidersHorizontal className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        {STATUS_OPTIONS.slice(1).map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={courseFilter} onValueChange={setCourseFilter}>
                    <SelectTrigger className="w-48">
                        <BookOpen className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                        <SelectValue placeholder="Course" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All courses</SelectItem>
                        {courses.map((c) => (
                            <SelectItem key={c.course_instance_id} value={c.course_instance_id}>
                                {c.course_code}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Submissions table */}
            {isLoading ? (
                <div className="flex flex-col gap-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-20 rounded-xl" />
                    ))}
                </div>
            ) : filtered.length === 0 ? (
                <Card className="border-dashed border-border/60">
                    <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
                        <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center">
                            <ClipboardList className="h-7 w-7 text-muted-foreground/50" />
                        </div>
                        <div className="text-center">
                            <p className="font-bold text-lg">No submissions found</p>
                            <p className="text-sm text-muted-foreground mt-1">
                                {search || statusFilter !== "all" || courseFilter !== "all"
                                    ? "Try adjusting your filters."
                                    : "Your submissions will appear here once you attempt an assignment."}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <div className="flex flex-col gap-3">
                    {filtered.map((sub) => (
                        <Link
                            key={sub.id}
                            href={`/student/courses/${sub.course_instance_id}/assignments/${sub.assignment_id}`}
                            className="group flex items-center gap-4 p-4 rounded-xl border border-border/60 hover:border-primary/30 hover:shadow-sm bg-card transition-all"
                        >
                            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                                <FileText className="h-5 w-5 text-primary" />
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <p className="font-semibold text-sm group-hover:text-primary transition-colors truncate">
                                        {sub.assignment_title}
                                    </p>
                                    {statusBadge(sub.status)}
                                    <Badge variant="outline" className="text-xs font-mono shrink-0">
                                        {sub.assignment_language}
                                    </Badge>
                                </div>
                                <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                                    <span className="flex items-center gap-1">
                                        <BookOpen className="h-3 w-3" />
                                        {sub.course_code} — {sub.course_title}
                                    </span>
                                    <span>Version {sub.version}</span>
                                    <span>
                                        {formatDistanceToNow(new Date(sub.submitted_at), {
                                            addSuffix: true,
                                        })}
                                    </span>
                                </div>
                            </div>

                            {/* Grade if available */}
                            {(sub as SubmissionWithContext & { grade?: string }).grade && (
                                <div className="text-center shrink-0">
                                    <p className="text-xs text-muted-foreground">Grade</p>
                                    <p className="text-lg font-black text-primary">
                                        {(sub as SubmissionWithContext & { grade?: string }).grade}
                                    </p>
                                </div>
                            )}

                            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
