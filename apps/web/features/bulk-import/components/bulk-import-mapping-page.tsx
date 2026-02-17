"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImportProgressStepper } from "./import-progress-stepper";
import { FileSummaryCard } from "./file-summary-card";
import { MappingTable } from "./mapping-table";
import { DataPreviewSidebar } from "./data-preview-sidebar";
import { MappingTip } from "./mapping-tip";
import {
  useImportMapping,
  useUpdateColumnMapping,
  useProceedToValidation,
} from "../hooks/use-import-mapping";
import type { SystemFieldType } from "@/schemas/bulk-import.schema";

interface BulkImportMappingPageProps {
  importId: string;
}

export function BulkImportMappingPage({
  importId,
}: BulkImportMappingPageProps) {
  const router = useRouter();
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch import mapping data
  const { data: mappingData, isLoading } = useImportMapping(importId);
  const updateMapping = useUpdateColumnMapping(importId);
  const proceedToValidation = useProceedToValidation();

  const handleMappingChange = (csvColumn: string, mappedTo: SystemFieldType) => {
    updateMapping.mutate(
      { csvColumn, mappedTo },
      {
        onSuccess: () => {
          setHasChanges(true);
        },
      }
    );
  };

  const handleChangeFile = () => {
    // Navigate back to upload step
    router.push(`/admin/bulk-import/upload`);
  };

  const handleBack = () => {
    router.push(`/admin/bulk-import/upload`);
  };

  const handleCancel = () => {
    router.push("/admin/users");
  };

  const handleNext = () => {
    proceedToValidation.mutate(importId, {
      onSuccess: () => {
        router.push(`/admin/bulk-import/${importId}/validate`);
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent motion-reduce:animate-[spin_1.5s_linear_infinite]" />
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Loading mapping configuration...
          </p>
        </div>
      </div>
    );
  }

  if (!mappingData) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-slate-500 dark:text-slate-400">
            Import session not found
          </p>
          <Button onClick={handleCancel} className="mt-4">
            Return to Users
          </Button>
        </div>
      </div>
    );
  }

  const canProceed = mappingData.unmappedRequiredFields.length === 0;

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Bulk User Import
        </h1>
        <p className="mt-1 text-slate-500 dark:text-slate-400">
          Import students, teachers, and staff data from your existing systems.
        </p>
      </div>

      {/* Progress Stepper */}
      <ImportProgressStepper currentStep={mappingData.currentStep} />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Mapping Configuration */}
        <div className="lg:col-span-2 space-y-6">
          {/* File Summary */}
          <FileSummaryCard
            fileInfo={mappingData.fileInfo}
            onChangeFile={handleChangeFile}
          />

          {/* Mapping Table */}
          <MappingTable
            mappings={mappingData.columnMappings}
            systemFields={mappingData.systemFields}
            requiredFieldsCount={mappingData.requiredFieldsCount}
            onMappingChange={handleMappingChange}
          />

          {/* Action Bar */}
          <div className="flex justify-end pt-4 space-x-4">
            <Button variant="outline" onClick={handleBack}>
              Back
            </Button>
            <Button variant="ghost" onClick={handleCancel}>
              Cancel
            </Button>
            <Button
              onClick={handleNext}
              disabled={!canProceed || proceedToValidation.isPending}
              className="shadow-md shadow-primary/20"
            >
              {proceedToValidation.isPending ? (
                "Processing..."
              ) : (
                <>
                  Next: Validate
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Right Column: Data Preview */}
        <div className="lg:col-span-1">
          <DataPreviewSidebar
            previewRows={mappingData.previewRows}
            onViewAll={() => {
              // Could open a dialog with all rows
              console.log("View all rows");
            }}
          />
          <MappingTip />
        </div>
      </div>
    </div>
  );
}
