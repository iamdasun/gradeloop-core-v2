'use client';

/**
 * Group (Batch) dialogs: Create + Edit
 */
import * as React from 'react';
import { Users2 } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { batchesApi, degreesApi } from '@/lib/api/academics';
import { handleApiError } from '@/lib/api/axios';
import { toast } from '@/lib/hooks/use-toast';
import type {
    Batch,
    Degree,
    CreateBatchRequest,
    UpdateBatchRequest,
    AcademicFormErrors,
} from '@/types/academics.types';

// ── Create ────────────────────────────────────────────────────────────────────

interface CreateGroupDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    parentBatch?: Batch | null;
    onSuccess: (batch: Batch) => void;
}

const EMPTY: CreateBatchRequest = {
    parent_id: null,
    degree_id: '',
    specialization_id: null,
    name: '',
    code: '',
    start_year: new Date().getFullYear(),
    end_year: new Date().getFullYear() + 4,
};

function validateCreate(v: CreateBatchRequest): AcademicFormErrors {
    const e: AcademicFormErrors = {};
    if (!v.name.trim()) e.name = 'Name is required';
    if (!v.code.trim()) e.code = 'Code is required';
    if (v.start_year < 2000) e.start_year = 'Invalid year';
    if (v.end_year <= v.start_year) e.end_year = 'End year must be after start year';
    return e;
}

export function CreateGroupDialog({
    open,
    onOpenChange,
    parentBatch,
    onSuccess,
}: CreateGroupDialogProps) {
    const [values, setValues] = React.useState<CreateBatchRequest>(EMPTY);
    const [errors, setErrors] = React.useState<AcademicFormErrors>({});
    const [submitting, setSubmitting] = React.useState(false);
    const [degrees, setDegrees] = React.useState<Degree[]>([]);

    React.useEffect(() => {
        if (open) {
            setValues({
                ...EMPTY,
                parent_id: parentBatch?.id ?? null,
                degree_id: parentBatch?.degree_id ?? '',
            });
            setErrors({});
            degreesApi.list().then(setDegrees).catch(() => { });
        }
    }, [open, parentBatch]);

    function set(field: keyof CreateBatchRequest, value: string | number | null) {
        setValues((prev) => ({ ...prev, [field]: value }));
        if (errors[field as string]) setErrors((prev) => ({ ...prev, [field]: undefined }));
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const errs = validateCreate(values);
        if (Object.keys(errs).length > 0) { setErrors(errs); return; }

        setSubmitting(true);
        try {
            const batch = await batchesApi.create(values);
            toast.success('Group created', batch.name);
            onOpenChange(false);
            onSuccess(batch);
        } catch (err) {
            toast.error('Failed to create group', handleApiError(err));
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Users2 className="h-5 w-5 text-zinc-600" />
                        {parentBatch ? `Create Sub-group under ${parentBatch.name}` : 'Create Group'}
                    </DialogTitle>
                    <DialogDescription>
                        Add a new academic group (batch).
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-2">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="grp_name">Name</Label>
                            <Input
                                id="grp_name"
                                placeholder="CS 2025"
                                value={values.name}
                                onChange={(e) => set('name', e.target.value)}
                            />
                            {errors.name && <p className="text-xs text-red-600">{errors.name}</p>}
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="grp_code">Code</Label>
                            <Input
                                id="grp_code"
                                placeholder="CS25"
                                value={values.code}
                                onChange={(e) => set('code', e.target.value.toUpperCase())}
                            />
                            {errors.code && <p className="text-xs text-red-600">{errors.code}</p>}
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label>Degree</Label>
                        <Select
                            value={values.degree_id || 'none'}
                            onValueChange={(v) => set('degree_id', v === 'none' ? '' : v)}
                        >
                            <SelectTrigger><SelectValue placeholder="Select degree" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                {degrees.map((d) => (
                                    <SelectItem key={d.id} value={d.id}>{d.name} ({d.code})</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="grp_start">Start Year</Label>
                            <Input
                                id="grp_start"
                                type="number"
                                min={2000}
                                max={2100}
                                value={values.start_year}
                                onChange={(e) => set('start_year', parseInt(e.target.value, 10) || 0)}
                            />
                            {errors.start_year && <p className="text-xs text-red-600">{errors.start_year}</p>}
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="grp_end">End Year</Label>
                            <Input
                                id="grp_end"
                                type="number"
                                min={2000}
                                max={2100}
                                value={values.end_year}
                                onChange={(e) => set('end_year', parseInt(e.target.value, 10) || 0)}
                            />
                            {errors.end_year && <p className="text-xs text-red-600">{errors.end_year}</p>}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={submitting}>
                            {submitting ? 'Creating…' : 'Create Group'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// ── Edit ──────────────────────────────────────────────────────────────────────

interface EditGroupDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    batch: Batch;
    onSuccess: (batch: Batch) => void;
}

export function EditGroupDialog({
    open,
    onOpenChange,
    batch,
    onSuccess,
}: EditGroupDialogProps) {
    const [values, setValues] = React.useState<UpdateBatchRequest>({});
    const [errors, setErrors] = React.useState<AcademicFormErrors>({});
    const [submitting, setSubmitting] = React.useState(false);

    React.useEffect(() => {
        if (open) {
            setValues({
                name: batch.name,
                start_year: batch.start_year,
                end_year: batch.end_year,
            });
            setErrors({});
        }
    }, [open, batch]);

    function set(field: keyof UpdateBatchRequest, value: string | number) {
        setValues((prev) => ({ ...prev, [field]: value }));
        if (errors[field as string]) setErrors((prev) => ({ ...prev, [field]: undefined }));
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const errs: AcademicFormErrors = {};
        if (
            values.start_year !== undefined &&
            values.end_year !== undefined &&
            values.end_year <= values.start_year
        ) {
            errs.end_year = 'End year must be after start year';
        }
        if (Object.keys(errs).length > 0) { setErrors(errs); return; }

        setSubmitting(true);
        try {
            const updated = await batchesApi.update(batch.id, values);
            toast.success('Group updated', updated.name);
            onOpenChange(false);
            onSuccess(updated);
        } catch (err) {
            toast.error('Failed to update group', handleApiError(err));
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Users2 className="h-5 w-5 text-zinc-600" />
                        Edit Group
                    </DialogTitle>
                    <DialogDescription>
                        Update <strong>{batch.name}</strong>.
                        <br />
                        <span className="text-xs font-mono text-zinc-400">{batch.code}</span>
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="edit_grp_name">Name</Label>
                        <Input
                            id="edit_grp_name"
                            value={values.name ?? ''}
                            onChange={(e) => set('name', e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="edit_grp_start">Start Year</Label>
                            <Input
                                id="edit_grp_start"
                                type="number"
                                min={2000}
                                max={2100}
                                value={values.start_year ?? batch.start_year}
                                onChange={(e) => set('start_year', parseInt(e.target.value, 10) || 0)}
                            />
                            {errors.start_year && <p className="text-xs text-red-600">{errors.start_year}</p>}
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="edit_grp_end">End Year</Label>
                            <Input
                                id="edit_grp_end"
                                type="number"
                                min={2000}
                                max={2100}
                                value={values.end_year ?? batch.end_year}
                                onChange={(e) => set('end_year', parseInt(e.target.value, 10) || 0)}
                            />
                            {errors.end_year && <p className="text-xs text-red-600">{errors.end_year}</p>}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={submitting}>
                            {submitting ? 'Saving…' : 'Save Changes'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
