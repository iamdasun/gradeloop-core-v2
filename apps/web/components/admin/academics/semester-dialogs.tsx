'use client';

/**
 * Semester dialogs: Create + Edit
 * Uses Calendar + Popover for date picking.
 */
import * as React from 'react';
import { Calendar as CalendarIcon, CalendarDays } from 'lucide-react';
import { format, parseISO } from 'date-fns';
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
import { Calendar } from '@/components/ui/calendar';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { semestersApi } from '@/lib/api/academics';
import { handleApiError } from '@/lib/api/axios';
import { toast } from '@/lib/hooks/use-toast';
import {
    SEMESTER_TERM_TYPES,
    SEMESTER_STATUSES,
} from '@/types/academics.types';
import type {
    Semester,
    CreateSemesterRequest,
    UpdateSemesterRequest,
    SemesterTermType,
    SemesterStatus,
    AcademicFormErrors,
} from '@/types/academics.types';

// ── Date Picker helper ────────────────────────────────────────────────────────

interface DatePickerFieldProps {
    id: string;
    label: string;
    value: string; // YYYY-MM-DD or ''
    onChange: (dateStr: string) => void;
    error?: string;
    /** Optional: disable dates before this */
    minDate?: Date;
}

function DatePickerField({ id, label, value, onChange, error, minDate }: DatePickerFieldProps) {
    const [popoverOpen, setPopoverOpen] = React.useState(false);
    const selected = value ? parseISO(value) : undefined;

    function handleSelect(date: Date | undefined) {
        if (date) {
            onChange(format(date, 'yyyy-MM-dd'));
        } else {
            onChange('');
        }
        setPopoverOpen(false);
    }

    return (
        <div className="space-y-1.5">
            <Label htmlFor={id}>{label}</Label>
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                <PopoverTrigger asChild>
                    <Button
                        id={id}
                        type="button"
                        variant="outline"
                        className={cn(
                            'w-full justify-start text-left font-normal h-9 px-3',
                            !value && 'text-muted-foreground',
                        )}
                    >
                        <CalendarDays className="mr-2 h-4 w-4" />
                        {selected ? format(selected, 'PPP') : 'Pick a date'}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                        mode="single"
                        selected={selected}
                        onSelect={handleSelect}
                        disabled={minDate ? (date) => date < minDate : undefined}
                        defaultMonth={selected ?? new Date()}
                    />
                </PopoverContent>
            </Popover>
            {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
    );
}

// ── Create ────────────────────────────────────────────────────────────────────

interface CreateSemesterDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: (semester: Semester) => void;
}

const EMPTY: CreateSemesterRequest = {
    name: '',
    code: '',
    term_type: 'Fall',
    start_date: '',
    end_date: '',
    status: 'Planned',
};

function validateCreate(v: CreateSemesterRequest): AcademicFormErrors {
    const e: AcademicFormErrors = {};
    if (!v.name.trim()) e.name = 'Name is required';
    if (!v.code.trim()) e.code = 'Code is required';
    if (!v.start_date) e.start_date = 'Start date is required';
    if (!v.end_date) e.end_date = 'End date is required';
    if (v.start_date && v.end_date && v.start_date >= v.end_date) {
        e.end_date = 'End date must be after start date';
    }
    return e;
}

export function CreateSemesterDialog({
    open,
    onOpenChange,
    onSuccess,
}: CreateSemesterDialogProps) {
    const [values, setValues] = React.useState<CreateSemesterRequest>(EMPTY);
    const [errors, setErrors] = React.useState<AcademicFormErrors>({});
    const [submitting, setSubmitting] = React.useState(false);

    React.useEffect(() => {
        if (open) { setValues(EMPTY); setErrors({}); }
    }, [open]);

    function set(field: keyof CreateSemesterRequest, value: string) {
        setValues((prev) => ({ ...prev, [field]: value }));
        if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const errs = validateCreate(values);
        if (Object.keys(errs).length > 0) { setErrors(errs); return; }

        setSubmitting(true);
        try {
            const semester = await semestersApi.create(values);
            toast.success('Semester created', semester.name);
            onOpenChange(false);
            onSuccess(semester);
        } catch (err) {
            toast.error('Failed to create semester', handleApiError(err));
        } finally {
            setSubmitting(false);
        }
    }

    // Build a minDate for end date picker
    const startAsDate = values.start_date ? parseISO(values.start_date) : undefined;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <CalendarIcon className="h-5 w-5 text-zinc-600" />
                        Create Semester
                    </DialogTitle>
                    <DialogDescription>
                        Add a new academic semester.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-2">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="sem_name">Name</Label>
                            <Input
                                id="sem_name"
                                placeholder="Fall 2025"
                                value={values.name}
                                onChange={(e) => set('name', e.target.value)}
                            />
                            {errors.name && <p className="text-xs text-red-600">{errors.name}</p>}
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="sem_code">Code</Label>
                            <Input
                                id="sem_code"
                                placeholder="FA25"
                                value={values.code}
                                onChange={(e) => set('code', e.target.value.toUpperCase())}
                            />
                            {errors.code && <p className="text-xs text-red-600">{errors.code}</p>}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>Term Type</Label>
                            <Select
                                value={values.term_type}
                                onValueChange={(v) => set('term_type', v as SemesterTermType)}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {SEMESTER_TERM_TYPES.map((t) => (
                                        <SelectItem key={t} value={t}>{t}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Status</Label>
                            <Select
                                value={values.status}
                                onValueChange={(v) => set('status', v as SemesterStatus)}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {SEMESTER_STATUSES.map((s) => (
                                        <SelectItem key={s} value={s}>{s}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <DatePickerField
                            id="sem_start"
                            label="Start Date"
                            value={values.start_date}
                            onChange={(v) => set('start_date', v)}
                            error={errors.start_date}
                        />
                        <DatePickerField
                            id="sem_end"
                            label="End Date"
                            value={values.end_date}
                            onChange={(v) => set('end_date', v)}
                            error={errors.end_date}
                            minDate={startAsDate}
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={submitting}>
                            {submitting ? 'Creating…' : 'Create Semester'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// ── Edit ──────────────────────────────────────────────────────────────────────

interface EditSemesterDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    semester: Semester;
    onSuccess: (semester: Semester) => void;
}

export function EditSemesterDialog({
    open,
    onOpenChange,
    semester,
    onSuccess,
}: EditSemesterDialogProps) {
    const [values, setValues] = React.useState<UpdateSemesterRequest>({});
    const [errors, setErrors] = React.useState<AcademicFormErrors>({});
    const [submitting, setSubmitting] = React.useState(false);

    React.useEffect(() => {
        if (open) {
            setValues({
                name: semester.name,
                term_type: semester.term_type,
                start_date: semester.start_date?.split('T')[0] ?? '',
                end_date: semester.end_date?.split('T')[0] ?? '',
                status: semester.status,
            });
            setErrors({});
        }
    }, [open, semester]);

    function set(field: keyof UpdateSemesterRequest, value: string) {
        setValues((prev) => ({ ...prev, [field]: value }));
        if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const errs: AcademicFormErrors = {};
        if (values.start_date && values.end_date && values.start_date >= values.end_date) {
            errs.end_date = 'End date must be after start date';
        }
        if (Object.keys(errs).length > 0) { setErrors(errs); return; }

        setSubmitting(true);
        try {
            const updated = await semestersApi.update(semester.id, values);
            toast.success('Semester updated', updated.name);
            onOpenChange(false);
            onSuccess(updated);
        } catch (err) {
            toast.error('Failed to update semester', handleApiError(err));
        } finally {
            setSubmitting(false);
        }
    }

    const startAsDate = values.start_date ? parseISO(values.start_date) : undefined;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <CalendarIcon className="h-5 w-5 text-zinc-600" />
                        Edit Semester
                    </DialogTitle>
                    <DialogDescription>
                        Update <strong>{semester.name}</strong>.
                        <br />
                        <span className="text-xs font-mono text-zinc-400">{semester.code}</span>
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-2">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="edit_sem_name">Name</Label>
                            <Input
                                id="edit_sem_name"
                                value={values.name ?? ''}
                                onChange={(e) => set('name', e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Term Type</Label>
                            <Select
                                value={values.term_type ?? semester.term_type}
                                onValueChange={(v) => set('term_type', v as SemesterTermType)}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {SEMESTER_TERM_TYPES.map((t) => (
                                        <SelectItem key={t} value={t}>{t}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label>Status</Label>
                        <Select
                            value={values.status ?? semester.status}
                            onValueChange={(v) => set('status', v as SemesterStatus)}
                        >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {SEMESTER_STATUSES.map((s) => (
                                    <SelectItem key={s} value={s}>{s}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <DatePickerField
                            id="edit_sem_start"
                            label="Start Date"
                            value={values.start_date ?? ''}
                            onChange={(v) => set('start_date', v)}
                            error={errors.start_date}
                        />
                        <DatePickerField
                            id="edit_sem_end"
                            label="End Date"
                            value={values.end_date ?? ''}
                            onChange={(v) => set('end_date', v)}
                            error={errors.end_date}
                            minDate={startAsDate}
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
