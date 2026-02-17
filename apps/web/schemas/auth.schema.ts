import { z } from "zod";

// Base user schema
export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  full_name: z.string().min(1),
  is_active: z.boolean(),
  user_type: z.enum(["student", "employee"]),
  roles: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      permissions: z.array(z.string()),
    }),
  ),
  password_changed_at: z.string().datetime().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export type User = z.infer<typeof UserSchema>;

// JWT payload schemas
export const AccessTokenPayloadSchema = z.object({
  sub: z.string().uuid(), // user ID
  email: z.string().email(),
  user_type: z.enum(["student", "employee"]),
  roles: z.array(z.string()), // role names
  permissions: z.array(z.string()),
  iat: z.number(),
  exp: z.number(),
  jti: z.string().uuid(), // JWT ID for revocation
  session_id: z.string().uuid(), // for session tracking
  iss: z.string().optional(),
  aud: z.string().optional(),
});

export type AccessTokenPayload = z.infer<typeof AccessTokenPayloadSchema>;

export const RefreshTokenPayloadSchema = z.object({
  sub: z.string().uuid(), // user ID
  session_id: z.string().uuid(),
  token_id: z.string().uuid(), // unique token identifier
  iat: z.number(),
  exp: z.number(),
  jti: z.string().uuid(),
  iss: z.string().optional(),
  aud: z.string().optional(),
});

export type RefreshTokenPayload = z.infer<typeof RefreshTokenPayloadSchema>;

// Auth request/response schemas
export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  device_name: z.string().optional().default("Web Browser"),
  remember_me: z.boolean().optional().default(false),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.object({
  user: UserSchema,
  access_token: z.string(),
  token_type: z.literal("Bearer"),
  expires_in: z.number(), // seconds until access token expires
  session_id: z.string().uuid(),
  is_password_reset_required: z.boolean().optional(),
});

export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const RefreshRequestSchema = z.object({
  device_name: z.string().optional(),
});

export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

export const RefreshResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.literal("Bearer"),
  expires_in: z.number(),
  session_id: z.string().uuid(),
});

export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;

// Session management schemas
export const SessionSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  device_name: z.string(),
  ip_address: z.string().regex(/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/, "Invalid IP address").optional(),
  user_agent: z.string().optional(),
  is_active: z.boolean(),
  last_activity: z.iso.datetime(),
  expires_at: z.iso.datetime(),
  created_at: z.iso.datetime(),
});

export type Session = z.infer<typeof SessionSchema>;

export const RefreshTokenSchema = z.object({
  id: z.uuid(),
  session_id: z.uuid(),
  user_id: z.uuid(),
  token_hash: z.string(),
  expires_at: z.iso.datetime(),
  revoked_at: z.iso.datetime().optional(),
  created_at: z.iso.datetime(),
  last_used_at: z.iso.datetime().optional(),
});

export type RefreshToken = z.infer<typeof RefreshTokenSchema>;

// Password management schemas
export const ChangePasswordRequestSchema = z.object({
  current_password: z.string().min(1),
  new_password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
});

export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

export const ForgotPasswordRequestSchema = z.object({
  email: z.email(),
});

export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>;

export const ResetPasswordRequestSchema = z.object({
  token: z.string().min(1),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
});

export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

// Validation response schemas
export const SessionValidationResponseSchema = z.object({
  valid: z.boolean(),
  user: UserSchema.optional(),
  session: SessionSchema.optional(),
  expires_at: z.iso.datetime().optional(),
});

export type SessionValidationResponse = z.infer<typeof SessionValidationResponseSchema>;

// Logout schemas
export const LogoutRequestSchema = z.object({
  revoke_all_sessions: z.boolean().optional().default(false),
});

export type LogoutRequest = z.infer<typeof LogoutRequestSchema>;

export const LogoutResponseSchema = z.object({
  message: z.string(),
  sessions_revoked: z.number().optional(),
});

export type LogoutResponse = z.infer<typeof LogoutResponseSchema>;

// Error schemas
export const AuthErrorSchema = z.object({
  error: z.string(),
  error_description: z.string(),
  error_code: z.string(),
  timestamp: z.iso.datetime(),
});

export type AuthError = z.infer<typeof AuthErrorSchema>;

// Rate limiting schemas
export const RateLimitInfoSchema = z.object({
  limit: z.number(),
  remaining: z.number(),
  reset: z.number(), // Unix timestamp
  retry_after: z.number().optional(), // seconds
});

export type RateLimitInfo = z.infer<typeof RateLimitInfoSchema>;

// Audit log schemas
export const AuthAuditLogSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid().optional(),
  session_id: z.string().uuid().optional(),
  event_type: z.enum([
    "login_attempt",
    "login_success",
    "login_failure",
    "logout",
    "token_refresh",
    "password_change",
    "password_reset_request",
    "password_reset_complete",
    "session_expired",
    "session_revoked",
    "account_locked",
    "account_unlocked",
  ]),
  ip_address: z.string().regex(/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/, "Invalid IP address").optional(),
  user_agent: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  created_at: z.iso.datetime(),
});

export type AuthAuditLog = z.infer<typeof AuthAuditLogSchema>;

// Device/Session management schemas
export const ActiveSessionSchema = z.object({
  session_id: z.string().uuid(),
  device_name: z.string(),
  ip_address: z.string().regex(/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/, "Invalid IP address").optional(),
  last_activity: z.iso.datetime(),
  created_at: z.iso.datetime(),
  is_current: z.boolean(),
});

export type ActiveSession = z.infer<typeof ActiveSessionSchema>;

export const SessionListResponseSchema = z.object({
  sessions: z.array(ActiveSessionSchema),
  total: z.number(),
});

export type SessionListResponse = z.infer<typeof SessionListResponseSchema>;

// Permission and role schemas
export const PermissionSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().optional(),
  resource: z.string(),
  action: z.string(),
});

export type Permission = z.infer<typeof PermissionSchema>;

export const RoleSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().optional(),
  permissions: z.array(PermissionSchema),
  is_system: z.boolean().optional().default(false),
});

export type Role = z.infer<typeof RoleSchema>;

// Authorization schemas
export const AuthorizationContextSchema = z.object({
  user_id: z.uuid(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
  resource: z.string().optional(),
  action: z.string().optional(),
});

export type AuthorizationContext = z.infer<typeof AuthorizationContextSchema>;

// Cookie configuration schema
export const CookieConfigSchema = z.object({
  name: z.string(),
  secure: z.boolean(),
  httpOnly: z.boolean(),
  sameSite: z.enum(["strict", "lax", "none"]),
  maxAge: z.number(), // seconds
  path: z.string(),
  domain: z.string().optional(),
});

export type CookieConfig = z.infer<typeof CookieConfigSchema>;

// Security configuration
export const SecurityConfigSchema = z.object({
  access_token_ttl: z.number(), // minutes
  refresh_token_ttl: z.number(), // days
  session_timeout: z.number(), // minutes
  max_sessions_per_user: z.number(),
  password_reset_token_ttl: z.number(), // minutes
  account_lockout_attempts: z.number(),
  account_lockout_duration: z.number(), // minutes
  csrf_token_length: z.number(),
  jwt_algorithm: z.enum(["RS256", "HS256"]),
});

export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;

// Client-side auth state schemas
export const ClientAuthStateSchema = z.object({
  isAuthenticated: z.boolean(),
  isLoading: z.boolean(),
  user: UserSchema.nullable(),
  session: SessionSchema.nullable(),
  lastActivity: z.number(),
  expiresAt: z.number().nullable(),
});

export type ClientAuthState = z.infer<typeof ClientAuthStateSchema>;
