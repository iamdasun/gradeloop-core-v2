'use client';

import * as React from 'react';
import {
    Plus,
    Search,
    RefreshCw,
    MoreHorizontal,
    ChevronRight,
    ChevronDown,
    Loader2,
    Calendar,
    Users,
    Download,
    Layers,
    CheckCircle2,
    XCircle,
    ChevronLeft,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { batchesApi, degreesApi, specializationsApi } from '@/lib/api/academics';
import { handleApiError } from '@/lib/api/axios';
import { toast } from '@/lib/hooks/use-toast';
import { useAcademicsAccess } from '@/lib/hooks/useAcademicsAccess';
import {
    CreateGroupDialog,
    EditGroupDialog,
} from '@/components/admin/academics/group-dialogs';
import { SelectNative } from '@/components/ui/select-native';
import { Skeleton } from '@/components/ui/skeleton';
import type { Batch, Degree, Specialization } from '@/types/academics.types';
import { cn } from '@/lib/utils/cn';

export default function GroupsPage() {
    const { canAccess, canWrite } = useAcademicsAccess();

    const [batches, setBatches] = React.useState<Batch[]>([]);
    const [degrees, setDegrees] = React.useState<Degree[]>([]);
    const [specializations, setSpecializations] = React.useState<Specialization[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState('');
    const [search, setSearch] = React.useState('');
    const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());
    const [degreeFilter, setDegreeFilter] = React.useState('');
    const [statusFilter, setStatusFilter] = React.useState('');

    const [createOpen, setCreateOpen] = React.useState(false);
    const [createParent, setCreateParent] = React.useState<Batch | null>(null);
    const [editTarget, setEditTarget] = React.useState<Batch | null>(null);

    const fetchData = React.useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [batchList, degreeList] = await Promise.all([
                batchesApi.list(true),
                degreesApi.list(true),
            ]);
            setBatches(batchList);
            setDegrees(degreeList);

            // Fetch specializations for each degree to build a full list
            const specs = await Promise.all(
                degreeList.map(d => specializationsApi.listByDegree(d.id, true))
            );
            setSpecializations(specs.flat());
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => { fetchData(); }, [fetchData]);

    const displayBatches = React.useMemo(() => {
        let filtered = batches;

        if (search.trim()) {
            const q = search.toLowerCase();
            filtered = filtered.filter(b =>
                b.name.toLowerCase().includes(q) ||
                b.code.toLowerCase().includes(q)
            );
        }

        if (degreeFilter) {
            filtered = filtered.filter(b => b.degree_id === degreeFilter);
        }

        if (statusFilter === 'active') {
            filtered = filtered.filter(b => b.is_active);
        } else if (statusFilter === 'inactive') {
            filtered = filtered.filter(b => !b.is_active);
        }

        return filtered;
    }, [batches, search, degreeFilter, statusFilter]);

    // Root batches for the hierarchical view (only if no search/filter active that flattens it)
    const isFiltered = !!(search.trim() || degreeFilter || statusFilter);

    const rootBatches = React.useMemo(
        () => displayBatches.filter((b) => !b.parent_id || isFiltered),
        [displayBatches, isFiltered],
    );

    const childrenOf = React.useCallback(
        (parentId: string) => batches.filter((b) => b.parent_id === parentId),
        [batches],
    );

    function toggleExpand(id: string) {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    async function toggleActive(batch: Batch) {
        try {
            if (batch.is_active) {
                await batchesApi.deactivate(batch.id);
                toast.success('Group deactivated', batch.name);
            } else {
                await batchesApi.reactivate(batch.id);
                toast.success('Group reactivated', batch.name);
            }
            fetchData();
        } catch (err) {
            toast.error('Action failed', handleApiError(err));
        }
    }

    const getSpecName = (specId: string | null) => {
        if (!specId) return 'General';
        return specializations.find(s => s.id === specId)?.name || 'General';
    };

    const getInitials = (code: string) => {
        return code.slice(0, 3).toUpperCase();
    };

    // Derived stats
    const totalBatches = batches.length;
    const activeBatches = batches.filter(b => b.is_active).length;
    const subBatches = batches.filter(b => b.parent_id).length;

    function BatchRow({ batch, depth = 0 }: { batch: Batch, depth?: number }) {
        const children = childrenOf(batch.id);
        const hasChildren = children.length > 0;
        const isExpanded = expandedIds.has(batch.id);
        const specName = getSpecName(batch.specialization_id);

        return (
            <>
                <TableRow className={cn("group h-16 transition-colors", depth > 0 && "bg-zinc-50/40 dark:bg-zinc-900/10")}>
                    <TableCell className="pl-6">
                        <div className="flex items-center gap-3">
                            <div className="flex items-center min-w-[24px]">
                                {hasChildren && !isFiltered ? (
                                    <button
                                        onClick={() => toggleExpand(batch.id)}
                                        className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded transition-colors"
                                    >
                                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
                                    </button>
                                ) : (
                                    <div className="w-6" />
                                )}
                            </div>
                            <div className="flex items-center gap-3" style={{ marginLeft: !isFiltered ? depth * 16 : 0 }}>
                                <Avatar className="h-9 w-9 rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-sm shrink-0">
                                    <AvatarFallback className="bg-primary/5 text-primary text-[10px] font-bold tracking-tight rounded-lg">
                                        {getInitials(batch.code)}
                                    </AvatarFallback>
                                </Avatar>
                                <Link
                                    href={`/admin/academics/groups/${batch.id}`}
                                    className="flex flex-col min-w-0 hover:opacity-70 transition-opacity"
                                >
                                    <span className="font-semibold text-sm truncate text-zinc-900 dark:text-zinc-100 group-hover:text-primary transition-colors">
                                        {batch.name}
                                    </span>
                                    <span className="text-[11px] text-zinc-500 font-medium">{batch.code}</span>
                                </Link>
                            </div>
                        </div>
                    </TableCell>
                    <TableCell>
                        <Badge variant="secondary" className="font-medium text-[11px] px-2 py-0.5 rounded-md">
                            {specName}
                        </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                        <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                            {/* Mocking student count for now */}
                            {Math.floor(Math.random() * 50) + 10}
                        </span>
                    </TableCell>
                    <TableCell>
                        <Badge variant={batch.is_active ? "info" : "secondary"} className="rounded-full px-2 py-0 font-semibold text-[10px] h-5">
                            {batch.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                    </TableCell>
                    <TableCell className="text-right pr-6">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-zinc-900">
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 shadow-lg border-zinc-200 dark:border-zinc-800">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setEditTarget(batch)}>
                                    Edit Details
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setCreateParent(batch); setCreateOpen(true); }}>
                                    Add Sub-batch
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => toggleActive(batch)} className={batch.is_active ? 'text-destructive' : 'text-primary'}>
                                    {batch.is_active ? 'Deactivate' : 'Reactivate'}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </TableCell>
                </TableRow>
                {isExpanded && !isFiltered && children.map(child => (
                    <BatchRow key={child.id} batch={child} depth={depth + 1} />
                ))}
            </>
        );
    }

    if (!canAccess) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-zinc-400">
                <Users className="h-12 w-12 mb-4 opacity-20" />
                <p className="font-medium text-lg">Access Prohibited</p>
                <p className="text-sm">You don&apos;t have permission to view this page.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header Area */}
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Groups & Batches</h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Manage academic cohorts and nested groups.
                    </p>
                </div>
                {canWrite && (
                    <div className="flex items-center gap-3">
                        <Button variant="outline" className="gap-2 shadow-sm font-semibold">
                            <Download className="h-4 w-4" />
                            Export
                        </Button>
                        <Button
                            onClick={() => { setCreateParent(null); setCreateOpen(true); }}
                            className="bg-primary hover:bg-primary/90 text-white font-bold gap-2 shadow-sm"
                        >
                            <Plus className="h-4 w-4" /> Create Batch
                        </Button>
                    </div>
                )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Card className="shadow-sm border-zinc-200 dark:border-zinc-800">
                    <CardContent className="flex items-center gap-4 p-5">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <Users className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold tracking-tight">{totalBatches}</p>
                            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Total Batches</p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-zinc-200 dark:border-zinc-800">
                    <CardContent className="flex items-center gap-4 p-5">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-info/10 text-info">
                            <CheckCircle2 className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold tracking-tight">{activeBatches}</p>
                            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Active Cohorts</p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-zinc-200 dark:border-zinc-800">
                    <CardContent className="flex items-center gap-4 p-5">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                            <Layers className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold tracking-tight">{subBatches}</p>
                            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Nested Groups</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters Bar */}
            <Card className="shadow-sm border-zinc-200 dark:border-zinc-800">
                <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="relative flex-1 min-w-0">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                        <Input
                            placeholder="Search batches by name or code..."
                            className="pl-9 h-10 border-zinc-200 dark:border-zinc-800 transition-all focus:ring-primary"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <SelectNative
                        className="sm:w-48 h-10"
                        value={degreeFilter}
                        onChange={(e) => setDegreeFilter(e.target.value)}
                    >
                        <option value="">All Degrees</option>
                        {degrees.map(d => (
                            <option key={d.id} value={d.id}>{d.code}</option>
                        ))}
                    </SelectNative>
                    <SelectNative
                        className="sm:w-40 h-10"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                    >
                        <option value="">All Statuses</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </SelectNative>
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-10 w-10 shrink-0 text-zinc-500"
                        onClick={fetchData}
                        disabled={loading}
                    >
                        <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                    </Button>
                </CardContent>
            </Card>

            {/* Table Area */}
            <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-950">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-zinc-50/50 dark:bg-zinc-900/50 hover:bg-zinc-50/50">
                                <TableHead className="pl-6 w-[400px] text-zinc-500 font-bold uppercase text-[10px] tracking-wider">Batch Identity</TableHead>
                                <TableHead className="text-zinc-500 font-bold uppercase text-[10px] tracking-wider">Specialization</TableHead>
                                <TableHead className="text-center text-zinc-500 font-bold uppercase text-[10px] tracking-wider">Students</TableHead>
                                <TableHead className="text-zinc-500 font-bold uppercase text-[10px] tracking-wider">Status</TableHead>
                                <TableHead className="text-right pr-6 text-zinc-500 font-bold uppercase text-[10px] tracking-wider w-20" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                Array.from({ length: 8 }).map((_, i) => (
                                    <TableRow key={i} className="h-16">
                                        <TableCell className="pl-6">
                                            <div className="flex items-center gap-3">
                                                <Skeleton className="h-9 w-9 rounded-lg" />
                                                <div className="space-y-1.5">
                                                    <Skeleton className="h-4 w-32" />
                                                    <Skeleton className="h-3 w-48" />
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell><Skeleton className="h-5 w-24 rounded-full" /></TableCell>
                                        <TableCell><Skeleton className="mx-auto h-5 w-10" /></TableCell>
                                        <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                                        <TableCell className="pr-6"><Skeleton className="h-8 w-8 ml-auto rounded-md" /></TableCell>
                                    </TableRow>
                                ))
                            ) : rootBatches.length > 0 ? (
                                rootBatches.map((batch) => (
                                    <BatchRow key={batch.id} batch={batch} />
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={5} className="py-20 text-center text-zinc-500">
                                        <div className="flex flex-col items-center gap-2">
                                            <Search className="h-10 w-10 text-zinc-200 dark:text-zinc-800 mb-2" />
                                            <p className="font-semibold text-zinc-900 dark:text-zinc-100">No batches match your criteria</p>
                                            <p className="text-sm">Try adjusting your filters or search query.</p>
                                            <Button variant="link" onClick={() => { setSearch(''); setDegreeFilter(''); setStatusFilter(''); }} className="mt-2 text-primary font-bold">Clear all filters</Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>

                {/* Pagination Footer */}
                {!loading && displayBatches.length > 0 && (
                    <div className="flex items-center justify-between border-t border-zinc-200 dark:border-zinc-800 px-6 py-4 bg-zinc-50/30 dark:bg-zinc-900/10">
                        <p className="text-[13px] text-zinc-500 font-medium">
                            Showing <span className="text-zinc-900 dark:text-zinc-100 font-bold">1 to {displayBatches.length}</span> of <span className="text-zinc-900 dark:text-zinc-100 font-bold">{displayBatches.length}</span> batches
                        </p>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" className="h-9 gap-1 disabled:opacity-30" disabled>
                                <ChevronLeft className="h-4 w-4" /> Prev
                            </Button>
                            <div className="flex items-center px-2">
                                <span className="text-sm font-bold text-primary px-3 py-1 bg-primary/5 rounded-md">1</span>
                            </div>
                            <Button variant="outline" size="sm" className="h-9 gap-1 disabled:opacity-30" disabled>
                                Next <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </Card>

            <CreateGroupDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                parentBatch={createParent}
                onSuccess={() => fetchData()}
            />
            {editTarget && (
                <EditGroupDialog
                    open={!!editTarget}
                    onOpenChange={(o) => { if (!o) setEditTarget(null); }}
                    batch={editTarget}
                    onSuccess={() => fetchData()}
                />
            )}
        </div>
    );
}


