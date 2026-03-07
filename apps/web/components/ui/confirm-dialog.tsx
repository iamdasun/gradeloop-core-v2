"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ConfirmDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string | React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    variant?: "default" | "destructive";
    onConfirm: () => void | Promise<void>;
    isLoading?: boolean;
    className?: string;
}

export function ConfirmDialog({
    open,
    onOpenChange,
    title,
    description,
    confirmText = "Confirm",
    cancelText = "Cancel",
    variant = "default",
    onConfirm,
    isLoading = false,
    className,
}: ConfirmDialogProps) {
    const [isConfirming, setIsConfirming] = React.useState(false);

    const handleConfirm = async () => {
        try {
            setIsConfirming(true);
            await onConfirm();
            onOpenChange(false);
        } finally {
            setIsConfirming(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className={cn("sm:max-w-md", className)}>
                <DialogHeader>
                    <div className="flex items-start gap-3">
                        {variant === "destructive" && (
                            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                        )}
                        <DialogTitle>{title}</DialogTitle>
                    </div>
                    {typeof description === "string" ? (
                        <DialogDescription>{description}</DialogDescription>
                    ) : (
                        description
                    )}
                </DialogHeader>
                <DialogFooter className="gap-2 sm:gap-0">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isLoading || isConfirming}
                    >
                        {cancelText}
                    </Button>
                    <Button
                        type="button"
                        variant={variant === "destructive" ? "destructive" : "default"}
                        onClick={handleConfirm}
                        disabled={isLoading || isConfirming}
                    >
                        {isConfirming || isLoading ? (
                            <>
                                <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                Processing...
                            </>
                        ) : (
                            confirmText
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
