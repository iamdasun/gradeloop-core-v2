'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  RefreshCw,
  Landmark,
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
import { facultiesApi } from '@/lib/api/academics';
import { handleApiError } from '@/lib/api/axios';
import { useAcademicsAccess } from '@/lib/hooks/useAcademicsAccess';
import { toast } from '@/lib/hooks/use-toast';
import { CreateFacultyDialog, EditFacultyDialog } from '@/components/admin/academics/faculty-dialogs';
import type { Faculty } from '@/types/academics.types';

// ── Skeleton ──────────────────────────────────────────────────────────────────

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

// ── Faculty card ──────────────────────────────────────────────────────────────

interface FacultyCardProps {
  faculty: Faculty;
  canWrite: boolean;
  onEdit: (f: Faculty) => void;
  onToggleActive: (f: Faculty) => void;
  onNavigate: (f: Faculty) => void;
}

function FacultyCard({ faculty, canWrite, onEdit, onToggleActive, onNavigate }: FacultyCardProps) {
  return (
    <div
      onClick={() => onNavigate(faculty)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onNavigate(faculty)}
      className={`
        group relative flex flex-col rounded-xl border bg-card transition-all duration-200 cursor-pointer
        hover:shadow-md hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
        ${faculty.is_active
          ? 'border-border'
          : 'border-border/60 opacity-70'
        }
      `}
    >
      {/* Active accent stripe */}
      <div
        className={`absolute left-0 top-0 h-full w-1 rounded-l-xl transition-colors ${faculty.is_active ? 'bg-amber-500' : 'bg-zinc-300 dark:bg-zinc-700'
          }`}
      />

      <div className="p-5 pl-6 flex flex-col gap-3 flex-1">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/30 shrink-0">
            <Landmark className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <Badge
            variant={faculty.is_active ? 'success' : 'secondary'}
            className="shrink-0 text-[11px]"
          >
            {faculty.is_active ? 'Active' : 'Inactive'}
          </Badge>
        </div>

        {/* Name + code */}
        <div>
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-50 leading-tight line-clamp-1">
            {faculty.name}
          </h3>
          <p className="mt-0.5 font-mono text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
            {faculty.code}
          </p>
        </div>

        {/* Description */}
        {faculty.description ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed flex-1">
            {faculty.description}
          </p>
        ) : (
          <p className="text-sm text-zinc-400 italic flex-1">No description</p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-1 border-t border-border/60">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium group-hover:text-primary transition-colors">
            View Departments <ChevronRight className="h-3 w-3" />
          </span>
          {canWrite && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(faculty); }} className="gap-2">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => { e.stopPropagation(); onToggleActive(faculty); }}
                  className={`gap-2 ${faculty.is_active
                      ? 'text-red-600 focus:text-red-600'
                      : 'text-emerald-600 focus:text-emerald-600'
                    }`}
                >
                  {faculty.is_active
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

export default function FacultiesPage() {
  const router = useRouter();
  const { canAccess, isSuperAdmin } = useAcademicsAccess();

  const [faculties, setFaculties] = React.useState<Faculty[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showInactive, setShowInactive] = React.useState(false);

  // Dialogs
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<Faculty | null>(null);

  // ── Role guard — super_admin only for this page ───────────────────────────
  React.useEffect(() => {
    if (!canAccess) router.replace('/admin');
  }, [canAccess, router]);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await facultiesApi.list(showInactive);
      setFaculties(data);
    } catch (err) {
      const msg = handleApiError(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive]);

  React.useEffect(() => { load(); }, [load]);

  const [togglingIds, setTogglingIds] = React.useState<Set<string>>(new Set());

  async function handleToggleActive(faculty: Faculty) {
    try {
      if (faculty.is_active) {
        await facultiesApi.deactivate(faculty.id);
        setFaculties((prev) => prev.map((f) => (f.id === faculty.id ? { ...f, is_active: false } : f)));
        toast.success('Faculty deactivated', faculty.name);

        if (!showInactive) {
          setTogglingIds((prev) => new Set(prev).add(faculty.id));
          setTimeout(() => {
            setTogglingIds((prev) => {
              const next = new Set(prev);
              next.delete(faculty.id);
              return next;
            });
          }, 1500);
        }
      } else {
        const updated = await facultiesApi.reactivate(faculty.id);
        setFaculties((prev) => prev.map((f) => (f.id === faculty.id ? updated : f)));
        toast.success('Faculty reactivated', faculty.name);
      }
    } catch (err) {
      toast.error('Action failed', handleApiError(err));
    }
  }

  if (!canAccess) return null;

  const visible = showInactive
    ? faculties
    : faculties.filter((f) => f.is_active || togglingIds.has(f.id));

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Faculties
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Manage top-level faculties that house academic departments.
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
          {isSuperAdmin && (
            <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Add Faculty
            </Button>
          )}
        </div>
      </div>

      {/* Super-admin notice for plain admin */}
      {!isSuperAdmin && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-400">
          <Landmark className="h-4 w-4 shrink-0" />
          <span>Faculty management requires <strong>super_admin</strong> privileges. You can view faculties but cannot create or modify them.</span>
        </div>
      )}

      {/* Gateway / network error banner */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Could not reach the academic service: <strong>{error}</strong>.
            {faculties.length > 0 ? ' Showing last loaded data.' : ''}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={load}
            className="ml-auto shrink-0 text-amber-700 hover:text-amber-900"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Stats row */}
      {!loading && !error && (
        <div className="flex items-center gap-6 text-sm text-zinc-500">
          <span>
            <strong className="text-zinc-900 dark:text-zinc-100">
              {faculties.filter((f) => f.is_active).length}
            </strong>{' '}
            active
          </span>
          {showInactive && (
            <span>
              <strong className="text-zinc-900 dark:text-zinc-100">
                {faculties.filter((f) => !f.is_active).length}
              </strong>{' '}
              inactive
            </span>
          )}
        </div>
      )}

      {/* Card grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 py-16 text-center">
          <Landmark className="h-10 w-10 text-zinc-300 dark:text-zinc-700 mb-3" />
          <p className="font-medium text-zinc-600 dark:text-zinc-400">No faculties found</p>
          <p className="mt-1 text-sm text-zinc-400">
            {isSuperAdmin
              ? 'Create your first faculty to get started.'
              : 'No faculties have been created yet.'}
          </p>
          {isSuperAdmin && (
            <Button size="sm" className="mt-4 gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Add Faculty
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((faculty) => (
            <FacultyCard
              key={faculty.id}
              faculty={faculty}
              canWrite={isSuperAdmin}
              onEdit={setEditTarget}
              onToggleActive={handleToggleActive}
              onNavigate={(f) => router.push(`/admin/academics/faculties/${f.id}`)}
            />
          ))}
          {/* Create New Faculty CTA card */}
          {isSuperAdmin && (
            <button
              onClick={() => setCreateOpen(true)}
              className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card/50 text-muted-foreground transition-all duration-200 hover:border-primary hover:text-primary hover:bg-primary/5 min-h-[160px] gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-current">
                <Plus className="h-5 w-5" />
              </div>
              <div className="text-center">
                <p className="font-medium text-sm">Create New Faculty</p>
                <p className="text-xs opacity-70 mt-0.5">Setup a new academic division</p>
              </div>
            </button>
          )}
        </div>
      )}

      {/* Dialogs */}
      {isSuperAdmin && (
        <>
          <CreateFacultyDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            onSuccess={(f) => setFaculties((prev) => [f, ...prev])}
          />
          {editTarget && (
            <EditFacultyDialog
              open={!!editTarget}
              onOpenChange={(o) => { if (!o) setEditTarget(null); }}
              faculty={editTarget}
              onSuccess={(updated) => {
                setFaculties((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
                setEditTarget(null);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
