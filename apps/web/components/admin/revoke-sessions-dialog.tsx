'use client';

import * as React from 'react';
import { usersApi, handleApiError } from '@/lib/api/users';
import { toast } from '@/lib/hooks/use-toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { UserListItem } from '@/types/auth.types';

interface Props {
  user: UserListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function RevokeSessionsDialog({
  user,
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const [loading, setLoading] = React.useState(false);

  async function handleConfirm() {
    if (!user) return;
    setLoading(true);
    try {
      await usersApi.revokeSessions(user.id);
      toast.success(
        'Sessions revoked',
        `All active sessions for ${user.username} have been terminated.`,
      );
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      toast.error('Failed to revoke sessions', handleApiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Revoke Sessions"
      description={`This will immediately terminate all active sessions for ${user?.username ?? 'this user'}. They will need to log in again on all devices.`}
      confirmLabel="Revoke All Sessions"
      onConfirm={handleConfirm}
      loading={loading}
    />
  );
}
