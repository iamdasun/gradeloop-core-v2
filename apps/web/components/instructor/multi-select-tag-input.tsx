"use client";

import * as React from "react";
import { X, ChevronDown, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface SelectOption {
    label: string;
    value: string;
}

interface MultiSelectTagInputProps {
    options: SelectOption[];
    value: string[];
    onChange: (value: string[]) => void;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
}

export function MultiSelectTagInput({
    options,
    value,
    onChange,
    placeholder = "Select options...",
    className,
    disabled,
}: MultiSelectTagInputProps) {
    const [open, setOpen] = React.useState(false);
    const [search, setSearch] = React.useState("");

    const filtered = options.filter((opt) =>
        opt.label.toLowerCase().includes(search.toLowerCase())
    );

    const toggle = (optValue: string) => {
        if (value.includes(optValue)) {
            onChange(value.filter((v) => v !== optValue));
        } else {
            onChange([...value, optValue]);
        }
    };

    const remove = (optValue: string, e: React.MouseEvent) => {
        e.stopPropagation();
        onChange(value.filter((v) => v !== optValue));
    };

    const selectedLabels = value
        .map((v) => options.find((o) => o.value === v)?.label ?? v)
        .filter(Boolean);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    disabled={disabled}
                    className={cn(
                        "w-full min-h-10 flex flex-wrap items-center gap-1.5 px-3 py-2 rounded-md border border-input bg-background text-sm ring-offset-background",
                        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                        "hover:border-ring/50 transition-colors",
                        className
                    )}
                >
                    {selectedLabels.length === 0 ? (
                        <span className="text-muted-foreground flex-1 text-left">{placeholder}</span>
                    ) : (
                        <div className="flex flex-wrap gap-1 flex-1">
                            {selectedLabels.map((label, i) => (
                                <Badge
                                    key={value[i]}
                                    variant="secondary"
                                    className="text-xs font-semibold gap-1 pl-2 pr-1 py-0.5"
                                >
                                    {label}
                                    <span
                                        role="button"
                                        tabIndex={0}
                                        onClick={(e) => remove(value[i], e)}
                                        onKeyDown={(e) => e.key === "Enter" && remove(value[i], e as any)}
                                        className="ml-0.5 rounded-full hover:bg-muted-foreground/20 cursor-pointer p-0.5"
                                    >
                                        <X className="h-3 w-3" />
                                    </span>
                                </Badge>
                            ))}
                        </div>
                    )}
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 ml-auto" />
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0 min-w-[200px]" align="start">
                <div className="p-2 border-b border-border/40">
                    <Input
                        placeholder="Search..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="h-8 text-sm"
                        autoFocus
                    />
                </div>
                <div className="max-h-52 overflow-y-auto">
                    {filtered.length === 0 ? (
                        <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                            No options found.
                        </div>
                    ) : (
                        filtered.map((opt) => {
                            const isSelected = value.includes(opt.value);
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => toggle(opt.value)}
                                    className={cn(
                                        "w-full flex items-center gap-2 px-3 py-2 text-sm text-left",
                                        "hover:bg-muted/50 transition-colors",
                                        isSelected && "bg-primary/5 text-primary font-medium"
                                    )}
                                >
                                    <div className={cn(
                                        "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                                        isSelected
                                            ? "bg-primary border-primary"
                                            : "border-muted-foreground/30"
                                    )}>
                                        {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                                    </div>
                                    {opt.label}
                                </button>
                            );
                        })
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
