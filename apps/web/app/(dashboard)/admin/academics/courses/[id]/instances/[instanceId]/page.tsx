'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    ArrowLeft,
    Users,
    UserCheck,
    Search,
    MoreHorizontal,
    Mail,
    ChevronLeft,
    ChevronRight,
    Loader2,
    AlertTriangle,
    RefreshCw,
    BookOpen,
    Calendar,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { courseInstancesApi, coursesApi, semestersApi, batchesApi } from '@/lib/api/academics';
import { useAcademicsAccess } from '@/lib/hooks/useAcademicsAccess';
import { handleApiError } from '@/lib/api/axios';
import { toast } from '@/lib/hooks/use-toast';
import { useUIStore } from '@/lib/stores/uiStore';
import type { CourseInstance, CourseInstructor, Enrollment, Course, Semester, Batch } from '@/types/academics.types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROSTER_PER_PAGE = 20;

function instanceStatusVariant(status: string) {
    if (status === 'Active') return 'success' as const;
    if (status === 'Planned') return 'info' as const;
    if (status === 'Completed') return 'secondary' as const;
    return 'destructive' as const;
}

function enrollmentStatusVariant(status: string) {
    if (status === 'Enrolled') return 'success' as const;
    if (status === 'Completed') return 'secondary' as const;
    if (status === 'Dropped') return 'destructive' as const;
    return 'secondary' as const;
}

function getInitials(name: string, email: string) {
    const src = name || email;
    return src
        .split(/[.\-_\s@]/)
        .map((p) => p[0]?.toUpperCase() ?? '')
        .slice(0, 2)
        .join('');
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CourseInstancePage() {
    const params = useParams();
    const { id, instanceId } = params as { id: string; instanceId: string };
    const router = useRouter();
    const { canAccess, canWrite } = useAcademicsAccess();
    const setPageTitle = useUIStore(s => s.setPageTitle);

    // ── Data state ──────────────────────────────────────────────────────
    const [instance, setInstance] = React.useState<CourseInstance | null>(null);
    const [course, setCourse] = React.useState<Course | null>(null);
    const [semester, setSemester] = React.useState<Semester | null>(null);
    const [batch, setBatch] = React.useState<Batch | null>(null);
    const [instructors, setInstructors] = React.useState<CourseInstructor[]>([]);
    const [enrollments, setEnrollments] = React.useState<Enrollment[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState('');

    // ── Search & pagination ─────────────────────────────────────────────
    const [search, setSearch] = React.useState('');
    const [rosterPage, setRosterPage] = React.useState(1);

    const fetchAll = React.useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const inst = await courseInstancesApi.getById(instanceId);
            setInstance(inst);

            const [courseData, semData, batData, instrData, enrollData] = await Promise.all([
                coursesApi.get(inst.course_id),
                semestersApi.get(inst.semester_id),
                batchesApi.get(inst.batch_id),
                courseInstancesApi.getInstructors(instanceId),
                courseInstancesApi.getEnrollments(instanceId),
            ]);

            setCourse(courseData);
            setSemester(semData);
            setBatch(batData);
            setInstructors(instrData);
            setEnrollments(enrollData);

            const title = courseData
                ? `${courseData.code}: ${courseData.title}`
                : `Instance ${instanceId.slice(0, 8)}`;
            setPageTitle(title);
        } catch (err) {
            const msg = handleApiError(err);
            setError(msg);
            toast.error('Failed to load instance details', msg);
        } finally {
            setLoading(false);
        }
    }, [instanceId, setPageTitle]);

    React.useEffect(() => {
        if (!canAccess) return;
        fetchAll();
    }, [canAccess, fetchAll]);

    React.useEffect(() => { return () => setPageTitle(null); }, [setPageTitle]);

    if (!canAccess) return null;

    if (loading) {
        return (
            <div className="flex h-[400px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error && !instance) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
                <AlertTriangle className="h-10 w-10 text-error" />
                <p className="text-sm text-muted-foreground">{error}</p>
                <Button variant="outline" onClick={fetchAll}>Try again</Button>
            </div>
        );
    }

    if (!instance) return null;

    // ── Filtered + paged roster ─────────────────────────────────────────
    const q = search.toLowerCase().trim();
    const filteredEnrollments = enrollments.filter((e) => {
        if (!q) return true;
        return (
            e.full_name.toLowerCase().includes(q) ||
            e.email.toLowerCase().includes(q) ||
            e.student_id.toLowerCase().includes(q)
        );
    });
    const totalRosterPages = Math.max(1, Math.ceil(filteredEnrollments.length / ROSTER_PER_PAGE));
    const pagedEnrollments = filteredEnrollments.slice(
        (rosterPage - 1) * ROSTER_PER_PAGE,
        rosterPage * ROSTER_PER_PAGE,
    );

    const pageTitle = course ? `${course.code}: ${course.title}` : `Instance ${instanceId.slice(0, 8)}`;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="space-y-4">
                <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-2 h-8 gap-1.5 text-muted-foreground hover:text-primary transition-colors"
                    onClick={() => router.back()}
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Course
                </Button>

                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="space-y-2">
                        <h1 className="text-2xl font-bold tracking-tight">{pageTitle}</h1>
                        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                            <Badge variant={instanceStatusVariant(instance.status)}>
                                {instance.status}
                            </Badge>
                            {semester && (
                                <span className="flex items-center gap-1.5">
                                    <Calendar className="h-3.5 w-3.5" />
                                    {semester.name} ({semester.term_type})
                                </span>
                            )}
                            {batch && (
                                <span className="flex items-center gap-1.5">
                                    <Users className="h-3.5 w-3.5" />
                                    {batch.name} ({batch.code})
                                </span>
                            )}
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 gap-2"
                        onClick={fetchAll}
                    >
                        <RefreshCw className="h-4 w-4" />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Card className="shadow-sm">
                    <CardContent className="flex items-center gap-3 p-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                            <Users className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{enrollments.length}</p>
                            <p className="text-xs text-muted-foreground">Enrolled</p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm">
                    <CardContent className="flex items-center gap-3 p-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                            <UserCheck className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{instance.max_enrollment}</p>
                            <p className="text-xs text-muted-foreground">Max Capacity</p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm">
                    <CardContent className="flex items-center gap-3 p-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                            <BookOpen className="h-5 w-5 text-secondary-foreground" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{instructors.length}</p>
                            <p className="text-xs text-muted-foreground">Instructors</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Instructors */}
            {instructors.length > 0 && (
                <Card className="shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold">Instructors</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-0">
                        {instructors.map((instr) => (
                            <div
                                key={instr.user_id}
                                className="flex items-center gap-3 rounded-lg border border-border p-3"
                            >
                                <Avatar className="h-10 w-10 shrink-0">
                                    <AvatarFallback className="bg-primary/10 text-primary text-sm">
                                        {getInitials(instr.full_name, instr.email)}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                    <p className="font-medium text-sm truncate">{instr.full_name}</p>
                                    <p className="text-xs text-muted-foreground truncate">{instr.role}</p>
                                </div>
                                <a
                                    href={`mailto:${instr.email}`}
                                    className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                                    title={instr.email}
                                >
                                    <Mail className="h-4 w-4" />
                                </a>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            {/* Roster */}
            <div className="space-y-3">
                <h2 className="text-lg font-semibold">
                    Roster
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                        ({enrollments.length} students)
                    </span>
                </h2>

                <Card className="shadow-sm overflow-hidden">
                    {/* Search bar */}
                    <div className="border-b border-border p-4">
                        <div className="relative max-w-sm">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Search by name, email or student ID…"
                                className="pl-9"
                                value={search}
                                onChange={(e) => {
                                    setSearch(e.target.value);
                                    setRosterPage(1);
                                }}
                            />
                        </div>
                    </div>

                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="min-w-[200px]">Student</TableHead>
                                <TableHead>Student ID</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="hidden md:table-cell">Enrolled</TableHead>
                                <TableHead className="hidden lg:table-cell">Grade</TableHead>
                                <TableHead className="w-10" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {pagedEnrollments.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="py-16 text-center text-muted-foreground">
                                        <Users className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
                                        <p className="font-medium">
                                            {q ? 'No students match your search' : 'No students enrolled yet'}
                                        </p>
                                        {!q && (
                                            <p className="text-sm mt-1">
                                                Students will appear here once enrolled.
                                            </p>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                pagedEnrollments.map((e) => (
                                    <TableRow key={e.user_id}>
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-9 w-9 shrink-0">
                                                    <AvatarFallback className="bg-muted text-sm">
                                                        {getInitials(e.full_name, e.email)}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div className="min-w-0">
                                                    <p className="font-medium text-sm truncate">{e.full_name || 'No Name'}</p>
                                                    <p className="text-xs text-muted-foreground truncate">{e.email}</p>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-mono text-sm text-muted-foreground">
                                            {e.student_id || '—'}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={enrollmentStatusVariant(e.status)}>
                                                {e.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground whitespace-nowrap">
                                            {new Date(e.enrolled_at).toLocaleDateString('en-US', { dateStyle: 'medium' })}
                                        </TableCell>
                                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                                            {e.final_grade ?? '—'}
                                        </TableCell>
                                        <TableCell>
                                            {canWrite && (
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                            <span className="sr-only">Open menu</span>
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-40">
                                                        <DropdownMenuItem className="gap-2" asChild>
                                                            <a href={`mailto:${e.email}`}>
                                                                <Mail className="h-4 w-4" />
                                                                Email Student
                                                            </a>
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>

                    {/* Pagination */}
                    {filteredEnrollments.length > ROSTER_PER_PAGE && (
                        <div className="flex items-center justify-between border-t border-border px-4 py-3">
                            <p className="text-sm text-muted-foreground">
                                Showing{' '}
                                <span className="font-medium text-foreground">
                                    {(rosterPage - 1) * ROSTER_PER_PAGE + 1}
                                </span>
                                –
                                <span className="font-medium text-foreground">
                                    {Math.min(rosterPage * ROSTER_PER_PAGE, filteredEnrollments.length)}
                                </span>{' '}
                                of{' '}
                                <span className="font-medium text-foreground">
                                    {filteredEnrollments.length}
                                </span>
                            </p>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-1"
                                    onClick={() => setRosterPage((p) => Math.max(1, p - 1))}
                                    disabled={rosterPage === 1}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                    Prev
                                </Button>
                                <span className="text-sm text-muted-foreground px-1">
                                    {rosterPage} / {totalRosterPages}
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-1"
                                    onClick={() => setRosterPage((p) => Math.min(totalRosterPages, p + 1))}
                                    disabled={rosterPage >= totalRosterPages}
                                >
                                    Next
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}
