'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    Edit3,
    Plus,
    Calendar,
    MoreVertical,
    ChevronLeft,
    ChevronRight,
    Loader2,
    AlertTriangle,
    Star,
    BookOpen,
    RefreshCw,
    Pencil,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
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
import { coursesApi, courseInstancesApi, semestersApi, batchesApi } from '@/lib/api/academics';
import { useAcademicsAccess } from '@/lib/hooks/useAcademicsAccess';
import { toast } from '@/lib/hooks/use-toast';
import { handleApiError } from '@/lib/api/axios';
import { useUIStore } from '@/lib/stores/uiStore';
import { EditCourseDialog } from '@/components/admin/academics/course-dialogs';
import { CreateCourseInstanceDialog, EditCourseInstanceDialog } from '@/components/admin/academics/course-instance-dialogs';
import type { Course, CourseInstance, Semester, Batch } from '@/types/academics.types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function instanceStatusVariant(status: string) {
    if (status === 'Active') return 'success' as const;
    if (status === 'Planned') return 'info' as const;
    if (status === 'Completed') return 'secondary' as const;
    return 'destructive' as const;
}

const INSTANCES_PER_PAGE = 10;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CourseDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;
    const { canAccess, canWrite } = useAcademicsAccess();
    const setPageTitle = useUIStore(s => s.setPageTitle);

    // ── Course state ──────────────────────────────────────────────────────
    const [course, setCourse] = React.useState<Course | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState('');

    // ── Instances state ───────────────────────────────────────────────────
    const [instances, setInstances] = React.useState<CourseInstance[]>([]);
    const [instancesLoading, setInstancesLoading] = React.useState(true);
    const [instancesError, setInstancesError] = React.useState('');
    const [instancesPage, setInstancesPage] = React.useState(1);

    // ── Lookup maps ───────────────────────────────────────────────────────
    const [semesterMap, setSemesterMap] = React.useState<Record<string, Semester>>({});
    const [batchMap, setBatchMap] = React.useState<Record<string, Batch>>({});

    // ── Dialog state ──────────────────────────────────────────────────────
    const [editCourseOpen, setEditCourseOpen] = React.useState(false);
    const [createInstanceOpen, setCreateInstanceOpen] = React.useState(false);
    const [editInstance, setEditInstance] = React.useState<CourseInstance | null>(null);

    const fetchCourse = React.useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const data = await coursesApi.get(id);
            setCourse(data);
            setPageTitle(data.title);
        } catch (err) {
            setError(handleApiError(err));
            toast.error('Failed to load course details');
        } finally {
            setLoading(false);
        }
    }, [id, setPageTitle]);

    const fetchInstances = React.useCallback(async () => {
        setInstancesLoading(true);
        setInstancesError('');
        try {
            const [instanceData, sems, bats] = await Promise.all([
                courseInstancesApi.listByCourse(id),
                semestersApi.list(true),
                batchesApi.list(true),
            ]);
            setInstances(instanceData);
            setSemesterMap(Object.fromEntries(sems.map((s) => [s.id, s])));
            setBatchMap(Object.fromEntries(bats.map((b) => [b.id, b])));
        } catch (err) {
            setInstancesError(handleApiError(err));
        } finally {
            setInstancesLoading(false);
        }
    }, [id]);

    React.useEffect(() => {
        if (!canAccess) return;
        fetchCourse();
        fetchInstances();
    }, [canAccess, fetchCourse, fetchInstances]);

    React.useEffect(() => { return () => setPageTitle(null); }, [setPageTitle]);

    if (!canAccess) return null;

    if (loading && !course) {
        return (
            <div className="flex h-[400px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!course && !loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
                <AlertTriangle className="h-10 w-10 text-error" />
                <p className="text-sm text-muted-foreground">{error || 'Course not found'}</p>
                <Button variant="outline" onClick={fetchCourse}>Try again</Button>
            </div>
        );
    }

    if (!course) return null;

    // Pagination
    const totalPages = Math.max(1, Math.ceil(instances.length / INSTANCES_PER_PAGE));
    const pagedInstances = instances.slice(
        (instancesPage - 1) * INSTANCES_PER_PAGE,
        instancesPage * INSTANCES_PER_PAGE,
    );

    return (
        <div className="space-y-8 max-w-6xl">
            {/* Breadcrumbs */}
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Link href="/admin/academics/courses" className="hover:text-primary transition-colors">Courses</Link>
                <span className="text-border">/</span>
                <span className="text-foreground">{course.code}</span>
            </div>

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-3">
                    <h1 className="text-3xl font-bold tracking-tight">
                        {course.code} — {course.title}
                    </h1>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        <Badge variant={course.is_active ? 'success' : 'secondary'}>
                            {course.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        <span className="flex items-center gap-1">
                            <Star className="h-3.5 w-3.5 fill-warning text-warning" />
                            {course.credits} {course.credits === 1 ? 'credit' : 'credits'}
                        </span>
                    </div>
                </div>

                {canWrite && (
                    <div className="flex items-center gap-3 shrink-0">
                        <Button
                            variant="outline"
                            className="gap-2 shadow-sm"
                            onClick={() => setEditCourseOpen(true)}
                        >
                            <Edit3 className="h-4 w-4" />
                            Edit Course
                        </Button>
                        <Button
                            className="gap-2 shadow-sm"
                            onClick={() => setCreateInstanceOpen(true)}
                        >
                            <Plus className="h-4 w-4" />
                            Create Instance
                        </Button>
                    </div>
                )}
            </div>

            {/* Course Description Card */}
            <Card className="bg-foreground dark:bg-card border-none text-background dark:text-foreground overflow-hidden relative shadow-lg rounded-2xl">
                <span className="absolute -bottom-8 right-0 text-[180px] font-black leading-none text-white/5 select-none tracking-tighter">
                    COURSE
                </span>
                <CardContent className="p-8 md:p-10 relative z-10 flex flex-col items-start gap-4 max-w-4xl">
                    <h3 className="text-xl font-bold tracking-tight">Course Description</h3>
                    <p className="text-sm leading-relaxed opacity-80">
                        {course.description || 'No description provided for this course.'}
                    </p>
                </CardContent>
            </Card>

            {/* Instances Section */}
            <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-border">
                    <div className="flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-primary" />
                        <h2 className="text-xl font-bold tracking-tight">Course Instances</h2>
                        {!instancesLoading && (
                            <Badge variant="secondary" className="ml-1">{instances.length}</Badge>
                        )}
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground"
                        onClick={fetchInstances}
                        disabled={instancesLoading}
                        title="Refresh instances"
                    >
                        <RefreshCw className={`h-4 w-4 ${instancesLoading ? 'animate-spin' : ''}`} />
                    </Button>
                </div>

                {instancesError && (
                    <div className="flex items-center gap-3 rounded-lg border border-warning-border bg-warning-muted px-4 py-3 text-sm text-warning-muted-foreground">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>{instancesError}</span>
                        <Button variant="ghost" size="sm" onClick={fetchInstances} className="ml-auto shrink-0">Retry</Button>
                    </div>
                )}

                <Card className="shadow-sm overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Semester</TableHead>
                                <TableHead>Batch</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-center">Max Enrollment</TableHead>
                                <TableHead className="hidden md:table-cell">Created</TableHead>
                                <TableHead className="w-10" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {instancesLoading ? (
                                Array.from({ length: 4 }).map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                                        <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-12 mx-auto" /></TableCell>
                                        <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                                        <TableCell><Skeleton className="h-8 w-8 rounded-md" /></TableCell>
                                    </TableRow>
                                ))
                            ) : pagedInstances.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="py-16 text-center text-muted-foreground">
                                        <Calendar className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
                                        <p className="font-medium">No instances yet</p>
                                        {canWrite && (
                                            <p className="text-sm mt-1">Create the first instance to schedule this course.</p>
                                        )}
                                        {canWrite && (
                                            <Button size="sm" className="mt-4 gap-1.5" onClick={() => setCreateInstanceOpen(true)}>
                                                <Plus className="h-4 w-4" /> Create Instance
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                pagedInstances.map((instance) => {
                                    const semester = semesterMap[instance.semester_id];
                                    const batch = batchMap[instance.batch_id];
                                    return (
                                        <TableRow key={instance.id} className="group">
                                            <TableCell>
                                                <Link
                                                    href={`/admin/academics/courses/${id}/instances/${instance.id}`}
                                                    className="font-medium hover:text-primary transition-colors"
                                                >
                                                    {semester
                                                        ? `${semester.name} (${semester.term_type})`
                                                        : instance.semester_id.slice(0, 8)}
                                                </Link>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {batch ? `${batch.name} (${batch.code})` : instance.batch_id.slice(0, 8)}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={instanceStatusVariant(instance.status)}>
                                                    {instance.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-center text-sm font-medium">
                                                {instance.max_enrollment}
                                            </TableCell>
                                            <TableCell className="hidden md:table-cell text-sm text-muted-foreground whitespace-nowrap">
                                                {new Date(instance.created_at).toLocaleDateString('en-US', { dateStyle: 'medium' })}
                                            </TableCell>
                                            <TableCell>
                                                {canWrite && (
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                                            >
                                                                <MoreVertical className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-40">
                                                            <DropdownMenuItem
                                                                className="gap-2"
                                                                onClick={() => router.push(`/admin/academics/courses/${id}/instances/${instance.id}`)}
                                                            >
                                                                <BookOpen className="h-3.5 w-3.5" /> View
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                className="gap-2"
                                                                onClick={() => setEditInstance(instance)}
                                                            >
                                                                <Pencil className="h-3.5 w-3.5" /> Edit
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>

                    {/* Pagination */}
                    {!instancesLoading && instances.length > INSTANCES_PER_PAGE && (
                        <div className="flex items-center justify-between border-t border-border px-4 py-3">
                            <p className="text-sm text-muted-foreground">
                                Showing{' '}
                                <span className="font-medium text-foreground">
                                    {(instancesPage - 1) * INSTANCES_PER_PAGE + 1}
                                </span>
                                –
                                <span className="font-medium text-foreground">
                                    {Math.min(instancesPage * INSTANCES_PER_PAGE, instances.length)}
                                </span>{' '}
                                of{' '}
                                <span className="font-medium text-foreground">{instances.length}</span>
                            </p>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-1"
                                    onClick={() => setInstancesPage((p) => Math.max(1, p - 1))}
                                    disabled={instancesPage === 1}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                    Prev
                                </Button>
                                <span className="text-sm text-muted-foreground px-1">
                                    {instancesPage} / {totalPages}
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-1"
                                    onClick={() => setInstancesPage((p) => Math.min(totalPages, p + 1))}
                                    disabled={instancesPage >= totalPages}
                                >
                                    Next
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </Card>
            </div>

            {/* Dialogs */}
            <EditCourseDialog
                open={editCourseOpen}
                onOpenChange={setEditCourseOpen}
                course={course}
                onSuccess={(updated) => {
                    setCourse(updated);
                    setPageTitle(updated.title);
                }}
            />
            <CreateCourseInstanceDialog
                open={createInstanceOpen}
                onOpenChange={setCreateInstanceOpen}
                courseId={id}
                onSuccess={(newInstance) => {
                    setInstances((prev) => [newInstance, ...prev]);
                }}
            />
            {editInstance && (
                <EditCourseInstanceDialog
                    open={!!editInstance}
                    onOpenChange={(o) => { if (!o) setEditInstance(null); }}
                    instance={editInstance}
                    semesterName={semesterMap[editInstance.semester_id]?.name}
                    batchName={batchMap[editInstance.batch_id]?.name}
                    onSuccess={(updated) => {
                        setInstances((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
                        setEditInstance(null);
                    }}
                />
            )}
        </div>
    );
}
