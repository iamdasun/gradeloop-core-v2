'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
  Search,
  BookMarked,
  BookX,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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

function StatCardSkeleton() {
  return (
    <Card className="shadow-sm">
      <CardContent className="flex items-center gap-3 p-4">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-12" />
          <Skeleton className="h-3.5 w-16" />
        </div>
      </CardContent>
    </Card>
  );
}

function CardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
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
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <Star className="h-3 w-3 fill-warning text-warning" />
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
        group relative flex flex-col rounded-xl border bg-card transition-all duration-200
        hover:shadow-md hover:-translate-y-0.5
        ${course.is_active
          ? 'border-border'
          : 'border-border/60 opacity-70'
        }
      `}
    >
      {/* Accent stripe */}
      <div
        className={`absolute left-0 top-0 h-full w-1 rounded-l-xl ${
          course.is_active ? 'bg-primary' : 'bg-muted-foreground/40'
        }`}
      />

      <div className="p-5 pl-6 flex flex-col gap-3 flex-1">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
            <BookOpen className="h-5 w-5 text-primary" />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <Badge variant={course.is_active ? 'success' : 'secondary'} className="text-[11px]">
              {course.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </div>

        {/* Title + code */}
        <div className="flex-1">
          <Link href={`/admin/academics/courses/${course.id}`}>
            <h3 className="font-semibold text-foreground hover:text-primary leading-tight line-clamp-2 transition-colors">
              {course.title}
            </h3>
          </Link>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground uppercase tracking-wide">
            {course.code}
          </p>
        </div>

        {/* Description */}
        {course.description ? (
          <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
            {course.description}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground/60 italic">No description</p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-1 border-t border-border/60">
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
                  className={`gap-2 ${course.is_active ? 'text-destructive focus:text-destructive' : 'text-success focus:text-success'}`}
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
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Courses</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage course catalogue — codes, titles, credits.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canWrite && (
            <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5 shadow-sm">
              <Plus className="h-4 w-4" /> Add Course
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {loading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <Card className="shadow-sm">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <BookOpen className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{courses.length}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-muted">
                  <BookMarked className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{courses.filter((c) => c.is_active).length}</p>
                  <p className="text-xs text-muted-foreground">Active</p>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-error-muted">
                  <BookX className="h-5 w-5 text-error" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{courses.filter((c) => !c.is_active).length}</p>
                  <p className="text-xs text-muted-foreground">Inactive</p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Filters */}
      <Card className="shadow-sm">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by title or code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowInactive((v) => !v)}
            className="text-xs shrink-0"
          >
            {showInactive ? 'Hide Inactive' : 'Show Inactive'}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={load}
            disabled={loading}
            title="Refresh"
            className="shrink-0"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </CardContent>
      </Card>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-warning-border bg-warning-muted px-4 py-3 text-sm text-warning-muted-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Service unavailable: <strong>{error}</strong>.{courses.length > 0 ? ' Showing cached data.' : ''}</span>
          <Button variant="ghost" size="sm" onClick={load} className="ml-auto shrink-0">Retry</Button>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <BookOpen className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="font-medium text-muted-foreground">
            {q ? 'No courses match your search' : 'No courses found'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground/70">
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
