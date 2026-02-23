/**
 * Represents the authenticated user as decoded from the IAM JWT.
 *
 * The login endpoint does NOT return a user object — all user data is
 * embedded in the access token's claims (user_id, username, role_name,
 * permissions).  There is no /users/me profile endpoint.
 */
export interface User {
  id: string;          // user_id claim
  username: string;
  role_name: string;   // single flat role string from JWT
  permissions: string[]; // flat permission names from JWT
}

// ── RBAC helpers ──────────────────────────────────────────────────────────────

/** A role as returned by GET /roles/:id (admin operations). */
export interface Role {
  id: string;
  name: string;
  /** Matches backend RoleResponse.user_type: "student" | "employee" | "all" */
  user_type: string;
  is_system_role?: boolean;
  description?: string;
  permissions?: Permission[];
}

/** A permission as returned by GET /permissions (admin operations). */
export interface Permission {
  id: string;
  name: string;
  description?: string;
}

// ── Auth endpoint types ───────────────────────────────────────────────────────

export interface LoginRequest {
  username: string;
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

/** Shape returned by GET /users (requires users:read permission). */
export interface UserListItem {
  id: string;
  username: string;
  email: string;
  role_id: string;
  role_name: string;
  user_type: string;
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
