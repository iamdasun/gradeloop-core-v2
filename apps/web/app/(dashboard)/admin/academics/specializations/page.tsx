'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Plus,
  RefreshCw,
  Layers,
  MoreHorizontal,
  Pencil,
  PowerOff,
  Power,
  AlertTriangle,
  Search,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
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
import { degreesApi, specializationsApi } from '@/lib/api/academics';
import { handleApiError } from '@/lib/api/axios';
import { useAcademicsAccess } from '@/lib/hooks/useAcademicsAccess';
import { toast } from '@/lib/hooks/use-toast';
import {
  EditSpecializationDialog,
} from '@/components/admin/academics/specialization-dialogs';
import type { Specialization, Degree } from '@/types/academics.types';

// ── Extended type bundling spec with its degree name ─────────────────────────

interface SpecWithDegree extends Specialization {
  degree_name: string;
  degree_code: string;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="space-y-0">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-border">
          <Skeleton className="h-8 w-8 rounded-md" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-5 w-28 rounded-full" />
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-7 w-7 rounded" />
        </div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SpecializationsPage() {
  const router = useRouter();
  const { canAccess, canWrite } = useAcademicsAccess();

  const [items, setItems] = React.useState<SpecWithDegree[]>([]);
  const [degrees, setDegrees] = React.useState<Degree[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Filters
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'active' | 'inactive'>('active');
  const [degreeFilter, setDegreeFilter] = React.useState<string>('all');

  // Dialogs
  const [editTarget, setEditTarget] = React.useState<SpecWithDegree | null>(null);

  React.useEffect(() => {
    if (!canAccess) router.replace('/admin');
  }, [canAccess, router]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch all degrees, then all specializations per degree in parallel
      const degList = await degreesApi.list(true);
      setDegrees(degList);
      const specArrays = await Promise.all(
        degList.map((d) => specializationsApi.listByDegree(d.id, true).then((specs) =>
          specs.map((s): SpecWithDegree => ({
            ...s,
            degree_name: d.name,
            degree_code: d.code,
          }))
        ))
      );
      setItems(specArrays.flat().sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  async function handleToggle(spec: SpecWithDegree) {
    try {
      if (spec.is_active) {
        await specializationsApi.deactivate(spec.id);
        setItems((prev) => prev.map((s) => s.id === spec.id ? { ...s, is_active: false } : s));
        toast.success('Specialization deactivated', spec.name);
      } else {
        const updated = await specializationsApi.reactivate(spec.id);
        setItems((prev) => prev.map((s) => s.id === spec.id ? { ...s, ...updated } : s));
        toast.success('Specialization reactivated', spec.name);
      }
    } catch (err) {
      toast.error('Action failed', handleApiError(err));
    }
  }

  if (!canAccess) return null;

  // Apply filters
  const filtered = items.filter((s) => {
    if (statusFilter === 'active' && !s.is_active) return false;
    if (statusFilter === 'inactive' && s.is_active) return false;
    if (degreeFilter !== 'all' && s.degree_id !== degreeFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q) || s.degree_name.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/admin/academics" className="hover:text-foreground transition-colors">Academics</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">Specializations</span>
      </nav>

      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Specializations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage specializations and their associated degree programmes.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="icon" onClick={load} disabled={loading} title="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Could not load specializations: <strong>{error}</strong></span>
          <Button variant="ghost" size="sm" onClick={load} className="ml-auto shrink-0 text-amber-700 hover:text-amber-900">Retry</Button>
        </div>
      )}

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search specializations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>

        {/* Status filter */}
        <div className="flex items-center rounded-lg border border-border bg-card p-0.5 gap-0.5">
          {(['active', 'inactive', 'all'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${statusFilter === s
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Degree filter */}
        <select
          value={degreeFilter}
          onChange={(e) => setDegreeFilter(e.target.value)}
          className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="all">All Degrees</option>
          {degrees.map((d) => (
            <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
          ))}
        </select>
      </div>

      {/* Stats */}
      {!loading && !error && (
        <p className="text-sm text-muted-foreground">
          Showing <strong className="text-foreground">{filtered.length}</strong> of{' '}
          <strong className="text-foreground">{items.length}</strong> specializations
        </p>
      )}

      {/* Table */}
      {loading ? (
        <div className="rounded-xl border border-border overflow-hidden">
          <TableSkeleton />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Layers className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="font-medium text-muted-foreground">
            {items.length === 0 ? 'No specializations found' : 'No results match your filters'}
          </p>
          {items.length === 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              Add specializations via the Degree detail pages.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground pl-4">Specialization Name</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Code</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Associated Degree</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                {canWrite && (
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground text-right pr-4">Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((spec) => (
                <TableRow 
                  key={spec.id} 
                  className="cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => router.push(`/admin/academics/specializations/${spec.id}`)}
                >
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
                    <Link
                      href={`/admin/academics/degrees/${spec.degree_id}`}
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {spec.degree_name}
                      <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {spec.degree_code}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={spec.is_active ? 'success' : 'secondary'} className="text-xs">
                      {spec.is_active ? 'Active' : 'Inactive'}
                    </Badge>
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
                          <DropdownMenuItem
                            onClick={() => router.push(`/admin/academics/degrees/${spec.degree_id}`)}
                            className="gap-2 text-muted-foreground"
                          >
                            <ChevronRight className="h-3.5 w-3.5" /> View in Degree
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setEditTarget(spec)} className="gap-2">
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleToggle(spec)}
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
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
            {degreeFilter !== 'all' && ` in ${degrees.find((d) => d.id === degreeFilter)?.name ?? 'degree'}`}
          </div>
        </div>
      )}

      {/* Edit dialog */}
      {editTarget && (
        <EditSpecializationDialog
          open={!!editTarget}
          onOpenChange={(o) => { if (!o) setEditTarget(null); }}
          specialization={editTarget}
          onSuccess={(updated) => {
            setItems((prev) => prev.map((s) => s.id === updated.id ? { ...s, ...updated } : s));
            setEditTarget(null);
          }}
        />
      )}
    </div>
  );
}
