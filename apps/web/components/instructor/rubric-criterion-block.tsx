"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { RubricCriterion } from "@/lib/stores/assignmentCreateStore";

// ─── Band style map ───────────────────────────────────────────────────────────

const BAND_STYLES: Record<string, { label: string; color: string }> = {
    excellent: {
        label: "Excellent",
        color: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
    },
    good: {
        label: "Good",
        color: "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800",
    },
    satisfactory: {
        label: "Satisfactory",
        color: "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800",
    },
    unsatisfactory: {
        label: "Unsatisfactory",
        color: "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800",
    },
};

const BAND_ORDER = ["excellent", "good", "satisfactory", "unsatisfactory"] as const;

// ─── Component ────────────────────────────────────────────────────────────────

interface RubricCriterionBlockProps {
    criterion: RubricCriterion;
    isExpanded: boolean;
    isFirst: boolean;
    isLast: boolean;
    onToggle: () => void;
    onChange: (updated: RubricCriterion) => void;
    onRemove: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
}

export function RubricCriterionBlock({
    criterion,
    isExpanded,
    isFirst,
    isLast,
    onToggle,
    onChange,
    onRemove,
    onMoveUp,
    onMoveDown,
}: RubricCriterionBlockProps) {
    const update = <K extends keyof RubricCriterion>(key: K, value: RubricCriterion[K]) =>
        onChange({ ...criterion, [key]: value });

    const updateBand = (
        band: keyof typeof criterion.bands,
        key: "description" | "mark_range",
        value: string | { min: number; max: number },
    ) =>
        onChange({
            ...criterion,
            bands: {
                ...criterion.bands,
                [band]: { ...criterion.bands[band], [key]: value },
            },
        });

    return (
        <div
            className={cn(
                "border rounded-xl bg-card overflow-hidden transition-colors",
                isExpanded ? "border-primary/30 shadow-sm" : "border-border/60",
            )}
        >
            {/* ── Header ── */}
            <div
                className="flex items-center gap-3 p-4 cursor-pointer select-none hover:bg-muted/20 transition-colors"
                onClick={onToggle}
            >
                {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}

                <span className="flex-1 font-semibold text-sm truncate">
                    {criterion.name ? (
                        criterion.name
                    ) : (
                        <span className="text-muted-foreground font-normal italic">Unnamed criterion</span>
                    )}
                </span>

                <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant="outline" className="font-mono text-xs tabular-nums">
                        {criterion.weight}%
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] uppercase tracking-wider hidden sm:flex">
                        {criterion.grading_mode.replace("_", " + ")}
                    </Badge>

                    {/* Reorder buttons */}
                    <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
                        disabled={isFirst}
                        onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
                    >
                        <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
                        disabled={isLast}
                        onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
                    >
                        <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => { e.stopPropagation(); onRemove(); }}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>

            {/* ── Body ── */}
            {isExpanded && (
                <div className="px-5 pb-5 border-t border-border/40 space-y-5 pt-5">
                    {/* Name / Weight / Mode */}
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_90px_170px] gap-4">
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Criterion Name</Label>
                            <Input
                                value={criterion.name}
                                placeholder="e.g. Code Correctness"
                                className="h-9"
                                onChange={(e) => update("name", e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Weight %</Label>
                            <Input
                                type="number"
                                min={0}
                                max={100}
                                value={criterion.weight}
                                className="h-9"
                                onChange={(e) => update("weight", Number(e.target.value))}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Grading Mode</Label>
                            <Select
                                value={criterion.grading_mode}
                                onValueChange={(v) =>
                                    update("grading_mode", v as RubricCriterion["grading_mode"])
                                }
                            >
                                <SelectTrigger className="h-9">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="llm">LLM</SelectItem>
                                    <SelectItem value="llm_ast">LLM + AST</SelectItem>
                                    <SelectItem value="deterministic">Deterministic</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Description */}
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Description</Label>
                        <Textarea
                            value={criterion.description}
                            placeholder="What does this criterion evaluate?"
                            className="min-h-[72px] resize-y text-sm"
                            onChange={(e) => update("description", e.target.value)}
                        />
                    </div>

                    {/* Grading bands */}
                    <div className="space-y-3">
                        <div className="grid grid-cols-[130px_1fr_52px_14px_52px] gap-2 items-center px-1">
                            <span className="text-xs text-muted-foreground font-medium">Band</span>
                            <span className="text-xs text-muted-foreground font-medium">Description</span>
                            <span className="text-xs text-muted-foreground font-medium text-center col-span-3">
                                Range (%)
                            </span>
                        </div>

                        {BAND_ORDER.map((bandKey) => {
                            const band = criterion.bands[bandKey];
                            const style = BAND_STYLES[bandKey];
                            return (
                                <div
                                    key={bandKey}
                                    className="grid grid-cols-[130px_1fr_52px_14px_52px] gap-2 items-center"
                                >
                                    <span
                                        className={cn(
                                            "inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium whitespace-nowrap",
                                            style.color,
                                        )}
                                    >
                                        {style.label}
                                    </span>
                                    <Input
                                        placeholder={`${style.label} behavior…`}
                                        value={band.description}
                                        className="h-8 text-sm"
                                        onChange={(e) => updateBand(bandKey, "description", e.target.value)}
                                    />
                                    <Input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={band.mark_range.min}
                                        className="h-8 text-center text-xs px-1"
                                        onChange={(e) =>
                                            updateBand(bandKey, "mark_range", {
                                                ...band.mark_range,
                                                min: Number(e.target.value),
                                            })
                                        }
                                    />
                                    <span className="text-center text-muted-foreground text-xs">–</span>
                                    <Input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={band.mark_range.max}
                                        className="h-8 text-center text-xs px-1"
                                        onChange={(e) =>
                                            updateBand(bandKey, "mark_range", {
                                                ...band.mark_range,
                                                max: Number(e.target.value),
                                            })
                                        }
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
