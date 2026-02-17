import { api } from "@/lib/api";
import { z } from "zod";
import {
  RoleWithPermissionsSchema,
  RoleListItemSchema,
  UpdateRoleSchema,
  UpdatePermissionsSchema,
  type RoleWithPermissions,
  type RoleListItem,
  type UpdateRole,
  type UpdatePermissions,
} from "@/schemas/role-permission.schema";

/**
 * Fetch a single role with all its permissions
 */
export const getRoleWithPermissions = async (roleId: string): Promise<RoleWithPermissions> => {
  const res = await api.get(`/roles/${roleId}/permissions`);
  return RoleWithPermissionsSchema.parse(res.data);
};

/**
 * Fetch all roles (minimal data)
 */
export const getRoles = async (): Promise<RoleListItem[]> => {
  const res = await api.get("/roles");
  return z.array(RoleListItemSchema).parse(res.data);
};

/**
 * Update role basic info (name, description, status)
 */
export const updateRole = async (roleId: string, data: UpdateRole): Promise<RoleWithPermissions> => {
  const validated = UpdateRoleSchema.parse(data);
  const res = await api.patch(`/roles/${roleId}`, validated);
  return RoleWithPermissionsSchema.parse(res.data);
};

/**
 * Update role permissions
 */
export const updateRolePermissions = async (data: UpdatePermissions): Promise<RoleWithPermissions> => {
  const validated = UpdatePermissionsSchema.parse(data);
  const res = await api.patch(`/roles/${data.role_id}/permissions`, validated);
  return RoleWithPermissionsSchema.parse(res.data);
};

/**
 * Delete a role
 */
export const deleteRole = async (roleId: string): Promise<void> => {
  await api.delete(`/roles/${roleId}`);
};
