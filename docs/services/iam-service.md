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

### User Management

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/users` | Create new user (admin only) | Yes (`users:write`) |
| POST | `/auth/activate` | Activate account with password | No |

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

### 4. User Logs In
```
POST /auth/login
→ User logs in with their chosen password
→ System detects is_password_reset_required=true
→ Returns 403 "Password reset required"
→ User must change password before accessing system
```

### 5. User Changes Password (First Login)
```
POST /auth/change-password (future endpoint)
→ User sets new password
→ is_password_reset_required=false
→ Full system access granted
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
- **Error Handling**:
  - `ErrInvalidToken` - Token structure or signature invalid
  - `ErrExpiredToken` - Token has expired
  - `ErrInvalidCredentials` - Invalid username or password
  - `ErrUserInactive` - User account is deactivated
  - `ErrPasswordResetRequired` - User must reset password before login
  - `ErrRefreshTokenNotFound` - Refresh token not found in database
  - `ErrRefreshTokenExpired` - Refresh token has expired
  - `ErrRefreshTokenRevoked` - Refresh token was revoked (logout)

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

### User DTOs

Located in `internal/dto/auth.go`:

```go
// Create user request (admin only)
type CreateUserRequest struct {
    Username string `json:"username"`
    Email    string `json:"email"`
    RoleID   string `json:"role_id"`
}

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
