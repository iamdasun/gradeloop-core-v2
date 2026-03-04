'use client';

import * as React from 'react';
import { ShieldAlert, Trash2, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export interface DangerZoneProps {
  entityName: string;
  entityType: string;
  isActive: boolean;
  onDeactivate: () => Promise<void>;
  onReactivate: () => Promise<void>;
  deactivateLabel?: string;
  reactivateLabel?: string;
  deactivateDescription?: string;
  reactivateDescription?: string;
  showDelete?: boolean;
  onDelete?: () => Promise<void>;
  deleteLabel?: string;
  deleteDescription?: string;
}

export function DangerZone({
  entityName,
  entityType,
  isActive,
  onDeactivate,
  onReactivate,
  deactivateLabel = 'Deactivate',
  reactivateLabel = 'Reactivate',
  deactivateDescription,
  reactivateDescription,
  showDelete = false,
  onDelete,
  deleteLabel = 'Delete',
  deleteDescription,
}: DangerZoneProps) {
  const [deactivateDialogOpen, setDeactivateDialogOpen] = React.useState(false);
  const [reactivateDialogOpen, setReactivateDialogOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const handleDeactivate = async () => {
    setLoading(true);
    try {
      await onDeactivate();
      setDeactivateDialogOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const handleReactivate = async () => {
    setLoading(true);
    try {
      await onReactivate();
      setReactivateDialogOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setLoading(true);
    try {
      await onDelete();
      setDeleteDialogOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const defaultDeactivateDesc =
    deactivateDescription ||
    `This will deactivate the ${entityType} "${entityName}". It will no longer be available for selection or use, but existing references will remain intact.`;

  const defaultReactivateDesc =
    reactivateDescription ||
    `This will reactivate the ${entityType} "${entityName}" and make it available for use again.`;

  const defaultDeleteDesc =
    deleteDescription ||
    `This action will permanently deactivate the ${entityType} "${entityName}" and cannot be undone. All associated data will be preserved but this ${entityType} will be marked as deleted.`;

  return (
    <Card className="border-destructive/50 shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-destructive" />
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
        </div>
        <CardDescription>Irreversible actions that affect this {entityType}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isActive ? (
          <div className="flex items-center justify-between rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {deactivateLabel} this {entityType}
              </p>
              <p className="text-xs text-zinc-500">
                Make this {entityType} unavailable for future use
              </p>
            </div>
            <Button
              variant="outline"
              className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground font-semibold"
              onClick={() => setDeactivateDialogOpen(true)}
            >
              {deactivateLabel}
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {reactivateLabel} this {entityType}
              </p>
              <p className="text-xs text-zinc-500">
                Make this {entityType} available for use again
              </p>
            </div>
            <Button
              variant="outline"
              className="border-primary text-primary hover:bg-primary hover:text-primary-foreground font-semibold"
              onClick={() => setReactivateDialogOpen(true)}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              {reactivateLabel}
            </Button>
          </div>
        )}

        {showDelete && onDelete && (
          <div className="flex items-center justify-between rounded-lg border border-destructive/50 bg-destructive/5 p-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-destructive">
                {deleteLabel} this {entityType}
              </p>
              <p className="text-xs text-destructive/70">
                Permanently remove this {entityType} from the system
              </p>
            </div>
            <Button
              variant="destructive"
              className="font-semibold"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {deleteLabel}
            </Button>
          </div>
        )}
      </CardContent>

      {/* Deactivate Dialog */}
      <AlertDialog open={deactivateDialogOpen} onOpenChange={setDeactivateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deactivateLabel} {entityType}?
            </AlertDialogTitle>
            <AlertDialogDescription>{defaultDeactivateDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivate}
              disabled={loading}
              className="bg-destructive hover:bg-destructive/90"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {deactivateLabel}...
                </>
              ) : (
                deactivateLabel
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reactivate Dialog */}
      <AlertDialog open={reactivateDialogOpen} onOpenChange={setReactivateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {reactivateLabel} {entityType}?
            </AlertDialogTitle>
            <AlertDialogDescription>{defaultReactivateDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReactivate}
              disabled={loading}
              className="bg-primary hover:bg-primary/90"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {reactivateLabel}...
                </>
              ) : (
                reactivateLabel
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Dialog */}
      {showDelete && onDelete && (
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-destructive">
                {deleteLabel} {entityType}?
              </AlertDialogTitle>
              <AlertDialogDescription>{defaultDeleteDesc}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={loading}
                className="bg-destructive hover:bg-destructive/90"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {deleteLabel}...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    {deleteLabel}
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Card>
  );
}
