"use client";

import { AlertTriangle, ArrowRight } from "lucide-react";
import { MappingRow } from "./mapping-row";
import type {
  ColumnMapping,
  SystemFieldOption,
  SystemFieldType,
} from "@/schemas/bulk-import.schema";

interface MappingTableProps {
  mappings: ColumnMapping[];
  systemFields: SystemFieldOption[];
  requiredFieldsCount: number;
  onMappingChange: (csvColumn: string, mappedTo: SystemFieldType) => void;
}

export function MappingTable({
  mappings,
  systemFields,
  requiredFieldsCount,
  onMappingChange,
}: MappingTableProps) {
  return (
    <div className="bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-gray-200 dark:border-border-color overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-gray-200 dark:border-border-color bg-gray-50/50 dark:bg-surface-dark/50">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Map Columns
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Review the auto-matched fields below.
            </p>
          </div>
          {requiredFieldsCount > 0 && (
            <div className="flex items-center space-x-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-900/30">
              <AlertTriangle className="h-4 w-4" />
              <span>{requiredFieldsCount} fields require attention</span>
            </div>
          )}
        </div>
      </div>

      {/* Column Headers */}
      <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-gray-50 dark:bg-surface-dark/80 border-b border-gray-200 dark:border-border-color text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
        <div className="col-span-5">CSV Column Header</div>
        <div className="col-span-1 flex justify-center">
          <ArrowRight className="h-4 w-4" />
        </div>
        <div className="col-span-5">GradeLoop System Field</div>
        <div className="col-span-1 text-center">Status</div>
      </div>

      {/* Mapping Rows */}
      {mappings.map((mapping) => (
        <MappingRow
          key={mapping.csvColumn}
          mapping={mapping}
          systemFields={systemFields}
          onMappingChange={onMappingChange}
        />
      ))}
    </div>
  );
}
