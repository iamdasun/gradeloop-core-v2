'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  RefreshCw,
  BookOpen,
  Award,
  AlertTriangle,
  ChevronRight,
  CalendarDays,
  CheckCircle2,
  XCircle,
  Settings,
  Save,
  Loader2,
  BookMarked,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { specializationsApi, degreesApi, coursesApi } from '@/lib/api/academics';
import { useUIStore } from '@/lib/stores/uiStore';
import { handleApiError } from '@/lib/api/axios';
import { useAcademicsAccess } from '@/lib/hooks/useAcademicsAccess';
import { toast } from '@/lib/hooks/use-toast';
import { AcademicsDetailLayout } from '@/components/admin/academics/AcademicsDetailLayout';
import { DangerZone } from '@/components/admin/academics/DangerZone';
import type { Specialization, Degree, Course, UpdateSpecializationRequest } from '@/types/academics.types';

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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SpecializationDetailPage() {
  const router = useRouter();
  const params = useParams<{ specializationId: string }>();
  const { canAccess, canWrite } = useAcademicsAccess();

  const setPageTitle = useUIStore((s) => s.setPageTitle);

  const [specialization, setSpecialization] = React.useState<Specialization | null>(null);
  const [degree, setDegree] = React.useState<Degree | null>(null);
  const [courses, setCourses] = React.useState<Course[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Settings
  const [activeTab, setActiveTab] = React.useState<'overview' | 'courses' | 'settings'>('overview');
  const [editValues, setEditValues] = React.useState<UpdateSpecializationRequest>({});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!canAccess) router.replace('/admin');
  }, [canAccess, router]);

  const load = React.useCallback(async () => {
    if (!params.specializationId) return;
    setLoading(true);
    setError(null);
    try {
      const spec = await specializationsApi.get(params.specializationId);
      setSpecialization(spec);
      setPageTitle(spec.name);
      setEditValues({ name: spec.name, code: spec.code });
      
      // Lazily fetch degree info
      if (spec.degree_id) {
        degreesApi.get(spec.degree_id).then(setDegree).catch(() => {});
      }
      
      // Try to fetch courses (may not be supported)
      try {
        const allCourses = await coursesApi.list();
        // Filter courses that might be associated with this specialization
        // Since there's no direct endpoint, we'll show all courses for now
        setCourses(allCourses);
      } catch (err) {
        // Course fetching is optional
        console.warn('Could not fetch courses:', err);
      }
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
  }, [params.specializationId]);

  React.useEffect(() => { load(); }, [load]);

  React.useEffect(() => () => setPageTitle(null), [setPageTitle]);

  async function handleSaveSpecialization(e: React.FormEvent) {
    e.preventDefault();
    if (!specialization) return;
    setSaving(true);
    try {
      const updated = await specializationsApi.update(specialization.id, editValues);
      setSpecialization(updated);
      setPageTitle(updated.name);
      toast.success('Specialization updated', updated.name);
    } catch (err) {
      toast.error('Update failed', handleApiError(err));
    } finally {
      setSaving(false);
    }
  }

  if (!canAccess) return null;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground flex-wrap">
        <Link href="/admin/academics" className="hover:text-foreground transition-colors">Academics</Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        {degree ? (
          <>
            <Link href="/admin/academics/degrees" className="hover:text-foreground transition-colors">Degrees</Link>
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            <Link
              href={`/admin/academics/degrees/${degree.id}`}
              className="hover:text-foreground transition-colors truncate max-w-[140px]"
            >
              {degree.name}
            </Link>
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          </>
        ) : (
          <>
            <Link href="/admin/academics/specializations" className="hover:text-foreground transition-colors">Specializations</Link>
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          </>
        )}
        <span className="text-foreground font-medium truncate max-w-[200px]">
          {loading ? '…' : (specialization?.name ?? 'Not found')}
        </span>
      </nav>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Could not load specialization: <strong>{error}</strong></span>
          <Button variant="ghost" size="sm" onClick={load} className="ml-auto shrink-0 text-amber-700 hover:text-amber-900">
            Retry
          </Button>
        </div>
      )}

      {/* Header */}
      {loading ? (
        <HeaderSkeleton />
      ) : specialization ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 -ml-1"
                  onClick={() => router.push('/admin/academics/specializations')}
                  title="Back to Specializations"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  {specialization.name}
                </h1>
              </div>
              <p className="text-sm text-muted-foreground pl-8">
                Manage courses and settings for this specialization.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="icon" onClick={load} disabled={loading} title="Refresh">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border-border bg-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  <BookOpen className="h-3.5 w-3.5" />
                  Specialization
                </div>
                <p className="text-lg font-bold text-foreground">{specialization.name}</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  <Award className="h-3.5 w-3.5" />
                  Parent Degree
                </div>
                {degree ? (
                  <Link
                    href={`/admin/academics/degrees/${degree.id}`}
                    className="text-base font-semibold text-primary hover:underline leading-tight block"
                  >
                    {degree.name}
                  </Link>
                ) : (
                  <p className="text-base font-semibold text-foreground">—</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  {specialization.is_active
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    : <XCircle className="h-3.5 w-3.5 text-zinc-400" />
                  }
                  Status
                </div>
                <Badge variant={specialization.is_active ? 'success' : 'secondary'} className="text-sm px-2.5 py-0.5">
                  {specialization.is_active ? 'Active' : 'Inactive'}
                </Badge>
                <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" />
                  Updated {fmt(specialization.updated_at)}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <BookOpen className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="font-medium text-muted-foreground">Specialization not found</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => router.push('/admin/academics/specializations')}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Specializations
          </Button>
        </div>
      )}

      {/* Tabbed Content */}
      {specialization && (
        <AcademicsDetailLayout
          tabs={[
            { id: 'overview', label: 'Overview', icon: BookOpen },
            { id: 'courses', label: 'Courses', icon: BookMarked },
            { id: 'settings', label: 'Settings', icon: Settings },
          ]}
          activeTab={activeTab}
          onTabChange={(tab) => setActiveTab(tab as 'overview' | 'courses' | 'settings')}
        >
          {activeTab === 'overview' && (
            <Card className="shadow-sm border-border">
              <CardHeader className="border-b border-border bg-muted/30">
                <CardTitle className="text-base font-bold">Specialization Overview</CardTitle>
                <CardDescription className="text-xs">Key information about this specialization.</CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">Specialization Name</Label>
                    <p className="text-sm font-semibold text-foreground">{specialization.name}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">Parent Degree</Label>
                    {degree ? (
                      <Link
                        href={`/admin/academics/degrees/${degree.id}`}
                        className="text-sm font-semibold text-primary hover:underline"
                      >
                        {degree.name}
                      </Link>
                    ) : (
                      <p className="text-sm text-muted-foreground">—</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">Specialization Code</Label>
                    <p className="text-sm font-mono font-medium text-foreground bg-muted px-2 py-1 rounded w-fit">{specialization.code}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">Status</Label>
                    <div>
                      <Badge variant={specialization.is_active ? 'success' : 'secondary'} className="text-sm">
                        {specialization.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">Last Updated</Label>
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {fmt(specialization.updated_at)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'courses' && (
            <Card className="shadow-sm border-border">
              <CardHeader className="border-b border-border bg-muted/30">
                <CardTitle className="text-base font-bold">Associated Courses</CardTitle>
                <CardDescription className="text-xs">Courses linked to this specialization.</CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <BookMarked className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="font-medium text-muted-foreground text-sm mb-2">Course association coming soon</p>
                  <p className="text-xs text-muted-foreground max-w-md">
                    The academic service API does not currently expose courses filtered by specialization. 
                    This feature will be available when the endpoint is implemented.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <Card className="border-border">
                <CardHeader className="border-b border-border bg-muted/30">
                  <CardTitle className="text-base font-bold">General Settings</CardTitle>
                  <CardDescription className="text-xs">Update the specialization name and code.</CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  <form onSubmit={handleSaveSpecialization} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="spec_name" className="text-xs font-bold uppercase text-muted-foreground">Specialization Name</Label>
                        <input
                          id="spec_name"
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 font-medium"
                          value={editValues.name ?? ''}
                          onChange={(e) => setEditValues({ ...editValues, name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="spec_code" className="text-xs font-bold uppercase text-muted-foreground">Specialization Code</Label>
                        <input
                          id="spec_code"
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                          value={editValues.code ?? ''}
                          onChange={(e) => setEditValues({ ...editValues, code: e.target.value })}
                        />
                      </div>
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

              <DangerZone
                entityName={specialization.name}
                entityType="specialization"
                isActive={specialization.is_active}
                onDeactivate={async () => {
                  await specializationsApi.deactivate(specialization.id);
                  setSpecialization((prev) => prev ? { ...prev, is_active: false } : prev);
                  toast.success('Specialization deactivated', specialization.name);
                }}
                onReactivate={async () => {
                  await specializationsApi.reactivate(specialization.id);
                  setSpecialization((prev) => prev ? { ...prev, is_active: true } : prev);
                  toast.success('Specialization reactivated', specialization.name);
                }}
              />
            </div>
          )}
        </AcademicsDetailLayout>
      )}
    </div>
  );
}
