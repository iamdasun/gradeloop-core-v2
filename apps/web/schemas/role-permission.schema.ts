import { z } from "zod";

// Permission action types
export const PermissionActionSchema = z.enum(["view", "create", "edit", "delete", "manage"]);
export type PermissionAction = z.infer<typeof PermissionActionSchema>;

// Resource permission
export const ResourcePermissionSchema = z.object({
  resource_id: z.string(),
  resource_name: z.string(),
  resource_description: z.string().optional(),
  actions: z.record(PermissionActionSchema, z.boolean()),
  locked_actions: z.array(PermissionActionSchema).optional(), // Actions that cannot be changed
});

export type ResourcePermission = z.infer<typeof ResourcePermissionSchema>;

// Module with its resources
export const ModulePermissionSchema = z.object({
  module_id: z.string(),
  module_name: z.string(),
  module_icon: z.string().optional(),
  resources: z.array(ResourcePermissionSchema),
});

export type ModulePermission = z.infer<typeof ModulePermissionSchema>;

// Complete role with permissions
export const RoleWithPermissionsSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  is_active: z.boolean(),
  is_system_role: z.boolean().default(false),
  assigned_users_count: z.number().int().min(0),
  modules: z.array(ModulePermissionSchema),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export type RoleWithPermissions = z.infer<typeof RoleWithPermissionsSchema>;

// Role update payload
export const UpdateRoleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  is_active: z.boolean(),
});

export type UpdateRole = z.infer<typeof UpdateRoleSchema>;

// Permission update payload
export const UpdatePermissionsSchema = z.object({
  role_id: z.string().uuid(),
  permissions: z.array(
    z.object({
      module_id: z.string(),
      resource_id: z.string(),
      action: PermissionActionSchema,
      enabled: z.boolean(),
    })
  ),
});

export type UpdatePermissions = z.infer<typeof UpdatePermissionsSchema>;

// Role list item (minimal)
export const RoleListItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().optional(),
  is_active: z.boolean(),
  assigned_users_count: z.number(),
});

export type RoleListItem = z.infer<typeof RoleListItemSchema>;
