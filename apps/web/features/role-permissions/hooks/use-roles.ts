import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getRoleWithPermissions,
  getRoles,
  updateRole,
  updateRolePermissions,
  deleteRole,
} from "../api/roles";
import type { UpdateRole, UpdatePermissions } from "@/schemas/role-permission.schema";
import { toast } from "sonner";

/**
 * Hook to fetch a single role with permissions
 */
export const useRoleWithPermissions = (roleId: string) => {
  return useQuery({
    queryKey: ["role-permissions", roleId],
    queryFn: () => getRoleWithPermissions(roleId),
    enabled: !!roleId,
  });
};

/**
 * Hook to fetch all roles
 */
export const useRoles = () => {
  return useQuery({
    queryKey: ["roles"],
    queryFn: getRoles,
  });
};

/**
 * Hook to update role basic info
 */
export const useUpdateRole = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ roleId, data }: { roleId: string; data: UpdateRole }) =>
      updateRole(roleId, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["role-permissions", data.id] });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      toast.success("Role updated successfully");
    },
    onError: () => {
      toast.error("Failed to update role");
    },
  });
};

/**
 * Hook to update role permissions
 */
export const useUpdateRolePermissions = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdatePermissions) => updateRolePermissions(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["role-permissions", data.id] });
      toast.success("Permissions updated successfully");
    },
    onError: () => {
      toast.error("Failed to update permissions");
    },
  });
};

/**
 * Hook to delete a role
 */
export const useDeleteRole = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      toast.success("Role deleted successfully");
    },
    onError: () => {
      toast.error("Failed to delete role");
    },
  });
};
