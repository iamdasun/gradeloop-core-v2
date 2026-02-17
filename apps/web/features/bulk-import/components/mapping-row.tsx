"use client";

import { ArrowRight, Check, AlertCircle, Minus, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type {
  ColumnMapping,
  SystemFieldOption,
  SystemFieldType,
} from "@/schemas/bulk-import.schema";

interface MappingRowProps {
  mapping: ColumnMapping;
  systemFields: SystemFieldOption[];
  onMappingChange: (csvColumn: string, mappedTo: SystemFieldType) => void;
}

export function MappingRow({
  mapping,
  systemFields,
  onMappingChange,
}: MappingRowProps) {
  const isIgnored = mapping.mappedTo === "ignore";
  const isRequired = mapping.status === "required";
  const isMapped = mapping.status === "mapped";

  return (
    <div
      className={cn(
        "grid grid-cols-12 gap-4 px-6 py-4 items-center border-b border-gray-200 dark:border-border-color transition-colors",
        isRequired
          ? "bg-amber-50/50 dark:bg-amber-900/10 hover:bg-amber-50 dark:hover:bg-amber-900/20"
          : "hover:bg-gray-50 dark:hover:bg-white/5",
        isIgnored && "opacity-60"
      )}
    >
      {/* CSV Column */}
      <div className="col-span-5">
        <div className="font-medium text-slate-700 dark:text-slate-200">
          {mapping.csvColumn}
        </div>
        {mapping.sampleValue && (
          <div className="text-xs text-slate-400 mt-0.5">
            Sample: {mapping.sampleValue}
          </div>
        )}
      </div>

      {/* Arrow Icon */}
      <div className="col-span-1 flex justify-center text-slate-400">
        {isIgnored ? (
          <X className="h-4 w-4" />
        ) : (
          <ArrowRight className="h-4 w-4" />
        )}
      </div>

      {/* System Field Selector */}
      <div className="col-span-5">
        <Select
          value={mapping.mappedTo ?? ""}
          onValueChange={(value) =>
            onMappingChange(mapping.csvColumn, value as SystemFieldType)
          }
        >
          <SelectTrigger
            className={cn(
              "w-full",
              isRequired &&
                "border-amber-300 dark:border-amber-600 focus:border-amber-500 focus:ring-amber-500",
              isMapped &&
                "border-primary/50 focus:border-primary focus:ring-primary",
              isIgnored && "bg-gray-50 dark:bg-surface-dark text-slate-500"
            )}
          >
            <SelectValue placeholder="Select Field..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ignore">-- Ignore Column --</SelectItem>
            {systemFields.map((field) => (
              <SelectItem key={field.value} value={field.value}>
                {field.label}
                {field.required && " *"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isRequired && (
          <div className="mt-1 text-xs text-amber-600 dark:text-amber-500 font-medium">
            Required field match needed
          </div>
        )}
      </div>

      {/* Status Indicator */}
      <div className="col-span-1 flex justify-center">
        {isMapped && (
          <div
            className="h-6 w-6 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 flex items-center justify-center"
            title="Mapped Successfully"
          >
            <Check className="h-4 w-4" />
          </div>
        )}
        {isRequired && (
          <div
            className="h-6 w-6 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center animate-pulse"
            title="Action Required"
          >
            <AlertCircle className="h-4 w-4" />
          </div>
        )}
        {isIgnored && (
          <div
            className="h-6 w-6 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 flex items-center justify-center"
            title="Ignored"
          >
            <Minus className="h-4 w-4" />
          </div>
        )}
      </div>
    </div>
  );
}
