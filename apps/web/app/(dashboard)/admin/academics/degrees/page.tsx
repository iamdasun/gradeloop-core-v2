'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  RefreshCw,
  Award,
  MoreHorizontal,
  Pencil,
  PowerOff,
  Power,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { degreesApi } from '@/lib/api/academics';
import { handleApiError } from '@/lib/api/axios';
import { useAcademicsAccess } from '@/lib/hooks/useAcademicsAccess';
import { toast } from '@/lib/hooks/use-toast';
import { CreateDegreeDialog, EditDegreeDialog } from '@/components/admin/academics/degree-dialogs';
import type { Degree, DegreeLevel } from '@/types/academics.types';

// ── Level badge colour map ────────────────────────────────────────────────────

const LEVEL_VARIANT: Record<DegreeLevel, 'info' | 'purple' | 'success' | 'warning' | 'secondary'> = {
  Undergraduate: 'info',
  Postgraduate: 'purple',
  Doctoral: 'success',
  Diploma: 'warning',
  Certificate: 'secondary',
};

// ── Skeleton ──────────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950 space-y-3">
      <div className="flex items-start justify-between">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
      </div>
      <div className="space-y-1.5 pt-1">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="flex justify-between pt-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>
    </div>
  );
}

// ── Degree card ───────────────────────────────────────────────────────────────

interface DegreeCardProps {
  degree: Degree;
  canWrite: boolean;
  onEdit: (d: Degree) => void;
  onToggleActive: (d: Degree) => void;
  onNavigate: (d: Degree) => void;
}

function DegreeCard({ degree, canWrite, onEdit, onToggleActive, onNavigate }: DegreeCardProps) {
  const levelVariant = LEVEL_VARIANT[degree.level] ?? 'secondary';

  return (
    <div
      onClick={() => onNavigate(degree)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onNavigate(degree)}
      className={`
        group relative flex flex-col rounded-xl border bg-card transition-all duration-200 cursor-pointer
        hover:shadow-md hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
        ${degree.is_active
          ? 'border-border'
          : 'border-border/60 opacity-70'
        }
      `}
    >
      {/* Level accent stripe */}
      <div
        className={`absolute left-0 top-0 h-full w-1 rounded-l-xl ${degree.is_active ? 'bg-violet-500' : 'bg-zinc-300 dark:bg-zinc-700'
          }`}
      />

      <div className="p-5 pl-6 flex flex-col gap-3 flex-1">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 dark:bg-violet-950/30 shrink-0">
            <Award className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <Badge variant={levelVariant} className="text-[11px]">{degree.level}</Badge>
            <Badge variant={degree.is_active ? 'success' : 'secondary'} className="text-[11px]">
              {degree.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </div>

        {/* Name + code */}
        <div className="flex-1">
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-50 leading-tight line-clamp-1">
            {degree.name}
          </h3>
          <p className="mt-0.5 font-mono text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
            {degree.code}
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-1 border-t border-border/60">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium group-hover:text-primary transition-colors">
            View Specializations <ChevronRight className="h-3 w-3" />
          </span>
          {canWrite && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(degree); }} className="gap-2">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => { e.stopPropagation(); onToggleActive(degree); }}
                  className={`gap-2 ${degree.is_active ? 'text-red-600 focus:text-red-600' : 'text-emerald-600 focus:text-emerald-600'}`}
                >
                  {degree.is_active
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

export default function DegreesPage() {
  const router = useRouter();
  const { canAccess, canWrite } = useAcademicsAccess();

  const [degrees, setDegrees] = React.useState<Degree[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showInactive, setShowInactive] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<Degree | null>(null);

  React.useEffect(() => {
    if (!canAccess) router.replace('/admin');
  }, [canAccess, router]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await degreesApi.list(showInactive);
      setDegrees(data);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive]);

  React.useEffect(() => { load(); }, [load]);

  // IDs of degrees being toggled — used for visual transition feedback
  const [togglingIds, setTogglingIds] = React.useState<Set<string>>(new Set());

  async function handleToggleActive(degree: Degree) {
    try {
      if (degree.is_active) {
        await degreesApi.deactivate(degree.id);
        // Update local state immediately
        setDegrees((prev) => prev.map((d) => (d.id === degree.id ? { ...d, is_active: false } : d)));
        toast.success('Degree deactivated', degree.name);

        // If not showing inactive, briefly keep item visible then fade out
        if (!showInactive) {
          setTogglingIds((prev) => new Set(prev).add(degree.id));
          setTimeout(() => {
            setTogglingIds((prev) => {
              const next = new Set(prev);
              next.delete(degree.id);
              return next;
            });
          }, 1500);
        }
      } else {
        const updated = await degreesApi.reactivate(degree.id);
        setDegrees((prev) => prev.map((d) => (d.id === degree.id ? updated : d)));
        toast.success('Degree reactivated', degree.name);
      }
    } catch (err) {
      toast.error('Action failed', handleApiError(err));
    }
  }

  if (!canAccess) return null;

  // Show active degrees + any that are mid-toggle transition (so the fade-out is visible)
  const visible = showInactive
    ? degrees
    : degrees.filter((d) => d.is_active || togglingIds.has(d.id));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Degrees
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Manage degree programmes offered across departments.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setShowInactive((v) => !v)} className="text-xs">
            {showInactive ? 'Hide Inactive' : 'Show Inactive'}
          </Button>
          <Button variant="outline" size="icon" onClick={load} disabled={loading} title="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          {canWrite && (
            <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add Degree
            </Button>
          )}
        </div>
      </div>

      {/* Error banner (hybrid fallback) */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Service unavailable: <strong>{error}</strong>.{degrees.length > 0 ? ' Showing cached data.' : ''}</span>
          <Button variant="ghost" size="sm" onClick={load} className="ml-auto shrink-0 text-amber-700 hover:text-amber-900">Retry</Button>
        </div>
      )}

      {/* Stats */}
      {!loading && !error && (
        <div className="flex items-center gap-6 text-sm text-zinc-500">
          <span><strong className="text-zinc-900 dark:text-zinc-100">{degrees.filter((d) => d.is_active).length}</strong> active</span>
          {showInactive && <span><strong className="text-zinc-900 dark:text-zinc-100">{degrees.filter((d) => !d.is_active).length}</strong> inactive</span>}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 py-16 text-center">
          <Award className="h-10 w-10 text-zinc-300 dark:text-zinc-700 mb-3" />
          <p className="font-medium text-zinc-600 dark:text-zinc-400">No degrees found</p>
          <p className="mt-1 text-sm text-zinc-400">
            {canWrite ? 'Add your first degree programme.' : 'No degree programmes have been created yet.'}
          </p>
          {canWrite && (
            <Button size="sm" className="mt-4 gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Add Degree
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((degree) => (
            <DegreeCard
              key={degree.id}
              degree={degree}
              canWrite={canWrite}
              onEdit={setEditTarget}
              onToggleActive={handleToggleActive}
              onNavigate={(d) => router.push(`/admin/academics/degrees/${d.id}`)}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <CreateDegreeDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={(d) => setDegrees((prev) => [d, ...prev])}
      />
      {editTarget && (
        <EditDegreeDialog
          open={!!editTarget}
          onOpenChange={(o) => { if (!o) setEditTarget(null); }}
          degree={editTarget}
          onSuccess={(updated) => {
            setDegrees((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
            setEditTarget(null);
          }}
        />
      )}
    </div>
  );
}
