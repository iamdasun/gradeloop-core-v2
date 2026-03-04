import { axiosInstance } from './axios';
import type { Role, Permission } from '@/types/auth.types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeArray<T>(raw: any): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (Array.isArray(raw?.data)) return raw.data as T[];
  // GET /roles returns { roles: [] }
  if (Array.isArray(raw?.roles)) return raw.roles as T[];
  return [];
}

export const rolesApi = {
  /** GET /roles */
  list: async (): Promise<Role[]> => {
    const { data } = await axiosInstance.get('/roles');
    return normalizeArray<Role>(data);
  },

  /** GET /roles/:id */
  get: async (id: string): Promise<Role> => {
    const { data } = await axiosInstance.get<Role>(`/roles/${id}`);
    return data;
  },

  /** POST /roles */
  create: async (payload: { name: string; description?: string; base_role_id?: string; permissions?: string[] }): Promise<Role> => {
    const { data } = await axiosInstance.post<Role>('/roles', payload);
    return data;
  },

  /** PUT /roles/:id or PATCH */
  update: async (id: string, payload: { name?: string; description?: string; permissions?: string[] }): Promise<Role> => {
    const { data } = await axiosInstance.put<Role>(`/roles/${id}`, payload);
    return data;
  },
};

export const permissionsApi = {
  /** GET /permissions */
  list: async (): Promise<Permission[]> => {
    const { data } = await axiosInstance.get('/permissions');
    return normalizeArray<Permission>(data);
  },
};
