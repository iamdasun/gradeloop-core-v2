/**
 * Admin-specific request/response types.
 *
 * Re-exports shared types from auth.types so consumers only need one import.
 */

export type { UserListItem, Role, Permission } from '@/types/auth.types';

// ── Pagination ───────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  total_pages?: number;
}

// ── Users ────────────────────────────────────────────────────────────────────

/** Query params supported by GET /users. */
export interface ListUsersParams {
  page?: number;
  limit?: number;
  /** Filter by user type: "all" | "student" | "employee" */
  user_type?: string;
}

/** POST /users — backend requires user_type; student/employee need extra fields. */
export interface CreateUserRequest {
  username: string;
  email: string;
  role_id: string;
  /** "student" | "employee" | "all" */
  user_type: string;
  student_id?: string;
  designation?: string;
}

/** Matches the backend CreateUserResponse DTO. */
export interface CreateUserResponse {
  id: string;
  username: string;
  email: string;
  role_id: string;
  is_active: boolean;
  activation_link: string;
  message: string;
}

/**
 * PUT /users/:id — backend only accepts role_id and is_active.
 * username / email / full_name are NOT updatable via this endpoint.
 */
export interface UpdateUserRequest {
  role_id?: string;
  is_active?: boolean;
}

/** Matches the backend UpdateUserResponse DTO. */
export interface UpdateUserResponse {
  id: string;
  username: string;
  email: string;
  role_id: string;
  is_active: boolean;
  message: string;
}

// ── Form validation ──────────────────────────────────────────────────────────

export interface FormErrors {
  [field: string]: string | undefined;
}
