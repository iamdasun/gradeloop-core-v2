"use client";

import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export interface SelectCheckboxProps {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    id: string;
    className?: string;
    disabled?: boolean;
}

export function SelectCheckbox({
    checked,
    onCheckedChange,
    id,
    className,
    disabled = false,
}: SelectCheckboxProps) {
    return (
        <div className={cn("flex items-center justify-center", className)}>
            <Checkbox
                id={id}
                checked={checked}
                onCheckedChange={onCheckedChange}
                disabled={disabled}
                aria-label="Select item"
            />
        </div>
    );
}
