'use client';

import * as React from 'react';
import {
    Users2,
    Plus,
    Search,
    MoreVertical,
    Loader2,
    AlertTriangle,
    ChevronRight,
    ChevronDown,
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
import { batchesApi } from '@/lib/api/academics';
import { handleApiError } from '@/lib/api/axios';
import { toast } from '@/lib/hooks/use-toast';
import { useAcademicsAccess } from '@/lib/hooks/useAcademicsAccess';
import {
    CreateGroupDialog,
    EditGroupDialog,
} from '@/components/admin/academics/group-dialogs';
import type { Batch } from '@/types/academics.types';

export default function GroupsPage() {
    const { canAccess, canWrite } = useAcademicsAccess();

    const [batches, setBatches] = React.useState<Batch[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState('');
    const [search, setSearch] = React.useState('');
    const [showInactive, setShowInactive] = React.useState(false);

    const [createOpen, setCreateOpen] = React.useState(false);
    const [createParent, setCreateParent] = React.useState<Batch | null>(null);
    const [editTarget, setEditTarget] = React.useState<Batch | null>(null);
    const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());

    const fetchBatches = React.useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const list = await batchesApi.list(showInactive);
            setBatches(list);
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setLoading(false);
        }
    }, [showInactive]);

    React.useEffect(() => { fetchBatches(); }, [fetchBatches]);

    // Build hierarchy: root batches and children
    const rootBatches = React.useMemo(
        () => batches.filter((b) => !b.parent_id),
        [batches],
    );

    const childrenOf = React.useCallback(
        (parentId: string) => batches.filter((b) => b.parent_id === parentId),
        [batches],
    );

    const filtered = React.useMemo(() => {
        if (!search.trim()) return rootBatches;
        const q = search.toLowerCase();
        return batches.filter(
            (b) =>
                b.name.toLowerCase().includes(q) ||
                b.code.toLowerCase().includes(q),
        );
    }, [rootBatches, batches, search]);

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
            fetchBatches();
        } catch (err) {
            toast.error('Action failed', handleApiError(err));
        }
    }

    function renderBatch(batch: Batch, depth: number = 0) {
        const children = childrenOf(batch.id);
        const hasChildren = children.length > 0;
        const isExpanded = expandedIds.has(batch.id);

        return (
            <div key={batch.id} style={{ marginLeft: depth * 24 }}>
                <Card className={`transition-all hover:shadow-md mb-2 ${!batch.is_active ? 'opacity-60' : ''}`}>
                    <CardContent className="p-4 flex items-center gap-3">
                        {/* Expand toggle */}
                        <button
                            type="button"
                            className="shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            onClick={() => hasChildren && toggleExpand(batch.id)}
                        >
                            {hasChildren ? (
                                isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                            ) : (
                                <span className="w-4" />
                            )}
                        </button>

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="font-mono text-xs text-zinc-400">{batch.code}</span>
                                {!batch.is_active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                            </div>
                            <h3 className="font-semibold text-sm truncate">{batch.name}</h3>
                            <p className="text-xs text-zinc-500">{batch.start_year} – {batch.end_year}</p>
                        </div>

                        {children.length > 0 && (
                            <Badge variant="outline" className="text-xs shrink-0">
                                {children.length} sub-group{children.length !== 1 ? 's' : ''}
                            </Badge>
                        )}

                        {canWrite && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                                        <MoreVertical className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => setEditTarget(batch)}>Edit</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => { setCreateParent(batch); setCreateOpen(true); }}>
                                        Add Sub-group
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => toggleActive(batch)}>
                                        {batch.is_active ? 'Deactivate' : 'Reactivate'}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </CardContent>
                </Card>

                {/* Render children if expanded */}
                {isExpanded && children.map((child) => renderBatch(child, depth + 1))}
            </div>
        );
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
                    <h1 className="text-2xl font-bold tracking-tight">Groups</h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        Manage academic groups (batches) with hierarchical structure.
                    </p>
                </div>
                {canWrite && (
                    <Button onClick={() => { setCreateParent(null); setCreateOpen(true); }} className="gap-2">
                        <Plus className="h-4 w-4" /> New Group
                    </Button>
                )}
            </div>

            {/* Filters */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <Input
                        className="pl-9"
                        placeholder="Search groups…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
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
                    <Users2 className="h-12 w-12 mb-3 opacity-40" />
                    <p className="text-sm">No groups found.</p>
                </div>
            )}

            {/* Tree */}
            {!loading && filtered.length > 0 && (
                <div className="space-y-0">
                    {(search.trim() ? filtered : rootBatches).map((b) => renderBatch(b))}
                </div>
            )}

            {/* Dialogs */}
            <CreateGroupDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                parentBatch={createParent}
                onSuccess={() => fetchBatches()}
            />
            {editTarget && (
                <EditGroupDialog
                    open={!!editTarget}
                    onOpenChange={(o) => { if (!o) setEditTarget(null); }}
                    batch={editTarget}
                    onSuccess={() => fetchBatches()}
                />
            )}
        </div>
    );
}
