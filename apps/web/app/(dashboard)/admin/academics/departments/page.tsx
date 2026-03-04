'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  RefreshCw,
  Building2,
  MoreHorizontal,
  Pencil,
  PowerOff,
  Power,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { departmentsApi } from '@/lib/api/academics';
import { handleApiError } from '@/lib/api/axios';
import { useAcademicsAccess } from '@/lib/hooks/useAcademicsAccess';
import { toast } from '@/lib/hooks/use-toast';
import { CreateDepartmentDialog, EditDepartmentDialog } from '@/components/admin/academics/department-dialogs';
import type { Department } from '@/types/academics.types';

// ── Skeleton grid ─────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950 space-y-3">
      <div className="flex items-start justify-between">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="space-y-1.5 pt-1">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
      <div className="flex justify-between pt-1">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>
    </div>
  );
}

// ── Department card ───────────────────────────────────────────────────────────

interface DepartmentCardProps {
  department: Department;
  canWrite: boolean;
  onEdit: (dept: Department) => void;
  onToggleActive: (dept: Department) => void;
  onNavigate: (dept: Department) => void;
}

function DepartmentCard({ department, canWrite, onEdit, onToggleActive, onNavigate }: DepartmentCardProps) {
  return (
    <div
      onClick={() => onNavigate(department)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onNavigate(department)}
      className={`
        group relative flex flex-col rounded-xl border bg-card transition-all duration-200 cursor-pointer
        hover:shadow-md hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
        ${department.is_active
          ? 'border-border'
          : 'border-border/60 opacity-70'
        }
      `}
    >
      {/* Active accent stripe */}
      <div
        className={`absolute left-0 top-0 h-full w-1 rounded-l-xl transition-colors ${department.is_active ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'
          }`}
      />

      <div className="p-5 pl-6 flex flex-col gap-3 flex-1">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800 shrink-0">
            <Building2 className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
          </div>
          <Badge variant={department.is_active ? 'success' : 'secondary'} className="shrink-0 text-[11px]">
            {department.is_active ? 'Active' : 'Inactive'}
          </Badge>
        </div>

        {/* Name + code */}
        <div>
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-50 leading-tight line-clamp-1">
            {department.name}
          </h3>
          <p className="mt-0.5 font-mono text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
            {department.code}
          </p>
        </div>

        {/* Description */}
        {department.description ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed flex-1">
            {department.description}
          </p>
        ) : (
          <p className="text-sm text-zinc-400 italic flex-1">No description</p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-1 border-t border-border/60">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium group-hover:text-primary transition-colors">
            View Degrees <ChevronRight className="h-3 w-3" />
          </span>
          {canWrite && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(department); }} className="gap-2">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => { e.stopPropagation(); onToggleActive(department); }}
                  className={`gap-2 ${department.is_active ? 'text-red-600 focus:text-red-600' : 'text-emerald-600 focus:text-emerald-600'}`}
                >
                  {department.is_active
                    ? <><PowerOff className="h-3.5 w-3.5" /> Deactivate</>
                    : <><Power className="h-3.5 w-3.5" /> Reactivate</>
                  }
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DepartmentsPage() {
  const router = useRouter();
  const { canAccess, canWrite } = useAcademicsAccess();

  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showInactive, setShowInactive] = React.useState(false);

  // Dialogs
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<Department | null>(null);

  // ── Role guard ────────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!canAccess) router.replace('/admin');
  }, [canAccess, router]);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await departmentsApi.list(showInactive);
      setDepartments(data);
    } catch (err) {
      const msg = handleApiError(err);
      setError(msg);
      // Hybrid fallback: show whatever we already have if we have some data
      if (departments.length === 0) setDepartments([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive]);

  React.useEffect(() => { load(); }, [load]);

  // IDs of departments being toggled — used for visual transition feedback
  const [togglingIds, setTogglingIds] = React.useState<Set<string>>(new Set());

  async function handleToggleActive(dept: Department) {
    try {
      if (dept.is_active) {
        await departmentsApi.deactivate(dept.id);
        setDepartments((prev) => prev.map((d) => (d.id === dept.id ? { ...d, is_active: false } : d)));
        toast.success('Department deactivated', dept.name);

        if (!showInactive) {
          setTogglingIds((prev) => new Set(prev).add(dept.id));
          setTimeout(() => {
            setTogglingIds((prev) => {
              const next = new Set(prev);
              next.delete(dept.id);
              return next;
            });
          }, 1500);
        }
      } else {
        const updated = await departmentsApi.reactivate(dept.id);
        setDepartments((prev) => prev.map((d) => (d.id === dept.id ? updated : d)));
        toast.success('Department reactivated', dept.name);
      }
    } catch (err) {
      toast.error('Action failed', handleApiError(err));
    }
  }

  if (!canAccess) return null;

  const visible = showInactive
    ? departments
    : departments.filter((d) => d.is_active || togglingIds.has(d.id));

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Departments
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Manage academic departments across all faculties.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowInactive((v) => !v)}
            className="text-xs"
          >
            {showInactive ? 'Hide Inactive' : 'Show Inactive'}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={load}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          {canWrite && (
            <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Add Department
            </Button>
          )}
        </div>
      </div>

      {/* Gateway / network error banner (hybrid fallback) */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Could not reach the academic service: <strong>{error}</strong>.
            {departments.length > 0 ? ' Showing last loaded data.' : ''}
          </span>
          <Button variant="ghost" size="sm" onClick={load} className="ml-auto shrink-0 text-amber-700 hover:text-amber-900">
            Retry
          </Button>
        </div>
      )}

      {/* Stats row */}
      {!loading && !error && (
        <div className="flex items-center gap-6 text-sm text-zinc-500">
          <span>
            <strong className="text-zinc-900 dark:text-zinc-100">{departments.filter((d) => d.is_active).length}</strong> active
          </span>
          {showInactive && (
            <span>
              <strong className="text-zinc-900 dark:text-zinc-100">{departments.filter((d) => !d.is_active).length}</strong> inactive
            </span>
          )}
        </div>
      )}

      {/* Card grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 py-16 text-center">
          <Building2 className="h-10 w-10 text-zinc-300 dark:text-zinc-700 mb-3" />
          <p className="font-medium text-zinc-600 dark:text-zinc-400">No departments found</p>
          <p className="mt-1 text-sm text-zinc-400">
            {canWrite ? 'Create your first department to get started.' : 'No departments have been created yet.'}
          </p>
          {canWrite && (
            <Button size="sm" className="mt-4 gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Add Department
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((dept) => (
            <DepartmentCard
              key={dept.id}
              department={dept}
              canWrite={canWrite}
              onEdit={setEditTarget}
              onToggleActive={handleToggleActive}
              onNavigate={(d) => router.push(`/admin/academics/departments/${d.id}`)}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <CreateDepartmentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={(dept) => setDepartments((prev) => [dept, ...prev])}
      />
      {editTarget && (
        <EditDepartmentDialog
          open={!!editTarget}
          onOpenChange={(o) => { if (!o) setEditTarget(null); }}
          department={editTarget}
          onSuccess={(updated) => {
            setDepartments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
            setEditTarget(null);
          }}
        />
      )}
    </div>
  );
}
