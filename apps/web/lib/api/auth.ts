import { axiosInstance } from './axios';
import type {
  LoginRequest,
  LoginResponse,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  ResetPasswordRequest,
  ResetPasswordResponse,
  RefreshTokenResponse,
} from '@/types/auth.types';

export const authApi = {
  /**
   * Login with username and password.
   * Returns only { access_token, expires_in }.
   * The refresh token is delivered via an HttpOnly cookie.
   */
  login: async (credentials: LoginRequest): Promise<LoginResponse> => {
    const { data } = await axiosInstance.post<LoginResponse>(
      '/auth/login',
      credentials,
    );
    return data;
  },

  /**
   * Logout – revokes the refresh token and clears the cookie.
   */
  logout: async (): Promise<void> => {
    await axiosInstance.post('/auth/logout');
  },

  /**
   * Request a password-reset email.
   */
  forgotPassword: async (
    payload: ForgotPasswordRequest,
  ): Promise<ForgotPasswordResponse> => {
    const { data } = await axiosInstance.post<ForgotPasswordResponse>(
      '/auth/forgot-password',
      payload,
    );
    return data;
  },

  /**
   * Reset password using the token from the email link.
   */
  resetPassword: async (
    payload: ResetPasswordRequest,
  ): Promise<ResetPasswordResponse> => {
    const { data } = await axiosInstance.post<ResetPasswordResponse>(
      '/auth/reset-password',
      payload,
    );
    return data;
  },

  /**
   * Refresh the access token using the refresh-token cookie.
   * Called automatically by the axios interceptor on 401.
   */
  refreshToken: async (): Promise<RefreshTokenResponse> => {
    const { data } = await axiosInstance.post<RefreshTokenResponse>(
      '/auth/refresh',
    );
    return data;
  },

  /**
   * Change the authenticated user's password.
   */
  changePassword: async (payload: {
    current_password: string;
    new_password: string;
  }): Promise<{ message: string }> => {
    const { data } = await axiosInstance.post('/auth/change-password', payload);
    return data;
  },
};
