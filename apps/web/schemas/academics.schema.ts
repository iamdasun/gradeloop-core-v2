import { z } from "zod";

export const FacultySchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string().optional(),
  status: z.enum(["active", "inactive", "archived"]).optional(),
  leaderIds: z.array(z.string()).optional(),
});

export type Faculty = z.infer<typeof FacultySchema>;

export const BatchSchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
});

export type Batch = z.infer<typeof BatchSchema>;
