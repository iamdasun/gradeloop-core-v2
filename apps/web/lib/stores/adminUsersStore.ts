import { create } from 'zustand';
import type { Role } from '@/types/auth.types';
import { rolesApi } from '@/lib/api/roles';
import { handleApiError } from '@/lib/api/axios';

interface AdminUsersState {
  /** Roles list — fetched once and cached. */
  roles: Role[];
  rolesLoading: boolean;
  rolesError: string | null;

  fetchRoles: () => Promise<void>;
  /** Force a fresh roles fetch (after create/update). */
  refetchRoles: () => Promise<void>;
}

async function loadRoles(
  set: (partial: Partial<AdminUsersState>) => void,
): Promise<void> {
  set({ rolesLoading: true, rolesError: null });
  try {
    const roles = await rolesApi.list();
    set({ roles, rolesLoading: false });
  } catch (err) {
    set({ rolesError: handleApiError(err), rolesLoading: false });
  }
}

export const useAdminUsersStore = create<AdminUsersState>((set, get) => ({
  roles: [],
  rolesLoading: false,
  rolesError: null,

  fetchRoles: async () => {
    if (get().roles.length > 0 || get().rolesLoading) return;
    await loadRoles(set);
  },

  refetchRoles: async () => {
    await loadRoles(set);
  },
}));
