# IAM Service

Identity and Access Management (IAM) service for GradeLoop Core V2. Handles user authentication, authorization, roles, and permissions.

## Tech Stack

- **Framework**: Fiber v3 (Go 1.25.6)
- **Database**: PostgreSQL with GORM ORM
- **Logging**: Zap (structured logging)
- **Architecture**: Clean Architecture
- **Password Hashing**: bcrypt

## Project Structure

```
apps/services/iam-service/
├── cmd/
│   └── main.go                    # Application entrypoint
├── internal/
│   ├── config/                    # Environment configuration
│   ├── domain/                    # Business entities (GORM models)
│   ├── dto/                       # Data Transfer Objects
│   ├── handler/                   # HTTP handlers
│   ├── jwt/                       # JWT authentication utilities
│   ├── middleware/                # Custom middleware
│   ├── repository/                # Data access layer
│   │   └── migrations/            # GORM migrations & seeder
│   ├── router/                    # Route definitions
│   ├── service/                   # Business logic
│   └── utils/                     # Helper functions (errors, logger)
├── pkg/                           # Public packages
├── go.mod
├── Dockerfile
└── README.md
```

## Database Schema

### Tables

#### `users`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() |
| username | VARCHAR(100) | UNIQUE, NOT NULL |
| email | VARCHAR(255) | UNIQUE, NOT NULL |
| password_hash | VARCHAR(255) | NOT NULL |
| role_id | UUID | FK → roles(id) ON DELETE SET NULL |
| is_active | BOOLEAN | DEFAULT true |
| is_password_reset_required | BOOLEAN | DEFAULT false |
| deleted_at | TIMESTAMP | Soft delete |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

**Indexes**: `idx_users_username` (partial), `idx_users_email` (partial), `idx_users_role_id`, `idx_users_deleted_at`

#### `roles`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY |
| name | VARCHAR(100) | UNIQUE, NOT NULL |
| is_system_role | BOOLEAN | DEFAULT false |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |
| deleted_at | TIMESTAMP | Soft delete |

#### `permissions`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY |
| name | VARCHAR(100) | UNIQUE, NOT NULL |
| description | VARCHAR(500) | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |
| deleted_at | TIMESTAMP | Soft delete |

#### `user_profiles_students`
| Column | Type | Constraints |
|--------|------|-------------|
| user_id | UUID | PK, FK → users(id) ON DELETE CASCADE |
| student_id | VARCHAR(50) | UNIQUE, NOT NULL |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

#### `user_profiles_employees`
| Column | Type | Constraints |
|--------|------|-------------|
| user_id | UUID | PK, FK → users(id) ON DELETE CASCADE |
| designation | VARCHAR(100) | NOT NULL |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

#### `role_permissions` (Junction Table)
| Column | Type | Constraints |
|--------|------|-------------|
| role_id | UUID | PK, FK → roles(id) ON DELETE CASCADE |
| permission_id | UUID | PK, FK → permissions(id) ON DELETE CASCADE |
| created_at | TIMESTAMP | |

#### `refresh_tokens`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY |
| user_id | UUID | FK → users(id) ON DELETE CASCADE, INDEX |
| token_hash | VARCHAR(255) | UNIQUE, NOT NULL, INDEX |
| expires_at | TIMESTAMP | NOT NULL, INDEX |
| revoked_at | TIMESTAMP | INDEX |
| created_at | TIMESTAMP | |

### Indexes

```sql
-- Users
CREATE INDEX idx_users_username ON users(username) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_role_id ON users(role_id);
CREATE INDEX idx_users_deleted_at ON users(deleted_at);

-- Student Profiles
CREATE INDEX idx_user_profiles_students_student_id ON user_profiles_students(student_id);

-- Refresh Tokens
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX idx_refresh_tokens_revoked_at ON refresh_tokens(revoked_at);

-- Role Permissions
CREATE INDEX idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission_id ON role_permissions(permission_id);
```

### ON DELETE Rules

| Foreign Key | Action |
|-------------|--------|
| `users.role_id` → `roles.id` | SET NULL |
| `user_profiles_*.user_id` → `users.id` | CASCADE |
| `refresh_tokens.user_id` → `users.id` | CASCADE |
| `role_permissions.role_id` → `roles.id` | CASCADE |
| `role_permissions.permission_id` → `permissions.id` | CASCADE |

## Seed Data

### System Roles
- `super_admin` - Full system access
- `admin` - Administrative access
- `employee` - Staff/Educator access
- `student` - Learner access

### System Permissions
| Permission | Description |
|------------|-------------|
| `users:read` | View user information |
| `users:write` | Create and update users |
| `users:delete` | Delete users |
| `roles:read` | View roles |
| `roles:write` | Create and update roles |
| `roles:delete` | Delete roles |
| `permissions:read` | View permissions |
| `permissions:write` | Manage permissions |
| `students:read` | View student profiles |
| `students:write` | Manage student profiles |
| `employees:read` | View employee profiles |
| `employees:write` | Manage employee profiles |

### Default Super Admin
Created from environment variables at application startup:
- `SUPER_ADMIN_USERNAME` - Super admin username (also used as email)
- `SUPER_ADMIN_PASSWORD` - Super admin password (hashed with bcrypt)

**Security Notes:**
- Super admin user is created only if it doesn't already exist
- Password cannot be a default value (`Admin@1234`, `password`, `changeme`)
- Password is hashed using bcrypt before storage
- Seeder runs automatically on every application startup

## API Endpoints

### Authentication

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/auth/login` | User login with username/password | No |
| POST | `/auth/refresh` | Refresh access token | No |
| POST | `/auth/logout` | Revoke refresh token (logout) | No |
| POST | `/auth/activate` | Activate account with password | No |
| POST | `/auth/change-password` | Change password (authenticated) | Yes |
| POST | `/auth/forgot-password` | Request password reset | No |
| POST | `/auth/reset-password` | Reset password with token | No |

### User Management

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/users` | Create new user (admin only) | Yes (`users:write`) |
| POST | `/auth/activate` | Activate account with password | No |

### Role & Permission Management

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/roles` | List all roles | Yes |
| GET | `/roles/:id` | Get role by ID | Yes |
| POST | `/roles` | Create new role | Yes (`roles:write`) |
| PUT | `/roles/:id` | Update role | Yes (`roles:write`) |
| DELETE | `/roles/:id` | Delete role | Yes (`roles:delete`) |
| POST | `/roles/:id/permissions` | Assign permission to role | Yes (`roles:write`) |
| GET | `/permissions` | List all permissions | Yes |
| POST | `/permissions` | Create new permission | Yes (`permissions:write`) |

### Session Management

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/admin/users/:id/revoke-sessions` | Revoke all user sessions | Yes (`users:write` or `users:delete`) |

### System

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/` | Service info | No |
| GET | `/health` | Health check | No |

---

### POST `/auth/login`

Authenticate user and return token pair.

**Request:**
```json
{
  "username": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Success Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "dGhpcy1pcy1hLXJhbmRvbS0yNTYtYml0LXRva2Vu",
  "expires_in": 900
}
```

**Validation Rules:**
- Username and password are required
- Soft-deleted users are rejected
- Inactive users (`is_active = false`) are rejected
- Users with `is_password_reset_required = true` are denied access

**Error Responses:**

| Status | Code | Message |
|--------|------|---------|
| 400 | - | Invalid request body |
| 401 | - | Invalid username or password |
| 403 | - | User account is inactive |
| 403 | - | Password reset required |

---

### POST `/auth/refresh`

Exchange a valid refresh token for a new access token and refresh token pair.

**Request:**
```json
{
  "refresh_token": "dGhpcy1pcy1hLXJhbmRvbS0yNTYtYml0LXRva2Vu"
}
```

**Success Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "bmV3LXJhbmRvbS0yNTYtYml0LXRva2VuLWhlcmU",
  "expires_in": 900
}
```

**Notes:**
- Old refresh token is revoked automatically (token rotation)
- New refresh token is issued with each request
- User status is re-validated on each refresh

**Error Responses:**

| Status | Code | Message |
|--------|------|---------|
| 400 | - | Invalid request body |
| 401 | - | Invalid or expired refresh token |
| 403 | - | User account is inactive |

---

### POST `/auth/logout`

Revoke a refresh token, effectively logging out the user.

**Request:**
```json
{
  "refresh_token": "dGhpcy1pcy1hLXJhbmRvbS0yNTYtYml0LXRva2Vu"
}
```

**Success Response (200 OK):**
```json
{
  "message": "logged out successfully"
}
```

**Notes:**
- Idempotent: calling with already-revoked token returns success
- Only invalidates the specified refresh token
- Access tokens remain valid until expiration

---

### POST `/users`

Create a new user account. **Requires authentication** and `users:write` permission (ADMIN or SUPER_ADMIN roles).

**Request:**
```json
{
  "username": "newuser@gradeloop.com",
  "email": "newuser@gradeloop.com",
  "role_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Success Response (201 Created):**
```json
{
  "id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "username": "newuser@gradeloop.com",
  "email": "newuser@gradeloop.com",
  "role_id": "550e8400-e29b-41d4-a716-446655440000",
  "is_active": false,
  "activation_link": "/auth/activate?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "message": "User created. Activation link expires at 2026-02-20T10:00:00Z"
}
```

**Behavior:**
- Creates user with inactive status (`is_active = false`)
- Sets `is_password_reset_required = true` (user must change password on first login)
- Generates a signed JWT activation token (24-hour expiry)
- Returns activation link (to be sent via email by the admin)
- User must call `/auth/activate` with their chosen password to activate the account

**Authorization:**
- Requires valid JWT access token in `Authorization: Bearer <token>` header
- Actor must have `users:write` permission (ADMIN or SUPER_ADMIN roles)

**Error Responses:**

| Status | Code | Message |
|--------|------|---------|
| 400 | - | Invalid request body / Role not found |
| 401 | - | Missing or invalid authorization |
| 403 | - | Permission denied (insufficient privileges) |
| 409 | - | Username already exists / Email already exists |

---

## User Lifecycle Flow

### 1. Admin Creates User
```
POST /users (with admin auth token)
→ User created: is_active=false, is_password_reset_required=true
→ Activation token generated (24h expiry)
→ Activation link returned to admin
```

### 2. Admin Sends Activation Link
```
Admin sends email to user with activation link:
https://app.gradeloop.com/auth/activate?token=eyJ...
```

### 3. User Activates Account
```
POST /auth/activate
Body: { "token": "eyJ...", "password": "SecurePass123!" }
→ Token validated (signature + expiry)
→ Password hashed with bcrypt
→ User activated: is_active=true
→ is_password_reset_required=true (kept for security)
```

### 4. User Logs In (First Time)
```
POST /auth/login
→ User logs in with their chosen password
→ System detects is_password_reset_required=true
→ Returns 403 "Password reset required"
→ User must change password before accessing system
```

### 5. User Changes Password (First Login)
```
POST /auth/change-password (with access token)
Body: { "current_password": "...", "new_password": "..." }
→ Current password validated
→ New password validated (strength requirements)
→ Password hashed and updated
→ is_password_reset_required=false
→ All refresh tokens invalidated (security)
→ Full system access granted
```

### 6. Password Reset Flow (Forgot Password)
```
POST /auth/forgot-password
Body: { "email": "user@example.com" }
→ Reset token generated (1h expiry)
→ Reset link sent via email

POST /auth/reset-password
Body: { "token": "...", "new_password": "..." }
→ Token validated (signature + expiry)
→ New password validated and hashed
→ is_password_reset_required=false
→ All refresh tokens invalidated
→ User can login with new password
```

---

### POST `/auth/activate`

Activate a user account using the activation token received after admin creates the account. User must set their password during activation.

**Request:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "password": "MySecurePassword123!"
}
```

**Success Response (200 OK):**
```json
{
  "message": "Account activated successfully. You can now login.",
  "username": "newuser@gradeloop.com"
}
```

**Behavior:**
- Validates the activation token (signature and expiry - 24 hours)
- Validates password (minimum 8 characters)
- Hashes password with bcrypt before storage
- Sets `is_active = true`
- Sets `is_password_reset_required = true` (user marked for password reset on first login)
- Token is single-use (subsequent attempts will fail with "User is already active")

**Password Requirements:**
- Minimum 8 characters
- Will be hashed with bcrypt (cost factor 10) before storage
- User will be prompted to change password on first login (due to `is_password_reset_required = true`)

**Error Responses:**

| Status | Code | Message |
|--------|------|---------|
| 400 | - | Invalid request body |
| 400 | - | Invalid activation token |
| 400 | - | Activation token expired |
| 400 | - | User is already active |
| 404 | - | User not found |

---

### POST `/auth/change-password`

Change the password for an authenticated user. Requires valid access token.

**Authorization:** Requires `Authorization: Bearer <access_token>` header

**Request:**
```json
{
  "current_password": "OldPassword123!",
  "new_password": "NewSecurePassword456!"
}
```

**Success Response (200 OK):**
```json
{
  "message": "Password changed successfully. Please login with your new password."
}
```

**Behavior:**
- Validates current password
- Validates new password strength (see requirements below)
- Ensures new password is different from current password
- Hashes new password with bcrypt
- Sets `is_password_reset_required = false`
- **Invalidates all existing refresh tokens** (user must re-login)

**Password Requirements:**
- Minimum 8 characters
- At least one uppercase letter (A-Z)
- At least one lowercase letter (a-z)
- At least one digit (0-9)
- At least one special character (@$!%*?&#)

**Error Responses:**

| Status | Code | Message |
|--------|------|---------|
| 400 | - | Invalid request body |
| 400 | - | New password must be different from current password |
| 400 | - | Password does not meet security requirements |
| 401 | - | Unauthorized (missing or invalid token) |
| 401 | - | Current password is incorrect |

---

### POST `/auth/forgot-password`

Request a password reset link. Sends reset token to user's email.

**Request:**
```json
{
  "email": "user@gradeloop.com"
}
```

**Success Response (200 OK):**
```json
{
  "message": "If an account exists with this email, a password reset link has been sent."
}
```

**Behavior:**
- Looks up user by email
- Generates cryptographically secure reset token (256-bit)
- Stores hashed token in database with 1-hour expiry
- **Does not reveal if email exists** (security best practice)
- Reset link should be sent via email (currently logged to console)

**Security Notes:**
- Response is identical for existing/non-existing emails (prevents enumeration)
- Reset token is single-use (invalidated after use)
- Reset token expires after 1 hour
- All refresh tokens are invalidated on successful password reset

**Error Responses:**

| Status | Code | Message |
|--------|------|---------|
| 400 | - | Invalid request body |

---

### POST `/auth/reset-password`

Reset password using a token received via email.

**Request:**
```json
{
  "token": "dGhpcy1pcy1hLXJhbmRvbS0yNTYtYml0LXRva2Vu",
  "new_password": "NewSecurePassword456!"
}
```

**Success Response (200 OK):**
```json
{
  "message": "Password reset successfully. You can now login with your new password."
}
```

**Behavior:**
- Validates reset token (signature and 1-hour expiry)
- Validates new password strength
- Hashes new password with bcrypt
- Sets `is_password_reset_required = false`
- Marks reset token as used (single-use)
- **Invalidates all existing refresh tokens**

**Password Requirements:**
- Minimum 8 characters
- At least one uppercase letter (A-Z)
- At least one lowercase letter (a-z)
- At least one digit (0-9)
- At least one special character (@$!%*?&#)

**Error Responses:**

| Status | Code | Message |
|--------|------|---------|
| 400 | - | Invalid request body |
| 400 | - | Invalid password reset token |
| 400 | - | Password reset token has expired |
| 400 | - | Password reset token has already been used |
| 400 | - | Password does not meet security requirements |
| 404 | - | User not found |

---

## Role & Permission Endpoints

### GET `/roles`

List all roles with their associated permissions.

**Success Response (200 OK):**
```json
{
  "roles": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "admin",
      "is_system_role": true,
      "permissions": [
        {
          "id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
          "name": "users:read",
          "description": "View user information"
        }
      ]
    }
  ]
}
```

---

### GET `/roles/:id`

Get a specific role by ID.

**Success Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "admin",
  "is_system_role": true,
  "permissions": [...]
}
```

**Error Responses:**

| Status | Code | Message |
|--------|------|---------|
| 404 | - | Role not found |

---

### POST `/roles`

Create a new role. **Requires `roles:write` permission.**

**Request:**
```json
{
  "name": "custom_role",
  "is_system_role": false,
  "permission_ids": [
    "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    "7cb8c820-9dad-11d1-80b4-00c04fd430c9"
  ]
}
```

**Success Response (201 Created):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "custom_role",
  "is_system_role": false,
  "permissions": [...]
}
```

**Error Responses:**

| Status | Code | Message |
|--------|------|---------|
| 400 | - | Invalid request body |
| 401 | - | Unauthorized |
| 403 | - | Permission denied (requires `roles:write`) |
| 409 | - | Role already exists |

---

### PUT `/roles/:id`

Update an existing role. **Requires `roles:write` permission.**

**Request:**
```json
{
  "name": "updated_role_name",
  "permission_ids": [
    "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
  ]
}
```

**Success Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "updated_role_name",
  "is_system_role": false,
  "permissions": [...]
}
```

**Constraints:**
- **System roles cannot be modified**

**Error Responses:**

| Status | Code | Message |
|--------|------|---------|
| 400 | - | Invalid request body |
| 401 | - | Unauthorized |
| 403 | - | Permission denied / System roles cannot be modified |
| 404 | - | Role not found |

---

### DELETE `/roles/:id`

Delete a role. **Requires `roles:delete` permission.**

**Success Response (200 OK):**
```json
{
  "message": "Role deleted successfully"
}
```

**Constraints:**
- **System roles cannot be deleted**

**Error Responses:**

| Status | Code | Message |
|--------|------|---------|
| 401 | - | Unauthorized |
| 403 | - | Permission denied / System roles cannot be deleted |
| 404 | - | Role not found |

---

### POST `/roles/:id/permissions`

Assign a permission to a role. **Requires `roles:write` permission.**

**Request:**
```json
{
  "permission_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
}
```

**Success Response (200 OK):**
```json
{
  "message": "Permission assigned successfully"
}
```

**Error Responses:**

| Status | Code | Message |
|--------|------|---------|
| 400 | - | Invalid request body / Permission not found |
| 401 | - | Unauthorized |
| 403 | - | Permission denied |
| 404 | - | Role not found |

---

### GET `/permissions`

List all available permissions.

**Success Response (200 OK):**
```json
{
  "permissions": [
    {
      "id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      "name": "users:read",
      "description": "View user information"
    },
    {
      "id": "7cb8c820-9dad-11d1-80b4-00c04fd430c9",
      "name": "users:write",
      "description": "Create and update users"
    }
  ]
}
```

---

### POST `/permissions`

Create a new permission. **Requires `permissions:write` permission.**

**Request:**
```json
{
  "name": "custom:permission",
  "description": "Description of the permission"
}
```

**Success Response (201 Created):**
```json
{
  "id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "name": "custom:permission",
  "description": "Description of the permission"
}
```

**Error Responses:**

| Status | Code | Message |
|--------|------|---------|
| 400 | - | Invalid request body |
| 401 | - | Unauthorized |
| 403 | - | Permission denied (requires `permissions:write`) |
| 409 | - | Permission already exists |

---

## Session Management Endpoints

### POST `/admin/users/:id/revoke-sessions`

Revoke all active sessions for a user. **Requires `users:write` or `users:delete` permission.**

**Request:**
```http
POST /admin/users/550e8400-e29b-41d4-a716-446655440000/revoke-sessions
Authorization: Bearer <access_token>
```

**Success Response (200 OK):**
```json
{
  "message": "Revoked 3 active session(s)"
}
```

**Behavior:**
- Sets `revoked_at` timestamp on all non-revoked refresh tokens for the user
- Returns count of sessions that were revoked
- User will be logged out from all devices
- Existing access tokens remain valid until expiration (15 minutes)
- Refresh tokens cannot be reused after revocation

**Automatic Revocation:**
- **Password change**: All sessions revoked when user changes password
- **Password reset**: All sessions revoked when password is reset via email
- **User soft-delete**: All sessions revoked when user is deleted

**Security Notes:**
- Revoked tokens are checked on every refresh token request
- Revoked tokens cannot be reused
- User must re-authenticate to obtain new tokens

**Error Responses:**

| Status | Code | Message |
|--------|------|---------|
| 400 | - | Invalid user ID format |
| 401 | - | Unauthorized (missing or invalid token) |
| 403 | - | Permission denied (requires `users:write` or `users:delete`) |
| 404 | - | User not found |

## Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `SERVER_PORT` | Server port | `8081` | No |
| `ENABLE_PREFORK` | Enable Fiber prefork mode | `false` | No |
| `DB_HOST` | PostgreSQL host | `localhost` | Yes |
| `DB_PORT` | PostgreSQL port | `5432` | Yes |
| `DB_USER` | PostgreSQL username | `postgres` | Yes |
| `DB_PASSWORD` | PostgreSQL password | - | Yes |
| `DB_NAME` | Database name | `iam_db` | Yes |
| `DB_SSLMODE` | SSL mode (`disable`, `require`, etc.) | `disable` | Yes |
| `SUPER_ADMIN_USERNAME` | Super admin username (also email) | - | For seeding |
| `SUPER_ADMIN_PASSWORD` | Super admin password (no defaults allowed) | - | For seeding |
| `JWT_SECRET_KEY` | JWT signing secret (min 32 chars) | - | Yes |
| `JWT_ACCESS_TOKEN_EXPIRY` | Access token expiry (minutes) | `15` | No |
| `JWT_REFRESH_TOKEN_EXPIRY` | Refresh token expiry (days) | `7` | No |

## Getting Started

### Prerequisites

- Go 1.25.6+
- PostgreSQL 14+
- Docker & Docker Compose (optional)

### Local Development

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Update environment variables:
   ```bash
   DB_HOST=localhost
   DB_PORT=5432
   DB_USER=postgres
   DB_PASSWORD=your_password
   DB_NAME=iam_db
   SUPER_ADMIN_USERNAME=superadmin@gradeloop.com
   SUPER_ADMIN_PASSWORD=YourSecurePassword123!
   ```

3. Install dependencies:
   ```bash
   go mod download
   ```

4. Run the service:
   ```bash
   go run ./cmd/main.go
   ```

### Docker Compose

From project root:
```bash
docker compose up iam-service
```

The service will:
- Connect to PostgreSQL (configured in `.env`)
- Run database migrations automatically
- Seed roles, permissions, and super admin user
- Start on port 8081

## Architecture

### Clean Architecture Layers

```
┌─────────────────────────────────────────┐
│            Handler Layer                │
│  (HTTP handlers, request/response)      │
├─────────────────────────────────────────┤
│            Service Layer                │
│  (Business logic, validation)           │
├─────────────────────────────────────────┤
│          Repository Layer               │
│  (Data access, GORM operations)         │
├─────────────────────────────────────────┤
│            Domain Layer                 │
│  (Entities, business rules)             │
└─────────────────────────────────────────┘
```

### Dependency Injection

```
main.go
  ├── Config (environment)
  ├── Logger (Zap)
  ├── Database (GORM)
  │     ├── Migrator
  │     └── Seeder
  ├── Repository
  ├── Service
  └── Handler
        └── Router
```

## Middleware

### Logger
Logs all HTTP requests with:
- Method, path, status code
- Client IP
- Request latency

### Recovery
Recovers from panics and returns 500 error response.

### AuthMiddleware
Validates JWT access tokens and stores user claims in context locals.

**Usage:**
```go
app.Use(middleware.AuthMiddleware([]byte(cfg.JWT.SecretKey)))
```

**Context Locals:**
- `user_id` - User UUID as string
- `username` - Username string
- `role_name` - Role name string
- `permissions` - Slice of permission strings

### RequirePermission
Checks if the authenticated user has a specific permission.

**Usage:**
```go
app.Get("/admin", middleware.RequirePermission("users:write"), handler.AdminHandler)
```

### RequireRole
Checks if the authenticated user has one of the allowed roles.

**Usage:**
```go
app.Get("/admin", middleware.RequireRole("admin", "super_admin"), handler.AdminHandler)
```

## Error Handling

Centralized error handling with `AppError`:

```go
type AppError struct {
    Code    int    `json:"code"`
    Message string `json:"message"`
    Err     error  `json:"-"`
}
```

Error helpers:
- `ErrNotFound(message)` - 404
- `ErrBadRequest(message)` - 400
- `ErrUnauthorized(message)` - 401
- `ErrInternal(message, err)` - 500

## JWT Authentication

### Token Structure

**Access Token (JWT):**
- Short-lived: 15 minutes (configurable)
- Signed with HMAC-SHA256
- Claims:
  - `user_id` (UUID)
  - `username` (string)
  - `role_name` (string)
  - `permissions` ([]string)
  - `exp` (expiration time)
  - `iat` (issued at)
  - `iss` (issuer: "iam-service")
  - `sub` (subject: user ID)
  - `jti` (JWT ID: unique identifier)

**Refresh Token:**
- Random 256-bit cryptographically secure string
- Stored as SHA-256 hash in database
- Expiry: 7 days (configurable)
- Used to obtain new access tokens

### Utility Functions

Located in `internal/jwt/jwt.go`:

```go
// Generate access token with user claims
func GenerateAccessToken(
    userID uuid.UUID,
    username, roleName string,
    permissions []string,
    secretKey []byte,
    expiry time.Duration,
) (string, time.Time, error)

// Generate cryptographically secure refresh token
func GenerateRefreshToken() (string, error)

// Validate and parse access token
func ValidateAccessToken(
    tokenString string,
    secretKey []byte,
) (*Claims, error)

// Hash refresh token for storage
func HashToken(token string) string
```

### Activation Token

For user account activation, a separate JWT token type is used:

```go
// Generate activation token (24-hour expiry)
func GenerateActivationToken(
    userID uuid.UUID,
    username, email string,
    secretKey []byte,
    expiry time.Duration,
) (string, time.Time, error)

// Validate activation token
func ValidateActivationToken(
    tokenString string,
    secretKey []byte,
) (*ActivationClaims, error)
```

**Activation Claims:**
- `user_id` (UUID)
- `username` (string)
- `email` (string)
- `exp` (expiration time - 24 hours from issuance)
- `iat` (issued at)
- `iss` (issuer: "iam-service")
- `sub` (subject: user ID)
- `jti` (JWT ID: unique identifier)

### JWT Manager

```go
// Create new JWT manager with configuration
jwt := jwt.NewJWT(secretKey, accessTokenExpiryMinutes, refreshTokenExpiryDays)

// Generate token pair (access + refresh)
tokenPair, err := jwt.GenerateTokenPair(userID, username, roleName, permissions)

// Validate token
claims, err := jwt.ValidateToken(tokenString)

// Get refresh token expiry
expiresAt := jwt.GetRefreshTokenExpiry()
```

### Token Response

```go
type TokenPair struct {
    AccessToken  string    // JWT access token
    RefreshToken string    // Plain refresh token (store client-side)
    ExpiresAt    time.Time // Access token expiration
}
```

### Security Features

- **Secret Key**: Loaded from `JWT_SECRET_KEY` environment variable (min 32 characters recommended)
- **Signing Method**: HMAC-SHA256 (`HS256`)
- **Token Validation**: Verifies signature, expiration, and claims structure
- **Refresh Token Storage**: Always stored as SHA-256 hash in database
- **Token Rotation**: New refresh token issued on each refresh request
- **Password Hashing**: bcrypt with cost factor 10
- **Password Strength**: Enforced on change/reset (8+ chars, uppercase, lowercase, digit, special char)
- **Reset Token Security**: Single-use, 1-hour expiry, hashed storage
- **Session Invalidation**:
  - All refresh tokens revoked on password change
  - All refresh tokens revoked on password reset
  - All refresh tokens revoked on user soft-delete
  - Admin endpoint to revoke user sessions (`/admin/users/:id/revoke-sessions`)
- **Revoked Token Enforcement**: Revoked tokens checked on every refresh request, cannot be reused
- **Error Handling**:
  - `ErrInvalidToken` - Token structure or signature invalid
  - `ErrExpiredToken` - Token has expired
  - `ErrInvalidCredentials` - Invalid username or password
  - `ErrUserInactive` - User account is deactivated
  - `ErrPasswordResetRequired` - User must reset password before login
  - `ErrRefreshTokenNotFound` - Refresh token not found in database
  - `ErrRefreshTokenExpired` - Refresh token has expired
  - `ErrRefreshTokenRevoked` - Refresh token was revoked (logout)
  - `ErrCurrentPasswordInvalid` - Current password is incorrect
  - `ErrNewPasswordSameAsOld` - New password same as current password
  - `ErrPasswordTooWeak` - Password does not meet strength requirements
  - `ErrPasswordResetTokenInvalid` - Reset token is invalid
  - `ErrPasswordResetTokenExpired` - Reset token has expired
  - `ErrPasswordResetTokenUsed` - Reset token already used

### Authentication Service

Located in `internal/service/auth.go`:

```go
// Authenticate user and return token pair
func (s *authService) Login(
    ctx context.Context,
    username, password string,
) (*dto.LoginResponse, error)

// Exchange refresh token for new token pair
func (s *authService) RefreshToken(
    ctx context.Context,
    refreshToken string,
) (*dto.RefreshTokenResponse, error)

// Revoke refresh token (logout)
func (s *authService) Logout(
    ctx context.Context,
    refreshToken string,
) error
```

### User Service

Located in `internal/service/user.go`:

```go
// Create user (admin only, requires users:write permission)
// Creates inactive user with activation token
func (s *userService) CreateUser(
    ctx context.Context,
    req *dto.CreateUserRequest,
    actorPermissions []string,
) (*dto.CreateUserResponse, error)

// Activate user account with token and password
// Validates token, hashes password, activates user
func (s *userService) ActivateUser(
    ctx context.Context,
    token, password string,
) (*dto.ActivateUserResponse, error)
```

### Password Service

Located in `internal/service/password.go`:

```go
// Change password for authenticated user
// Validates current password, enforces strength requirements,
// invalidates all refresh tokens
func (s *passwordService) ChangePassword(
    ctx context.Context,
    userID uuid.UUID,
    currentPassword, newPassword string,
) (*dto.ChangePasswordResponse, error)

// Request password reset (forgot password)
// Generates reset token, sends email (simulated)
func (s *passwordService) ForgotPassword(
    ctx context.Context,
    email string,
) (*dto.ForgotPasswordResponse, error)

// Reset password with token
// Validates token, enforces strength, invalidates refresh tokens
func (s *passwordService) ResetPassword(
    ctx context.Context,
    token, newPassword string,
) (*dto.ResetPasswordResponse, error)
```

### Password DTOs

Located in `internal/dto/auth.go`:

```go
// Change password request (authenticated)
type ChangePasswordRequest struct {
    CurrentPassword string `json:"current_password"`
    NewPassword     string `json:"new_password"`  // min 8 chars, strength required
}

// Forgot password request
type ForgotPasswordRequest struct {
    Email string `json:"email"`
}

// Reset password request
type ResetPasswordRequest struct {
    Token       string `json:"token"`
    NewPassword string `json:"new_password"`  // min 8 chars, strength required
}
```

// Create user response
type CreateUserResponse struct {
    ID             uuid.UUID `json:"id"`
    Username       string    `json:"username"`
    Email          string    `json:"email"`
    RoleID         uuid.UUID `json:"role_id"`
    IsActive       bool      `json:"is_active"`
    ActivationLink string    `json:"activation_link"`
    Message        string    `json:"message"`
}

// Activate user request
type ActivateUserRequest struct {
    Token    string `json:"token"`
    Password string `json:"password"`  // min 8 characters
}

// Activate user response
type ActivateUserResponse struct {
    Message  string `json:"message"`
    Username string `json:"username"`
}
```

```go
// Login response
type LoginResponse struct {
    AccessToken  string `json:"access_token"`
    RefreshToken string `json:"refresh_token"`
    ExpiresIn    int64  `json:"expires_in"` // seconds
}

// Refresh token request
type RefreshTokenRequest struct {
    RefreshToken string `json:"refresh_token"`
}

// Refresh token response
type RefreshTokenResponse struct {
    AccessToken  string `json:"access_token"`
    RefreshToken string `json:"refresh_token"`
    ExpiresIn    int64  `json:"expires_in"` // seconds
}
```

## Migrations

Migrations run automatically on startup via GORM AutoMigrate:

```go
migrator := migrations.NewMigrator(db.DB, logger)
if err := migrator.Run(); err != nil {
    return fmt.Errorf("running migrations: %w", err)
}
```

### Rollback (Development Only)

```go
migrator := migrations.NewMigrator(db.DB, logger)
if err := migrator.Rollback(); err != nil {
    return fmt.Errorf("rollback: %w", err)
}
```

## Security

- **Password Hashing**: bcrypt (cost factor 10)
- **Soft Deletes**: All tables support soft delete via `deleted_at`
- **UUID Primary Keys**: Prevents ID enumeration attacks
- **Token Hashing**: Refresh tokens stored as hashes

## Testing

```bash
# Run tests
go test ./...

# Run tests with coverage
go test -cover ./...

# Build
go build -o ./bin/iam-service ./cmd/main.go
```

## Health Check

```bash
curl http://localhost:8081/health
# Response: {"status": "ok"}
```

## Service Info

```bash
curl http://localhost:8081/
# Response: {
#   "service": "iam-service",
#   "version": "1.0.0",
#   "status": "running"
# }
```

---

## Frontend-to-Backend Integration

This section documents how the Next.js frontend (`apps/web`) integrates with the IAM service, covering the token strategy, cookie flow, and how to test the password-reset flow locally.

### Token Strategy

| Token | Where stored | Lifetime | How sent to backend |
|-------|-------------|----------|---------------------|
| `access_token` (JWT) | **In-memory** only — Zustand `auth-store` | 15 min (configurable) | `Authorization: Bearer <token>` header, attached by the Axios request interceptor |
| `refresh_token` (opaque string) | **HttpOnly Secure cookie** set by the backend | 7 days (configurable) | Sent automatically by the browser on every `withCredentials: true` request to the same origin |

> **Why in-memory for the access token?**  
> Storing JWTs in `localStorage` exposes them to XSS attacks. Keeping them only in JavaScript memory means they are never accessible to third-party scripts and are automatically discarded on tab close.

---

### Axios Client (`lib/api/client.ts`)

The shared Axios instance is configured with:

```ts
axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1",
  withCredentials: true,   // sends the HttpOnly refresh_token cookie on every call
});
```

**Request interceptor** — attaches the in-memory access token:
```ts
config.headers.Authorization = `Bearer ${accessToken}`;
```

**Response interceptor** — handles 401s automatically:
1. Marks the request with `_retry = true` (prevents infinite loops).
2. Calls `POST /api/v1/auth/refresh` — the browser sends the cookie automatically.
3. Stores the new `access_token` in Zustand, then retries the original request.
4. If the refresh call also returns 401, clears the Zustand store and redirects to `/auth/login`.

Concurrent 401s are queued and all resolved (or rejected) once the single refresh call completes.

---

### Refresh Token Cookie Flow

```
Browser                          IAM Service
  │                                   │
  │── POST /auth/login ───────────────►│
  │   { username, password }           │  validates credentials
  │                                   │
  │◄── 200 OK ────────────────────────│
  │   body: { access_token, expires_in}│
  │   Set-Cookie: refresh_token=...    │  HttpOnly; Secure; SameSite=Lax; Path=/
  │                                   │
  │   (store access_token in memory)  │
  │                                   │
  │── GET /api/v1/users (with Bearer) ─►│  works fine while access_token is valid
  │                                   │
  │── (access_token expires) ─────────►│  returns 401
  │                                   │
  │   [interceptor fires]             │
  │── POST /auth/refresh ─────────────►│
  │   Cookie: refresh_token=... ←──── │  browser sends cookie automatically
  │                                   │  validates refresh token, issues new pair
  │◄── 200 OK ────────────────────────│
  │   body: { access_token }           │
  │   Set-Cookie: refresh_token=...    │  rotated — old token is now revoked
  │                                   │
  │   [interceptor retries original]  │
  │── GET /api/v1/users (new Bearer) ──►│  succeeds
```

---

### Auth Store Actions (`store/auth-store.ts`)

| Action | Description |
|--------|-------------|
| `login(username, password)` | Calls `POST /auth/login`, stores `access_token` in memory, decodes JWT claims into `user` |
| `logout()` | Calls `POST /auth/logout` (backend revokes refresh token and clears cookie), then wipes Zustand state |
| `refresh()` | Calls `POST /auth/refresh` (cookie-driven), updates in-memory `access_token`, returns new token or `null` |
| `changePassword(current, new)` | Calls `POST /auth/change-password` (requires Bearer token). Backend revokes all sessions. |
| `forgotPassword(email)` | Calls `POST /auth/forgot-password`. Always returns 200 (anti-enumeration). |
| `resetPassword(token, newPassword)` | Calls `POST /auth/reset-password` with `{ token, new_password }`. Token comes from URL query param. |
| `setUserFromToken(token)` | Decodes a JWT and hydrates the Zustand `user` object without a network call |

---

### Auth Pages (`app/auth/`)

All auth pages live under `app/auth/` and share the two-panel layout defined in `app/auth/layout.tsx`:

| Route | File | Description |
|-------|------|-------------|
| `/auth/login` | `app/auth/login/page.tsx` | Email + password form. Handles 401 (bad credentials) and 429 (rate-limited) errors distinctly. |
| `/auth/forgot-password` | `app/auth/forgot-password/page.tsx` | Email entry form. Calls `POST /auth/forgot-password`. Shows confirmation state after submit. |
| `/auth/reset-password?token=...` | `app/auth/reset-password/page.tsx` | New password + confirm fields. Extracts `token` from URL query via `useSearchParams` (wrapped in `<Suspense>`). |

---

### Testing the Reset Password Flow Locally

**Prerequisites:** IAM service running on `http://localhost:8000`, frontend on `http://localhost:3000`.

**Step 1 — Request a reset link**

```bash
curl -X POST http://localhost:8000/api/v1/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'
# → 200 {"message": "If an account exists ..."}
```

**Step 2 — Get the raw token from IAM service logs**

The IAM service currently logs the reset token to the console (email sending is not yet wired). Look for a line similar to:

```
[IAM] Password reset token for user@example.com: <TOKEN>
```

**Step 3 — Open the reset page in the browser**

```
http://localhost:3000/auth/reset-password?token=<TOKEN>
```

The page reads the `token` query parameter, fills the form, and calls `POST /auth/reset-password` with `{ token, new_password }` on submit.

**Step 4 — Verify via curl**

```bash
curl -X POST http://localhost:8000/api/v1/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token": "<TOKEN>", "new_password": "NewSecure@123"}'
# → 200 {"message": "Password reset successfully..."}
```

**Step 5 — Login with new password**

```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"username": "user@example.com", "password": "NewSecure@123"}'
# → 200 {"access_token": "eyJ...", "expires_in": 900}
# The refresh_token is stored in cookies.txt (HttpOnly cookie)
```

---

### Local CORS & Cookie Notes

When running frontend and backend on different ports locally (e.g. `:3000` and `:8000`), cookies are **cross-origin**. Ensure:

1. **IAM CORS config** (`cmd/main.go`) includes `http://localhost:3000` in `AllowOrigins` and has `AllowCredentials: true`.
2. **Cookie `Secure` flag** — Set `JWT_COOKIE_SECURE=false` in your local `.env` since `localhost` does not use HTTPS.
3. **Cookie `SameSite`** — `JWT_COOKIE_SAMESITE=Lax` is appropriate for localhost development.
4. **Axios `withCredentials: true`** — Already configured in `lib/api/client.ts`. This is what instructs the browser to send the cookie cross-origin.
5. **`NEXT_PUBLIC_API_URL`** — Set this to `http://localhost:8000/api/v1` in `apps/web/.env.local`.

Sample `apps/web/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

Sample IAM `.env` fragment:
```env
JWT_COOKIE_SECURE=false
JWT_COOKIE_SAMESITE=Lax
FRONTEND_URL=http://localhost:3000
```
