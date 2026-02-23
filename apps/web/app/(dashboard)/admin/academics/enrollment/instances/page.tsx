'use client';

import * as React from 'react';
import {
    BookOpen,
    Plus,
    Loader2,
    AlertTriangle,
    ArrowLeft,
    Pencil,
    LayoutGrid,
    Users,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import {
    coursesApi,
    semestersApi,
    batchesApi,
    courseInstancesApi,
} from '@/lib/api/academics';
import { handleApiError } from '@/lib/api/axios';
import { toast } from '@/lib/hooks/use-toast';
import { useAcademicsAccess } from '@/lib/hooks/useAcademicsAccess';
import { COURSE_INSTANCE_STATUSES } from '@/types/academics.types';
import type {
    Course,
    Semester,
    Batch,
    CourseInstance,
    CourseInstanceStatus,
    AcademicFormErrors,
} from '@/types/academics.types';

const STATUS_COLOR: Record<string, string> = {
    Planned: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    Active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    Completed: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
    Cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

export default function CourseInstancesPage() {
    const { canAccess, canWrite } = useAcademicsAccess();

    const [courses, setCourses] = React.useState<Course[]>([]);
    const [semesters, setSemesters] = React.useState<Semester[]>([]);
    const [batches, setBatches] = React.useState<Batch[]>([]);
    const [loading, setLoading] = React.useState(true);

    const [instancesByBatch, setInstancesByBatch] = React.useState<Record<string, CourseInstance[]>>({});
    const [fetchingBatches, setFetchingBatches] = React.useState<Record<string, boolean>>({});

    // Create dialog
    const [createOpen, setCreateOpen] = React.useState(false);
    const [createValues, setCreateValues] = React.useState({
        course_id: '',
        semester_id: '',
        batch_id: '',
        status: 'Planned' as CourseInstanceStatus,
        max_enrollment: 60,
    });
    const [createErrors, setCreateErrors] = React.useState<AcademicFormErrors>({});
    const [createSub, setCreateSub] = React.useState(false);

    // Edit dialog
    const [editOpen, setEditOpen] = React.useState(false);
    const [editTarget, setEditTarget] = React.useState<CourseInstance | null>(null);
    const [editValues, setEditValues] = React.useState({ status: '', max_enrollment: 0 });
    const [editSub, setEditSub] = React.useState(false);

    React.useEffect(() => {
        async function load() {
            try {
                const [c, s, b] = await Promise.all([
                    coursesApi.list(),
                    semestersApi.list(),
                    batchesApi.list(),
                ]);
                setCourses(c);
                setSemesters(s);
                setBatches(b);

                // Pre-fetch instances for all batches
                const instancesMap: Record<string, CourseInstance[]> = {};
                await Promise.allSettled(
                    b.map(async (batch) => {
                        const list = await batchesApi.getCourseInstances(batch.id);
                        instancesMap[batch.id] = list;
                    })
                );
                setInstancesByBatch(instancesMap);

            } catch (err) {
                toast.error('Failed to load reference data', handleApiError(err));
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    const fetchInstancesForBatch = async (batchId: string) => {
        setFetchingBatches(p => ({ ...p, [batchId]: true }));
        try {
            const list = await batchesApi.getCourseInstances(batchId);
            setInstancesByBatch(p => ({ ...p, [batchId]: list }));
        } catch (err) {
            toast.error('Failed to refresh instances', handleApiError(err));
        } finally {
            setFetchingBatches(p => ({ ...p, [batchId]: false }));
        }
    };

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        const errs: AcademicFormErrors = {};
        if (!createValues.course_id) errs.course_id = 'Required';
        if (!createValues.semester_id) errs.semester_id = 'Required';
        if (!createValues.batch_id) errs.batch_id = 'Required';
        if (createValues.max_enrollment <= 0) errs.max_enrollment = 'Must be positive';
        if (Object.keys(errs).length > 0) { setCreateErrors(errs); return; }

        setCreateSub(true);
        try {
            await courseInstancesApi.create(createValues);
            toast.success('Course instance created');
            setCreateOpen(false);
            await fetchInstancesForBatch(createValues.batch_id);
        } catch (err) {
            toast.error('Failed to create', handleApiError(err));
        } finally {
            setCreateSub(false);
        }
    }

    function openEdit(ci: CourseInstance) {
        setEditTarget(ci);
        setEditValues({ status: ci.status, max_enrollment: ci.max_enrollment });
        setEditOpen(true);
    }

    async function handleEdit(e: React.FormEvent) {
        e.preventDefault();
        if (!editTarget) return;
        setEditSub(true);
        try {
            await courseInstancesApi.update(editTarget.id, {
                status: editValues.status,
                max_enrollment: editValues.max_enrollment,
            });
            toast.success('Instance updated');
            setEditOpen(false);
            await fetchInstancesForBatch(editTarget.batch_id);
        } catch (err) {
            toast.error('Failed to update', handleApiError(err));
        } finally {
            setEditSub(false);
        }
    }

    if (!canAccess) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-zinc-400">
                <AlertTriangle className="h-10 w-10 mb-3" />
                <p>You don&apos;t have permission to view this page.</p>
            </div>
        );
    }

    const courseName = (id: string) => courses.find((c) => c.id === id)?.title ?? id.slice(0, 8);
    const courseCode = (id: string) => courses.find((c) => c.id === id)?.code ?? '';
    const semesterName = (id: string) => semesters.find((s) => s.id === id)?.name ?? id.slice(0, 8);

    return (
        <div className="space-y-8 pb-10">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-6">
                <div className="flex items-start gap-4">
                    <Link href="/admin/academics/enrollment">
                        <Button variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-full bg-background mt-1 hover:bg-muted/50 transition-colors">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div className="space-y-1">
                        <h1 className="text-3xl font-black tracking-tight lg:text-4xl text-foreground font-serif">
                            Course Instances
                        </h1>
                        <p className="text-sm text-muted-foreground font-medium flex items-center gap-2">
                            <LayoutGrid className="h-4 w-4" />
                            Grouped by Batches
                        </p>
                    </div>
                </div>
                {canWrite && (
                    <Button
                        onClick={() => { setCreateValues((prev) => ({ ...prev, batch_id: '' })); setCreateErrors({}); setCreateOpen(true); }}
                        className="gap-2 h-10 px-5 shadow-sm rounded-full shrink-0"
                    >
                        <Plus className="h-4 w-4" /> New Instance
                    </Button>
                )}
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-32 space-y-4">
                    <div className="relative">
                        <div className="absolute inset-0 rounded-full blur-xl bg-primary/20 animate-pulse" />
                        <Loader2 className="h-10 w-10 animate-spin text-primary relative z-10" />
                    </div>
                    <p className="text-sm text-muted-foreground font-medium tracking-wide uppercase">Organizing curriculum...</p>
                </div>
            ) : batches.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center rounded-2xl border border-dashed border-border/60 bg-muted/10">
                    <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                        <Users className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-bold">No Batches Found</h3>
                    <p className="text-sm text-muted-foreground max-w-sm mt-1 mb-6">
                        Course instances are grouped by batches, but there are no batches available yet. Create a batch first.
                    </p>
                </div>
            ) : (
                <Accordion
                    type="multiple"
                    className="w-full space-y-4"
                    defaultValue={batches.slice(0, 3).map(b => b.id)}
                >
                    {batches.map((batch) => {
                        const batchInstances = instancesByBatch[batch.id] || [];
                        const isFetching = fetchingBatches[batch.id];

                        let startYear = new Date().getFullYear();
                        let endYear = new Date().getFullYear() + 4;
                        if (batch.start_year) {
                            startYear = new Date(batch.start_year).getFullYear();
                        }
                        if (batch.end_year) {
                            endYear = new Date(batch.end_year).getFullYear();
                        }

                        return (
                            <AccordionItem
                                key={batch.id}
                                value={batch.id}
                                className="border border-border/50 bg-card rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300 group/accordion"
                            >
                                <AccordionTrigger className="px-6 py-5 hover:no-underline hover:bg-muted/30 transition-colors">
                                    <div className="flex items-center justify-between w-full pr-4 text-left">
                                        <div className="flex items-center gap-4">
                                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 group-hover/accordion:bg-primary/20 transition-colors">
                                                <Users className="h-5 w-5 text-primary" />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-bold tracking-tight group-hover/accordion:text-primary transition-colors">
                                                    {batch.name}
                                                </h3>
                                                <p className="text-xs text-muted-foreground font-mono mt-0.5">
                                                    {batch.code} • {startYear} - {endYear}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Badge variant="secondary" className="bg-muted text-muted-foreground rounded-full px-3 py-0.5 font-medium border-0">
                                                {batchInstances.length} {batchInstances.length === 1 ? 'Instance' : 'Instances'}
                                            </Badge>
                                        </div>
                                    </div>
                                </AccordionTrigger>

                                <AccordionContent className="px-6 pb-6 pt-2 bg-muted/10 border-t border-border/40">
                                    {isFetching ? (
                                        <div className="flex justify-center py-10">
                                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                        </div>
                                    ) : batchInstances.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-12 text-center rounded-xl border border-dashed border-border/50 bg-background/50">
                                            <BookOpen className="h-10 w-10 text-muted-foreground/30 mb-3" />
                                            <p className="text-sm font-medium text-muted-foreground">No course instances planned</p>
                                            {canWrite && (
                                                <Button
                                                    variant="link"
                                                    className="text-xs text-primary mt-1 h-auto p-0"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        setCreateValues({ ...createValues, batch_id: batch.id });
                                                        setCreateErrors({});
                                                        setCreateOpen(true);
                                                    }}
                                                >
                                                    Create one for this batch
                                                </Button>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 pt-4">
                                            {batchInstances.map((ci, idx) => (
                                                <Card
                                                    key={ci.id}
                                                    className="group/card relative overflow-hidden border-border/60 hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 bg-background translate-y-0 hover:-translate-y-1"
                                                    style={{ animationDelay: `${idx * 50}ms`, animationFillMode: 'both' }}
                                                >
                                                    <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-primary/40 to-primary/10 opacity-0 group-hover/card:opacity-100 transition-opacity" />
                                                    <CardContent className="p-5">
                                                        <div className="flex items-start justify-between gap-2 mb-3">
                                                            <div className="min-w-0 flex-1">
                                                                <h4 className="font-bold text-base leading-tight truncate mb-1 text-foreground" title={courseName(ci.course_id)}>
                                                                    {courseName(ci.course_id)}
                                                                </h4>
                                                                <p className="text-xs text-muted-foreground font-mono inline-flex items-center bg-muted px-1.5 py-0.5 rounded-sm">
                                                                    {courseCode(ci.course_id)}
                                                                </p>
                                                            </div>
                                                            {canWrite && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-8 w-8 rounded-full opacity-0 group-hover/card:opacity-100 transition-opacity focus:opacity-100 shrink-0 bg-muted/50 hover:bg-muted"
                                                                    onClick={(e) => { e.preventDefault(); openEdit(ci); }}
                                                                >
                                                                    <Pencil className="h-3.5 w-3.5" />
                                                                </Button>
                                                            )}
                                                        </div>

                                                        <div className="space-y-4">
                                                            <div className="flex items-center justify-between text-sm">
                                                                <span className="text-muted-foreground">Semester:</span>
                                                                <span className="font-medium truncate max-w-[120px]" title={semesterName(ci.semester_id)}>
                                                                    {semesterName(ci.semester_id)}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center justify-between text-sm">
                                                                <span className="text-muted-foreground">Capacity:</span>
                                                                <span className="font-medium">{ci.max_enrollment} students</span>
                                                            </div>
                                                        </div>

                                                        <div className="mt-5 pt-4 border-t border-border/50 flex gap-2 items-center justify-end">
                                                            <Badge className={`text-[10px] uppercase font-bold tracking-wider rounded-md border-0 px-2 py-0.5 ${STATUS_COLOR[ci.status] ?? ''}`}>
                                                                {ci.status}
                                                            </Badge>
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            ))}
                                        </div>
                                    )}
                                </AccordionContent>
                            </AccordionItem>
                        );
                    })}
                </Accordion>
            )}

            {/* Create dialog */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden rounded-2xl border-border/50 shadow-2xl">
                    <div className="bg-muted/30 px-6 py-4 border-b border-border/50">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 text-xl font-serif">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                                    <BookOpen className="h-4 w-4 text-primary" />
                                </div>
                                Create Course Instance
                            </DialogTitle>
                            <DialogDescription className="text-sm mt-1">
                                Add a new course offering for a specific batch and semester.
                            </DialogDescription>
                        </DialogHeader>
                    </div>
                    <form onSubmit={handleCreate} className="space-y-5 p-6">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Course</Label>
                            <Select value={createValues.course_id} onValueChange={(v) => setCreateValues((p) => ({ ...p, course_id: v }))}>
                                <SelectTrigger className="h-10 border-border/60 focus:ring-primary/20 bg-background"><SelectValue placeholder="Select course" /></SelectTrigger>
                                <SelectContent>
                                    {courses.map((c) => (
                                        <SelectItem key={c.id} value={c.id}>{c.title} <span className="text-muted-foreground text-xs ml-1 font-mono">({c.code})</span></SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {createErrors.course_id && <p className="text-xs text-destructive font-medium">{createErrors.course_id}</p>}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Semester</Label>
                                <Select value={createValues.semester_id} onValueChange={(v) => setCreateValues((p) => ({ ...p, semester_id: v }))}>
                                    <SelectTrigger className="h-10 border-border/60 focus:ring-primary/20 bg-background"><SelectValue placeholder="Select" /></SelectTrigger>
                                    <SelectContent>
                                        {semesters.map((s) => (
                                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {createErrors.semester_id && <p className="text-xs text-destructive font-medium">{createErrors.semester_id}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Batch</Label>
                                <Select value={createValues.batch_id} onValueChange={(v) => setCreateValues((p) => ({ ...p, batch_id: v }))}>
                                    <SelectTrigger className="h-10 border-border/60 focus:ring-primary/20 bg-background"><SelectValue placeholder="Select" /></SelectTrigger>
                                    <SelectContent>
                                        {batches.map((b) => (
                                            <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {createErrors.batch_id && <p className="text-xs text-destructive font-medium">{createErrors.batch_id}</p>}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</Label>
                                <Select value={createValues.status} onValueChange={(v) => setCreateValues((p) => ({ ...p, status: v as CourseInstanceStatus }))}>
                                    <SelectTrigger className="h-10 border-border/60 focus:ring-primary/20 bg-background"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {COURSE_INSTANCE_STATUSES.map((s) => (
                                            <SelectItem key={s} value={s}>{s}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Max Enrollment</Label>
                                <Input
                                    type="number"
                                    min={1}
                                    className="h-10 border-border/60 focus-visible:ring-primary/20 bg-background"
                                    value={createValues.max_enrollment}
                                    onChange={(e) => setCreateValues((p) => ({ ...p, max_enrollment: parseInt(e.target.value, 10) || 0 }))}
                                />
                                {createErrors.max_enrollment && <p className="text-xs text-destructive font-medium">{createErrors.max_enrollment}</p>}
                            </div>
                        </div>

                        <DialogFooter className="pt-4 border-t border-border/40 space-x-2">
                            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)} className="rounded-full">Cancel</Button>
                            <Button type="submit" disabled={createSub} className="rounded-full px-6 shadow-sm">
                                {createSub ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...</> : 'Create Instance'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Edit dialog */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent className="sm:max-w-[400px] p-0 overflow-hidden rounded-2xl border-border/50 shadow-2xl">
                    <div className="bg-muted/30 px-6 py-4 border-b border-border/50">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 text-xl font-serif">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                                    <Pencil className="h-4 w-4 text-primary" />
                                </div>
                                Update Instance
                            </DialogTitle>
                            <DialogDescription className="text-sm mt-1 truncate" title={editTarget ? `${courseName(editTarget.course_id)} — ${semesterName(editTarget.semester_id)}` : ''}>
                                {editTarget && `${courseName(editTarget.course_id)} — ${semesterName(editTarget.semester_id)}`}
                            </DialogDescription>
                        </DialogHeader>
                    </div>
                    <form onSubmit={handleEdit} className="space-y-5 p-6">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</Label>
                            <Select value={editValues.status} onValueChange={(v) => setEditValues((p) => ({ ...p, status: v }))}>
                                <SelectTrigger className="h-10 border-border/60 focus:ring-primary/20 bg-background"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {COURSE_INSTANCE_STATUSES.map((s) => (
                                        <SelectItem key={s} value={s}>{s}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Max Enrollment</Label>
                            <Input
                                type="number"
                                min={1}
                                className="h-10 border-border/60 focus-visible:ring-primary/20 bg-background"
                                value={editValues.max_enrollment}
                                onChange={(e) => setEditValues((p) => ({ ...p, max_enrollment: parseInt(e.target.value, 10) || 0 }))}
                            />
                        </div>
                        <DialogFooter className="pt-4 border-t border-border/40 space-x-2">
                            <Button type="button" variant="ghost" onClick={() => setEditOpen(false)} className="rounded-full">Cancel</Button>
                            <Button type="submit" disabled={editSub} className="rounded-full px-6 shadow-sm">
                                {editSub ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : 'Save Changes'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
