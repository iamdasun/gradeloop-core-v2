import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getImportMapping,
  updateColumnMapping,
  updateAllMappings,
  proceedToValidation,
} from "../api/import-mapping";
import type {
  UpdateMappingRequest,
  UpdateAllMappingsRequest,
} from "@/schemas/bulk-import.schema";
import { toast } from "sonner";

/**
 * Query key factory for import mapping
 */
const importMappingKeys = {
  all: ["import-mapping"] as const,
  detail: (importId: string) => ["import-mapping", importId] as const,
};

/**
 * Hook to fetch import mapping configuration
 */
export const useImportMapping = (importId: string) => {
  return useQuery({
    queryKey: importMappingKeys.detail(importId),
    queryFn: () => getImportMapping(importId),
    enabled: !!importId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

/**
 * Hook to update a single column mapping
 */
export const useUpdateColumnMapping = (importId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateMappingRequest) =>
      updateColumnMapping(importId, data),
    onSuccess: (data) => {
      queryClient.setQueryData(importMappingKeys.detail(importId), data);
      toast.success("Mapping updated successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update mapping: ${error.message}`);
    },
  });
};

/**
 * Hook to update all column mappings
 */
export const useUpdateAllMappings = (importId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateAllMappingsRequest) =>
      updateAllMappings(importId, data),
    onSuccess: (data) => {
      queryClient.setQueryData(importMappingKeys.detail(importId), data);
      toast.success("All mappings saved successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to save mappings: ${error.message}`);
    },
  });
};

/**
 * Hook to proceed to validation step
 */
export const useProceedToValidation = () => {
  return useMutation({
    mutationFn: (importId: string) => proceedToValidation(importId),
    onSuccess: () => {
      toast.success("Proceeding to validation...");
    },
    onError: (error: Error) => {
      toast.error(`Failed to proceed: ${error.message}`);
    },
  });
};
