import * as React from "react";
import {
    SideDialog,
    SideDialogContent,
    SideDialogDescription,
    SideDialogHeader,
    SideDialogTitle,
} from "@/components/ui/side-dialog";
import { cn } from "@/lib/utils";

interface SideSheetFormProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: string;
    children: React.ReactNode;
    className?: string;
}

export function SideSheetForm({
    open,
    onOpenChange,
    title,
    description,
    children,
    className,
}: SideSheetFormProps) {
    return (
        <SideDialog open={open} onOpenChange={onOpenChange}>
            <SideDialogContent className={cn("sm:max-w-2xl", className)}>
                <SideDialogHeader>
                    <SideDialogTitle>{title}</SideDialogTitle>
                    {description && (
                        <SideDialogDescription>{description}</SideDialogDescription>
                    )}
                </SideDialogHeader>
                {children}
            </SideDialogContent>
        </SideDialog>
    );
}
