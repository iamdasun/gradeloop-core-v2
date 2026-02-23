'use client';

import * as React from 'react';
import {
  Plus,
  Search,
  RefreshCw,
  MoreHorizontal,
  Eye,
  Pencil,
  ShieldOff,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Users,
  UserCheck,
  UserX,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SelectNative } from '@/components/ui/select-native';
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { CreateUserDialog } from '@/components/admin/create-user-dialog';
import { EditUserDialog } from '@/components/admin/edit-user-dialog';
import { UserDetailsDialog } from '@/components/admin/user-details-dialog';
import { RevokeSessionsDialog } from '@/components/admin/revoke-sessions-dialog';
import { DeleteUserDialog } from '@/components/admin/delete-user-dialog';
import { useAdminUsersStore } from '@/lib/stores/adminUsersStore';
import { usersApi, handleApiError } from '@/lib/api/users';
import type { UserListItem } from '@/types/auth.types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function initials(username: string) {
  return username
    .split(/[.\-_\s@]/)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

function roleBadgeVariant(roleName: string) {
  const l = roleName.toLowerCase();
  if (l.includes('admin')) return 'purple' as const;
  if (l.includes('instructor') || l.includes('teacher')) return 'info' as const;
  if (l.includes('student') || l.includes('learner')) return 'success' as const;
  return 'secondary' as const;
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <Badge variant={active ? 'success' : 'destructive'}>
      {active ? 'Active' : 'Inactive'}
    </Badge>
  );
}

function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          <TableCell>
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
          </TableCell>
          <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
          <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
          <TableCell><Skeleton className="h-8 w-8 rounded-md" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

const PAGE_LIMIT = 20;

export default function UsersPage() {
  // ── Data state ──────────────────────────────────────────────────────────
  const [users, setUsers] = React.useState<UserListItem[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // ── Filter state ────────────────────────────────────────────────────────
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [roleFilter, setRoleFilter] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');

  // ── Dialog state ────────────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editUser, setEditUser] = React.useState<UserListItem | null>(null);
  const [detailsUser, setDetailsUser] = React.useState<UserListItem | null>(null);
  const [revokeUser, setRevokeUser] = React.useState<UserListItem | null>(null);
  const [deleteUser, setDeleteUser] = React.useState<UserListItem | null>(null);

  const { roles, rolesLoading, rolesError, fetchRoles, refetchRoles } = useAdminUsersStore();

  // ── Debounce search ──────────────────────────────────────────────────────
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  React.useEffect(() => { setPage(1); }, [debouncedSearch, roleFilter, statusFilter]);

  // ── Fetch users ──────────────────────────────────────────────────────────
  const fetchUsers = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await usersApi.list({
        page,
        limit: PAGE_LIMIT,
        role_id: roleFilter || undefined,
      });
      setUsers(result.data);
      setTotal(result.total);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
  }, [page, roleFilter]);

  React.useEffect(() => { fetchUsers(); }, [fetchUsers]);
  React.useEffect(() => { fetchRoles(); }, [fetchRoles]);

  // ── Client-side filtering (search & status only — role filter is server-side) ──
  const displayUsers = React.useMemo(() => {
    return users.filter((u) => {
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        if (!u.username.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q))
          return false;
      }
      if (statusFilter === 'active' && !u.is_active) return false;
      if (statusFilter === 'inactive' && u.is_active) return false;
      return true;
    });
  }, [users, debouncedSearch, statusFilter]);

  // ── Derived stats ────────────────────────────────────────────────────────────
  const activeCount = users.filter((u) => u.is_active).length;
  const inactiveCount = users.filter((u) => !u.is_active).length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  // ── Handlers ─────────────────────────────────────────────────────────────────
  function handleUserCreated() {
    fetchUsers();
  }
  function handleUserUpdated(updated: UserListItem) {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
  }
  function handleUserDeleted(id: string) {
    setUsers((prev) => prev.filter((u) => u.id !== id));
    setTotal((t) => Math.max(0, t - 1));
  }

  return (
    <div className="space-y-6">

      {/* Page Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Manage accounts, roles, and access.
          </p>
        </div>
        <Button className="gap-2 shadow-sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Add User
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
              <Users className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{total.toLocaleString()}</p>
              <p className="text-xs text-zinc-500">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
              <UserCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{activeCount}</p>
              <p className="text-xs text-zinc-500">Active</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
              <UserX className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{inactiveCount}</p>
              <p className="text-xs text-zinc-500">Inactive</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="shadow-sm">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <Input
              placeholder="Search by username or email…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <SelectNative
            className="sm:w-44"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            disabled={rolesLoading}
            title={rolesError ? `Roles unavailable: ${rolesError}` : undefined}
          >
            <option value="">
              {rolesLoading ? 'Loading roles…' : rolesError ? 'Roles unavailable' : 'All roles'}
            </option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </SelectNative>
          {rolesError && (
            <button
              type="button"
              className="text-xs text-red-500 hover:underline shrink-0"
              onClick={() => refetchRoles()}
            >
              Retry roles
            </button>
          )}
          <SelectNative
            className="sm:w-40"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </SelectNative>
          <Button
            variant="outline"
            size="icon"
            onClick={fetchUsers}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="shadow-sm overflow-hidden">
        {error && !loading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <p className="text-sm text-red-500">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchUsers}>Try again</Button>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Joined</TableHead>
                  <TableHead className="hidden lg:table-cell">Last Login</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableSkeleton rows={8} />
                ) : displayUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-16 text-center text-zinc-500">
                      <Users className="mx-auto h-10 w-10 text-zinc-300 dark:text-zinc-600 mb-3" />
                      <p className="font-medium">No users found</p>
                      <p className="text-sm mt-1">
                        {debouncedSearch || roleFilter || statusFilter
                          ? 'Try adjusting your search or filters.'
                          : 'Get started by adding the first user.'}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  displayUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9 shrink-0">
                            <AvatarFallback className="bg-zinc-100 dark:bg-zinc-800 text-sm">
                              {initials(user.username)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{user.username}</p>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{user.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={roleBadgeVariant(user.role_name)}>
                          {user.role_name}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge active={user.is_active} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                        {new Date(user.created_at).toLocaleDateString('en-US', { dateStyle: 'medium' })}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                        {user.last_login_at
                          ? new Date(user.last_login_at).toLocaleDateString('en-US', { dateStyle: 'medium' })
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Open menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="gap-2" onClick={() => setDetailsUser(user)}>
                              <Eye className="h-4 w-4" />View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem className="gap-2" onClick={() => setEditUser(user)}>
                              <Pencil className="h-4 w-4" />Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="gap-2" onClick={() => setRevokeUser(user)}>
                              <ShieldOff className="h-4 w-4" />Revoke Sessions
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="gap-2 text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
                              onClick={() => setDeleteUser(user)}
                            >
                              <Trash2 className="h-4 w-4" />Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {/* Pagination */}
            {!loading && users.length > 0 && (
              <div className="flex items-center justify-between border-t border-zinc-200 dark:border-zinc-800 px-4 py-3">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Showing{' '}
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">
                    {(page - 1) * PAGE_LIMIT + 1}
                  </span>–
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">
                    {Math.min(page * PAGE_LIMIT, total)}
                  </span>{' '}
                  of{' '}
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">
                    {total.toLocaleString()}
                  </span>
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline" size="sm" className="gap-1"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1 || loading}
                  >
                    <ChevronLeft className="h-4 w-4" />Prev
                  </Button>
                  <span className="text-sm text-zinc-500 px-1">{page} / {totalPages}</span>
                  <Button
                    variant="outline" size="sm" className="gap-1"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages || loading}
                  >
                    Next<ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Dialogs */}
      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={handleUserCreated}
      />
      <EditUserDialog
        user={editUser}
        open={!!editUser}
        onOpenChange={(open) => !open && setEditUser(null)}
        onSuccess={handleUserUpdated}
      />
      <UserDetailsDialog
        user={detailsUser}
        open={!!detailsUser}
        onOpenChange={(open) => !open && setDetailsUser(null)}
        onEdit={(u) => { setDetailsUser(null); setEditUser(u); }}
        onRevokeSessions={(u) => { setDetailsUser(null); setRevokeUser(u); }}
        onDelete={(u) => { setDetailsUser(null); setDeleteUser(u); }}
      />
      <RevokeSessionsDialog
        user={revokeUser}
        open={!!revokeUser}
        onOpenChange={(open) => !open && setRevokeUser(null)}
        onSuccess={fetchUsers}
      />
      <DeleteUserDialog
        user={deleteUser}
        open={!!deleteUser}
        onOpenChange={(open) => !open && setDeleteUser(null)}
        onSuccess={handleUserDeleted}
      />
    </div>
  );
}
