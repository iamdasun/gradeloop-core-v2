"use client";

/**
 * Faculty dialogs: Create + Edit
 *
 * Backend contract (dto/faculty.go):
 *   CreateFacultyRequest.leaders  required, min=1 — each needs user_id (UUID) + role string
 *   Leaders must be employees — fetched from IAM GET /users?user_type=employee
 */
import * as React from "react";
import { Landmark, UserPlus, Trash2, ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { facultiesApi } from "@/lib/api/academics";
import { usersApi } from "@/lib/api/users";
import { handleApiError } from "@/lib/api/axios";
import { toast } from "@/lib/hooks/use-toast";
import type { UserListItem } from "@/types/auth.types";
import type {
  Faculty,
  CreateFacultyRequest,
  CreateLeadershipRequest,
  UpdateFacultyRequest,
  AcademicFormErrors,
} from "@/types/academics.types";

// ── Helpers ───────────────────────────────────────────────────────────────────

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function emptyLeader(): CreateLeadershipRequest {
  return { user_id: "", role: "" };
}

function validateCreate(v: CreateFacultyRequest): AcademicFormErrors {
  const e: AcademicFormErrors = {};
  if (!v.name.trim()) e.name = "Name is required";
  else if (v.name.trim().length < 3) e.name = "Minimum 3 characters";
  if (!v.code.trim()) e.code = "Code is required";
  else if (v.code.trim().length < 2) e.code = "Minimum 2 characters";
  if (!v.leaders || v.leaders.length === 0) {
    e.leaders = "At least one leader is required";
  } else {
    v.leaders.forEach((l, i) => {
      if (!l.user_id.trim() || !UUID_RE.test(l.user_id.trim()))
        e[`leader_uid_${i}`] = "Select a valid employee";
      if (!l.role.trim()) e[`leader_role_${i}`] = "Role is required";
      else if (l.role.trim().length < 3)
        e[`leader_role_${i}`] = "Minimum 3 characters";
    });
  }
  return e;
}

function validateEdit(v: UpdateFacultyRequest): AcademicFormErrors {
  const e: AcademicFormErrors = {};
  if (
    v.name !== undefined &&
    v.name.trim().length > 0 &&
    v.name.trim().length < 3
  )
    e.name = "Minimum 3 characters";
  if (
    v.code !== undefined &&
    v.code.trim().length > 0 &&
    v.code.trim().length < 2
  )
    e.code = "Minimum 2 characters";
  (v.leaders ?? []).forEach((l, i) => {
    if (!l.user_id.trim() || !UUID_RE.test(l.user_id.trim()))
      e[`leader_uid_${i}`] = "Select a valid employee";
    if (!l.role.trim()) e[`leader_role_${i}`] = "Role is required";
    else if (l.role.trim().length < 3)
      e[`leader_role_${i}`] = "Minimum 3 characters";
  });
  return e;
}

// ── Shared employee select component ─────────────────────────────────────────

interface LeadersEditorProps {
  leaders: CreateLeadershipRequest[];
  employees: UserListItem[];
  employeesLoading: boolean;
  errors: AcademicFormErrors;
  onChange: (leaders: CreateLeadershipRequest[]) => void;
  onClearError: (key: string) => void;
}

function LeadersEditor({
  leaders,
  employees,
  employeesLoading,
  errors,
  onChange,
  onClearError,
}: LeadersEditorProps) {
  function setLeader(
    index: number,
    field: keyof CreateLeadershipRequest,
    value: string,
  ) {
    const next = leaders.map((l, i) =>
      i === index ? { ...l, [field]: value } : l,
    );
    onChange(next);
    onClearError(`leader_${field === "user_id" ? "uid" : "role"}_${index}`);
  }

  function addLeader() {
    onChange([...leaders, emptyLeader()]);
  }

  function removeLeader(index: number) {
    onChange(leaders.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>
          Leaders{" "}
          <span className="text-zinc-400 font-normal">(employees only)</span>
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addLeader}
          className="h-7 gap-1.5 text-xs"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Add Leader
        </Button>
      </div>

      {errors.leaders && (
        <p className="text-xs text-red-600">{errors.leaders}</p>
      )}

      {leaders.length === 0 ? (
        <div className="flex items-center justify-center rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800 py-4 text-sm text-zinc-400">
          No leaders added yet — at least one required
        </div>
      ) : (
        <div className="space-y-2">
          {leaders.map((leader, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_auto_auto] gap-2 items-start rounded-lg border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 p-3"
            >
              <div className="grid grid-cols-2 gap-2 col-span-1">
                {/* Employee select */}
                <div className="space-y-1">
                  <p className="text-[11px] text-zinc-500 font-medium uppercase tracking-wide">
                    Employee
                  </p>
                  {employeesLoading ? (
                    <div className="flex h-9 items-center px-3 text-xs text-zinc-400 border rounded-md bg-white dark:bg-zinc-950">
                      Loading employees…
                    </div>
                  ) : employees.length > 0 ? (
                    <div className="relative">
                      <select
                        className="flex h-9 w-full appearance-none rounded-md border border-zinc-200 bg-white px-3 py-1 pr-8 text-sm text-zinc-900 dark:text-zinc-50 shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 dark:border-zinc-800 dark:focus-visible:ring-zinc-300"
                        value={leader.user_id}
                        onChange={(e) =>
                          setLeader(i, "user_id", e.target.value)
                        }
                      >
                        <option value="">Select employee…</option>
                        {employees.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.full_name}
                            {emp.designation ? ` — ${emp.designation}` : ""}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-zinc-400" />
                    </div>
                  ) : (
                    <Input
                      placeholder="Employee UUID"
                      value={leader.user_id}
                      onChange={(e) => setLeader(i, "user_id", e.target.value)}
                    />
                  )}
                  {errors[`leader_uid_${i}`] && (
                    <p className="text-xs text-red-600">
                      {errors[`leader_uid_${i}`]}
                    </p>
                  )}
                </div>

                {/* Role input */}
                <div className="space-y-1">
                  <p className="text-[11px] text-zinc-500 font-medium uppercase tracking-wide">
                    Role
                  </p>
                  <Input
                    placeholder="e.g. Dean"
                    value={leader.role}
                    onChange={(e) => setLeader(i, "role", e.target.value)}
                  />
                  {errors[`leader_role_${i}`] && (
                    <p className="text-xs text-red-600">
                      {errors[`leader_role_${i}`]}
                    </p>
                  )}
                </div>
              </div>

              {/* Remove */}
              <div className="pt-5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-zinc-400 hover:text-red-600"
                  onClick={() => removeLeader(i)}
                  title="Remove leader"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Create ────────────────────────────────────────────────────────────────────

interface CreateFacultyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (faculty: Faculty) => void;
}

const EMPTY_CREATE: CreateFacultyRequest = {
  name: "",
  code: "",
  description: "",
  leaders: [emptyLeader()],
};

export function CreateFacultyDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateFacultyDialogProps) {
  const [values, setValues] =
    React.useState<CreateFacultyRequest>(EMPTY_CREATE);
  const [errors, setErrors] = React.useState<AcademicFormErrors>({});
  const [submitting, setSubmitting] = React.useState(false);

  const [employees, setEmployees] = React.useState<UserListItem[]>([]);
  const [employeesLoading, setEmployeesLoading] = React.useState(false);

  // Fetch employees once when dialog opens
  React.useEffect(() => {
    if (open) {
      setValues(EMPTY_CREATE);
      setErrors({});
      setEmployeesLoading(true);
      usersApi
        .list({ user_type: "instructor", limit: 200 })
        .then((r) => setEmployees(r.data))
        .catch(() => setEmployees([]))
        .finally(() => setEmployeesLoading(false));
    }
  }, [open]);

  function setField(
    field: keyof Omit<CreateFacultyRequest, "leaders">,
    value: string,
  ) {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateCreate(values);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setSubmitting(true);
    try {
      const faculty = await facultiesApi.create(values);
      toast.success("Faculty created", faculty.name);
      onOpenChange(false);
      onSuccess(faculty);
    } catch (err) {
      toast.error("Failed to create faculty", handleApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-zinc-600" />
            Create Faculty
          </DialogTitle>
          <DialogDescription>
            Add a new top-level faculty. At least one employee leader is
            required.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 py-2">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fac_name">Name</Label>
              <Input
                id="fac_name"
                placeholder="Computing"
                value={values.name}
                onChange={(e) => setField("name", e.target.value)}
              />
              {errors.name && (
                <p className="text-xs text-red-600">{errors.name}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fac_code">Code</Label>
              <Input
                id="fac_code"
                placeholder="FOC"
                value={values.code}
                onChange={(e) => setField("code", e.target.value.toUpperCase())}
              />
              {errors.code && (
                <p className="text-xs text-red-600">{errors.code}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fac_desc">
              Description <span className="text-zinc-400">(optional)</span>
            </Label>
            <Input
              id="fac_desc"
              placeholder="Brief description of the faculty"
              value={values.description}
              onChange={(e) => setField("description", e.target.value)}
            />
          </div>

          <Separator />

          {/* Leaders */}
          <LeadersEditor
            leaders={values.leaders}
            employees={employees}
            employeesLoading={employeesLoading}
            errors={errors}
            onChange={(leaders) => {
              setValues((prev) => ({ ...prev, leaders }));
              setErrors((prev) => ({ ...prev, leaders: undefined }));
            }}
            onClearError={(key) =>
              setErrors((prev) => ({ ...prev, [key]: undefined }))
            }
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create Faculty"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit ──────────────────────────────────────────────────────────────────────

interface EditFacultyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  faculty: Faculty;
  onSuccess: (faculty: Faculty) => void;
}

export function EditFacultyDialog({
  open,
  onOpenChange,
  faculty,
  onSuccess,
}: EditFacultyDialogProps) {
  const [values, setValues] = React.useState<UpdateFacultyRequest>({});
  const [errors, setErrors] = React.useState<AcademicFormErrors>({});
  const [submitting, setSubmitting] = React.useState(false);

  const [employees, setEmployees] = React.useState<UserListItem[]>([]);
  const [employeesLoading, setEmployeesLoading] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      // Seed leaders from existing faculty data
      const existingLeaders: CreateLeadershipRequest[] =
        faculty.leaders?.map((l) => ({ user_id: l.user_id, role: l.role })) ??
        [];

      setValues({
        name: faculty.name,
        code: faculty.code,
        description: faculty.description,
        leaders: existingLeaders,
      });
      setErrors({});

      setEmployeesLoading(true);
      usersApi
        .list({ user_type: "instructor", limit: 200 })
        .then((r) => setEmployees(r.data))
        .catch(() => setEmployees([]))
        .finally(() => setEmployeesLoading(false));
    }
  }, [open, faculty]);

  function setField(
    field: keyof Omit<UpdateFacultyRequest, "leaders" | "is_active">,
    value: string,
  ) {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateEdit(values);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setSubmitting(true);
    try {
      const updated = await facultiesApi.update(faculty.id, values);
      toast.success("Faculty updated", updated.name);
      onOpenChange(false);
      onSuccess(updated);
    } catch (err) {
      toast.error("Failed to update faculty", handleApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-zinc-600" />
            Edit Faculty
          </DialogTitle>
          <DialogDescription>
            Update details for <strong>{faculty.name}</strong>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit_fac_name">Name</Label>
              <Input
                id="edit_fac_name"
                value={values.name ?? ""}
                onChange={(e) => setField("name", e.target.value)}
              />
              {errors.name && (
                <p className="text-xs text-red-600">{errors.name}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit_fac_code">Code</Label>
              <Input
                id="edit_fac_code"
                value={values.code ?? ""}
                onChange={(e) => setField("code", e.target.value.toUpperCase())}
              />
              {errors.code && (
                <p className="text-xs text-red-600">{errors.code}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit_fac_desc">
              Description <span className="text-zinc-400">(optional)</span>
            </Label>
            <Input
              id="edit_fac_desc"
              value={values.description ?? ""}
              onChange={(e) => setField("description", e.target.value)}
            />
          </div>

          <Separator />

          {/* Leaders — optional on update, but shown for convenience */}
          <LeadersEditor
            leaders={values.leaders ?? []}
            employees={employees}
            employeesLoading={employeesLoading}
            errors={errors}
            onChange={(leaders) => {
              setValues((prev) => ({ ...prev, leaders }));
            }}
            onClearError={(key) =>
              setErrors((prev) => ({ ...prev, [key]: undefined }))
            }
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
