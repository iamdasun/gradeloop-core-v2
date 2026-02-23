'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  RefreshCw,
  BookOpen,
  MoreHorizontal,
  Pencil,
  PowerOff,
  Power,
  AlertTriangle,
  Star,
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
import { coursesApi } from '@/lib/api/academics';
import { handleApiError } from '@/lib/api/axios';
import { useAcademicsAccess } from '@/lib/hooks/useAcademicsAccess';
import { toast } from '@/lib/hooks/use-toast';
import { CreateCourseDialog, EditCourseDialog } from '@/components/admin/academics/course-dialogs';
import type { Course } from '@/types/academics.types';

// ── Skeleton ──────────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950 space-y-3">
      <div className="flex items-start justify-between">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
      </div>
      <div className="space-y-1.5 pt-1">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-4 w-20" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
      <div className="flex justify-between pt-1">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>
    </div>
  );
}

// ── Credits indicator ─────────────────────────────────────────────────────────

function CreditsDisplay({ credits }: { credits: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
      {credits} {credits === 1 ? 'credit' : 'credits'}
    </span>
  );
}

// ── Course card ───────────────────────────────────────────────────────────────

interface CourseCardProps {
  course: Course;
  canWrite: boolean;
  onEdit: (c: Course) => void;
  onToggleActive: (c: Course) => void;
}

function CourseCard({ course, canWrite, onEdit, onToggleActive }: CourseCardProps) {
  return (
    <div
      className={`
        group relative flex flex-col rounded-xl border bg-white transition-all duration-200
        hover:shadow-md hover:-translate-y-0.5 dark:bg-zinc-950
        ${course.is_active
          ? 'border-zinc-200 dark:border-zinc-800'
          : 'border-zinc-200/60 opacity-70 dark:border-zinc-800/60'
        }
      `}
    >
      {/* Accent stripe */}
      <div
        className={`absolute left-0 top-0 h-full w-1 rounded-l-xl ${course.is_active ? 'bg-sky-500' : 'bg-zinc-300 dark:bg-zinc-700'
          }`}
      />

      <div className="p-5 pl-6 flex flex-col gap-3 flex-1">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 dark:bg-sky-950/30 shrink-0">
            <BookOpen className="h-5 w-5 text-sky-600 dark:text-sky-400" />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <Badge variant={course.is_active ? 'success' : 'secondary'} className="text-[11px]">
              {course.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </div>

        {/* Title + code */}
        <div className="flex-1">
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-50 leading-tight line-clamp-2">
            {course.title}
          </h3>
          <p className="mt-0.5 font-mono text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
            {course.code}
          </p>
        </div>

        {/* Description */}
        {course.description ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
            {course.description}
          </p>
        ) : (
          <p className="text-sm text-zinc-400 italic">No description</p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-1 border-t border-zinc-100 dark:border-zinc-800/60">
          <CreditsDisplay credits={course.credits} />
          {canWrite && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => onEdit(course)} className="gap-2">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onToggleActive(course)}
                  className={`gap-2 ${course.is_active ? 'text-red-600 focus:text-red-600' : 'text-emerald-600 focus:text-emerald-600'}`}
                >
                  {course.is_active
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

export default function CoursesPage() {
  const router = useRouter();
  const { canAccess, canWrite } = useAcademicsAccess();

  const [courses, setCourses] = React.useState<Course[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showInactive, setShowInactive] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<Course | null>(null);

  React.useEffect(() => {
    if (!canAccess) router.replace('/admin');
  }, [canAccess, router]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await coursesApi.list(showInactive);
      setCourses(data);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive]);

  React.useEffect(() => { load(); }, [load]);

  const [togglingIds, setTogglingIds] = React.useState<Set<string>>(new Set());

  async function handleToggleActive(course: Course) {
    try {
      if (course.is_active) {
        await coursesApi.deactivate(course.id);
        setCourses((prev) => prev.map((c) => (c.id === course.id ? { ...c, is_active: false } : c)));
        toast.success('Course deactivated', course.title);

        if (!showInactive) {
          setTogglingIds((prev) => new Set(prev).add(course.id));
          setTimeout(() => {
            setTogglingIds((prev) => {
              const next = new Set(prev);
              next.delete(course.id);
              return next;
            });
          }, 1500);
        }
      } else {
        const updated = await coursesApi.reactivate(course.id);
        setCourses((prev) => prev.map((c) => (c.id === course.id ? updated : c)));
        toast.success('Course reactivated', course.title);
      }
    } catch (err) {
      toast.error('Action failed', handleApiError(err));
    }
  }

  if (!canAccess) return null;

  const q = search.toLowerCase().trim();
  const visible = courses.filter((c) => {
    if (!showInactive && !c.is_active && !togglingIds.has(c.id)) return false;
    if (!q) return true;
    return (
      c.title.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      (c.description?.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Courses
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Manage course catalogue — codes, titles, credits.
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
              <Plus className="h-4 w-4" /> Add Course
            </Button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <input
          type="search"
          placeholder="Search by title or code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1 text-sm shadow-xs placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:focus-visible:ring-zinc-300"
        />
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Service unavailable: <strong>{error}</strong>.{courses.length > 0 ? ' Showing cached data.' : ''}</span>
          <Button variant="ghost" size="sm" onClick={load} className="ml-auto shrink-0 text-amber-700 hover:text-amber-900">Retry</Button>
        </div>
      )}

      {/* Stats */}
      {!loading && !error && (
        <div className="flex items-center gap-6 text-sm text-zinc-500">
          <span><strong className="text-zinc-900 dark:text-zinc-100">{courses.filter((c) => c.is_active).length}</strong> active</span>
          {showInactive && <span><strong className="text-zinc-900 dark:text-zinc-100">{courses.filter((c) => !c.is_active).length}</strong> inactive</span>}
          {q && <span><strong className="text-zinc-900 dark:text-zinc-100">{visible.length}</strong> matching &ldquo;{search}&rdquo;</span>}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 py-16 text-center">
          <BookOpen className="h-10 w-10 text-zinc-300 dark:text-zinc-700 mb-3" />
          <p className="font-medium text-zinc-600 dark:text-zinc-400">
            {q ? 'No courses match your search' : 'No courses found'}
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            {!q && canWrite ? 'Add your first course to the catalogue.' : ''}
          </p>
          {!q && canWrite && (
            <Button size="sm" className="mt-4 gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Add Course
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              canWrite={canWrite}
              onEdit={setEditTarget}
              onToggleActive={handleToggleActive}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <CreateCourseDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={(c) => setCourses((prev) => [c, ...prev])}
      />
      {editTarget && (
        <EditCourseDialog
          open={!!editTarget}
          onOpenChange={(o) => { if (!o) setEditTarget(null); }}
          course={editTarget}
          onSuccess={(updated) => {
            setCourses((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
            setEditTarget(null);
          }}
        />
      )}
    </div>
  );
}
