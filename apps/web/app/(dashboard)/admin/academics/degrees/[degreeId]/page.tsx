'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Plus,
  RefreshCw,
  Award,
  MoreHorizontal,
  Pencil,
  PowerOff,
  Power,
  AlertTriangle,
  ChevronRight,
  CalendarDays,
  CheckCircle2,
  XCircle,
  GraduationCap,
  Building2,
  Layers,
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
import { degreesApi, specializationsApi, departmentsApi } from '@/lib/api/academics';
import { useUIStore } from '@/lib/stores/uiStore';
import { handleApiError } from '@/lib/api/axios';
import { useAcademicsAccess } from '@/lib/hooks/useAcademicsAccess';
import { toast } from '@/lib/hooks/use-toast';
import {
  CreateSpecializationDialog,
  EditSpecializationDialog,
} from '@/components/admin/academics/specialization-dialogs';
import { EditDegreeDialog } from '@/components/admin/academics/degree-dialogs';
import type { Degree, Specialization, DegreeLevel, Department, UpdateDegreeRequest } from '@/types/academics.types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const LEVEL_VARIANT: Record<DegreeLevel, 'info' | 'purple' | 'success' | 'warning' | 'secondary'> = {
  Undergraduate: 'info',
  Postgraduate: 'purple',
  Doctoral: 'success',
  Diploma: 'warning',
  Certificate: 'secondary',
};

// ── Skeletons ─────────────────────────────────────────────────────────────────

function HeaderSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-7 w-7 rounded-md" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      <Skeleton className="h-4 w-96" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-36" />
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
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-7 w-7 rounded" />
        </div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DegreeDetailPage() {
  const router = useRouter();
  const params = useParams<{ degreeId: string }>();
  const { canAccess, canWrite } = useAcademicsAccess();

  const setPageTitle = useUIStore((s) => s.setPageTitle);

  const [degree, setDegree] = React.useState<Degree | null>(null);
  const [department, setDepartment] = React.useState<Department | null>(null);
  const [specializations, setSpecializations] = React.useState<Specialization[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showInactive, setShowInactive] = React.useState(false);

  // Dialogs
  const [createSpecOpen, setCreateSpecOpen] = React.useState(false);
  const [editSpecTarget, setEditSpecTarget] = React.useState<Specialization | null>(null);
  const [editDegreeOpen, setEditDegreeOpen] = React.useState(false);

  // Settings
  const [activeTab, setActiveTab] = React.useState<'specializations' | 'settings'>('specializations');
  const [editValues, setEditValues] = React.useState<UpdateDegreeRequest>({});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!canAccess) router.replace('/admin');
  }, [canAccess, router]);

  const load = React.useCallback(async () => {
    if (!params.degreeId) return;
    setLoading(true);
    setError(null);
    try {
      const [deg, specs] = await Promise.all([
        degreesApi.get(params.degreeId),
        specializationsApi.listByDegree(params.degreeId, true),
      ]);
      setDegree(deg);
      setSpecializations(specs);
      setPageTitle(deg.name);
      setEditValues({ name: deg.name, code: deg.code, level: deg.level });
      // Lazily fetch department info
      if (deg.department_id) {
        departmentsApi.get(deg.department_id).then(setDepartment).catch(() => {});
      }
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
  }, [params.degreeId]);

  React.useEffect(() => { load(); }, [load]);

  React.useEffect(() => () => setPageTitle(null), [setPageTitle]);

  async function handleSaveDegree(e: React.FormEvent) {
    e.preventDefault();
    if (!degree) return;
    setSaving(true);
    try {
      const updated = await degreesApi.update(degree.id, editValues);
      setDegree(updated);
      setPageTitle(updated.name);
      toast.success('Degree updated', updated.name);
    } catch (err) {
      toast.error('Update failed', handleApiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleDegreeStatus() {
    if (!degree) return;
    try {
      if (degree.is_active) {
        await degreesApi.deactivate(degree.id);
        setDegree((prev) => prev ? { ...prev, is_active: false } : prev);
        toast.success('Degree deactivated', degree.name);
      } else {
        await degreesApi.reactivate(degree.id);
        setDegree((prev) => prev ? { ...prev, is_active: true } : prev);
        toast.success('Degree reactivated', degree.name);
      }
    } catch (err) {
      toast.error('Action failed', handleApiError(err));
    }
  }

  async function handleToggleSpec(spec: Specialization) {
    try {
      if (spec.is_active) {
        await specializationsApi.deactivate(spec.id);
        setSpecializations((prev) => prev.map((s) => s.id === spec.id ? { ...s, is_active: false } : s));
        toast.success('Specialization deactivated', spec.name);
      } else {
        const updated = await specializationsApi.reactivate(spec.id);
        setSpecializations((prev) => prev.map((s) => s.id === spec.id ? updated : s));
        toast.success('Specialization reactivated', spec.name);
      }
    } catch (err) {
      toast.error('Action failed', handleApiError(err));
    }
  }

  if (!canAccess) return null;

  const visibleSpecs = showInactive
    ? specializations
    : specializations.filter((s) => s.is_active);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground flex-wrap">
        <Link href="/admin/academics" className="hover:text-foreground transition-colors">Academics</Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        {department ? (
          <>
            <Link href="/admin/academics/departments" className="hover:text-foreground transition-colors">Departments</Link>
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            <Link
              href={`/admin/academics/departments/${department.id}`}
              className="hover:text-foreground transition-colors truncate max-w-[120px]"
            >
              {department.name}
            </Link>
          </>
        ) : (
          <Link href="/admin/academics/degrees" className="hover:text-foreground transition-colors">Degrees</Link>
        )}
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        <span className="text-foreground font-medium truncate max-w-[200px]">
          {loading ? '…' : (degree?.name ?? 'Not found')}
        </span>
      </nav>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Could not load degree: <strong>{error}</strong></span>
          <Button variant="ghost" size="sm" onClick={load} className="ml-auto shrink-0 text-amber-700 hover:text-amber-900">Retry</Button>
        </div>
      )}

      {/* Header */}
      {loading ? (
        <HeaderSkeleton />
      ) : degree ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 -ml-1 shrink-0"
                  onClick={() => department
                    ? router.push(`/admin/academics/departments/${department.id}`)
                    : router.push('/admin/academics/degrees')
                  }
                  title="Back"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">{degree.name}</h1>
                <Badge variant={LEVEL_VARIANT[degree.level] ?? 'secondary'} className="text-xs">
                  {degree.level}
                </Badge>
                <Badge variant={degree.is_active ? 'success' : 'secondary'} className="text-xs">
                  {degree.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground pl-8">
                {department ? `${degree.level} program offered by ${department.name}` : `${degree.level} degree programme`}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="icon" onClick={load} disabled={loading} title="Refresh">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              {canWrite && (
                <Button variant="outline" size="sm" onClick={() => setEditDegreeOpen(true)} className="gap-1.5">
                  <Pencil className="h-4 w-4" /> Edit Degree
                </Button>
              )}
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border-border bg-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  <Award className="h-3.5 w-3.5" />
                  Degree Code
                </div>
                <p className="text-lg font-bold text-foreground font-mono">{degree.code}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{degree.name}</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  <Building2 className="h-3.5 w-3.5" />
                  Department
                </div>
                {department ? (
                  <Link
                    href={`/admin/academics/departments/${department.id}`}
                    className="text-base font-semibold text-primary hover:underline leading-tight block"
                  >
                    {department.name}
                  </Link>
                ) : (
                  <p className="text-base font-semibold text-foreground">—</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  <GraduationCap className="h-3.5 w-3.5" />
                  Program Type
                </div>
                <Badge variant={LEVEL_VARIANT[degree.level] ?? 'secondary'} className="text-sm px-2.5 py-0.5">
                  {degree.level}
                </Badge>
                <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" />
                  Since {fmt(degree.created_at)}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Award className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="font-medium text-muted-foreground">Degree not found</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => router.push('/admin/academics/degrees')}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Degrees
          </Button>
        </div>
      )}

      {/* Tab layout */}
      {degree && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* LHS Sidebar */}
          <div className="lg:col-span-1 space-y-3">
            <Button
              variant={activeTab === 'specializations' ? 'default' : 'ghost'}
              className={cn(
                'justify-start font-semibold w-full',
                activeTab === 'specializations' ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setActiveTab('specializations')}
            >
              <Layers className="h-4 w-4 mr-2" />
              Specializations
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
          {activeTab === 'specializations' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              Specializations
              {!loading && (
                <Badge variant="secondary" className="text-xs font-mono">
                  {specializations.filter((s) => s.is_active).length}
                </Badge>
              )}
            </h2>
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
                <Button size="sm" onClick={() => setCreateSpecOpen(true)} className="gap-1.5">
                  <Plus className="h-4 w-4" /> Add Specialization
                </Button>
              )}
            </div>
          </div>

          {loading ? (
            <TableSkeleton />
          ) : visibleSpecs.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
              <Layers className="h-8 w-8 text-muted-foreground/30 mb-3" />
              <p className="font-medium text-muted-foreground text-sm">No specializations found</p>
              <p className="text-xs text-muted-foreground mt-0.5">All tracks and concentrations for this degree programme appear here.</p>
              {canWrite && (
                <Button size="sm" className="mt-3 gap-1.5" onClick={() => setCreateSpecOpen(true)}>
                  <Plus className="h-4 w-4" /> Add Specialization
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground pl-4">Specialization Name</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Code</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Added</TableHead>
                    {canWrite && (
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground text-right pr-4">Actions</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleSpecs.map((spec) => (
                    <TableRow key={spec.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                            <Layers className="h-4 w-4 text-primary" />
                          </div>
                          <p className="font-medium text-foreground text-sm">{spec.name}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">
                          {spec.code}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={spec.is_active ? 'success' : 'secondary'} className="text-xs">
                          {spec.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {fmt(spec.created_at)}
                      </TableCell>
                      {canWrite && (
                        <TableCell className="text-right pr-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuItem onClick={() => setEditSpecTarget(spec)} className="gap-2">
                                <Pencil className="h-3.5 w-3.5" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleToggleSpec(spec)}
                                className={`gap-2 ${spec.is_active ? 'text-red-600 focus:text-red-600' : 'text-emerald-600 focus:text-emerald-600'}`}
                              >
                                {spec.is_active
                                  ? <><PowerOff className="h-3.5 w-3.5" /> Deactivate</>
                                  : <><Power className="h-3.5 w-3.5" /> Reactivate</>
                                }
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="px-4 py-2.5 border-t border-border bg-muted/20 text-xs text-muted-foreground">
                Showing {visibleSpecs.length} of {specializations.length} specialization{specializations.length !== 1 ? 's' : ''}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <Card className="border-border">
            <CardHeader className="border-b border-border bg-muted/30">
              <CardTitle className="text-base font-bold">General Settings</CardTitle>
              <CardDescription className="text-xs">Update the degree name, code and programme level.</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSaveDegree} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="deg_name" className="text-xs font-bold uppercase text-muted-foreground">Degree Name</Label>
                    <input
                      id="deg_name"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 font-medium"
                      value={editValues.name ?? ''}
                      onChange={(e) => setEditValues({ ...editValues, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deg_code" className="text-xs font-bold uppercase text-muted-foreground">Degree Code</Label>
                    <input
                      id="deg_code"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                      value={editValues.code ?? ''}
                      onChange={(e) => setEditValues({ ...editValues, code: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deg_level" className="text-xs font-bold uppercase text-muted-foreground">Programme Level</Label>
                  <select
                    id="deg_level"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    value={editValues.level ?? ''}
                    onChange={(e) => setEditValues({ ...editValues, level: e.target.value as DegreeLevel })}
                  >
                    <option value="Undergraduate">Undergraduate</option>
                    <option value="Postgraduate">Postgraduate</option>
                    <option value="Doctoral">Doctoral</option>
                    <option value="Diploma">Diploma</option>
                    <option value="Certificate">Certificate</option>
                  </select>
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
                  <CardDescription className="text-xs text-red-500/70">Proceed with caution. These actions may affect all specializations under this degree.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-foreground">
                    {degree.is_active ? 'Deactivate Degree' : 'Reactivate Degree'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {degree.is_active
                      ? 'All specializations under this degree will be affected.'
                      : 'Restore visibility and access for this degree and its specializations.'}
                  </p>
                </div>
                <Button
                  variant={degree.is_active ? 'destructive' : 'secondary'}
                  className="font-bold whitespace-nowrap"
                  onClick={handleToggleDegreeStatus}
                >
                  {degree.is_active ? 'Deactivate' : 'Reactivate'}
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
      {degree && (
        <>
          <CreateSpecializationDialog
            open={createSpecOpen}
            onOpenChange={setCreateSpecOpen}
            degreeId={degree.id}
            degreeName={degree.name}
            onSuccess={(spec) => {
              setSpecializations((prev) => [spec, ...prev]);
              setCreateSpecOpen(false);
            }}
          />
          {editSpecTarget && (
            <EditSpecializationDialog
              open={!!editSpecTarget}
              onOpenChange={(o) => { if (!o) setEditSpecTarget(null); }}
              specialization={editSpecTarget}
              onSuccess={(updated) => {
                setSpecializations((prev) => prev.map((s) => s.id === updated.id ? updated : s));
                setEditSpecTarget(null);
              }}
            />
          )}
          {canWrite && (
            <EditDegreeDialog
              open={editDegreeOpen}
              onOpenChange={setEditDegreeOpen}
              degree={degree}
              onSuccess={(updated) => {
                setDegree(updated);
                setEditDegreeOpen(false);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
