'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Building2, Award, BookOpen, Landmark, ArrowRight, AlertTriangle, Calendar, Users2, ClipboardList } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { departmentsApi, degreesApi, coursesApi, facultiesApi, semestersApi, batchesApi } from '@/lib/api/academics';
import { useAcademicsAccess } from '@/lib/hooks/useAcademicsAccess';

interface SectionStats {
  active: number;
  total: number;
}

const DEFAULT_STATS: SectionStats = { active: 0, total: 0 };

export default function AcademicsOverviewPage() {
  const router = useRouter();
  const { canAccess, isSuperAdmin } = useAcademicsAccess();

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [faculties, setFaculties] = React.useState<SectionStats>(DEFAULT_STATS);
  const [depts, setDepts] = React.useState<SectionStats>(DEFAULT_STATS);
  const [degrees, setDegrees] = React.useState<SectionStats>(DEFAULT_STATS);
  const [courses, setCourses] = React.useState<SectionStats>(DEFAULT_STATS);
  const [semesters, setSemesters] = React.useState<SectionStats>(DEFAULT_STATS);
  const [groups, setGroups] = React.useState<SectionStats>(DEFAULT_STATS);

  React.useEffect(() => {
    if (!canAccess) { router.replace('/admin'); return; }

    setLoading(true);
    Promise.allSettled([
      isSuperAdmin ? facultiesApi.list(true) : Promise.reject('not_super_admin'),
      departmentsApi.list(true),
      degreesApi.list(true),
      coursesApi.list(true),
      semestersApi.list(true),
      batchesApi.list(true),
    ]).then(([fac, d, deg, c, sem, grp]) => {
      if (fac.status === 'fulfilled') {
        const all = fac.value;
        setFaculties({ total: all.length, active: all.filter((x) => x.is_active).length });
      }
      if (d.status === 'fulfilled') {
        const all = d.value;
        setDepts({ total: all.length, active: all.filter((x) => x.is_active).length });
      }
      if (deg.status === 'fulfilled') {
        const all = deg.value;
        setDegrees({ total: all.length, active: all.filter((x) => x.is_active).length });
      }
      if (c.status === 'fulfilled') {
        const all = c.value;
        setCourses({ total: all.length, active: all.filter((x) => x.is_active).length });
      }
      if (sem.status === 'fulfilled') {
        const all = sem.value;
        setSemesters({ total: all.length, active: all.filter((x) => x.is_active).length });
      }
      if (grp.status === 'fulfilled') {
        const all = grp.value;
        setGroups({ total: all.length, active: all.filter((x) => x.is_active).length });
      }
      if (d.status === 'rejected' && deg.status === 'rejected' && c.status === 'rejected') {
        setError('Could not load academics data. The service may be unavailable.');
      }
    }).finally(() => setLoading(false));
  }, [canAccess, isSuperAdmin, router]);

  if (!canAccess) return null;

  const sections = [
    ...(isSuperAdmin ? [{
      title: 'Faculties',
      description: 'Manage top-level faculties that house departments.',
      href: '/admin/academics/faculties',
      icon: Landmark,
      iconBg: 'bg-amber-50 dark:bg-amber-950/30',
      iconColor: 'text-amber-600 dark:text-amber-400',
      accentColor: 'bg-amber-500',
      stats: faculties,
    }] : []),
    {
      title: 'Departments',
      description: 'Organise academic departments across faculties.',
      href: '/admin/academics/departments',
      icon: Building2,
      iconBg: 'bg-emerald-50 dark:bg-emerald-950/30',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      accentColor: 'bg-emerald-500',
      stats: depts,
    },
    {
      title: 'Degrees',
      description: 'Manage degree programmes at all levels.',
      href: '/admin/academics/degrees',
      icon: Award,
      iconBg: 'bg-violet-50 dark:bg-violet-950/30',
      iconColor: 'text-violet-600 dark:text-violet-400',
      accentColor: 'bg-violet-500',
      stats: degrees,
    },
    {
      title: 'Courses',
      description: 'Maintain the institution-wide course catalogue.',
      href: '/admin/academics/courses',
      icon: BookOpen,
      iconBg: 'bg-sky-50 dark:bg-sky-950/30',
      iconColor: 'text-sky-600 dark:text-sky-400',
      accentColor: 'bg-sky-500',
      stats: courses,
    },
    {
      title: 'Semesters',
      description: 'Define academic terms, set dates and manage semester lifecycle.',
      href: '/admin/academics/semesters',
      icon: Calendar,
      iconBg: 'bg-orange-50 dark:bg-orange-950/30',
      iconColor: 'text-orange-600 dark:text-orange-400',
      accentColor: 'bg-orange-500',
      stats: semesters,
    },
    {
      title: 'Groups',
      description: 'Organise students into hierarchical batches.',
      href: '/admin/academics/groups',
      icon: Users2,
      iconBg: 'bg-pink-50 dark:bg-pink-950/30',
      iconColor: 'text-pink-600 dark:text-pink-400',
      accentColor: 'bg-pink-500',
      stats: groups,
    },
    {
      title: 'Enrollment',
      description: 'Manage course instances, instructors and student enrollments.',
      href: '/admin/academics/enrollment',
      icon: ClipboardList,
      iconBg: 'bg-teal-50 dark:bg-teal-950/30',
      iconColor: 'text-teal-600 dark:text-teal-400',
      accentColor: 'bg-teal-500',
      stats: DEFAULT_STATS,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Academics
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Administer the academic structure — departments, degrees, and course catalogue.
        </p>
      </div>

      {/* Service error banner */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Section cards */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <Link key={section.href} href={section.href} className="group block">
              <div className="relative flex flex-col rounded-xl border border-zinc-200 bg-white p-6 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 dark:border-zinc-800 dark:bg-zinc-950">
                {/* Top accent */}
                <div className={`absolute left-0 top-0 h-1 w-full rounded-t-xl ${section.accentColor}`} />

                <div className="flex items-start justify-between">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${section.iconBg}`}>
                    <Icon className={`h-5 w-5 ${section.iconColor}`} />
                  </div>
                  <ArrowRight className="h-4 w-4 text-zinc-300 group-hover:text-zinc-500 transition-colors mt-1" />
                </div>

                <div className="mt-4">
                  <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
                    {section.title}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    {section.description}
                  </p>
                </div>

                {/* Stats */}
                <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800/60">
                  {loading ? (
                    <div className="flex gap-4">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  ) : (
                    <div className="flex gap-4 text-sm">
                      <span className="text-zinc-500">
                        <strong className="text-zinc-900 dark:text-zinc-100">{section.stats.active}</strong> active
                      </span>
                      <span className="text-zinc-500">
                        <strong className="text-zinc-900 dark:text-zinc-100">{section.stats.total}</strong> total
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
