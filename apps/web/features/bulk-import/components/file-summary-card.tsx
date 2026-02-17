"use client";

import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FileInfo } from "@/schemas/bulk-import.schema";

interface FileSummaryCardProps {
  fileInfo: FileInfo;
  onChangeFile?: () => void;
}

export function FileSummaryCard({
  fileInfo,
  onChangeFile,
}: FileSummaryCardProps) {
  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-gray-200 dark:border-border-color p-4 flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <div className="h-10 w-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center text-green-600 dark:text-green-400">
          <FileText className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {fileInfo.filename}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {fileInfo.rowCount} rows detected • {formatFileSize(fileInfo.size)}
          </p>
        </div>
      </div>
      {onChangeFile && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onChangeFile}
          className="text-primary hover:text-primary-hover hover:bg-primary/10"
        >
          Change File
        </Button>
      )}
    </div>
  );
}
