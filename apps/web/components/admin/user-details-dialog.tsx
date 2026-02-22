'use client';

import * as React from 'react';
import {
  User,
  Mail,
  Shield,
  Calendar,
  Clock,
  Hash,
  Edit,
  ShieldOff,
  Trash2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { UserListItem } from '@/types/auth.types';

interface Props {
  user: UserListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (user: UserListItem) => void;
  onRevokeSessions: (user: UserListItem) => void;
  onDelete: (user: UserListItem) => void;
}

function initials(username: string) {
  return username
    .split(/[.\-_\s]/)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function roleBadgeVariant(roleName: string) {
  const lower = roleName.toLowerCase();
  if (lower.includes('admin')) return 'purple' as const;
  if (lower.includes('instructor') || lower.includes('teacher'))
    return 'info' as const;
  return 'secondary' as const;
}

export function UserDetailsDialog({
  user,
  open,
  onOpenChange,
  onEdit,
  onRevokeSessions,
  onDelete,
}: Props) {
  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>User Details</DialogTitle>
        </DialogHeader>

        {/* Avatar + name + status */}
        <div className="flex items-center gap-4 py-2">
          <Avatar className="h-14 w-14 text-lg">
            <AvatarFallback className="bg-zinc-100 dark:bg-zinc-800">
              {initials(user.username)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold">{user.username}</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 truncate">
              {user.email}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={user.is_active ? 'success' : 'destructive'}>
                {user.is_active ? 'Active' : 'Inactive'}
              </Badge>
              <Badge variant={roleBadgeVariant(user.role_name)}>
                {user.role_name}
              </Badge>
            </div>
          </div>
        </div>

        <Separator />

        {/* Detail grid */}
        <dl className="grid grid-cols-1 gap-3 text-sm">
          <div className="flex items-start gap-3">
            <Hash className="h-4 w-4 text-zinc-400 mt-0.5 shrink-0" />
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400 text-xs">
                User ID
              </dt>
              <dd className="font-mono text-xs break-all">{user.id}</dd>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <User className="h-4 w-4 text-zinc-400 mt-0.5 shrink-0" />
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400 text-xs">
                Username
              </dt>
              <dd>{user.username}</dd>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Mail className="h-4 w-4 text-zinc-400 mt-0.5 shrink-0" />
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400 text-xs">
                Email
              </dt>
              <dd className="break-all">{user.email}</dd>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Shield className="h-4 w-4 text-zinc-400 mt-0.5 shrink-0" />
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400 text-xs">
                Role
              </dt>
              <dd>{user.role_name}</dd>
            </div>
          </div>

          {user.user_type && (
            <div className="flex items-start gap-3">
              <User className="h-4 w-4 text-zinc-400 mt-0.5 shrink-0" />
              <div>
                <dt className="text-zinc-500 dark:text-zinc-400 text-xs">
                  User Type
                </dt>
                <dd className="capitalize">{user.user_type}</dd>
              </div>
            </div>
          )}

          {user.designation && (
            <div className="flex items-start gap-3">
              <User className="h-4 w-4 text-zinc-400 mt-0.5 shrink-0" />
              <div>
                <dt className="text-zinc-500 dark:text-zinc-400 text-xs">
                  Designation
                </dt>
                <dd>{user.designation}</dd>
              </div>
            </div>
          )}

          <div className="flex items-start gap-3">
            <Calendar className="h-4 w-4 text-zinc-400 mt-0.5 shrink-0" />
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400 text-xs">
                Created
              </dt>
              <dd>{formatDate(user.created_at)}</dd>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Clock className="h-4 w-4 text-zinc-400 mt-0.5 shrink-0" />
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400 text-xs">
                Last Login
              </dt>
              <dd>{formatDate(user.last_login_at)}</dd>
            </div>
          </div>
        </dl>

        <Separator />

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              onOpenChange(false);
              onEdit(user);
            }}
          >
            <Edit className="h-4 w-4" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              onOpenChange(false);
              onRevokeSessions(user);
            }}
          >
            <ShieldOff className="h-4 w-4" />
            Revoke Sessions
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 border-red-200 dark:border-red-800"
            onClick={() => {
              onOpenChange(false);
              onDelete(user);
            }}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
