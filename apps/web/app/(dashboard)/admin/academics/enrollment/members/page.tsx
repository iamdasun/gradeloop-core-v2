'use client';

import * as React from 'react';
import {
    Users,
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
    batchesApi,
    batchMembersApi,
} from '@/lib/api/academics';
import { handleApiError } from '@/lib/api/axios';
import { toast } from '@/lib/hooks/use-toast';
import { useAcademicsAccess } from '@/lib/hooks/useAcademicsAccess';
import { BATCH_MEMBER_STATUSES } from '@/types/academics.types';
import type {
    Batch,
    BatchMember,
    BatchMemberStatus,
} from '@/types/academics.types';

const STATUS_COLOR: Record<string, string> = {
    Active: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    Graduated: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    Suspended: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
    Withdrawn: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

export default function BatchMembersPage() {
    const { canAccess, canWrite } = useAcademicsAccess();

    const [batches, setBatches] = React.useState<Batch[]>([]);
    const [loading, setLoading] = React.useState(true);

    const [selectedBatch, setSelectedBatch] = React.useState('');
    const [members, setMembers] = React.useState<BatchMember[]>([]);
    const [membersLoading, setMembersLoading] = React.useState(false);

    // Add dialog
    const [addOpen, setAddOpen] = React.useState(false);
    const [addValues, setAddValues] = React.useState({
        batch_id: '',
        user_id: '',
        status: 'Active' as BatchMemberStatus,
    });
    const [addSub, setAddSub] = React.useState(false);

    // Remove confirm
    const [removeTarget, setRemoveTarget] = React.useState<BatchMember | null>(null);
    const [removing, setRemoving] = React.useState(false);

    React.useEffect(() => {
        batchesApi.list()
            .then(setBatches)
            .catch((err) => toast.error('Failed to load groups', handleApiError(err)))
            .finally(() => setLoading(false));
    }, []);

    React.useEffect(() => {
        if (!selectedBatch) { setMembers([]); return; }
        setMembersLoading(true);
        batchesApi.getMembers(selectedBatch)
            .then(setMembers)
            .catch(() => setMembers([]))
            .finally(() => setMembersLoading(false));
    }, [selectedBatch]);

    async function refreshMembers() {
        if (!selectedBatch) return;
        const list = await batchesApi.getMembers(selectedBatch);
        setMembers(list);
    }

    async function handleAdd(e: React.FormEvent) {
        e.preventDefault();
        if (!addValues.batch_id || !addValues.user_id) {
            toast.error('All fields are required');
            return;
        }
        setAddSub(true);
        try {
            await batchMembersApi.add(addValues);
            toast.success('Member added');
            setAddOpen(false);
            if (addValues.batch_id === selectedBatch) await refreshMembers();
        } catch (err) {
            toast.error('Failed to add member', handleApiError(err));
        } finally {
            setAddSub(false);
        }
    }

    async function handleRemove() {
        if (!removeTarget) return;
        setRemoving(true);
        try {
            await batchMembersApi.remove(removeTarget.batch_id, removeTarget.user_id);
            toast.success('Member removed');
            setRemoveTarget(null);
            await refreshMembers();
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

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Link href="/admin/academics/enrollment">
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Batch Members</h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        Manage student memberships in groups/batches.
                    </p>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
                </div>
            ) : (
                <>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="flex-1 max-w-xs">
                            <Select value={selectedBatch} onValueChange={setSelectedBatch}>
                                <SelectTrigger><SelectValue placeholder="Select group…" /></SelectTrigger>
                                <SelectContent>
                                    {batches.map((b) => (
                                        <SelectItem key={b.id} value={b.id}>{b.name} ({b.code})</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {canWrite && (
                            <Button onClick={() => { setAddValues({ batch_id: selectedBatch, user_id: '', status: 'Active' }); setAddOpen(true); }} className="gap-2">
                                <Plus className="h-4 w-4" /> Add Member
                            </Button>
                        )}
                    </div>

                    {!selectedBatch && (
                        <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
                            <Users className="h-12 w-12 mb-3 opacity-40" />
                            <p className="text-sm">Select a group to view its members.</p>
                        </div>
                    )}

                    {selectedBatch && membersLoading && (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
                        </div>
                    )}

                    {selectedBatch && !membersLoading && members.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
                            <Users className="h-12 w-12 mb-3 opacity-40" />
                            <p className="text-sm">No members in this group yet.</p>
                        </div>
                    )}

                    {members.length > 0 && (
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>User ID</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Enrolled At</TableHead>
                                        {canWrite && <TableHead className="w-10" />}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {members.map((m) => (
                                        <TableRow key={`${m.batch_id}-${m.user_id}`}>
                                            <TableCell className="font-mono text-xs">{m.user_id}</TableCell>
                                            <TableCell>
                                                <Badge className={`text-xs border-0 ${STATUS_COLOR[m.status] ?? ''}`}>
                                                    {m.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-xs text-zinc-500">
                                                {new Date(m.enrolled_at).toLocaleDateString()}
                                            </TableCell>
                                            {canWrite && (
                                                <TableCell>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => setRemoveTarget(m)}>
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

            {/* Add member dialog */}
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5 text-zinc-600" />
                            Add Batch Member
                        </DialogTitle>
                        <DialogDescription>Add a student to a group/batch.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleAdd} className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label>Group</Label>
                            <Select value={addValues.batch_id} onValueChange={(v) => setAddValues((p) => ({ ...p, batch_id: v }))}>
                                <SelectTrigger><SelectValue placeholder="Select group" /></SelectTrigger>
                                <SelectContent>
                                    {batches.map((b) => (
                                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Student User ID</Label>
                            <Input
                                placeholder="Paste student UUID"
                                value={addValues.user_id}
                                onChange={(e) => setAddValues((p) => ({ ...p, user_id: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Status</Label>
                            <Select value={addValues.status} onValueChange={(v) => setAddValues((p) => ({ ...p, status: v as BatchMemberStatus }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {BATCH_MEMBER_STATUSES.map((s) => (
                                        <SelectItem key={s} value={s}>{s}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={addSub}>
                                {addSub ? 'Adding…' : 'Add Member'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Remove confirmation */}
            <AlertDialog open={!!removeTarget} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove Member?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will remove user <span className="font-mono text-xs">{removeTarget?.user_id}</span> from the group. This action cannot be undone.
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
