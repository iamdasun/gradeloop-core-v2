import { axiosInstance, handleApiError } from "./axios";
import type { UserListItem } from "@/types/auth.types";
import type {
  PaginatedResponse,
  ListUsersParams,
  CreateUserRequest,
  UpdateUserRequest,
  CreateUserResponse,
  UpdateUserResponse,
} from "@/types/admin.types";

export type PaginatedUsers = PaginatedResponse<UserListItem>;

export interface UserActivityLog {
  id: string;
  user_id: string;
  action: string;
  description: string;
  entity_type?: string;
  entity_id?: string;
  metadata?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export interface UserActivityResponse {
  data: UserActivityLog[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Normalises the backend response which may return:
 *   - a plain array
 *   - { data: [], total, page, limit }
 *   - { users: [], meta: { total, page, limit } }
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizePaginated(raw: any, params: ListUsersParams): PaginatedUsers {
  if (Array.isArray(raw)) {
    return {
      data: raw as UserListItem[],
      total: raw.length,
      page: params.page ?? 1,
      limit: params.limit ?? raw.length,
    };
  }
  if (Array.isArray(raw?.data)) return raw as PaginatedUsers;
  if (Array.isArray(raw?.users)) {
    return {
      data: raw.users as UserListItem[],
      // backend sends total_count at top level, not nested under meta
      total: raw.total_count ?? raw.users.length,
      page: raw.page ?? 1,
      limit: raw.limit ?? raw.users.length,
    };
  }
  return raw as PaginatedUsers;
}

export const usersApi = {
  /** GET /users?page=1&limit=20 — backend supports page, limit, user_type only */
  list: async (params: ListUsersParams = {}): Promise<PaginatedUsers> => {
    const cleanParams: Record<string, unknown> = {};
    if (params.page !== undefined) cleanParams.page = params.page;
    if (params.limit !== undefined) cleanParams.limit = params.limit;
    if (params.user_type) cleanParams.user_type = params.user_type;
    if (params.role_id) cleanParams.role_id = params.role_id;
    if (params.search) cleanParams.search = params.search;

    const { data } = await axiosInstance.get("/users", { params: cleanParams });
    return normalizePaginated(data, params);
  },

  /** GET /users/:id */
  get: async (id: string): Promise<UserListItem> => {
    const { data } = await axiosInstance.get<UserListItem>(`/users/${id}`);
    return data;
  },

  /** POST /users */
  create: async (payload: CreateUserRequest): Promise<CreateUserResponse> => {
    const { data } = await axiosInstance.post<CreateUserResponse>(
      "/users",
      payload,
    );
    return data;
  },

  /** PUT /users/:id — accepts role_id and is_active only */
  update: async (
    id: string,
    payload: UpdateUserRequest,
  ): Promise<UpdateUserResponse> => {
    const { data } = await axiosInstance.put<UpdateUserResponse>(
      `/users/${id}`,
      payload,
    );
    return data;
  },

  /** DELETE /users/:id */
  delete: async (id: string): Promise<void> => {
    await axiosInstance.delete(`/users/${id}`);
  },

  /** POST /admin/users/:id/revoke-sessions */
  revokeSessions: async (id: string): Promise<void> => {
    await axiosInstance.post(`/admin/users/${id}/revoke-sessions`);
  },

  /** GET /users/import/template */
  importTemplate: async (format: "csv" | "xlsx"): Promise<void> => {
    const { data } = await axiosInstance.get("/users/import/template", {
      params: { format },
      responseType: "blob",
    });
    const url = window.URL.createObjectURL(new Blob([data]));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `user_import_template.${format}`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  },

  /** POST /users/import/preview */
  importPreview: async (file: File): Promise<any> => {
    const formData = new FormData();
    formData.append("file", file);
    const { data } = await axiosInstance.post(
      "/users/import/preview",
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
      },
    );
    return data;
  },

  /** POST /users/import/execute */
  importExecute: async (
    file: File,
    mapping: Record<string, string>,
  ): Promise<any> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("column_mapping", JSON.stringify(mapping));
    const { data } = await axiosInstance.post(
      "/users/import/execute",
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
      },
    );
    return data;
  },

  /** GET /admin/users/:id/activity — Fetch user activity/audit logs */
  getActivity: async (
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<UserActivityResponse> => {
    const { data } = await axiosInstance.get(
      `/admin/users/${userId}/activity`,
      {
        params: { page, limit },
      },
    );
    return {
      data: data.data || data.activities || [],
      total: data.total || data.total_count || 0,
      page: data.page || 1,
      limit: data.limit || limit,
    };
  },
};

export { handleApiError };
