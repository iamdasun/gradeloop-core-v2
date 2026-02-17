import { api } from "@/lib/api";
import {
  BulkImportMappingSchema,
  type BulkImportMapping,
  type UpdateMappingRequest,
  type UpdateAllMappingsRequest,
} from "@/schemas/bulk-import.schema";

/**
 * Get import mapping configuration for a specific import session
 */
export const getImportMapping = async (
  importId: string
): Promise<BulkImportMapping> => {
  const res = await api.get(`/admin/bulk-import/${importId}/mapping`);
  return BulkImportMappingSchema.parse(res.data);
};

/**
 * Update a single column mapping
 */
export const updateColumnMapping = async (
  importId: string,
  data: UpdateMappingRequest
): Promise<BulkImportMapping> => {
  const res = await api.patch(
    `/admin/bulk-import/${importId}/mapping/column`,
    data
  );
  return BulkImportMappingSchema.parse(res.data);
};

/**
 * Update all column mappings at once
 */
export const updateAllMappings = async (
  importId: string,
  data: UpdateAllMappingsRequest
): Promise<BulkImportMapping> => {
  const res = await api.patch(
    `/admin/bulk-import/${importId}/mapping/batch`,
    data
  );
  return BulkImportMappingSchema.parse(res.data);
};

/**
 * Proceed to validation step
 */
export const proceedToValidation = async (
  importId: string
): Promise<{ success: boolean; validationId: string }> => {
  const res = await api.post(`/admin/bulk-import/${importId}/validate`);
  return res.data;
};
