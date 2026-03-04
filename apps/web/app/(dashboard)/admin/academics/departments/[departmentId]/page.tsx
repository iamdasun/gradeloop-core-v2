'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Plus,
  RefreshCw,
  Building2,
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
  Layers,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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
import { departmentsApi, degreesApi, facultiesApi } from '@/lib/api/academics';
import { useUIStore } from '@/lib/stores/uiStore';
import { handleApiError } from '@/lib/api/axios';
import { useAcademicsAccess } from '@/lib/hooks/useAcademicsAccess';
import { toast } from '@/lib/hooks/use-toast';
import {
  CreateDegreeDialog,
  EditDegreeDialog,
} from '@/components/admin/academics/degree-dialogs';
import { EditDepartmentDialog } from '@/components/admin/academics/department-dialogs';
import type { Department, Degree, DegreeLevel, Faculty } from '@/types/academics.types';

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
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
            <Skeleton className="h-3 w-24" />
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
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-7 w-7 rounded" />
        </div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DepartmentDetailPage() {
  const router = useRouter();
  const params = useParams<{ departmentId: string }>();
  const { canAccess, canWrite } = useAcademicsAccess();

  const setPageTitle = useUIStore((s) => s.setPageTitle);

  const [department, setDepartment] = React.useState<Department | null>(null);
  const [faculty, setFaculty] = React.useState<Faculty | null>(null);
  const [degrees, setDegrees] = React.useState<Degree[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showInactive, setShowInactive] = React.useState(false);

  // Dialogs
  const [createDegreeOpen, setCreateDegreeOpen] = React.useState(false);
  const [editDegreeTarget, setEditDegreeTarget] = React.useState<Degree | null>(null);
  const [editDeptOpen, setEditDeptOpen] = React.useState(false);

  React.useEffect(() => {
    if (!canAccess) router.replace('/admin');
  }, [canAccess, router]);

  const load = React.useCallback(async () => {
    if (!params.departmentId) return;
    setLoading(true);
    setError(null);
    try {
      const [dept, degList] = await Promise.all([
        departmentsApi.get(params.departmentId),
        degreesApi.listByDepartment(params.departmentId),
      ]);
      setDepartment(dept);
      setDegrees(degList);
      setPageTitle(dept.name);
      // Lazily fetch faculty name
      if (dept.faculty_id) {
        facultiesApi.get(dept.faculty_id).then(setFaculty).catch(() => {});
      }
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
  }, [params.departmentId]);

  React.useEffect(() => { load(); }, [load]);

  React.useEffect(() => () => setPageTitle(null), [setPageTitle]);

  async function handleToggleDegree(deg: Degree) {
    try {
      if (deg.is_active) {
        await degreesApi.deactivate(deg.id);
        setDegrees((prev) => prev.map((d) => d.id === deg.id ? { ...d, is_active: false } : d));
        toast.success('Degree deactivated', deg.name);
      } else {
        const updated = await degreesApi.reactivate(deg.id);
        setDegrees((prev) => prev.map((d) => d.id === deg.id ? updated : d));
        toast.success('Degree reactivated', deg.name);
      }
    } catch (err) {
      toast.error('Action failed', handleApiError(err));
    }
  }

  if (!canAccess) return null;

  const visibleDegrees = showInactive
    ? degrees
    : degrees.filter((d) => d.is_active);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground flex-wrap">
        <Link href="/admin/academics" className="hover:text-foreground transition-colors">Academics</Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        {faculty ? (
          <>
            <Link href="/admin/academics/faculties" className="hover:text-foreground transition-colors">Faculties</Link>
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            <Link
              href={`/admin/academics/faculties/${department?.faculty_id}`}
              className="hover:text-foreground transition-colors truncate max-w-[120px]"
            >
              {faculty.name}
            </Link>
          </>
        ) : (
          <Link href="/admin/academics/departments" className="hover:text-foreground transition-colors">Departments</Link>
        )}
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        <span className="text-foreground font-medium truncate max-w-[200px]">
          {loading ? '…' : (department?.name ?? 'Not found')}
        </span>
      </nav>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Could not load department: <strong>{error}</strong></span>
          <Button variant="ghost" size="sm" onClick={load} className="ml-auto shrink-0 text-amber-700 hover:text-amber-900">Retry</Button>
        </div>
      )}

      {/* Header */}
      {loading ? (
        <HeaderSkeleton />
      ) : department ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 -ml-1"
                  onClick={() => faculty
                    ? router.push(`/admin/academics/faculties/${department.faculty_id}`)
                    : router.push('/admin/academics/departments')
                  }
                  title="Back"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  {department.name}
                </h1>
              </div>
              <p className="text-sm text-muted-foreground pl-8">
                {department.description || 'Manage degree programmes and academic structure for this department.'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="icon" onClick={load} disabled={loading} title="Refresh">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              {canWrite && (
                <Button variant="outline" size="sm" onClick={() => setEditDeptOpen(true)} className="gap-1.5">
                  <Pencil className="h-4 w-4" /> Edit Department
                </Button>
              )}
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border-border bg-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  <Building2 className="h-3.5 w-3.5" />
                  Department Name
                </div>
                <p className="text-lg font-bold text-foreground">{department.name}</p>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">{department.code}</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  <Layers className="h-3.5 w-3.5" />
                  Faculty
                </div>
                {faculty ? (
                  <Link
                    href={`/admin/academics/faculties/${faculty.id}`}
                    className="text-base font-semibold text-primary hover:underline leading-tight block"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {faculty.name}
                  </Link>
                ) : (
                  <p className="text-base font-semibold text-foreground">—</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  {department.is_active
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    : <XCircle className="h-3.5 w-3.5 text-zinc-400" />
                  }
                  Status
                </div>
                <Badge variant={department.is_active ? 'success' : 'secondary'} className="text-sm px-2.5 py-0.5">
                  {department.is_active ? 'Active' : 'Inactive'}
                </Badge>
                <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" />
                  Updated {fmt(department.updated_at)}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Building2 className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="font-medium text-muted-foreground">Department not found</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => router.push('/admin/academics/departments')}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Departments
          </Button>
        </div>
      )}

      {/* Degrees section */}
      {department && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              Degrees &amp; Programs
              {!loading && (
                <Badge variant="secondary" className="text-xs font-mono">
                  {degrees.filter((d) => d.is_active).length}
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
                <Button size="sm" onClick={() => setCreateDegreeOpen(true)} className="gap-1.5">
                  <Plus className="h-4 w-4" /> Add Degree
                </Button>
              )}
            </div>
          </div>

          {loading ? (
            <TableSkeleton />
          ) : visibleDegrees.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
              <Award className="h-8 w-8 text-muted-foreground/30 mb-3" />
              <p className="font-medium text-muted-foreground text-sm">No degree programmes found</p>
              {canWrite && (
                <Button size="sm" className="mt-3 gap-1.5" onClick={() => setCreateDegreeOpen(true)}>
                  <Plus className="h-4 w-4" /> Add Degree
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground pl-4">Degree Name</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Code</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Level</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground text-right pr-4">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleDegrees.map((deg) => (
                    <TableRow
                      key={deg.id}
                      className="cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => router.push(`/admin/academics/degrees/${deg.id}`)}
                    >
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 shrink-0">
                            <Award className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                          </div>
                          <p className="font-medium text-foreground text-sm">{deg.name}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">
                          {deg.code}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={LEVEL_VARIANT[deg.level] ?? 'secondary'} className="text-xs">
                          {deg.level}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={deg.is_active ? 'success' : 'secondary'} className="text-xs">
                          {deg.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-2">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 text-muted-foreground hover:text-primary text-xs"
                            onClick={(e) => { e.stopPropagation(); router.push(`/admin/academics/degrees/${deg.id}`); }}
                          >
                            View <ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                          {canWrite && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditDegreeTarget(deg); }} className="gap-2">
                                  <Pencil className="h-3.5 w-3.5" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={(e) => { e.stopPropagation(); handleToggleDegree(deg); }}
                                  className={`gap-2 ${deg.is_active ? 'text-red-600 focus:text-red-600' : 'text-emerald-600 focus:text-emerald-600'}`}
                                >
                                  {deg.is_active
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
                Showing {visibleDegrees.length} {showInactive ? 'total' : 'active'} degree{visibleDegrees.length !== 1 ? 's' : ''}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Dialogs */}
      {department && (
        <>
          <CreateDegreeDialog
            open={createDegreeOpen}
            onOpenChange={setCreateDegreeOpen}
            initialDepartmentId={department.id}
            initialDepartmentName={department.name}
            onSuccess={(deg) => {
              setDegrees((prev) => [deg, ...prev]);
              setCreateDegreeOpen(false);
            }}
          />
          {editDegreeTarget && (
            <EditDegreeDialog
              open={!!editDegreeTarget}
              onOpenChange={(o) => { if (!o) setEditDegreeTarget(null); }}
              degree={editDegreeTarget}
              onSuccess={(updated) => {
                setDegrees((prev) => prev.map((d) => d.id === updated.id ? updated : d));
                setEditDegreeTarget(null);
              }}
            />
          )}
          {canWrite && (
            <EditDepartmentDialog
              open={editDeptOpen}
              onOpenChange={setEditDeptOpen}
              department={department}
              onSuccess={(updated) => {
                setDepartment(updated);
                setEditDeptOpen(false);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
