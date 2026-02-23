'use client';

/**
 * Specialization dialogs: Create + Edit
 */
import * as React from 'react';
import { Award } from 'lucide-react';
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
import { specializationsApi } from '@/lib/api/academics';
import { handleApiError } from '@/lib/api/axios';
import { toast } from '@/lib/hooks/use-toast';
import type {
    Specialization,
    CreateSpecializationRequest,
    UpdateSpecializationRequest,
    AcademicFormErrors,
} from '@/types/academics.types';

// ── Create ────────────────────────────────────────────────────────────────────

interface CreateSpecializationDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    degreeId: string;
    degreeName: string;
    onSuccess: (spec: Specialization) => void;
}

function validateCreate(v: CreateSpecializationRequest): AcademicFormErrors {
    const e: AcademicFormErrors = {};
    if (!v.name.trim()) e.name = 'Name is required';
    if (!v.code.trim()) e.code = 'Code is required';
    return e;
}

export function CreateSpecializationDialog({
    open,
    onOpenChange,
    degreeId,
    degreeName,
    onSuccess,
}: CreateSpecializationDialogProps) {
    const [values, setValues] = React.useState<CreateSpecializationRequest>({
        degree_id: degreeId,
        name: '',
        code: '',
    });
    const [errors, setErrors] = React.useState<AcademicFormErrors>({});
    const [submitting, setSubmitting] = React.useState(false);

    React.useEffect(() => {
        if (open) {
            setValues({ degree_id: degreeId, name: '', code: '' });
            setErrors({});
        }
    }, [open, degreeId]);

    function set(field: keyof CreateSpecializationRequest, value: string) {
        setValues((prev) => ({ ...prev, [field]: value }));
        if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const errs = validateCreate(values);
        if (Object.keys(errs).length > 0) { setErrors(errs); return; }

        setSubmitting(true);
        try {
            const spec = await specializationsApi.create(values);
            toast.success('Specialization created', spec.name);
            onOpenChange(false);
            onSuccess(spec);
        } catch (err) {
            toast.error('Failed to create specialization', handleApiError(err));
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[440px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Award className="h-5 w-5 text-zinc-600" />
                        Add Specialization
                    </DialogTitle>
                    <DialogDescription>
                        Create a new specialization under <strong>{degreeName}</strong>.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="spec_name">Name</Label>
                        <Input
                            id="spec_name"
                            placeholder="Artificial Intelligence"
                            value={values.name}
                            onChange={(e) => set('name', e.target.value)}
                        />
                        {errors.name && <p className="text-xs text-red-600">{errors.name}</p>}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="spec_code">Code</Label>
                        <Input
                            id="spec_code"
                            placeholder="AI"
                            value={values.code}
                            onChange={(e) => set('code', e.target.value.toUpperCase())}
                        />
                        {errors.code && <p className="text-xs text-red-600">{errors.code}</p>}
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={submitting}>
                            {submitting ? 'Creating…' : 'Create'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// ── Edit ──────────────────────────────────────────────────────────────────────

interface EditSpecializationDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    specialization: Specialization;
    onSuccess: (spec: Specialization) => void;
}

export function EditSpecializationDialog({
    open,
    onOpenChange,
    specialization,
    onSuccess,
}: EditSpecializationDialogProps) {
    const [values, setValues] = React.useState<UpdateSpecializationRequest>({});
    const [submitting, setSubmitting] = React.useState(false);

    React.useEffect(() => {
        if (open) {
            setValues({ name: specialization.name, code: specialization.code });
        }
    }, [open, specialization]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);
        try {
            const updated = await specializationsApi.update(specialization.id, values);
            toast.success('Specialization updated', updated.name);
            onOpenChange(false);
            onSuccess(updated);
        } catch (err) {
            toast.error('Failed to update', handleApiError(err));
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[440px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Award className="h-5 w-5 text-zinc-600" />
                        Edit Specialization
                    </DialogTitle>
                    <DialogDescription>
                        Update <strong>{specialization.name}</strong>.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="edit_spec_name">Name</Label>
                        <Input
                            id="edit_spec_name"
                            value={values.name ?? ''}
                            onChange={(e) => setValues((p) => ({ ...p, name: e.target.value }))}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="edit_spec_code">Code</Label>
                        <Input
                            id="edit_spec_code"
                            value={values.code ?? ''}
                            onChange={(e) => setValues((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                        />
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
