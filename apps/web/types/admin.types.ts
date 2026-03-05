/**
 * Admin-specific request/response types.
 *
 * Re-exports shared types from auth.types so consumers only need one import.
 */

export type { UserListItem, Role, Permission } from "@/types/auth.types";

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
  /** Filter by user type: "all" | "student" | "instructor" | "admin" | "super_admin" */
  user_type?: string;
  /** Search by name or email — forwarded as search query to backend */
  search?: string;
}

/** POST /users — backend requires user_type; student/instructor need extra fields. */
export interface CreateUserRequest {
  full_name: string;
  email: string;
  /** "student" | "instructor" | "admin" | "super_admin" */
  user_type: string;
  student_id?: string;
  designation?: string;
}

/** Matches the backend CreateUserResponse DTO. */
export interface CreateUserResponse {
  id: string;
  full_name: string;
  email: string;
  user_type: string;
  is_active: boolean;
  activation_link: string;
  message: string;
}

/**
 * PUT /users/:id — backend accepts user_type and is_active.
 * username / email / full_name are NOT updatable via this endpoint.
 */
export interface UpdateUserRequest {
  user_type?: string;
  is_active?: boolean;
}

/** Matches the backend UpdateUserResponse DTO. */
export interface UpdateUserResponse {
  id: string;
  email: string;
  user_type: string;
  is_active: boolean;
  message: string;
}

// ── Form validation ──────────────────────────────────────────────────────────

export interface FormErrors {
  [field: string]: string | undefined;
}

// ── Bulk Import ──────────────────────────────────────────────────────────────

export interface BulkImportUserRow {
  full_name: string;
  email: string;
  username: string;
  role: string;
  user_type: string;
  department: string;
  faculty: string;
  student_id?: string;
  designation?: string;
}

export interface BulkImportPreviewRow {
  row_index: number;
  data: BulkImportUserRow;
  errors?: string[];
  is_valid: boolean;
}

export interface BulkImportPreviewResponse {
  rows: BulkImportPreviewRow[];
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  column_mapping: Record<string, string>;
}

export interface BulkImportExecuteRequest {
  rows: BulkImportUserRow[];
  column_mapping: Record<string, string>;
}

export interface BulkImportResultRow {
  row_index: number;
  email: string;
  success: boolean;
  error?: string;
}

export interface BulkImportExecuteResponse {
  total_processed: number;
  success_count: number;
  failure_count: number;
  results: BulkImportResultRow[];
}
