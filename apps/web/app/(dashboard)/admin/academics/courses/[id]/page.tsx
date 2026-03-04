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
    Settings,
    CalendarDays,
    Save,
    ArrowLeft,
    CheckCircle2,
    XCircle,
    Award,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
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
import { AcademicsDetailLayout } from '@/components/admin/academics/AcademicsDetailLayout';
import { DangerZone } from '@/components/admin/academics/DangerZone';
import type { Course, CourseInstance, Semester, Batch, UpdateCourseRequest } from '@/types/academics.types';

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

    // ── Tab & Settings state ──────────────────────────────────────────────
    const [activeTab, setActiveTab] = React.useState<'overview' | 'instances' | 'settings'>('overview');
    const [editValues, setEditValues] = React.useState<UpdateCourseRequest>({});
    const [saving, setSaving] = React.useState(false);

    const fetchCourse = React.useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const data = await coursesApi.get(id);
            setCourse(data);
            setPageTitle(data.title);
            setEditValues({ title: data.title, credits: data.credits, description: data.description ?? '' });
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

    async function handleSaveCourse(e: React.FormEvent) {
        e.preventDefault();
        if (!course) return;
        setSaving(true);
        try {
            const updated = await coursesApi.update(course.id, editValues);
            setCourse(updated);
            setPageTitle(updated.title);
            toast.success('Course updated', updated.title);
        } catch (err) {
            toast.error('Update failed', handleApiError(err));
        } finally {
            setSaving(false);
        }
    }

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
                <AlertTriangle className="h-10 w-10 text-destructive" />
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

    const tabs = [
        { id: 'overview' as const, label: 'Overview', icon: BookOpen },
        { id: 'instances' as const, label: 'Instances', icon: CalendarDays },
        { id: 'settings' as const, label: 'Settings', icon: Settings },
    ];

    return (
        <div className="space-y-6 w-full">
            {/* Breadcrumbs */}
            <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Link href="/admin/academics" className="hover:text-foreground transition-colors">Academics</Link>
                <ChevronRight className="h-3.5 w-3.5" />
                <Link href="/admin/academics/courses" className="hover:text-primary transition-colors">Courses</Link>
                <ChevronRight className="h-3.5 w-3.5" />
                <span className="text-foreground font-medium">{course.code}</span>
            </nav>

            {/* Header */}
            <div className="flex items-center gap-4">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => router.push('/admin/academics/courses')}
                >
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex-1 min-w-0">
                    <h1 className="text-3xl font-bold tracking-tight truncate">
                        {course.code} — {course.title}
                    </h1>
                </div>
                {canWrite && activeTab === 'instances' && (
                    <Button
                        className="gap-2 shadow-sm"
                        onClick={() => setCreateInstanceOpen(true)}
                    >
                        <Plus className="h-4 w-4" />
                        Create Instance
                    </Button>
                )}
            </div>

            {/* Tabbed Layout */}
            <AcademicsDetailLayout
                tabs={tabs}
                activeTab={activeTab}
                onTabChange={setActiveTab}
            >
                {/* Overview Tab */}
                {activeTab === 'overview' && (
                    <div className="space-y-6">
                        {/* Stats Grid */}
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            <Card>
                                <CardHeader className="pb-3">
                                    <CardDescription className="text-xs">Course Code</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex items-center gap-2">
                                        <Award className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-lg font-semibold">{course.code}</span>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="pb-3">
                                    <CardDescription className="text-xs">Course Title</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex items-center gap-2">
                                        <BookOpen className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-lg font-semibold truncate">{course.title}</span>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="pb-3">
                                    <CardDescription className="text-xs">Credits</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex items-center gap-2">
                                        <Star className="h-4 w-4 text-warning fill-warning" />
                                        <span className="text-lg font-semibold">{course.credits}</span>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="pb-3">
                                    <CardDescription className="text-xs">Total Instances</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex items-center gap-2">
                                        <CalendarDays className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-lg font-semibold">{instances.length}</span>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="pb-3">
                                    <CardDescription className="text-xs">Status</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Badge variant={course.is_active ? 'success' : 'secondary'}>
                                        {course.is_active ? (
                                            <><CheckCircle2 className="h-3 w-3 mr-1" /> Active</>
                                        ) : (
                                            <><XCircle className="h-3 w-3 mr-1" /> Inactive</>
                                        )}
                                    </Badge>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="pb-3">
                                    <CardDescription className="text-xs">Created</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <span className="text-sm text-muted-foreground">
                                        {new Date(course.created_at).toLocaleDateString('en-US', { dateStyle: 'medium' })}
                                    </span>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Description Card */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Course Description</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                                    {course.description || 'No description provided for this course.'}
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Instances Tab */}
                {activeTab === 'instances' && (
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
                )}

                {/* Settings Tab */}
                {activeTab === 'settings' && (
                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Course Settings</CardTitle>
                                <CardDescription>
                                    Update course information
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={handleSaveCourse} className="space-y-4">
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label htmlFor="code">Course Code</Label>
                                            <input
                                                id="code"
                                                type="text"
                                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                value={course.code}
                                                disabled
                                                title="Course code cannot be changed after creation"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="credits">Credits *</Label>
                                            <input
                                                id="credits"
                                                type="number"
                                                required
                                                min="0"
                                                step="0.5"
                                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                placeholder="e.g., 3"
                                                value={editValues.credits ?? ''}
                                                onChange={(e) => setEditValues({ ...editValues, credits: parseFloat(e.target.value) })}
                                                disabled={!canWrite}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="title">Course Title *</Label>
                                        <input
                                            id="title"
                                            type="text"
                                            required
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                            placeholder="e.g., Introduction to Programming"
                                            value={editValues.title ?? ''}
                                            onChange={(e) => setEditValues({ ...editValues, title: e.target.value })}
                                            disabled={!canWrite}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="description">Description</Label>
                                        <textarea
                                            id="description"
                                            rows={4}
                                            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                                            placeholder="Provide a detailed description of the course"
                                            value={editValues.description ?? ''}
                                            onChange={(e) => setEditValues({ ...editValues, description: e.target.value })}
                                            disabled={!canWrite}
                                        />
                                    </div>

                                    {canWrite && (
                                        <div className="flex justify-end pt-2">
                                            <Button type="submit" disabled={saving} className="gap-2">
                                                {saving ? (
                                                    <>
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                        Saving...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Save className="h-4 w-4" />
                                                        Save Changes
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    )}
                                </form>
                            </CardContent>
                        </Card>

                        {canWrite && (
                            <DangerZone
                                entityName={course.title}
                                entityType="course"
                                isActive={course.is_active}
                                onDeactivate={async () => {
                                    await coursesApi.deactivate(course.id);
                                    const updated = { ...course, is_active: false };
                                    setCourse(updated);
                                    toast.success('Course deactivated', course.title);
                                }}
                                onReactivate={async () => {
                                    await coursesApi.reactivate(course.id);
                                    const updated = { ...course, is_active: true };
                                    setCourse(updated);
                                    toast.success('Course reactivated', course.title);
                                }}
                            />
                        )}
                    </div>
                )}
            </AcademicsDetailLayout>

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
                courseCode={course?.code}
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
