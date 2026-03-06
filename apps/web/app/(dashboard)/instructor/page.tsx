"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/stores/authStore";
import {
    BookOpen,
    FileText,
    GraduationCap,
    Clock,
    CheckCircle2,
    AlertCircle,
    Settings,
    ArrowRight,
    Plus,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/instructor/status-badge";
import { DataTable, ColumnDef } from "@/components/instructor/data-table";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { instructorCoursesApi } from "@/lib/api/academics";
import { instructorAssessmentsApi } from "@/lib/api/assessments";
import { handleApiError } from "@/lib/api/axios";
import { StatsCard } from "@/components/instructor/stats-card";
import { SectionHeader } from "@/components/instructor/section-header";
import { EmptyStateCard } from "@/components/instructor/empty-state";
import { format, isPast, isWithinInterval, addDays } from "date-fns";

interface RecentSubmission {
    id: string;
    studentName: string;
    assignmentTitle: string;
    courseCode: string;
    submittedAt: string;
    status: "Graded" | "Pending" | "Late";
    score?: string;
}

// Mock recent submissions until real submissions endpoint returns per-instructor data
const mockRecentSubmissions: RecentSubmission[] = [
    {
        id: "sub-1",
        studentName: "Alice Smith",
        assignmentTitle: "Midterm Project Part 1",
        courseCode: "CS101",
        submittedAt: "2 hours ago",
        status: "Pending",
    },
    {
        id: "sub-2",
        studentName: "Bob Johnson",
        assignmentTitle: "Weekly Quiz 4",
        courseCode: "MA201",
        submittedAt: "5 hours ago",
        status: "Graded",
        score: "95/100",
    },
    {
        id: "sub-3",
        studentName: "Charlie Brown",
        assignmentTitle: "Lab Report 3",
        courseCode: "PHY101",
        submittedAt: "1 day ago",
        status: "Late",
    },
    {
        id: "sub-4",
        studentName: "Diana Prince",
        assignmentTitle: "Midterm Project Part 1",
        courseCode: "CS101",
        submittedAt: "1 day ago",
        status: "Graded",
        score: "88/100",
    },
];

const submissionColumns: ColumnDef<RecentSubmission, any>[] = [
    {
        accessorKey: "studentName",
        header: "Student",
        cell: ({ row }) => (
            <div className="font-semibold text-foreground">{row.getValue("studentName")}</div>
        ),
    },
    {
        accessorKey: "assignmentTitle",
        header: "Assignment",
        cell: ({ row }) => (
            <div className="flex flex-col">
                <span className="text-sm font-medium">{row.getValue("assignmentTitle")}</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    {row.original.courseCode}
                </span>
            </div>
        ),
    },
    {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.getValue("status")} />,
    },
    {
        accessorKey: "score",
        header: "Score",
        cell: ({ row }) => {
            const score = row.original.score;
            return score ? (
                <span className="font-mono font-semibold text-sm">{score}</span>
            ) : (
                <span className="text-muted-foreground">—</span>
            );
        },
    },
    {
        accessorKey: "submittedAt",
        header: "Time",
        cell: ({ row }) => (
            <div className="text-muted-foreground text-sm whitespace-nowrap">
                {row.getValue("submittedAt")}
            </div>
        ),
    },
];

export default function InstructorDashboardPage() {
    const user = useAuthStore((s) => s.user);
    const displayName = user?.full_name || user?.email || "Instructor";

    const [stats, setStats] = React.useState({
        coursesCount: 0,
        studentsCount: 0,
        assignmentsCount: 0,
        pendingSubmissions: 0,
    });
    const [upcomingDeadlines, setUpcomingDeadlines] = React.useState<
        { id: string; title: string; courseCode: string; due: Date; instanceId: string }[]
    >([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        let mounted = true;

        async function fetchDashboardStats() {
            try {
                setIsLoading(true);

                const [courses, assignments] = await Promise.all([
                    instructorCoursesApi.listMyCourses(),
                    instructorAssessmentsApi.listMyAssignments(),
                ]);

                const enrollmentsPromises = courses.map((c) =>
                    instructorCoursesApi.listMyStudents(c.course_instance_id)
                );
                const allEnrollments = await Promise.all(enrollmentsPromises);

                const uniqueStudents = new Set<string>();
                allEnrollments.flat().forEach((e) => uniqueStudents.add(e.user_id));

                // Derive upcoming deadlines from assignments (due within next 7 days)
                const now = new Date();
                const soon = addDays(now, 7);
                const deadlines = assignments
                    .filter((a) => {
                        if (!a.due_at) return false;
                        const due = new Date(a.due_at);
                        return isWithinInterval(due, { start: now, end: soon });
                    })
                    .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime())
                    .slice(0, 5)
                    .map((a) => {
                        const course = courses.find(
                            (c) => c.course_instance_id === a.course_instance_id
                        );
                        return {
                            id: a.id,
                            title: a.title,
                            courseCode: course?.course_code ?? "—",
                            due: new Date(a.due_at!),
                            instanceId: a.course_instance_id,
                        };
                    });

                if (mounted) {
                    setStats({
                        coursesCount: courses.length,
                        studentsCount: uniqueStudents.size,
                        assignmentsCount: assignments.length,
                        pendingSubmissions: mockRecentSubmissions.filter((s) => s.status === "Pending")
                            .length,
                    });
                    setUpcomingDeadlines(deadlines);
                }
            } catch (err) {
                if (mounted) setError(handleApiError(err));
            } finally {
                if (mounted) setIsLoading(false);
            }
        }

        fetchDashboardStats();
        return () => {
            mounted = false;
        };
    }, []);

    return (
        <div className="flex flex-col gap-8 pb-8">
            {/* Header */}
            <SectionHeader
                title={`Welcome back, ${displayName.split(" ")[0]}`}
                description="Your instructor workspace — manage courses, assignments, and student submissions."
            />

            {error && (
                <div className="flex gap-3 p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive text-sm">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                </div>
            )}

            {/* KPI cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatsCard
                    title="Active Courses"
                    icon={BookOpen}
                    value={stats.coursesCount.toString()}
                    isLoading={isLoading}
                    subtitle={
                        stats.coursesCount > 0
                            ? "Assigned this semester"
                            : "Awaiting admin assignment"
                    }
                />
                <StatsCard
                    title="Total Students"
                    icon={GraduationCap}
                    value={stats.studentsCount.toString()}
                    isLoading={isLoading}
                    subtitle="Unique across all courses"
                />
                <StatsCard
                    title="Total Assignments"
                    icon={FileText}
                    value={stats.assignmentsCount.toString()}
                    isLoading={isLoading}
                    subtitle="Created by you"
                />
                <StatsCard
                    title="Pending Review"
                    icon={CheckCircle2}
                    value={stats.pendingSubmissions.toString()}
                    isLoading={isLoading}
                    subtitle="Submissions awaiting grade"
                    badge={stats.pendingSubmissions > 0 ? "Action needed" : undefined}
                    badgeVariant="destructive"
                />
            </div>

            {/* Main activity grid */}
            <div className="grid gap-6 lg:grid-cols-3">
                {/* Recent Submissions (2/3 width) */}
                <div className="lg:col-span-2 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold font-heading">Recent Submissions</h2>
                        <Button variant="ghost" size="sm" className="h-8 text-primary gap-1" asChild>
                            <Link href="/instructor/courses">
                                View All <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                        </Button>
                    </div>
                    {isLoading ? (
                        <div className="space-y-3">
                            {[1, 2, 3].map((i) => (
                                <Skeleton key={i} className="h-14 w-full rounded-xl" />
                            ))}
                        </div>
                    ) : (
                        <DataTable
                            columns={submissionColumns}
                            data={mockRecentSubmissions}
                            isLoading={false}
                        />
                    )}
                </div>

                {/* Upcoming Deadlines (1/3 width) */}
                <div className="flex flex-col gap-4">
                    <h2 className="text-xl font-bold font-heading">Upcoming Deadlines</h2>
                    <Card className="border-border/60 bg-background flex-1">
                        <CardContent className="p-0">
                            {isLoading ? (
                                <div className="p-4 space-y-3">
                                    {[1, 2, 3].map((i) => (
                                        <Skeleton key={i} className="h-16 w-full rounded-xl" />
                                    ))}
                                </div>
                            ) : upcomingDeadlines.length === 0 ? (
                                <div className="p-8 flex flex-col items-center text-center gap-2">
                                    <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center">
                                        <Clock className="h-6 w-6 text-muted-foreground/60" />
                                    </div>
                                    <p className="text-sm font-semibold text-foreground">No upcoming deadlines</p>
                                    <p className="text-xs text-muted-foreground">
                                        Assignments with deadlines in the next 7 days will appear here.
                                    </p>
                                </div>
                            ) : (
                                <div className="divide-y divide-border/40">
                                    {upcomingDeadlines.map((deadline) => {
                                        const isUrgent = isWithinInterval(deadline.due, {
                                            start: new Date(),
                                            end: addDays(new Date(), 1),
                                        });
                                        return (
                                            <div
                                                key={deadline.id}
                                                className="p-4 flex items-start gap-3 hover:bg-muted/30 transition-colors"
                                            >
                                                <div
                                                    className={cn(
                                                        "mt-0.5 h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                                                        isUrgent
                                                            ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                                                            : "bg-primary/10 text-primary"
                                                    )}
                                                >
                                                    <Clock className="h-4 w-4" />
                                                </div>
                                                <div className="flex flex-col min-w-0 flex-1">
                                                    <div className="flex items-center justify-between gap-2 mb-0.5">
                                                        <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                                                            {deadline.courseCode}
                                                        </span>
                                                        {isUrgent && (
                                                            <span className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 rounded">
                                                                Due Soon
                                                            </span>
                                                        )}
                                                    </div>
                                                    <h4 className="font-semibold text-sm text-foreground truncate">
                                                        {deadline.title}
                                                    </h4>
                                                    <p className="text-xs text-muted-foreground mt-0.5">
                                                        {format(deadline.due, "MMM d • h:mm a")}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            <div className="p-4 border-t border-border/40 bg-muted/10">
                                <Button
                                    variant="outline"
                                    className="w-full text-xs font-semibold h-8"
                                    asChild
                                >
                                    <Link href="/instructor/courses">Manage Assignments</Link>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Quick Access */}
            <div>
                <h2 className="text-lg font-bold mb-4 font-heading">Quick Access</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {[
                        {
                            href: "/instructor/courses",
                            icon: BookOpen,
                            title: "My Courses",
                            desc: "View and manage courses you are assigned to instruct.",
                            action: "Open Courses",
                        },
                        {
                            href: "/instructor/courses",
                            icon: Plus,
                            title: "Create Assignment",
                            desc: "Select a course and create a new graded assignment.",
                            action: "Select Course",
                        },
                        {
                            href: "/instructor/settings",
                            icon: Settings,
                            title: "Settings",
                            desc: "Manage your instructor profile and preferences.",
                            action: "Open Settings",
                        },
                    ].map((item) => {
                        const Icon = item.icon;
                        return (
                            <Card
                                key={item.href + item.title}
                                className="group border-border/60 hover:border-primary/30 hover:shadow-md transition-all duration-200 bg-background"
                            >
                                <CardContent className="p-6 flex flex-col gap-4">
                                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                                        <Icon className="h-5 w-5 text-primary" />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-bold">{item.title}</h3>
                                        <p className="text-sm text-muted-foreground mt-0.5">{item.desc}</p>
                                    </div>
                                    <Button variant="outline" size="sm" className="w-fit" asChild>
                                        <Link href={item.href}>{item.action}</Link>
                                    </Button>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
