'use client';

/**
 * Group (Batch) dialogs: Create + Edit
 */
import * as React from 'react';
import { Users2, Shield, Info } from 'lucide-react';
import {
    SideDialog,
    SideDialogContent,
    SideDialogDescription,
    SideDialogFooter,
    SideDialogHeader,
    SideDialogTitle,
} from '@/components/ui/side-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectNative } from '@/components/ui/select-native';
import { batchesApi, degreesApi, specializationsApi } from '@/lib/api/academics';
import { handleApiError } from '@/lib/api/axios';
import { toast } from '@/lib/hooks/use-toast';
import type {
    Batch,
    Degree,
    Specialization,
    CreateBatchRequest,
    UpdateBatchRequest,
    AcademicFormErrors,
} from '@/types/academics.types';
import { cn } from '@/lib/utils/cn';

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
    if (!v.degree_id) e.degree_id = 'Degree is required';
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
    const [specializations, setSpecializations] = React.useState<Specialization[]>([]);

    React.useEffect(() => {
        if (open) {
            setValues({
                ...EMPTY,
                parent_id: parentBatch?.id ?? null,
                degree_id: parentBatch?.degree_id ?? '',
                specialization_id: parentBatch?.specialization_id ?? null,
            });
            setErrors({});
            degreesApi.list().then(setDegrees).catch(() => { });
        }
    }, [open, parentBatch]);

    // Fetch specializations when degree changes
    React.useEffect(() => {
        if (values.degree_id) {
            specializationsApi.listByDegree(values.degree_id).then(setSpecializations).catch(() => setSpecializations([]));
        } else {
            setSpecializations([]);
        }
    }, [values.degree_id]);

    function set(field: keyof CreateBatchRequest, value: any) {
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
            toast.success('Group created', `${batch.name} (${batch.code}) has been added.`);
            onOpenChange(false);
            onSuccess(batch);
        } catch (err) {
            toast.error('Failed to create group', handleApiError(err));
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <SideDialog open={open} onOpenChange={onOpenChange}>
            <SideDialogContent className="max-w-md">
                <SideDialogHeader>
                    <SideDialogTitle className="flex items-center gap-2">
                        <Users2 className="h-5 w-5 text-primary" />
                        {parentBatch ? 'Create Sub-batch' : 'Create New Batch'}
                    </SideDialogTitle>
                    <SideDialogDescription>
                        {parentBatch ? (
                            <>Creating nested group under <span className="font-bold text-foreground">{parentBatch.name}</span>.</>
                        ) : (
                            'Define a new student intake or academic group.'
                        )}
                    </SideDialogDescription>
                </SideDialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6 flex-1 overflow-y-auto pr-2">
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="batch_code">Batch Code</Label>
                                <Input
                                    id="batch_code"
                                    placeholder="e.g. CS24A"
                                    value={values.code}
                                    onChange={(e) => set('code', e.target.value.toUpperCase())}
                                    className={cn(errors.code && "border-red-500")}
                                />
                                {errors.code && <p className="text-[10px] text-red-500">{errors.code}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="batch_name">Batch Name</Label>
                                <Input
                                    id="batch_name"
                                    placeholder="e.g. Batch 2024 - A"
                                    value={values.name}
                                    onChange={(e) => set('name', e.target.value)}
                                    className={cn(errors.name && "border-red-500")}
                                />
                                {errors.name && <p className="text-[10px] text-red-500">{errors.name}</p>}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Academic Degree</Label>
                            <SelectNative
                                value={values.degree_id}
                                onChange={(e) => set('degree_id', e.target.value)}
                                disabled={!!parentBatch}
                            >
                                <option value="">Select a degree...</option>
                                {degrees.map((d) => (
                                    <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                                ))}
                            </SelectNative>
                            {errors.degree_id && <p className="text-[10px] text-red-500">{errors.degree_id}</p>}
                        </div>

                        <div className="space-y-2">
                            <Label>Specialization (Optional)</Label>
                            <SelectNative
                                value={values.specialization_id || ''}
                                onChange={(e) => set('specialization_id', e.target.value || null)}
                                disabled={!values.degree_id}
                            >
                                <option value="">General / None</option>
                                {specializations.map((s) => (
                                    <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                                ))}
                            </SelectNative>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="start_y">Start Year</Label>
                                <Input
                                    id="start_y"
                                    type="number"
                                    value={values.start_year}
                                    onChange={(e) => set('start_year', parseInt(e.target.value) || 0)}
                                />
                                {errors.start_year && <p className="text-[10px] text-red-500">{errors.start_year}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="end_y">Expected End Year</Label>
                                <Input
                                    id="end_y"
                                    type="number"
                                    value={values.end_year}
                                    onChange={(e) => set('end_year', parseInt(e.target.value) || 0)}
                                />
                                {errors.end_year && <p className="text-[10px] text-red-500">{errors.end_year}</p>}
                            </div>
                        </div>
                    </div>

                    <div className="p-4 bg-primary/5 dark:bg-primary/10 rounded-lg border border-primary/20 flex gap-3">
                        <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <p className="text-xs text-primary/80 dark:text-primary-foreground/80 leading-relaxed">
                            {parentBatch
                                ? "Sub-batches inherit the parent degree and specialization by default. You can organize sections or lab groups here."
                                : "A batch represents a cohort of students. You can define specialized curricula or intake-specific settings."}
                        </p>
                    </div>
                </form>

                <SideDialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={submitting} className="min-w-[120px]">
                        {submitting ? 'Creating...' : 'Create Batch'}
                    </Button>
                </SideDialogFooter>
            </SideDialogContent>
        </SideDialog>
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
    const [specializations, setSpecializations] = React.useState<Specialization[]>([]);

    React.useEffect(() => {
        if (open) {
            setValues({
                name: batch.name,
                start_year: batch.start_year,
                end_year: batch.end_year,
                specialization_id: batch.specialization_id,
            });
            setErrors({});
            if (batch.degree_id) {
                specializationsApi.listByDegree(batch.degree_id).then(setSpecializations).catch(() => []);
            }
        }
    }, [open, batch]);

    function set(field: keyof UpdateBatchRequest, value: any) {
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
            toast.success('Batch updated', updated.name);
            onOpenChange(false);
            onSuccess(updated);
        } catch (err) {
            toast.error('Failed to update batch', handleApiError(err));
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <SideDialog open={open} onOpenChange={onOpenChange}>
            <SideDialogContent className="max-w-md">
                <SideDialogHeader>
                    <SideDialogTitle className="flex items-center gap-2">
                        <Users2 className="h-5 w-5 text-primary" />
                        Edit Batch Settings
                    </SideDialogTitle>
                    <SideDialogDescription>
                        Update details for <span className="font-bold text-foreground">{batch.name}</span> ({batch.code}).
                    </SideDialogDescription>
                </SideDialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6 flex-1 overflow-y-auto pr-2">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="edit_batch_name">Display Name</Label>
                            <Input
                                id="edit_batch_name"
                                placeholder="e.g. Batch 2024 - A"
                                value={values.name}
                                onChange={(e) => set('name', e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Specialization</Label>
                            <SelectNative
                                value={values.specialization_id || ''}
                                onChange={(e) => set('specialization_id', e.target.value || null)}
                            >
                                <option value="">General / None</option>
                                {specializations.map((s) => (
                                    <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                                ))}
                            </SelectNative>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="edit_start_y">Start Year</Label>
                                <Input
                                    id="edit_start_y"
                                    type="number"
                                    value={values.start_year}
                                    onChange={(e) => set('start_year', parseInt(e.target.value) || 0)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit_end_y">Expected End Year</Label>
                                <Input
                                    id="edit_end_y"
                                    type="number"
                                    value={values.end_year}
                                    onChange={(e) => set('end_year', parseInt(e.target.value) || 0)}
                                />
                                {errors.end_year && <p className="text-[10px] text-red-500">{errors.end_year}</p>}
                            </div>
                        </div>
                    </div>
                </form>

                <SideDialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={submitting} className="min-w-[120px]">
                        {submitting ? 'Saving...' : 'Save Changes'}
                    </Button>
                </SideDialogFooter>
            </SideDialogContent>
        </SideDialog>
    );
}

