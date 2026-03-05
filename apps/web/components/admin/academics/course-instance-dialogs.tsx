'use client';

/**
 * Course Instance dialogs: Create (2-step) + Edit (with Settings section)
 * Uses SideDialog + brand tokens from globals.css
 */
import * as React from 'react';
import {
  Calendar, Loader2, Search, X, GraduationCap, BookOpen, Users,
  Settings2, ChevronRight, ChevronLeft, Check, UserPlus,
} from 'lucide-react';
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  courseInstancesApi,
  semestersApi,
  batchesApi,
  enrollmentsApi,
} from '@/lib/api/academics';
import { usersApi } from '@/lib/api/users';
import { handleApiError } from '@/lib/api/axios';
import { toast } from '@/lib/hooks/use-toast';
import type {
  CourseInstance,
  Semester,
  Batch,
  CreateCourseInstanceRequest,
  UpdateCourseInstanceRequest,
  CourseInstanceStatus,
  AcademicFormErrors,
  EnrollStudentRequest,
} from '@/types/academics.types';
import type { UserListItem } from '@/types/auth.types';

const STATUSES: CourseInstanceStatus[] = ['Planned', 'Active', 'Completed', 'Cancelled'];

// ── Palette-mapped Section Header ─────────────────────────────────────────────

type SectionVariant = 'primary' | 'success' | 'info' | 'warning';

const sectionVariantClasses: Record<SectionVariant, { icon: string }> = {
  primary: { icon: 'bg-primary/10 text-primary' },
  success: { icon: 'bg-success/15 text-success' },
  info:    { icon: 'bg-info/10 text-info' },
  warning: { icon: 'bg-warning/10 text-warning' },
};

function SectionHeader({
  icon,
  label,
  variant = 'primary',
}: {
  icon: React.ReactNode;
  label: string;
  variant?: SectionVariant;
}) {
  const cls = sectionVariantClasses[variant];
  return (
    <div className="flex items-center gap-2.5 mb-4 mt-2">
      <div className={`flex h-6 w-6 items-center justify-center rounded-full shrink-0 ${cls.icon}`}>
        {icon}
      </div>
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

// ── Step Indicator ────────────────────────────────────────────────────────────

function StepIndicator({ step, steps }: { step: number; steps: string[] }) {
  return (
    <div className="flex items-center gap-0 mb-6">
      {steps.map((label, idx) => {
        const num = idx + 1;
        const done = num < step;
        const active = num === step;
        return (
          <React.Fragment key={num}>
            <div className="flex flex-col items-center gap-1 min-w-[5rem]">
              <div
                className={[
                  'h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                  done
                    ? 'bg-success text-success-foreground'
                    : active
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
                ].join(' ')}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : num}
              </div>
              <span
                className={`text-[11px] font-medium leading-tight text-center ${
                  active ? 'text-primary' : done ? 'text-success' : 'text-muted-foreground'
                }`}
              >
                {label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div className={`flex-1 h-px mb-4 mx-1 transition-colors ${done ? 'bg-success' : 'bg-border'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Instructor Search ─────────────────────────────────────────────────────────

function InstructorSearchInput({
  placeholder,
  value,
  onSelect,
  excludeIds = [],
}: {
  placeholder: string;
  value: UserListItem | null;
  onSelect: (user: UserListItem | null) => void;
  excludeIds?: string[];
}) {
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<UserListItem[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (!query.trim()) { setResults([]); setOpen(false); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await usersApi.list({ search: query, user_type: 'employee', limit: 8 });
        const filtered = res.data.filter((u) => !excludeIds.includes(u.id));
        setResults(filtered);
        setOpen(filtered.length > 0);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [query, excludeIds]);

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
          {(value.full_name || value.email)[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground truncate">{value.full_name || value.email}</p>
          <p className="text-xs text-muted-foreground truncate capitalize">{value.designation || value.user_type}</p>
        </div>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative flex items-center">
        <Search className="absolute left-3 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          className="pl-9 pr-4 h-9 text-sm"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {searching && (
          <Loader2 className="absolute right-3 h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
          {results.map((u) => (
            <button
              key={u.id}
              type="button"
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
              onMouseDown={() => { onSelect(u); setQuery(''); setOpen(false); }}
            >
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                {(u.full_name || u.email)[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{u.full_name || u.email}</p>
                <p className="text-xs text-muted-foreground truncate">{u.email}</p>
              </div>
              <span className="text-xs text-muted-foreground shrink-0 capitalize">
                {u.designation || u.user_type}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── TA Multi-Select Chips ─────────────────────────────────────────────────────

function TaChipInput({
  value,
  onChange,
  excludeIds = [],
}: {
  value: UserListItem[];
  onChange: (users: UserListItem[]) => void;
  excludeIds?: string[];
}) {
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<UserListItem[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const existingIds = value.map((u) => u.id).concat(excludeIds);

  React.useEffect(() => {
    if (!query.trim()) { setResults([]); setOpen(false); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await usersApi.list({ search: query, user_type: 'employee', limit: 8 });
        const filtered = res.data.filter((u) => !existingIds.includes(u.id));
        setResults(filtered);
        setOpen(filtered.length > 0);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [query, existingIds.join(',')]);

  return (
    <div className="relative">
      <div className="min-h-[2.5rem] flex flex-wrap gap-1.5 items-center rounded-lg border border-border bg-background px-2 py-1.5">
        {value.map((ta) => (
          <span
            key={ta.id}
            className="inline-flex items-center gap-1 rounded-full bg-info/10 text-info-muted-foreground border border-info/20 px-2.5 py-0.5 text-xs font-medium"
          >
            {ta.full_name || ta.email}
            <button
              type="button"
              onClick={() => onChange(value.filter((t) => t.id !== ta.id))}
              className="ml-0.5 hover:opacity-70 transition-opacity"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-muted-foreground py-0.5 px-1"
          placeholder={value.length === 0 ? 'Search by name...' : 'Add more...'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {searching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-1" />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
          {results.map((u) => (
            <button
              key={u.id}
              type="button"
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
              onMouseDown={() => {
                onChange([...value, u]);
                setQuery('');
                setOpen(false);
              }}
            >
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                {(u.full_name || u.email)[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{u.full_name || u.email}</p>
                <p className="text-xs text-muted-foreground truncate">{u.email}</p>
              </div>
            </button>
          ))}
        </div>
      )}
      <p className="mt-1.5 text-xs text-muted-foreground">
        You can select multiple teaching assistants.
      </p>
    </div>
  );
}

// ── Student Multi-Select Chips ────────────────────────────────────────────────

function StudentChipInput({
  value,
  onChange,
}: {
  value: UserListItem[];
  onChange: (users: UserListItem[]) => void;
}) {
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<UserListItem[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const existingIds = value.map((u) => u.id);

  React.useEffect(() => {
    if (!query.trim()) { setResults([]); setOpen(false); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await usersApi.list({ search: query, user_type: 'student', limit: 10 });
        const filtered = res.data.filter((u) => !existingIds.includes(u.id));
        setResults(filtered);
        setOpen(filtered.length > 0);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, existingIds.join(',')]);

  return (
    <div className="relative">
      <div className="min-h-[2.5rem] flex flex-wrap gap-1.5 items-center rounded-lg border border-border bg-background px-2 py-1.5">
        {value.map((s) => (
          <span
            key={s.id}
            className="inline-flex items-center gap-1 rounded-full bg-success/10 text-success-muted-foreground border border-success/20 px-2.5 py-0.5 text-xs font-medium"
          >
            {s.full_name || s.email}
            {s.student_id && (
              <span className="opacity-60 ml-0.5">#{s.student_id}</span>
            )}
            <button
              type="button"
              onClick={() => onChange(value.filter((t) => t.id !== s.id))}
              className="ml-0.5 hover:opacity-70 transition-opacity"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          className="flex-1 min-w-[160px] bg-transparent text-sm outline-none placeholder:text-muted-foreground py-0.5 px-1"
          placeholder={value.length === 0 ? 'Search by name or student ID...' : 'Add more...'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {searching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-1" />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
          {results.map((u) => (
            <button
              key={u.id}
              type="button"
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
              onMouseDown={() => { onChange([...value, u]); setQuery(''); setOpen(false); }}
            >
              <div className="h-7 w-7 rounded-full bg-success/10 flex items-center justify-center text-success text-xs font-bold shrink-0">
                {(u.full_name || u.email)[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{u.full_name || u.email}</p>
                <p className="text-xs text-muted-foreground truncate">{u.email}</p>
              </div>
              {u.student_id && (
                <span className="text-xs text-muted-foreground shrink-0 font-mono">
                  #{u.student_id}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      <p className="mt-1.5 text-xs text-muted-foreground">
        Search and select individual students by name or student ID.
      </p>
    </div>
  );
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateStep1(semesterId: string): AcademicFormErrors {
  const e: AcademicFormErrors = {};
  if (!semesterId) e.semester_id = 'Semester is required';
  return e;
}

function validateStep2(batchId: string, students: UserListItem[]): AcademicFormErrors {
  const e: AcademicFormErrors = {};
  if (!batchId && students.length === 0) e.batch_id = 'Select a batch or add at least one student';
  return e;
}

// ── Create ────────────────────────────────────────────────────────────────────

interface CreateCourseInstanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  courseCode?: string;
  onSuccess: (instance: CourseInstance) => void;
}

const STEP_LABELS = ['General & Staff', 'Enrollment'];

export function CreateCourseInstanceDialog({
  open,
  onOpenChange,
  courseId,
  courseCode,
  onSuccess,
}: CreateCourseInstanceDialogProps) {
  // Step state
  const [step, setStep] = React.useState(1);

  // Step 1 fields
  const [instanceName, setInstanceName] = React.useState('');
  const [semesterId, setSemesterId] = React.useState('');
  const [customCourseCode, setCustomCourseCode] = React.useState(courseCode ?? '');
  const [leadInstructor, setLeadInstructor] = React.useState<UserListItem | null>(null);
  const [tas, setTas] = React.useState<UserListItem[]>([]);

  // Step 2 fields
  const [batchId, setBatchId] = React.useState('');
  const [students, setStudents] = React.useState<UserListItem[]>([]);
  const [maxEnrollment, setMaxEnrollment] = React.useState(30);

  const [errors, setErrors] = React.useState<AcademicFormErrors>({});
  const [submitting, setSubmitting] = React.useState(false);

  const [semesters, setSemesters] = React.useState<Semester[]>([]);
  const [batches, setBatches] = React.useState<Batch[]>([]);
  const [metaLoading, setMetaLoading] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setStep(1);
      setInstanceName('');
      setSemesterId('');
      setCustomCourseCode(courseCode ?? '');
      setLeadInstructor(null);
      setTas([]);
      setBatchId('');
      setStudents([]);
      setMaxEnrollment(30);
      setErrors({});
      setMetaLoading(true);
      Promise.all([semestersApi.list(), batchesApi.list()])
        .then(([sems, bats]) => { setSemesters(sems); setBatches(bats); })
        .catch(() => toast.error('Failed to load options', 'Could not fetch semesters or batches.'))
        .finally(() => setMetaLoading(false));
    }
  }, [open, courseCode]);

  function handleNext() {
    const errs = validateStep1(semesterId);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setStep(2);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateStep2(batchId, students);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});

    const req: CreateCourseInstanceRequest = {
      course_id: courseId,
      semester_id: semesterId,
      batch_id: batchId,
      status: 'Planned',
      max_enrollment: maxEnrollment,
    };

    setSubmitting(true);
    try {
      const instance = await courseInstancesApi.create(req);
      toast.success('Instance created', 'Course instance has been scheduled.');
      onOpenChange(false);
      onSuccess(instance);
    } catch (err) {
      toast.error('Failed to create instance', handleApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  const leadInstructorId = leadInstructor ? [leadInstructor.id] : [];
  const taIds = tas.map((t) => t.id);

  return (
    <SideDialog open={open} onOpenChange={onOpenChange}>
      <SideDialogContent>
        <SideDialogHeader>
          <SideDialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Create Course Instance
          </SideDialogTitle>
          <SideDialogDescription>Setup details for the new academic session</SideDialogDescription>
        </SideDialogHeader>

        {/* Step Indicator */}
        <StepIndicator step={step} steps={STEP_LABELS} />

        <form onSubmit={handleSubmit} className="flex flex-col gap-0 flex-1">

          {/* ── STEP 1: General Info + Staff Assignment ──────────── */}
          {step === 1 && (
            <>
              <SectionHeader icon={<BookOpen className="h-3 w-3" />} label="General Info" variant="primary" />

              <div className="space-y-4 mb-6">
                <div className="space-y-1.5">
                  <Label htmlFor="ci_name">Instance Name</Label>
                  <Input
                    id="ci_name"
                    placeholder="e.g. CS101 Fall 2026"
                    value={instanceName}
                    onChange={(e) => setInstanceName(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ci_semester">
                      Semester <span className="text-destructive">*</span>
                    </Label>
                    {metaLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground h-9">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                      </div>
                    ) : (
                      <Select
                        value={semesterId}
                        onValueChange={(v) => {
                          setSemesterId(v);
                          setErrors((p) => ({ ...p, semester_id: undefined }));
                        }}
                      >
                        <SelectTrigger id="ci_semester">
                          <SelectValue placeholder="Select Semester" />
                        </SelectTrigger>
                        <SelectContent>
                          {semesters.length === 0 ? (
                            <SelectItem value="__none" disabled>No semesters available</SelectItem>
                          ) : (
                            semesters.map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    )}
                    {errors.semester_id && (
                      <p className="text-xs text-destructive">{errors.semester_id}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="ci_code">Course Code</Label>
                    <Input
                      id="ci_code"
                      placeholder="e.g. CS-101"
                      value={customCourseCode}
                      onChange={(e) => setCustomCourseCode(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <SectionHeader icon={<Users className="h-3 w-3" />} label="Staff Assignment" variant="info" />

              <div className="space-y-4 mb-6">
                <div className="space-y-1.5">
                  <Label>Lead Instructor</Label>
                  <InstructorSearchInput
                    placeholder="Search for instructor by name..."
                    value={leadInstructor}
                    onSelect={setLeadInstructor}
                    excludeIds={taIds}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Teaching Assistants</Label>
                  <TaChipInput value={tas} onChange={setTas} excludeIds={leadInstructorId} />
                </div>
              </div>

              <SideDialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleNext} className="gap-1.5">
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </SideDialogFooter>
            </>
          )}

          {/* ── STEP 2: Student Enrollment + Instance Settings ───── */}
          {step === 2 && (
            <>
              <SectionHeader icon={<GraduationCap className="h-3 w-3" />} label="Student Enrollment" variant="success" />

              <div className="space-y-4 mb-6">
                <div className="space-y-1.5">
                  <Label htmlFor="ci_batch">Select Batch / Group</Label>
                  {metaLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground h-9">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                    </div>
                  ) : (
                    <Select
                      value={batchId}
                      onValueChange={(v) => {
                        setBatchId(v);
                        setErrors((p) => ({ ...p, batch_id: undefined }));
                      }}
                    >
                      <SelectTrigger id="ci_batch">
                        <SelectValue placeholder="Choose a student batch" />
                      </SelectTrigger>
                      <SelectContent>
                        {batches.length === 0 ? (
                          <SelectItem value="__none" disabled>No batches available</SelectItem>
                        ) : (
                          batches.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.name} ({b.code})
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* OR divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">or add individually</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                <div className="space-y-1.5">
                  <Label>Add Individual Students</Label>
                  <StudentChipInput value={students} onChange={setStudents} />
                </div>

                {errors.batch_id && (
                  <p className="text-xs text-destructive">{errors.batch_id}</p>
                )}
              </div>

              {/* Settings section */}
              <SectionHeader icon={<Settings2 className="h-3 w-3" />} label="Instance Settings" variant="warning" />

              <div className="space-y-4 mb-6">
                <div className="rounded-lg border border-border bg-muted/30 divide-y divide-border">
                  {/* Max Enrollment */}
                  <div className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">Max Enrollment</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Maximum students allowed in this instance
                      </p>
                    </div>
                    <Input
                      type="number"
                      min={1}
                      value={maxEnrollment}
                      onChange={(e) => setMaxEnrollment(parseInt(e.target.value, 10) || 1)}
                      className="w-20 text-center text-sm h-8"
                    />
                  </div>

                  {/* Initial Status (read-only) */}
                  <div className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">Initial Status</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Status when the instance is created
                      </p>
                    </div>
                    <span className="inline-flex items-center rounded-full bg-warning/10 text-warning-muted-foreground border border-warning/20 px-2.5 py-0.5 text-xs font-medium">
                      Planned
                    </span>
                  </div>
                </div>
              </div>

              <SideDialogFooter>
                <Button type="button" variant="outline" onClick={() => setStep(1)} className="gap-1.5">
                  <ChevronLeft className="h-3.5 w-3.5" /> Back
                </Button>
                <Button type="submit" disabled={submitting || metaLoading} className="gap-1.5">
                  {submitting ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" />Creating…</>
                  ) : (
                    <><Check className="h-3.5 w-3.5" /> Save &amp; Create Instance</>
                  )}
                </Button>
              </SideDialogFooter>
            </>
          )}
        </form>
      </SideDialogContent>
    </SideDialog>
  );
}

// ── Edit ──────────────────────────────────────────────────────────────────────

interface EditCourseInstanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instance: CourseInstance;
  semesterName?: string;
  batchName?: string;
  onSuccess: (updated: CourseInstance) => void;
}

export function EditCourseInstanceDialog({
  open,
  onOpenChange,
  instance,
  semesterName,
  batchName,
  onSuccess,
}: EditCourseInstanceDialogProps) {
  const [status, setStatus] = React.useState<CourseInstanceStatus>(instance.status);
  const [maxEnrollment, setMaxEnrollment] = React.useState(instance.max_enrollment);
  const [errors, setErrors] = React.useState<AcademicFormErrors>({});
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setStatus(instance.status);
      setMaxEnrollment(instance.max_enrollment);
      setErrors({});
    }
  }, [open, instance]);

  const statusVariant: Record<CourseInstanceStatus, { badge: string; dot: string }> = {
    Planned:   { badge: 'bg-warning/10 text-warning-muted-foreground border-warning/20',   dot: 'bg-warning' },
    Active:    { badge: 'bg-success/10 text-success-muted-foreground border-success/20',   dot: 'bg-success' },
    Completed: { badge: 'bg-info/10 text-info-muted-foreground border-info/20',             dot: 'bg-info' },
    Cancelled: { badge: 'bg-destructive/10 text-destructive border-destructive/20',         dot: 'bg-destructive' },
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: AcademicFormErrors = {};
    if (maxEnrollment <= 0) errs.max_enrollment = 'Must be a positive number';
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setSubmitting(true);
    try {
      const updated = await courseInstancesApi.update(instance.id, {
        status,
        max_enrollment: maxEnrollment,
      });
      toast.success('Instance updated');
      onOpenChange(false);
      onSuccess(updated);
    } catch (err) {
      toast.error('Failed to update instance', handleApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SideDialog open={open} onOpenChange={onOpenChange}>
      <SideDialogContent>
        <SideDialogHeader>
          <SideDialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Edit Course Instance
          </SideDialogTitle>
          <SideDialogDescription>
            {semesterName && batchName
              ? `${semesterName} — ${batchName}`
              : `Instance ${instance.id.slice(0, 8)}`}
          </SideDialogDescription>
        </SideDialogHeader>

        {/* Instance overview card */}
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 mb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">
                {semesterName || 'Unknown Semester'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {batchName ? `Batch: ${batchName}` : `ID: ${instance.id.slice(0, 8)}`}
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium shrink-0 ${statusVariant[instance.status].badge}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${statusVariant[instance.status].dot}`} />
              {instance.status}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-0 flex-1">

          {/* Settings section */}
          <SectionHeader icon={<Settings2 className="h-3 w-3" />} label="Instance Settings" variant="warning" />

          <div className="rounded-lg border border-border bg-muted/30 divide-y divide-border mb-6">
            {/* Status */}
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Status</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Current operational state of this instance
                </p>
              </div>
              <Select value={status} onValueChange={(v) => setStatus(v as CourseInstanceStatus)}>
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Max Enrollment */}
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Max Enrollment</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Maximum number of students for this instance
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Input
                  type="number"
                  min={1}
                  value={maxEnrollment}
                  onChange={(e) => setMaxEnrollment(parseInt(e.target.value, 10) || 1)}
                  className="w-20 text-center text-sm h-8"
                />
                {errors.max_enrollment && (
                  <p className="text-xs text-destructive">{errors.max_enrollment}</p>
                )}
              </div>
            </div>

            {/* Instance ID (read-only) */}
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Instance ID</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Unique identifier for this course instance
                </p>
              </div>
              <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded">
                {instance.id.slice(0, 8)}…
              </span>
            </div>
          </div>

          <SideDialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="gap-1.5">
              {submitting
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</>
                : <><Check className="h-3.5 w-3.5" />Save Changes</>
              }
            </Button>
          </SideDialogFooter>
        </form>
      </SideDialogContent>
    </SideDialog>
  );
}

// ── Enroll Students ───────────────────────────────────────────────────────────

interface EnrollStudentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseInstanceId: string;
  /** Already-enrolled user IDs, used to filter out suggestions */
  enrolledUserIds?: string[];
  onSuccess: () => void;
}

function getEnrollInitials(name: string, email: string) {
  const src = name || email;
  return src
    .split(/[.\-_\s@]/)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

export function EnrollStudentsDialog({
  open,
  onOpenChange,
  courseInstanceId,
  enrolledUserIds = [],
  onSuccess,
}: EnrollStudentsDialogProps) {
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<UserListItem[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [selected, setSelected] = React.useState<UserListItem[]>([]);
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset when dialog opens/closes
  React.useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setSelected([]);
      setDropdownOpen(false);
    }
  }, [open]);

  const selectedIds = React.useMemo(() => new Set(selected.map((u) => u.id)), [selected]);

  React.useEffect(() => {
    if (!query.trim()) { setResults([]); setDropdownOpen(false); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await usersApi.list({ search: query, user_type: 'student', limit: 10 });
        const filtered = res.data.filter(
          (u) => !selectedIds.has(u.id) && !enrolledUserIds.includes(u.id),
        );
        setResults(filtered);
        setDropdownOpen(filtered.length > 0);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function addStudent(u: UserListItem) {
    setSelected((prev) => [...prev, u]);
    setQuery('');
    setResults([]);
    setDropdownOpen(false);
  }

  function removeStudent(id: string) {
    setSelected((prev) => prev.filter((u) => u.id !== id));
  }

  async function handleEnroll() {
    if (selected.length === 0) return;
    setSubmitting(true);
    const errors: string[] = [];
    for (const student of selected) {
      try {
        await enrollmentsApi.enroll({
          course_instance_id: courseInstanceId,
          user_id: student.id,
          status: 'Enrolled',
          allow_individual: true, // Allow enrolling students outside of batch
        } satisfies EnrollStudentRequest);
      } catch {
        errors.push(student.full_name || student.email);
      }
    }
    setSubmitting(false);
    if (errors.length > 0) {
      if (errors.length < selected.length) {
        // partial success
        const succeeded = selected.length - errors.length;
        onSuccess();
        onOpenChange(false);
        // import toast lazily to avoid circular deps — use dynamic import
        (await import('@/lib/hooks/use-toast')).toast.warning(
          `${succeeded} student(s) enrolled`,
          `Failed to enroll: ${errors.join(', ')}`,
        );
      } else {
        // all failed
        (await import('@/lib/hooks/use-toast')).toast.error(
          'Enrollment failed',
          `Could not enroll: ${errors.join(', ')}`,
        );
      }
    } else {
      onSuccess();
      onOpenChange(false);
      (await import('@/lib/hooks/use-toast')).toast.success(
        `${selected.length} student(s) enrolled`,
        'Students have been added to this course instance.',
      );
    }
  }

  return (
    <SideDialog open={open} onOpenChange={onOpenChange}>
      <SideDialogContent>
        <SideDialogHeader>
          <SideDialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Enroll Students
          </SideDialogTitle>
          <SideDialogDescription>
            Search for students and add them individually to this course instance.
          </SideDialogDescription>
        </SideDialogHeader>

        <div className="flex flex-col gap-4 flex-1 overflow-y-auto">

          {/* ── Search input ── */}
          <SectionHeader icon={<Search className="h-3 w-3" />} label="Find Students" variant="primary" />
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search by name, email or student ID…"
              className="pl-9 pr-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
              onFocus={() => results.length > 0 && setDropdownOpen(true)}
              autoFocus
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
            {/* Suggestions dropdown */}
            {dropdownOpen && results.length > 0 && (
              <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
                {results.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left"
                    onMouseDown={() => addStudent(u)}
                  >
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="bg-success/10 text-success text-xs">
                        {getEnrollInitials(u.full_name, u.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate text-sm">{u.full_name || u.email}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                    {u.student_id && (
                      <span className="text-xs text-muted-foreground shrink-0 font-mono">
                        #{u.student_id}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {!searching && query.trim() && results.length === 0 && !dropdownOpen && (
              <p className="mt-2 text-xs text-muted-foreground">No students found matching &ldquo;{query}&rdquo;.</p>
            )}
          </div>

          {/* ── Selected students ── */}
          {selected.length > 0 && (
            <>
              <SectionHeader
                icon={<GraduationCap className="h-3 w-3" />}
                label={`Selected (${selected.length})`}
                variant="success"
              />
              <div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
                {selected.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 px-3 py-2.5">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="bg-success/10 text-success text-xs">
                        {getEnrollInitials(u.full_name, u.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{u.full_name || u.email}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                    {u.student_id && (
                      <span className="text-xs text-muted-foreground font-mono shrink-0">
                        #{u.student_id}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeStudent(u.id)}
                      className="ml-1 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <SideDialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={selected.length === 0 || submitting}
            className="gap-1.5"
            onClick={handleEnroll}
          >
            {submitting
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Enrolling…</>
              : <><UserPlus className="h-3.5 w-3.5" />Enroll {selected.length > 0 ? `${selected.length} Student${selected.length > 1 ? 's' : ''}` : 'Students'}</>
            }
          </Button>
        </SideDialogFooter>
      </SideDialogContent>
    </SideDialog>
  );
}

// ── Add Batch to Instance Dialog ──────────────────────────────────────────────

export function AddBatchToInstanceDialog({
  open,
  onOpenChange,
  instanceId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceId: string;
  onSuccess?: () => void;
}) {
  const [batches, setBatches] = React.useState<Batch[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [selectedBatchId, setSelectedBatchId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setSearch('');
      setSelectedBatchId(null);
      return;
    }
    
    const fetchBatches = async () => {
      setLoading(true);
      try {
        const data = await batchesApi.list(false);
        setBatches(data);
      } catch (err) {
        toast.error('Failed to load batches', handleApiError(err));
      } finally {
        setLoading(false);
      }
    };

    fetchBatches();
  }, [open]);

  const filteredBatches = batches.filter((b) => {
    const q = search.toLowerCase();
    return (
      b.name.toLowerCase().includes(q) ||
      b.code.toLowerCase().includes(q)
    );
  });

  const handleAddBatch = async () => {
    if (!selectedBatchId) return;

    setSubmitting(true);
    try {
      // Get all batch members
      const members = await batchesApi.getMembersDetailed(selectedBatchId);
      const userIds = members.map((m) => m.user_id);

      // Enroll all batch members in the course instance
      await Promise.all(
        userIds.map((userId) =>
          enrollmentsApi.enroll({
            course_instance_id: instanceId,
            user_id: userId,
          })
        )
      );

      toast.success(
        'Batch added successfully',
        `${userIds.length} students enrolled from batch`
      );
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      toast.error('Failed to add batch', handleApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SideDialog open={open} onOpenChange={onOpenChange}>
      <SideDialogContent>
        <SideDialogHeader>
          <SideDialogTitle>Add Batch to Course</SideDialogTitle>
          <SideDialogDescription>
            Select a batch to enroll all its students in this course instance.
          </SideDialogDescription>
        </SideDialogHeader>

        <div className="space-y-4 flex-1">
          <SectionHeader
            icon={<Users className="h-3 w-3" />}
            label="Select Batch"
            variant="primary"
          />

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search batches by name or code..."
              className="pl-9 h-9 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Batch List */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filteredBatches.length === 0 ? (
            <div className="py-8 text-center">
              <Users className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">
                {search ? 'No batches found' : 'No batches available'}
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {filteredBatches.map((batch) => (
                <button
                  key={batch.id}
                  type="button"
                  onClick={() => setSelectedBatchId(batch.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                    selectedBatchId === batch.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                    selectedBatchId === batch.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {selectedBatchId === batch.id ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Users className="h-4 w-4" />
                    )}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-medium text-sm truncate">{batch.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {batch.code} • {batch.start_year}-{batch.end_year}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <SideDialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!selectedBatchId || submitting}
            onClick={handleAddBatch}
            className="gap-1.5"
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Adding Batch...
              </>
            ) : (
              <>
                <UserPlus className="h-3.5 w-3.5" />
                Add Batch
              </>
            )}
          </Button>
        </SideDialogFooter>
      </SideDialogContent>
    </SideDialog>
  );
}

// ── Add Individual Student Dialog ─────────────────────────────────────────────

export function AddIndividualStudentDialog({
  open,
  onOpenChange,
  instanceId,
  excludeUserIds = [],
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceId: string;
  excludeUserIds?: string[];
  onSuccess?: () => void;
}) {
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<UserListItem[]>([]);
  const [selected, setSelected] = React.useState<UserListItem[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setSelected([]);
      setDropdownOpen(false);
      return;
    }
  }, [open]);

  React.useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setDropdownOpen(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await usersApi.list({
          search: query,
          user_type: 'Student',
          limit: 20,
        });
        const selectedIds = selected.map((s) => s.id);
        const allExcluded = [...excludeUserIds, ...selectedIds];
        const filtered = res.data.filter((u) => !allExcluded.includes(u.id));
        setResults(filtered);
        setDropdownOpen(filtered.length > 0);
      } catch (err) {
        setResults([]);
        setDropdownOpen(false);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, selected, excludeUserIds]);

  const addStudent = (student: UserListItem) => {
    setSelected((prev) => [...prev, student]);
    setQuery('');
    setResults([]);
    setDropdownOpen(false);
  };

  const removeStudent = (userId: string) => {
    setSelected((prev) => prev.filter((s) => s.id !== userId));
  };

  const handleEnroll = async () => {
    if (selected.length === 0) return;

    setSubmitting(true);
    try {
      await Promise.all(
        selected.map((student) =>
          enrollmentsApi.enroll({
            course_instance_id: instanceId,
            user_id: student.id,
            status: 'Enrolled',
            allow_individual: true, // Allow enrolling students outside of batch
          })
        )
      );

      toast.success(
        `${selected.length} student${selected.length > 1 ? 's' : ''} enrolled`,
        'Students added successfully'
      );
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      toast.error('Failed to enroll students', handleApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  function getEnrollInitials(name: string, email: string) {
    const src = name || email;
    return src
      .split(/[.\-_\s@]/)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .slice(0, 2)
      .join('');
  }

  return (
    <SideDialog open={open} onOpenChange={onOpenChange}>
      <SideDialogContent>
        <SideDialogHeader>
          <SideDialogTitle>Add Individual Students</SideDialogTitle>
          <SideDialogDescription>
            Search and add students individually to this course instance.
          </SideDialogDescription>
        </SideDialogHeader>

        <div className="space-y-4 flex-1">
          <SectionHeader
            icon={<Search className="h-3 w-3" />}
            label="Search Students"
            variant="info"
          />

          {/* Search Input */}
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search by name, email, or ID..."
                className="pl-9 h-9 text-sm"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => results.length > 0 && setDropdownOpen(true)}
                onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* Dropdown Results */}
            {dropdownOpen && results.length > 0 && (
              <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg overflow-hidden max-h-[240px] overflow-y-auto">
                {results.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left"
                    onMouseDown={() => addStudent(u)}
                  >
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="bg-info/10 text-info text-xs">
                        {getEnrollInitials(u.full_name, u.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate text-sm">
                        {u.full_name || u.email}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {u.email}
                      </p>
                    </div>
                    {u.student_id && (
                      <span className="text-xs text-muted-foreground shrink-0 font-mono">
                        #{u.student_id}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {!searching && query.trim() && results.length === 0 && !dropdownOpen && (
              <p className="mt-2 text-xs text-muted-foreground">
                No students found matching &ldquo;{query}&rdquo;.
              </p>
            )}
          </div>

          {/* Selected Students */}
          {selected.length > 0 && (
            <>
              <SectionHeader
                icon={<GraduationCap className="h-3 w-3" />}
                label={`Selected (${selected.length})`}
                variant="success"
              />
              <div className="rounded-lg border border-border overflow-hidden divide-y divide-border max-h-[300px] overflow-y-auto">
                {selected.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 px-3 py-2.5">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="bg-success/10 text-success text-xs">
                        {getEnrollInitials(u.full_name, u.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {u.full_name || u.email}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {u.email}
                      </p>
                    </div>
                    {u.student_id && (
                      <span className="text-xs text-muted-foreground font-mono shrink-0">
                        #{u.student_id}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeStudent(u.id)}
                      className="ml-1 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <SideDialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={selected.length === 0 || submitting}
            className="gap-1.5"
            onClick={handleEnroll}
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Enrolling...
              </>
            ) : (
              <>
                <UserPlus className="h-3.5 w-3.5" />
                Enroll {selected.length > 0 ? `${selected.length} Student${selected.length > 1 ? 's' : ''}` : 'Students'}
              </>
            )}
          </Button>
        </SideDialogFooter>
      </SideDialogContent>
    </SideDialog>
  );
}
