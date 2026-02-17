import { z } from "zod";

// Enum schemas
export const MappingStatusSchema = z.enum([
  "mapped",
  "required",
  "ignored",
  "unmapped",
]);

export const ImportStepSchema = z.enum([
  "upload",
  "map",
  "validate",
  "import",
]);

export const SystemFieldTypeSchema = z.enum([
  "first_name",
  "last_name",
  "email",
  "user_id",
  "sis_id",
  "phone",
  "date_of_birth",
  "department",
  "role",
  "custom_field_1",
  "custom_field_2",
  "ignore",
]);

// File info schema
export const FileInfoSchema = z.object({
  id: z.string(),
  filename: z.string(),
  size: z.number(), // in bytes
  rowCount: z.number(),
  uploadedAt: z.string().datetime(),
});

// System field option schema
export const SystemFieldOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
  required: z.boolean().default(false),
  description: z.string().optional(),
});

// Column mapping schema
export const ColumnMappingSchema = z.object({
  csvColumn: z.string(),
  sampleValue: z.string().nullable(),
  mappedTo: SystemFieldTypeSchema.nullable(),
  status: MappingStatusSchema,
  isRequired: z.boolean().default(false),
});

// Preview row schema
export const PreviewRowSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  email: z.string().email().nullable(),
  initials: z.string(),
  gradientClass: z.string(), // e.g., "from-blue-400 to-indigo-500"
  fields: z.record(z.string(), z.string().nullable()),
});

// Bulk import mapping response schema
export const BulkImportMappingSchema = z.object({
  importId: z.string(),
  fileInfo: FileInfoSchema,
  currentStep: ImportStepSchema,
  columnMappings: z.array(ColumnMappingSchema),
  previewRows: z.array(PreviewRowSchema),
  systemFields: z.array(SystemFieldOptionSchema),
  requiredFieldsCount: z.number(),
  unmappedRequiredFields: z.array(z.string()),
});

// Update mapping request schema
export const UpdateMappingRequestSchema = z.object({
  csvColumn: z.string(),
  mappedTo: SystemFieldTypeSchema,
});

export const UpdateAllMappingsRequestSchema = z.object({
  mappings: z.array(UpdateMappingRequestSchema),
});

// Type exports
export type MappingStatus = z.infer<typeof MappingStatusSchema>;
export type ImportStep = z.infer<typeof ImportStepSchema>;
export type SystemFieldType = z.infer<typeof SystemFieldTypeSchema>;
export type FileInfo = z.infer<typeof FileInfoSchema>;
export type SystemFieldOption = z.infer<typeof SystemFieldOptionSchema>;
export type ColumnMapping = z.infer<typeof ColumnMappingSchema>;
export type PreviewRow = z.infer<typeof PreviewRowSchema>;
export type BulkImportMapping = z.infer<typeof BulkImportMappingSchema>;
export type UpdateMappingRequest = z.infer<typeof UpdateMappingRequestSchema>;
export type UpdateAllMappingsRequest = z.infer<
  typeof UpdateAllMappingsRequestSchema
>;
