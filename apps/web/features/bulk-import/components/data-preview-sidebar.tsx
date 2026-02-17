"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PreviewRow } from "@/schemas/bulk-import.schema";

interface DataPreviewSidebarProps {
  previewRows: PreviewRow[];
  onViewAll?: () => void;
}

export function DataPreviewSidebar({
  previewRows,
  onViewAll,
}: DataPreviewSidebarProps) {
  return (
    <div className="bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-gray-200 dark:border-border-color sticky top-24">
      {/* Header */}
      <div className="p-5 border-b border-gray-200 dark:border-border-color">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          Data Preview
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Live preview of first {previewRows.length} rows.
        </p>
      </div>

      {/* Preview Items */}
      <div className="overflow-x-auto">
        {previewRows.map((row) => (
          <div
            key={row.id}
            className="p-4 border-b border-gray-100 dark:border-border-color/50 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors group"
          >
            <div className="flex items-start space-x-3">
              {/* Avatar */}
              <div
                className={cn(
                  "h-8 w-8 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-xs font-bold shadow-sm",
                  row.gradientClass
                )}
                title={row.displayName}
              >
                {row.initials}
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                  {row.displayName}
                </p>
                {row.email && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {row.email}
                  </p>
                )}

                {/* Field Badges */}
                <div className="mt-2 flex flex-wrap gap-1">
                  {Object.entries(row.fields).map(
                    ([key, value]) =>
                      value && (
                        <Badge
                          key={key}
                          variant="secondary"
                          className="text-xs"
                        >
                          {key}: {value}
                        </Badge>
                      )
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      {onViewAll && (
        <div className="p-4 bg-gray-50/50 dark:bg-surface-dark/50 text-center">
          <Button
            variant="link"
            onClick={onViewAll}
            className="text-primary hover:underline"
          >
            View All Rows
          </Button>
        </div>
      )}
    </div>
  );
}
