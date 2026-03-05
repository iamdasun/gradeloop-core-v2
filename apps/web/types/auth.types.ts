/**
 * Represents the authenticated user as decoded from the IAM JWT.
 *
 * The login endpoint does NOT return a user object — all user data is
 * embedded in the access token's claims (user_id, email, user_type).
 * There is no /users/me profile endpoint.
 */
export interface User {
  id: string; // user_id claim
  email: string;
  full_name: string;
  user_type: string; // 'student', 'instructor', 'admin', or 'super_admin'
}

// ── User type constants ───────────────────────────────────────────────────────

export const USER_TYPES = {
  STUDENT: 'student',
  INSTRUCTOR: 'instructor',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
} as const;

export type UserType = typeof USER_TYPES[keyof typeof USER_TYPES];

// ── Auth endpoint types ───────────────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * The IAM login endpoint returns only the access token in the response body.
 * The refresh token is set as an HttpOnly cookie by the server.
 * There is no `user` field — all user data is embedded in the JWT claims.
 */
export interface LoginResponse {
  access_token: string;
  expires_in: number;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ForgotPasswordResponse {
  message: string;
}

export interface ResetPasswordRequest {
  token: string;
  new_password: string;
}

export interface ResetPasswordResponse {
  message: string;
}

export interface ActivateAccountRequest {
  token: string;
}

export interface ActivateAccountResponse {
  message: string;
  email: string;
}

export interface RefreshTokenResponse {
  access_token: string;
  expires_in: number;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

export interface ChangePasswordResponse {
  message: string;
}

// ── Admin user list types ─────────────────────────────────────────────────────

/** Shape returned by GET /users (requires admin access). */
export interface UserListItem {
  id: string;
  email: string;
  full_name: string;
  user_type: string;
  avatar_url?: string;
  faculty?: string;
  department?: string;
  student_id?: string;
  designation?: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface ApiError {
  message: string;
  status?: number;
  errors?: Record<string, string[]>;
}
