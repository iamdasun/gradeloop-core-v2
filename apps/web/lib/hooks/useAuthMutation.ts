'use client';

/**
 * Auth mutation hooks.
 *
 * Lightweight state-machine hooks that wrap authApi calls and drive the
 * Zustand auth store.  No external query library is required.
 */

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api/auth';
import { useAuthStore } from '@/lib/stores/authStore';
import { handleApiError } from '@/lib/api/axios';
import type {
  LoginRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
} from '@/types/auth.types';

interface MutationState {
  isLoading: boolean;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export function useLoginMutation() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [state, setState] = useState<MutationState>({
    isLoading: false,
    error: null,
  });

  const mutate = useCallback(
    async (credentials: LoginRequest) => {
      setState({ isLoading: true, error: null });
      try {
        const data = await authApi.login(credentials);
        // Decode JWT claims – no user object in the login response
        setSession(data.access_token);
        const path = useAuthStore.getState().getRedirectPath();
        router.push(path);
        setState({ isLoading: false, error: null });
      } catch (err) {
        setState({ isLoading: false, error: handleApiError(err) });
      }
    },
    [router, setSession],
  );

  return { ...state, mutate };
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

export function useLogoutMutation() {
  const router = useRouter();
  const clearSession = useAuthStore((s) => s.clearSession);
  const [state, setState] = useState<MutationState>({
    isLoading: false,
    error: null,
  });

  const mutate = useCallback(async () => {
    setState({ isLoading: true, error: null });
    try {
      await authApi.logout();
    } catch {
      // Server-side logout failed; still clear local state so the user
      // cannot continue using a revoked session
    } finally {
      clearSession();
      setState({ isLoading: false, error: null });
      router.push('/login');
    }
  }, [router, clearSession]);

  return { ...state, mutate };
}

// ---------------------------------------------------------------------------
// Forgot password
// ---------------------------------------------------------------------------

export function useForgotPasswordMutation() {
  const [state, setState] = useState<MutationState>({
    isLoading: false,
    error: null,
  });

  const mutate = useCallback(async (payload: ForgotPasswordRequest) => {
    setState({ isLoading: true, error: null });
    try {
      await authApi.forgotPassword(payload);
      setState({ isLoading: false, error: null });
    } catch (err) {
      setState({ isLoading: false, error: handleApiError(err) });
    }
  }, []);

  return { ...state, mutate };
}

// ---------------------------------------------------------------------------
// Reset password
// ---------------------------------------------------------------------------

export function useResetPasswordMutation() {
  const router = useRouter();
  const [state, setState] = useState<MutationState>({
    isLoading: false,
    error: null,
  });

  const mutate = useCallback(
    async (payload: ResetPasswordRequest) => {
      setState({ isLoading: true, error: null });
      try {
        await authApi.resetPassword(payload);
        setState({ isLoading: false, error: null });
        router.push('/login?reset=success');
      } catch (err) {
        setState({ isLoading: false, error: handleApiError(err) });
      }
    },
    [router],
  );

  return { ...state, mutate };
}

// ---------------------------------------------------------------------------
// Change password (authenticated)
// ---------------------------------------------------------------------------

export function useChangePasswordMutation() {
  const [state, setState] = useState<MutationState>({
    isLoading: false,
    error: null,
  });

  const mutate = useCallback(
    async (payload: { current_password: string; new_password: string }) => {
      setState({ isLoading: true, error: null });
      try {
        await authApi.changePassword(payload);
        setState({ isLoading: false, error: null });
      } catch (err) {
        setState({ isLoading: false, error: handleApiError(err) });
      }
    },
    [],
  );

  return { ...state, mutate };
}
