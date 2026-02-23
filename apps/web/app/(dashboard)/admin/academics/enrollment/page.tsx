'use client';

import * as React from 'react';
import Link from 'next/link';
import {
    ClipboardList,
    BookOpen,
    Users,
    GraduationCap,
    UserCog,
    ArrowRight,
    AlertTriangle,
    Loader2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import {
    batchesApi,
} from '@/lib/api/academics';
import { handleApiError } from '@/lib/api/axios';
import { useAcademicsAccess } from '@/lib/hooks/useAcademicsAccess';

interface SectionCard {
    title: string;
    description: string;
    href: string;
    icon: React.ReactNode;
    color: string;
}

const SECTIONS: SectionCard[] = [
    {
        title: 'Course Instances',
        description: 'Create and manage course offerings per semester and group.',
        href: '/admin/academics/enrollment/instances',
        icon: <BookOpen className="h-6 w-6" />,
        color: 'text-blue-500',
    },
    {
        title: 'Student Enrollments',
        description: 'Enroll students into course instances, manage statuses and grades.',
        href: '/admin/academics/enrollment/students',
        icon: <GraduationCap className="h-6 w-6" />,
        color: 'text-emerald-500',
    },
    {
        title: 'Batch Members',
        description: 'Add or remove students from groups/batches.',
        href: '/admin/academics/enrollment/members',
        icon: <Users className="h-6 w-6" />,
        color: 'text-violet-500',
    },
    {
        title: 'Course Instructors',
        description: 'Assign and manage instructors for course instances.',
        href: '/admin/academics/enrollment/instructors',
        icon: <UserCog className="h-6 w-6" />,
        color: 'text-amber-500',
    },
];

export default function EnrollmentPage() {
    const { canAccess } = useAcademicsAccess();
    const [stats, setStats] = React.useState({ batches: 0 });
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        async function load() {
            try {
                const b = await batchesApi.list();
                setStats({ batches: b.length });
            } catch {
                // non-blocking
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    if (!canAccess) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-zinc-400">
                <AlertTriangle className="h-10 w-10 mb-3" />
                <p>You don&apos;t have permission to view this page.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                    <ClipboardList className="h-6 w-6 text-zinc-500" />
                    Enrollment Management
                </h1>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                    Manage course instances, student enrollments, batch memberships, and instructor assignments.
                </p>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
                </div>
            ) : (
                <>
                    {/* Quick stat */}
                    <div className="flex gap-4">
                        <div className="rounded-lg border bg-card px-4 py-3">
                            <p className="text-xs text-muted-foreground">Active Groups</p>
                            <p className="text-2xl font-bold">{stats.batches}</p>
                        </div>
                    </div>

                    {/* Section cards */}
                    <div className="grid gap-4 sm:grid-cols-2">
                        {SECTIONS.map((s) => (
                            <Link key={s.href} href={s.href}>
                                <Card className="group transition-all hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-600 cursor-pointer h-full">
                                    <CardContent className="p-5 flex items-start gap-4">
                                        <div className={`mt-0.5 ${s.color}`}>
                                            {s.icon}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-semibold text-sm flex items-center gap-2">
                                                {s.title}
                                                <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400" />
                                            </h3>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                                                {s.description}
                                            </p>
                                        </div>
                                    </CardContent>
                                </Card>
                            </Link>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
