"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, CheckCircle2, XCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BulkActionToolbarProps {
    selectedCount: number;
    onBulkDelete?: () => void | Promise<void>;
    onBulkApprove?: () => void | Promise<void>;
    onBulkReject?: () => void | Promise<void>;
    onClearSelection: () => void;
    isLoading?: boolean;
    className?: string;
}

export function BulkActionToolbar({
    selectedCount,
    onBulkDelete,
    onBulkApprove,
    onBulkReject,
    onClearSelection,
    isLoading = false,
    className,
}: BulkActionToolbarProps) {
    if (selectedCount === 0) return null;

    return (
        <div className={cn(
            "sticky top-4 z-50 mb-6 rounded-xl border bg-card p-4 shadow-lg animate-in slide-in-from-top-4",
            className
        )}>
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="text-sm">
                        {selectedCount} selected
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                        Choose an action
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {onBulkApprove && (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={onBulkApprove}
                            disabled={isLoading}
                            className="gap-2"
                        >
                            <CheckCircle2 className="h-4 w-4" />
                            Approve
                        </Button>
                    )}
                    {onBulkReject && (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={onBulkReject}
                            disabled={isLoading}
                            className="gap-2"
                        >
                            <XCircle className="h-4 w-4" />
                            Reject
                        </Button>
                    )}
                    {onBulkDelete && (
                        <Button
                            size="sm"
                            variant="destructive"
                            onClick={onBulkDelete}
                            disabled={isLoading}
                            className="gap-2"
                        >
                            <Trash2 className="h-4 w-4" />
                            Delete
                        </Button>
                    )}
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={onClearSelection}
                        disabled={isLoading}
                        className="gap-2"
                    >
                        <X className="h-4 w-4" />
                        Clear
                    </Button>
                </div>
            </div>
        </div>
    );
}
