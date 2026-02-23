'use client';

import * as React from 'react';
import {
    UserCog,
    Plus,
    Loader2,
    AlertTriangle,
    ArrowLeft,
    Trash2,
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
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    coursesApi,
    semestersApi,
    batchesApi,
    courseInstancesApi,
    courseInstructorsApi,
} from '@/lib/api/academics';
import { handleApiError } from '@/lib/api/axios';
import { toast } from '@/lib/hooks/use-toast';
import { useAcademicsAccess } from '@/lib/hooks/useAcademicsAccess';
import { INSTRUCTOR_ROLES } from '@/types/academics.types';
import type {
    Course,
    Semester,
    Batch,
    CourseInstance,
    CourseInstructor,
    InstructorRole,
} from '@/types/academics.types';

const ROLE_COLOR: Record<string, string> = {
    'Lead Instructor': 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
    Instructor: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    TA: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
};

export default function CourseInstructorsPage() {
    const { canAccess, canWrite } = useAcademicsAccess();

    const [courses, setCourses] = React.useState<Course[]>([]);
    const [semesters, setSemesters] = React.useState<Semester[]>([]);
    const [batches, setBatches] = React.useState<Batch[]>([]);
    const [instances, setInstances] = React.useState<CourseInstance[]>([]);
    const [loading, setLoading] = React.useState(true);

    const [selectedBatch, setSelectedBatch] = React.useState('');
    const [selectedInstance, setSelectedInstance] = React.useState('');
    const [instructors, setInstructors] = React.useState<CourseInstructor[]>([]);
    const [instrLoading, setInstrLoading] = React.useState(false);

    // Assign dialog
    const [assignOpen, setAssignOpen] = React.useState(false);
    const [assignValues, setAssignValues] = React.useState({
        course_instance_id: '',
        user_id: '',
        role: 'Instructor' as InstructorRole,
    });
    const [assignSub, setAssignSub] = React.useState(false);

    // Remove confirm
    const [removeTarget, setRemoveTarget] = React.useState<CourseInstructor | null>(null);
    const [removing, setRemoving] = React.useState(false);

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

    React.useEffect(() => {
        if (!selectedBatch) { setInstances([]); setSelectedInstance(''); return; }
        batchesApi.getCourseInstances(selectedBatch)
            .then(setInstances)
            .catch(() => setInstances([]));
    }, [selectedBatch]);

    React.useEffect(() => {
        if (!selectedInstance) { setInstructors([]); return; }
        setInstrLoading(true);
        courseInstancesApi.getInstructors(selectedInstance)
            .then(setInstructors)
            .catch(() => setInstructors([]))
            .finally(() => setInstrLoading(false));
    }, [selectedInstance]);

    async function refreshInstructors() {
        if (!selectedInstance) return;
        const list = await courseInstancesApi.getInstructors(selectedInstance);
        setInstructors(list);
    }

    async function handleAssign(e: React.FormEvent) {
        e.preventDefault();
        if (!assignValues.course_instance_id || !assignValues.user_id) {
            toast.error('All fields are required');
            return;
        }
        setAssignSub(true);
        try {
            await courseInstructorsApi.assign(assignValues);
            toast.success('Instructor assigned');
            setAssignOpen(false);
            if (assignValues.course_instance_id === selectedInstance) await refreshInstructors();
        } catch (err) {
            toast.error('Failed to assign', handleApiError(err));
        } finally {
            setAssignSub(false);
        }
    }

    async function handleRemove() {
        if (!removeTarget) return;
        setRemoving(true);
        try {
            await courseInstructorsApi.remove(removeTarget.course_instance_id, removeTarget.user_id);
            toast.success('Instructor removed');
            setRemoveTarget(null);
            await refreshInstructors();
        } catch (err) {
            toast.error('Failed to remove', handleApiError(err));
        } finally {
            setRemoving(false);
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
                    <h1 className="text-2xl font-bold tracking-tight">Course Instructors</h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        Assign and manage instructors for course instances.
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
                            <Button onClick={() => { setAssignValues({ course_instance_id: selectedInstance, user_id: '', role: 'Instructor' }); setAssignOpen(true); }} className="gap-2">
                                <Plus className="h-4 w-4" /> Assign Instructor
                            </Button>
                        )}
                    </div>

                    {!selectedInstance && (
                        <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
                            <UserCog className="h-12 w-12 mb-3 opacity-40" />
                            <p className="text-sm">Select a group and course instance to view instructors.</p>
                        </div>
                    )}

                    {selectedInstance && instrLoading && (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
                        </div>
                    )}

                    {selectedInstance && !instrLoading && instructors.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
                            <UserCog className="h-12 w-12 mb-3 opacity-40" />
                            <p className="text-sm">No instructors assigned to this instance.</p>
                        </div>
                    )}

                    {instructors.length > 0 && (
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>User ID</TableHead>
                                        <TableHead>Role</TableHead>
                                        {canWrite && <TableHead className="w-10" />}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {instructors.map((i) => (
                                        <TableRow key={`${i.course_instance_id}-${i.user_id}`}>
                                            <TableCell className="font-mono text-xs">{i.user_id}</TableCell>
                                            <TableCell>
                                                <Badge className={`text-xs border-0 ${ROLE_COLOR[i.role] ?? ''}`}>
                                                    {i.role}
                                                </Badge>
                                            </TableCell>
                                            {canWrite && (
                                                <TableCell>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => setRemoveTarget(i)}>
                                                        <Trash2 className="h-3.5 w-3.5" />
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

            {/* Assign dialog */}
            <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <UserCog className="h-5 w-5 text-zinc-600" />
                            Assign Instructor
                        </DialogTitle>
                        <DialogDescription>Assign an instructor to a course instance.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleAssign} className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label>Course Instance</Label>
                            <Select value={assignValues.course_instance_id} onValueChange={(v) => setAssignValues((p) => ({ ...p, course_instance_id: v }))}>
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
                            <Label>Instructor User ID</Label>
                            <Input
                                placeholder="Paste instructor UUID"
                                value={assignValues.user_id}
                                onChange={(e) => setAssignValues((p) => ({ ...p, user_id: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Role</Label>
                            <Select value={assignValues.role} onValueChange={(v) => setAssignValues((p) => ({ ...p, role: v as InstructorRole }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {INSTRUCTOR_ROLES.map((r) => (
                                        <SelectItem key={r} value={r}>{r}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={assignSub}>
                                {assignSub ? 'Assigning…' : 'Assign'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Remove confirmation */}
            <AlertDialog open={!!removeTarget} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove Instructor?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will remove <span className="font-mono text-xs">{removeTarget?.user_id}</span> ({removeTarget?.role}) from this course instance.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRemove} disabled={removing} className="bg-red-600 hover:bg-red-700">
                            {removing ? 'Removing…' : 'Remove'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
