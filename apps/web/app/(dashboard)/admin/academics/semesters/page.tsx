'use client';

import * as React from 'react';
import {
    Calendar,
    Plus,
    Search,
    MoreVertical,
    Loader2,
    AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { semestersApi } from '@/lib/api/academics';
import { handleApiError } from '@/lib/api/axios';
import { toast } from '@/lib/hooks/use-toast';
import { useAcademicsAccess } from '@/lib/hooks/useAcademicsAccess';
import {
    CreateSemesterDialog,
    EditSemesterDialog,
} from '@/components/admin/academics/semester-dialogs';
import { SEMESTER_TERM_TYPES } from '@/types/academics.types';
import type { Semester } from '@/types/academics.types';

const STATUS_COLOR: Record<string, string> = {
    Planned: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    Active: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    Completed: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
    Cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

export default function SemestersPage() {
    const { canAccess, canWrite } = useAcademicsAccess();

    const [semesters, setSemesters] = React.useState<Semester[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState('');
    const [search, setSearch] = React.useState('');
    const [showInactive, setShowInactive] = React.useState(false);
    const [termFilter, setTermFilter] = React.useState<string>('all');

    const [createOpen, setCreateOpen] = React.useState(false);
    const [editTarget, setEditTarget] = React.useState<Semester | null>(null);

    const fetchSemesters = React.useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const list = await semestersApi.list(showInactive, termFilter === 'all' ? undefined : termFilter);
            setSemesters(list);
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setLoading(false);
        }
    }, [showInactive, termFilter]);

    React.useEffect(() => { fetchSemesters(); }, [fetchSemesters]);

    const filtered = React.useMemo(() => {
        if (!search.trim()) return semesters;
        const q = search.toLowerCase();
        return semesters.filter(
            (s) =>
                s.name.toLowerCase().includes(q) ||
                s.code.toLowerCase().includes(q),
        );
    }, [semesters, search]);

    async function toggleActive(semester: Semester) {
        try {
            if (semester.is_active) {
                await semestersApi.deactivate(semester.id);
                toast.success('Semester deactivated', semester.name);
            } else {
                await semestersApi.reactivate(semester.id);
                toast.success('Semester reactivated', semester.name);
            }
            fetchSemesters();
        } catch (err) {
            toast.error('Action failed', handleApiError(err));
        }
    }

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
            {/* Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Semesters</h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        Manage academic semesters and terms.
                    </p>
                </div>
                {canWrite && (
                    <Button onClick={() => setCreateOpen(true)} className="gap-2">
                        <Plus className="h-4 w-4" /> New Semester
                    </Button>
                )}
            </div>

            {/* Filters */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <Input
                        className="pl-9"
                        placeholder="Search semesters…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <Select value={termFilter} onValueChange={setTermFilter}>
                    <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="Term type" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Terms</SelectItem>
                        {SEMESTER_TERM_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button
                    variant={showInactive ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setShowInactive(!showInactive)}
                >
                    {showInactive ? 'Showing All' : 'Active Only'}
                </Button>
            </div>

            {/* Error */}
            {error && (
                <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
                    {error}
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
                </div>
            )}

            {/* Empty */}
            {!loading && !error && filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
                    <Calendar className="h-12 w-12 mb-3 opacity-40" />
                    <p className="text-sm">No semesters found.</p>
                </div>
            )}

            {/* Grid */}
            {!loading && filtered.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {filtered.map((sem) => (
                        <Card
                            key={sem.id}
                            className={`transition-all hover:shadow-md ${!sem.is_active ? 'opacity-60' : ''}`}
                        >
                            <CardContent className="p-5">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-mono text-xs text-zinc-400">{sem.code}</span>
                                            {!sem.is_active && (
                                                <Badge variant="secondary" className="text-xs">Inactive</Badge>
                                            )}
                                        </div>
                                        <h3 className="font-semibold text-sm truncate">{sem.name}</h3>
                                    </div>
                                    {canWrite && (
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                                                    <MoreVertical className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => setEditTarget(sem)}>
                                                    Edit
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => toggleActive(sem)}>
                                                    {sem.is_active ? 'Deactivate' : 'Reactivate'}
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    )}
                                </div>

                                <div className="flex flex-wrap gap-2 mb-3">
                                    <Badge variant="outline" className="text-xs">{sem.term_type}</Badge>
                                    <Badge className={`text-xs border-0 ${STATUS_COLOR[sem.status] || ''}`}>
                                        {sem.status}
                                    </Badge>
                                </div>

                                <div className="text-xs text-zinc-500 dark:text-zinc-400 space-y-0.5">
                                    <p>Start: {new Date(sem.start_date).toLocaleDateString()}</p>
                                    <p>End: {new Date(sem.end_date).toLocaleDateString()}</p>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Dialogs */}
            <CreateSemesterDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                onSuccess={() => fetchSemesters()}
            />
            {editTarget && (
                <EditSemesterDialog
                    open={!!editTarget}
                    onOpenChange={(o) => { if (!o) setEditTarget(null); }}
                    semester={editTarget}
                    onSuccess={() => fetchSemesters()}
                />
            )}
        </div>
    );
}
