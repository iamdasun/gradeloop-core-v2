'use client';

import * as React from 'react';
import {
    GraduationCap,
    Plus,
    Loader2,
    AlertTriangle,
    ArrowLeft,
    Pencil,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
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
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    coursesApi,
    semestersApi,
    batchesApi,
    courseInstancesApi,
    enrollmentsApi,
} from '@/lib/api/academics';
import { handleApiError } from '@/lib/api/axios';
import { toast } from '@/lib/hooks/use-toast';
import { useAcademicsAccess } from '@/lib/hooks/useAcademicsAccess';
import { ENROLLMENT_STATUSES } from '@/types/academics.types';
import type {
    Course,
    Semester,
    Batch,
    CourseInstance,
    Enrollment,
    EnrollmentStatus,
} from '@/types/academics.types';

const STATUS_COLOR: Record<string, string> = {
    Enrolled: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    Dropped: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
    Completed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    Failed: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

export default function StudentEnrollmentsPage() {
    const { canAccess, canWrite } = useAcademicsAccess();

    const [courses, setCourses] = React.useState<Course[]>([]);
    const [semesters, setSemesters] = React.useState<Semester[]>([]);
    const [batches, setBatches] = React.useState<Batch[]>([]);
    const [instances, setInstances] = React.useState<CourseInstance[]>([]);
    const [loading, setLoading] = React.useState(true);

    const [selectedBatch, setSelectedBatch] = React.useState('');
    const [selectedInstance, setSelectedInstance] = React.useState('');
    const [enrollments, setEnrollments] = React.useState<Enrollment[]>([]);
    const [enrollLoading, setEnrollLoading] = React.useState(false);

    // Enroll dialog
    const [enrollOpen, setEnrollOpen] = React.useState(false);
    const [enrollValues, setEnrollValues] = React.useState({
        course_instance_id: '',
        user_id: '',
        status: 'Enrolled' as EnrollmentStatus,
    });
    const [enrollSub, setEnrollSub] = React.useState(false);

    // Update dialog
    const [updateOpen, setUpdateOpen] = React.useState(false);
    const [updateTarget, setUpdateTarget] = React.useState<Enrollment | null>(null);
    const [updateValues, setUpdateValues] = React.useState({ status: '', final_grade: '' });
    const [updateSub, setUpdateSub] = React.useState(false);

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
            } catch (err) {
                toast.error('Failed to load data', handleApiError(err));
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    // Load instances when batch changes
    React.useEffect(() => {
        if (!selectedBatch) { setInstances([]); setSelectedInstance(''); return; }
        batchesApi.getCourseInstances(selectedBatch)
            .then(setInstances)
            .catch(() => setInstances([]));
    }, [selectedBatch]);

    // Load enrollments when instance changes
    React.useEffect(() => {
        if (!selectedInstance) { setEnrollments([]); return; }
        setEnrollLoading(true);
        courseInstancesApi.getEnrollments(selectedInstance)
            .then(setEnrollments)
            .catch(() => setEnrollments([]))
            .finally(() => setEnrollLoading(false));
    }, [selectedInstance]);

    async function refreshEnrollments() {
        if (!selectedInstance) return;
        const list = await courseInstancesApi.getEnrollments(selectedInstance);
        setEnrollments(list);
    }

    async function handleEnroll(e: React.FormEvent) {
        e.preventDefault();
        if (!enrollValues.course_instance_id || !enrollValues.user_id) {
            toast.error('All fields are required');
            return;
        }
        setEnrollSub(true);
        try {
            await enrollmentsApi.enroll(enrollValues);
            toast.success('Student enrolled');
            setEnrollOpen(false);
            if (enrollValues.course_instance_id === selectedInstance) await refreshEnrollments();
        } catch (err) {
            toast.error('Failed to enroll', handleApiError(err));
        } finally {
            setEnrollSub(false);
        }
    }

    function openUpdate(en: Enrollment) {
        setUpdateTarget(en);
        setUpdateValues({ status: en.status, final_grade: en.final_grade ?? '' });
        setUpdateOpen(true);
    }

    async function handleUpdate(e: React.FormEvent) {
        e.preventDefault();
        if (!updateTarget) return;
        setUpdateSub(true);
        try {
            await enrollmentsApi.update(updateTarget.course_instance_id, updateTarget.user_id, updateValues);
            toast.success('Enrollment updated');
            setUpdateOpen(false);
            await refreshEnrollments();
        } catch (err) {
            toast.error('Failed to update', handleApiError(err));
        } finally {
            setUpdateSub(false);
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
    const semesterName = (id: string) => semesters.find((s) => s.id === id)?.name ?? id.slice(0, 8);

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Link href="/admin/academics/enrollment">
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Student Enrollments</h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        Manage student enrollments in course instances.
                    </p>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
                </div>
            ) : (
                <>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                        <div className="space-y-1 flex-1 max-w-xs">
                            <Label className="text-xs text-zinc-500">Group</Label>
                            <Select value={selectedBatch} onValueChange={setSelectedBatch}>
                                <SelectTrigger><SelectValue placeholder="Select group…" /></SelectTrigger>
                                <SelectContent>
                                    {batches.map((b) => (
                                        <SelectItem key={b.id} value={b.id}>{b.name} ({b.code})</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1 flex-1 max-w-xs">
                            <Label className="text-xs text-zinc-500">Course Instance</Label>
                            <Select value={selectedInstance} onValueChange={setSelectedInstance} disabled={!selectedBatch}>
                                <SelectTrigger><SelectValue placeholder="Select instance…" /></SelectTrigger>
                                <SelectContent>
                                    {instances.map((ci) => (
                                        <SelectItem key={ci.id} value={ci.id}>
                                            {courseName(ci.course_id)} — {semesterName(ci.semester_id)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {canWrite && (
                            <Button onClick={() => { setEnrollValues({ course_instance_id: selectedInstance, user_id: '', status: 'Enrolled' }); setEnrollOpen(true); }} className="gap-2">
                                <Plus className="h-4 w-4" /> Enroll Student
                            </Button>
                        )}
                    </div>

                    {!selectedInstance && (
                        <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
                            <GraduationCap className="h-12 w-12 mb-3 opacity-40" />
                            <p className="text-sm">Select a group and course instance to view enrollments.</p>
                        </div>
                    )}

                    {selectedInstance && enrollLoading && (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
                        </div>
                    )}

                    {selectedInstance && !enrollLoading && enrollments.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
                            <GraduationCap className="h-12 w-12 mb-3 opacity-40" />
                            <p className="text-sm">No enrollments for this instance.</p>
                        </div>
                    )}

                    {enrollments.length > 0 && (
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Student ID</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Grade</TableHead>
                                        <TableHead>Enrolled At</TableHead>
                                        {canWrite && <TableHead className="w-10" />}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {enrollments.map((en) => (
                                        <TableRow key={`${en.course_instance_id}-${en.user_id}`}>
                                            <TableCell className="font-mono text-xs">{en.user_id}</TableCell>
                                            <TableCell>
                                                <Badge className={`text-xs border-0 ${STATUS_COLOR[en.status] ?? ''}`}>
                                                    {en.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-sm">{en.final_grade || '—'}</TableCell>
                                            <TableCell className="text-xs text-zinc-500">
                                                {new Date(en.enrolled_at).toLocaleDateString()}
                                            </TableCell>
                                            {canWrite && (
                                                <TableCell>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openUpdate(en)}>
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </Button>
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </>
            )}

            {/* Enroll dialog */}
            <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <GraduationCap className="h-5 w-5 text-zinc-600" />
                            Enroll Student
                        </DialogTitle>
                        <DialogDescription>Enroll a student into a course instance.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleEnroll} className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label>Course Instance</Label>
                            <Select value={enrollValues.course_instance_id} onValueChange={(v) => setEnrollValues((p) => ({ ...p, course_instance_id: v }))}>
                                <SelectTrigger><SelectValue placeholder="Select instance" /></SelectTrigger>
                                <SelectContent>
                                    {instances.map((ci) => (
                                        <SelectItem key={ci.id} value={ci.id}>
                                            {courseName(ci.course_id)} — {semesterName(ci.semester_id)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Student User ID</Label>
                            <Input
                                placeholder="Paste student UUID"
                                value={enrollValues.user_id}
                                onChange={(e) => setEnrollValues((p) => ({ ...p, user_id: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Status</Label>
                            <Select value={enrollValues.status} onValueChange={(v) => setEnrollValues((p) => ({ ...p, status: v as EnrollmentStatus }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {ENROLLMENT_STATUSES.map((s) => (
                                        <SelectItem key={s} value={s}>{s}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setEnrollOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={enrollSub}>
                                {enrollSub ? 'Enrolling…' : 'Enroll'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Update enrollment dialog */}
            <Dialog open={updateOpen} onOpenChange={setUpdateOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>Update Enrollment</DialogTitle>
                        <DialogDescription>
                            Student: <span className="font-mono text-xs">{updateTarget?.user_id}</span>
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleUpdate} className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label>Status</Label>
                            <Select value={updateValues.status} onValueChange={(v) => setUpdateValues((p) => ({ ...p, status: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {ENROLLMENT_STATUSES.map((s) => (
                                        <SelectItem key={s} value={s}>{s}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Final Grade</Label>
                            <Input
                                placeholder="e.g. A, B+, 3.7"
                                value={updateValues.final_grade}
                                onChange={(e) => setUpdateValues((p) => ({ ...p, final_grade: e.target.value }))}
                            />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setUpdateOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={updateSub}>
                                {updateSub ? 'Saving…' : 'Save'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
