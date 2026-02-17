import { z } from "zod";

// User status enum
export const UserStatusSchema = z.enum(["active", "inactive", "suspended"]);
export type UserStatus = z.infer<typeof UserStatusSchema>;

// User role enum for display
export const UserRoleSchema = z.enum(["admin", "teacher", "student", "employee"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

// Complete user schema for user management
export const UserManagementSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  full_name: z.string().min(1),
  is_active: z.boolean(),
  user_type: z.enum(["student", "employee"]),
  role: UserRoleSchema,
  status: UserStatusSchema,
  avatar_url: z.string().url().optional().nullable(),
  last_login: z.string().datetime().optional().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type UserManagement = z.infer<typeof UserManagementSchema>;

// Paginated response
export const PaginatedUsersSchema = z.object({
  data: z.array(UserManagementSchema),
  total: z.number(),
  page: z.number(),
  per_page: z.number(),
  total_pages: z.number(),
});

export type PaginatedUsers = z.infer<typeof PaginatedUsersSchema>;

// Filter parameters
export const UserFilterParamsSchema = z.object({
  search: z.string().optional(),
  role: UserRoleSchema.optional(),
  status: UserStatusSchema.optional(),
  page: z.number().default(1),
  per_page: z.number().default(10),
});

export type UserFilterParams = z.infer<typeof UserFilterParamsSchema>;

// User count by category
export const UserCountsSchema = z.object({
  all: z.number(),
  employees: z.number(),
  students: z.number(),
});

export type UserCounts = z.infer<typeof UserCountsSchema>;
