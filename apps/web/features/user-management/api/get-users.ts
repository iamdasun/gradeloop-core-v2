import { api } from "@/lib/api";
import { 
  PaginatedUsersSchema, 
  UserFilterParams, 
  UserManagementSchema,
  UserCountsSchema,
  type PaginatedUsers,
  type UserManagement,
  type UserCounts,
} from "@/schemas/user-management.schema";

/**
 * Fetch paginated users with optional filters
 */
export const getUsers = async (params: UserFilterParams): Promise<PaginatedUsers> => {
  const res = await api.get("/users", { params });
  return PaginatedUsersSchema.parse(res.data);
};

/**
 * Fetch a single user by ID
 */
export const getUser = async (id: string): Promise<UserManagement> => {
  const res = await api.get(`/users/${id}`);
  return UserManagementSchema.parse(res.data);
};

/**
 * Get user counts by category (for tabs)
 */
export const getUserCounts = async (): Promise<UserCounts> => {
  const res = await api.get("/users/counts");
  return UserCountsSchema.parse(res.data);
};

/**
 * Delete a user
 */
export const deleteUser = async (id: string): Promise<void> => {
  await api.delete(`/users/${id}`);
};

/**
 * Update user status
 */
export const updateUserStatus = async (
  id: string, 
  status: "active" | "inactive" | "suspended"
): Promise<UserManagement> => {
  const res = await api.patch(`/users/${id}/status`, { status });
  return UserManagementSchema.parse(res.data);
};
