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
Created from environment variables:
- `SUPER_ADMIN_EMAIL` - Super admin email
- `SUPER_ADMIN_PASSWORD` - Super admin password (hashed with bcrypt)

## API Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/` | Service info | No |
| GET | `/health` | Health check | No |

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
| `SUPER_ADMIN_EMAIL` | Super admin email | - | For seeding |
| `SUPER_ADMIN_PASSWORD` | Super admin password | - | For seeding |

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
   SUPER_ADMIN_EMAIL=superadmin@gradeloop.com
   SUPER_ADMIN_PASSWORD=Admin@1234
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
