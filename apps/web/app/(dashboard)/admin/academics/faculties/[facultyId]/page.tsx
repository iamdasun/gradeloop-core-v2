'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Plus,
  RefreshCw,
  Landmark,
  Building2,
  MoreHorizontal,
  Pencil,
  PowerOff,
  Power,
  AlertTriangle,
  ChevronRight,
  Hash,
  CalendarDays,
  CheckCircle2,
  XCircle,
  Settings,
  Save,
  ShieldAlert,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { facultiesApi, departmentsApi } from '@/lib/api/academics';
import { useUIStore } from '@/lib/stores/uiStore';
import { handleApiError } from '@/lib/api/axios';
import { useAcademicsAccess } from '@/lib/hooks/useAcademicsAccess';
import { toast } from '@/lib/hooks/use-toast';
import {
  CreateDepartmentDialog,
  EditDepartmentDialog,
} from '@/components/admin/academics/department-dialogs';
import { EditFacultyDialog } from '@/components/admin/academics/faculty-dialogs';
import type { Faculty, Department, UpdateFacultyRequest } from '@/types/academics.types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ── Skeletons ─────────────────────────────────────────────────────────────────

function HeaderSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-40" />
          </div>
        ))}
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 rounded-lg border border-border">
          <Skeleton className="h-8 w-8 rounded-md" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-7 w-7 rounded" />
        </div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FacultyDetailPage() {
  const router = useRouter();
  const params = useParams<{ facultyId: string }>();
  const { canAccess, canWrite, isSuperAdmin } = useAcademicsAccess();

  const setPageTitle = useUIStore((s) => s.setPageTitle);

  const [faculty, setFaculty] = React.useState<Faculty | null>(null);
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showInactive, setShowInactive] = React.useState(false);

  // Dialogs
  const [createDeptOpen, setCreateDeptOpen] = React.useState(false);
  const [editDeptTarget, setEditDeptTarget] = React.useState<Department | null>(null);
  const [editFacultyOpen, setEditFacultyOpen] = React.useState(false);

  // Settings
  const [activeTab, setActiveTab] = React.useState<'departments' | 'settings'>('departments');
  const [editValues, setEditValues] = React.useState<UpdateFacultyRequest>({});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!canAccess) router.replace('/admin');
  }, [canAccess, router]);

  const load = React.useCallback(async () => {
    if (!params.facultyId) return;
    setLoading(true);
    setError(null);
    try {
      const [fac, depts] = await Promise.all([
        facultiesApi.get(params.facultyId),
        departmentsApi.listByFaculty(params.facultyId),
      ]);
      setFaculty(fac);
      setDepartments(depts);
      setPageTitle(fac.name);
      setEditValues({ name: fac.name, code: fac.code, description: fac.description ?? '' });
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
  }, [params.facultyId]);

  React.useEffect(() => { load(); }, [load]);

  React.useEffect(() => () => setPageTitle(null), [setPageTitle]);

  async function handleSaveFaculty(e: React.FormEvent) {
    e.preventDefault();
    if (!faculty) return;
    setSaving(true);
    try {
      const updated = await facultiesApi.update(faculty.id, editValues);
      setFaculty(updated);
      setPageTitle(updated.name);
      toast.success('Faculty updated', updated.name);
    } catch (err) {
      toast.error('Update failed', handleApiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleFacultyStatus() {
    if (!faculty) return;
    try {
      if (faculty.is_active) {
        await facultiesApi.deactivate(faculty.id);
        setFaculty((prev) => prev ? { ...prev, is_active: false } : prev);
        toast.success('Faculty deactivated', faculty.name);
      } else {
        await facultiesApi.reactivate(faculty.id);
        setFaculty((prev) => prev ? { ...prev, is_active: true } : prev);
        toast.success('Faculty reactivated', faculty.name);
      }
    } catch (err) {
      toast.error('Action failed', handleApiError(err));
    }
  }

  async function handleToggleDept(dept: Department) {
    try {
      if (dept.is_active) {
        await departmentsApi.deactivate(dept.id);
        setDepartments((prev) => prev.map((d) => d.id === dept.id ? { ...d, is_active: false } : d));
        toast.success('Department deactivated', dept.name);
      } else {
        const updated = await departmentsApi.reactivate(dept.id);
        setDepartments((prev) => prev.map((d) => d.id === dept.id ? updated : d));
        toast.success('Department reactivated', dept.name);
      }
    } catch (err) {
      toast.error('Action failed', handleApiError(err));
    }
  }

  if (!canAccess) return null;

  const visibleDepts = showInactive
    ? departments
    : departments.filter((d) => d.is_active);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/admin/academics" className="hover:text-foreground transition-colors">Academics</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href="/admin/academics/faculties" className="hover:text-foreground transition-colors">Faculties</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium truncate max-w-[200px]">
          {loading ? '…' : (faculty?.name ?? 'Not found')}
        </span>
      </nav>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Could not load faculty: <strong>{error}</strong></span>
          <Button variant="ghost" size="sm" onClick={load} className="ml-auto shrink-0 text-amber-700 hover:text-amber-900">
            Retry
          </Button>
        </div>
      )}

      {/* Header */}
      {loading ? (
        <HeaderSkeleton />
      ) : faculty ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 -ml-1"
                  onClick={() => router.push('/admin/academics/faculties')}
                  title="Back to Faculties"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  {faculty.name}
                </h1>
              </div>
              <p className="text-sm text-muted-foreground pl-8">
                {faculty.description || 'Manage departments and academic programs under this faculty.'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="icon" onClick={load} disabled={loading} title="Refresh">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              {isSuperAdmin && (
                <Button variant="outline" size="sm" onClick={() => setEditFacultyOpen(true)} className="gap-1.5">
                  <Pencil className="h-4 w-4" /> Edit Faculty
                </Button>
              )}
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Faculty Name */}
            <Card className="border-border bg-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  <Landmark className="h-3.5 w-3.5" />
                  Faculty Name
                </div>
                <p className="text-lg font-bold text-foreground">{faculty.name}</p>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">{faculty.code}</p>
              </CardContent>
            </Card>

            {/* Departments count */}
            <Card className="border-border bg-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  <Building2 className="h-3.5 w-3.5" />
                  Departments
                </div>
                <p className="text-lg font-bold text-foreground">{departments.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {departments.filter((d) => d.is_active).length} active
                </p>
              </CardContent>
            </Card>

            {/* Status */}
            <Card className="border-border bg-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  {faculty.is_active
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    : <XCircle className="h-3.5 w-3.5 text-zinc-400" />
                  }
                  Status
                </div>
                <Badge variant={faculty.is_active ? 'success' : 'secondary'} className="text-sm px-2.5 py-0.5">
                  {faculty.is_active ? 'Active' : 'Inactive'}
                </Badge>
                <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" />
                  Updated {fmt(faculty.updated_at)}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Landmark className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="font-medium text-muted-foreground">Faculty not found</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => router.push('/admin/academics/faculties')}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Faculties
          </Button>
        </div>
      )}

      {/* Tab layout */}
      {faculty && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* LHS Sidebar */}
          <div className="lg:col-span-1 space-y-3">
            <Button
              variant={activeTab === 'departments' ? 'default' : 'ghost'}
              className={cn(
                'justify-start font-semibold w-full',
                activeTab === 'departments' ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setActiveTab('departments')}
            >
              <Building2 className="h-4 w-4 mr-2" />
              Departments
            </Button>
            <Button
              variant={activeTab === 'settings' ? 'default' : 'ghost'}
              className={cn(
                'justify-start font-semibold w-full',
                activeTab === 'settings' ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setActiveTab('settings')}
            >
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </div>

          {/* RHS Content */}
          <div className="lg:col-span-3 space-y-6">
          {activeTab === 'departments' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Departments
                {!loading && (
                  <Badge variant="secondary" className="text-xs font-mono">
                    {departments.filter((d) => d.is_active).length}
                  </Badge>
                )}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowInactive((v) => !v)}
                className="text-xs"
              >
                {showInactive ? 'Hide Inactive' : 'Show Inactive'}
              </Button>
              {canWrite && (
                <Button size="sm" onClick={() => setCreateDeptOpen(true)} className="gap-1.5">
                  <Plus className="h-4 w-4" /> Add Department
                </Button>
              )}
            </div>
          </div>

          {loading ? (
            <TableSkeleton />
          ) : visibleDepts.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
              <Building2 className="h-8 w-8 text-muted-foreground/30 mb-3" />
              <p className="font-medium text-muted-foreground text-sm">No departments found</p>
              {canWrite && (
                <Button size="sm" className="mt-3 gap-1.5" onClick={() => setCreateDeptOpen(true)}>
                  <Plus className="h-4 w-4" /> Add Department
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground pl-4">
                      Department Name
                    </TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Code
                    </TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Status
                    </TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground text-right pr-4">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleDepts.map((dept) => (
                    <TableRow
                      key={dept.id}
                      className="cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => router.push(`/admin/academics/departments/${dept.id}`)}
                    >
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                            <Building2 className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-foreground text-sm">{dept.name}</p>
                            {dept.description && (
                              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{dept.description}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">
                          {dept.code}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={dept.is_active ? 'success' : 'secondary'} className="text-xs">
                          {dept.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-2">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 text-muted-foreground hover:text-primary text-xs"
                            onClick={(e) => { e.stopPropagation(); router.push(`/admin/academics/departments/${dept.id}`); }}
                          >
                            View <ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                          {canWrite && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem
                                  onClick={(e) => { e.stopPropagation(); setEditDeptTarget(dept); }}
                                  className="gap-2"
                                >
                                  <Pencil className="h-3.5 w-3.5" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={(e) => { e.stopPropagation(); handleToggleDept(dept); }}
                                  className={`gap-2 ${dept.is_active ? 'text-red-600 focus:text-red-600' : 'text-emerald-600 focus:text-emerald-600'}`}
                                >
                                  {dept.is_active
                                    ? <><PowerOff className="h-3.5 w-3.5" /> Deactivate</>
                                    : <><Power className="h-3.5 w-3.5" /> Reactivate</>
                                  }
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="px-4 py-2.5 border-t border-border bg-muted/20 text-xs text-muted-foreground">
                Showing {visibleDepts.length} {showInactive ? 'total' : 'active'} department{visibleDepts.length !== 1 ? 's' : ''}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <Card className="border-border">
            <CardHeader className="border-b border-border bg-muted/30">
              <CardTitle className="text-base font-bold">General Settings</CardTitle>
              <CardDescription className="text-xs">Update the faculty name, code and description.</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSaveFaculty} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="faculty_name" className="text-xs font-bold uppercase text-muted-foreground">Faculty Name</Label>
                    <input
                      id="faculty_name"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 font-medium"
                      value={editValues.name ?? ''}
                      onChange={(e) => setEditValues({ ...editValues, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="faculty_code" className="text-xs font-bold uppercase text-muted-foreground">Faculty Code</Label>
                    <input
                      id="faculty_code"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                      value={editValues.code ?? ''}
                      onChange={(e) => setEditValues({ ...editValues, code: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="faculty_desc" className="text-xs font-bold uppercase text-muted-foreground">Description</Label>
                  <textarea
                    id="faculty_desc"
                    rows={3}
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                    value={editValues.description ?? ''}
                    onChange={(e) => setEditValues({ ...editValues, description: e.target.value })}
                  />
                </div>
                <div className="flex justify-end pt-2">
                  <Button disabled={saving} className="font-bold gap-2">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Changes
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="border-red-100 dark:border-red-900/30 overflow-hidden">
            <CardHeader className="bg-red-50/50 dark:bg-red-900/10 border-b border-red-100 dark:border-red-900/20">
              <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
                <ShieldAlert className="h-5 w-5" />
                <div>
                  <CardTitle className="text-base font-bold">Danger Zone</CardTitle>
                  <CardDescription className="text-xs text-red-500/70">Proceed with caution. These actions may affect all departments under this faculty.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-foreground">
                    {faculty.is_active ? 'Deactivate Faculty' : 'Reactivate Faculty'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {faculty.is_active
                      ? 'All departments under this faculty will be affected.'
                      : 'Restore visibility and access for this faculty and its departments.'}
                  </p>
                </div>
                <Button
                  variant={faculty.is_active ? 'destructive' : 'secondary'}
                  className="font-bold whitespace-nowrap"
                  onClick={handleToggleFacultyStatus}
                >
                  {faculty.is_active ? 'Deactivate' : 'Reactivate'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
          </div>
        </div>
      )}

      {/* Dialogs */}
      {faculty && (
        <>
          <CreateDepartmentDialog
            open={createDeptOpen}
            onOpenChange={setCreateDeptOpen}
            initialFacultyId={faculty.id}
            initialFacultyName={faculty.name}
            onSuccess={(dept) => {
              setDepartments((prev) => [dept, ...prev]);
              setCreateDeptOpen(false);
            }}
          />
          {editDeptTarget && (
            <EditDepartmentDialog
              open={!!editDeptTarget}
              onOpenChange={(o) => { if (!o) setEditDeptTarget(null); }}
              department={editDeptTarget}
              onSuccess={(updated) => {
                setDepartments((prev) => prev.map((d) => d.id === updated.id ? updated : d));
                setEditDeptTarget(null);
              }}
            />
          )}
          {isSuperAdmin && (
            <EditFacultyDialog
              open={editFacultyOpen}
              onOpenChange={setEditFacultyOpen}
              faculty={faculty}
              onSuccess={(updated) => {
                setFaculty(updated);
                setEditFacultyOpen(false);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
