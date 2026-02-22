# Faculty Management Feature Documentation

## Overview

The Faculty Management feature allows Super Admins to create, update, and deactivate faculties within the Academic Service. Each faculty must have one or more leadership users (e.g., Dean, Pro-Vice Chancellor) assigned to it.

## Architecture

This implementation follows **Clean Architecture** principles with clear separation of concerns:

```
internal/
├── domain/          # Business entities and models
├── dto/             # Data Transfer Objects for API requests/responses
├── repository/      # Data access layer
├── service/         # Business logic layer
├── handler/         # HTTP request handlers
├── client/          # External service clients (audit logging)
└── middleware/      # Authentication and authorization
```

## Database Schema

### Table: `faculties`

| Column       | Type         | Constraints                    | Description                      |
|--------------|--------------|--------------------------------|----------------------------------|
| id           | UUID         | PRIMARY KEY                    | Unique identifier                |
| name         | VARCHAR(255) | NOT NULL                       | Faculty name                     |
| code         | VARCHAR(50)  | UNIQUE, NOT NULL               | Faculty code (e.g., "FOC")       |
| description  | TEXT         |                                | Faculty description              |
| is_active    | BOOLEAN      | DEFAULT true                   | Active status                    |
| created_at   | TIMESTAMP    |                                | Creation timestamp               |
| updated_at   | TIMESTAMP    |                                | Last update timestamp            |
| deleted_at   | TIMESTAMP    | NULL                           | Soft delete timestamp            |

**Indexes:**
- Primary Key: `id`
- Unique Index: `code`
- Index: `deleted_at`

### Table: `faculty_leadership`

| Column       | Type         | Constraints                    | Description                      |
|--------------|--------------|--------------------------------|----------------------------------|
| faculty_id   | UUID         | PRIMARY KEY, FOREIGN KEY       | References faculties(id)         |
| user_id      | UUID         | PRIMARY KEY                    | User ID from IAM service         |
| role         | VARCHAR(100) | NOT NULL                       | Leadership role                  |
| is_active    | BOOLEAN      | DEFAULT true                   | Active status                    |
| created_at   | TIMESTAMP    |                                | Creation timestamp               |
| updated_at   | TIMESTAMP    |                                | Last update timestamp            |
| deleted_at   | TIMESTAMP    | NULL                           | Soft delete timestamp            |

**Composite Primary Key:** `(faculty_id, user_id)`

**Foreign Keys:**
- `faculty_id` → `faculties(id)` with CASCADE on delete

**Notes:**
- `user_id` references IAM service users table logically (no DB-level FK)
- Multiple leaders are allowed per faculty
- Common role examples: "Dean", "Pro-Vice Chancellor", "Academic Panel Member"

## API Endpoints

All endpoints require authentication and **Super Admin** role.

### Base URL
```
/api/v1/faculties
```

### 1. Create Faculty

**Endpoint:** `POST /faculties`

**Authorization:** Bearer Token (Super Admin only)

**Request Body:**
```json
{
  "name": "Faculty of Computing",
  "code": "FOC",
  "description": "The Faculty of Computing offers undergraduate and postgraduate programs",
  "leaders": [
    {
      "user_id": "550e8400-e29b-41d4-a716-446655440001",
      "role": "Dean"
    },
    {
      "user_id": "550e8400-e29b-41d4-a716-446655440002",
      "role": "Pro-Vice Chancellor"
    }
  ]
}
```

**Validation Rules:**
- `name`: Required, 3-255 characters
- `code`: Required, 2-50 characters, must be unique
- `description`: Optional
- `leaders`: Required, must have at least 1 leader
  - `user_id`: Required, valid UUID
  - `role`: Required, 3-100 characters

**Success Response:** `201 Created`
```json
{
  "id": "7f3e8400-e29b-41d4-a716-446655440003",
  "name": "Faculty of Computing",
  "code": "FOC",
  "description": "The Faculty of Computing offers undergraduate and postgraduate programs",
  "is_active": true,
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z",
  "leaders": [
    {
      "faculty_id": "7f3e8400-e29b-41d4-a716-446655440003",
      "user_id": "550e8400-e29b-41d4-a716-446655440001",
      "role": "Dean",
      "is_active": true,
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

**Error Responses:**
- `400 Bad Request`: Validation error
  ```json
  {
    "code": 400,
    "message": "faculty must have at least one leader"
  }
  ```
- `409 Conflict`: Duplicate code
  ```json
  {
    "code": 409,
    "message": "faculty with this code already exists"
  }
  ```
- `403 Forbidden`: Insufficient permissions

### 2. List Faculties

**Endpoint:** `GET /faculties`

**Query Parameters:**
- `include_inactive` (boolean, optional): Include inactive faculties. Default: `false`

**Example:**
```
GET /faculties?include_inactive=false
```

**Success Response:** `200 OK`
```json
{
  "faculties": [
    {
      "id": "7f3e8400-e29b-41d4-a716-446655440003",
      "name": "Faculty of Computing",
      "code": "FOC",
      "description": "Computing Faculty",
      "is_active": true,
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z",
      "leaders": [...]
    }
  ],
  "count": 1
}
```

**Behavior:**
- By default, only returns active faculties (`is_active = true`)
- Soft-deleted faculties (`deleted_at IS NOT NULL`) are always excluded
- Set `include_inactive=true` to include inactive faculties

### 3. Get Faculty by ID

**Endpoint:** `GET /faculties/:id`

**Success Response:** `200 OK`
```json
{
  "id": "7f3e8400-e29b-41d4-a716-446655440003",
  "name": "Faculty of Computing",
  "code": "FOC",
  "description": "Computing Faculty",
  "is_active": true,
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z",
  "leaders": [
    {
      "faculty_id": "7f3e8400-e29b-41d4-a716-446655440003",
      "user_id": "550e8400-e29b-41d4-a716-446655440001",
      "role": "Dean",
      "is_active": true,
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

**Error Response:**
- `404 Not Found`: Faculty does not exist
- `400 Bad Request`: Invalid UUID format

### 4. Update Faculty

**Endpoint:** `PUT /faculties/:id`

**Request Body:**
```json
{
  "name": "Faculty of Computing and Information Technology",
  "description": "Updated description",
  "leaders": [
    {
      "user_id": "550e8400-e29b-41d4-a716-446655440001",
      "role": "Dean"
    },
    {
      "user_id": "550e8400-e29b-41d4-a716-446655440003",
      "role": "Deputy Dean"
    }
  ],
  "is_active": true
}
```

**Validation Rules:**
- All fields are optional
- If `name` is provided: 3-255 characters
- If `leaders` is provided:
  - Must have at least 1 leader
  - Replaces all existing leaders
  - Each leader validated same as create

**Success Response:** `200 OK`
```json
{
  "id": "7f3e8400-e29b-41d4-a716-446655440003",
  "name": "Faculty of Computing and Information Technology",
  "code": "FOC",
  "description": "Updated description",
  "is_active": true,
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T11:45:00Z",
  "leaders": [...]
}
```

**Important Notes:**
- Providing `leaders` will **replace** all existing leaders
- To keep existing leaders, omit the `leaders` field
- Cannot update `code` (immutable after creation)

**Error Responses:**
- `400 Bad Request`: Validation error
- `404 Not Found`: Faculty does not exist

### 5. Deactivate Faculty

**Endpoint:** `PATCH /faculties/:id/deactivate`

**Request Body:**
```json
{
  "is_active": false
}
```

**Success Response:** `200 OK`
```json
{
  "message": "faculty deactivated successfully"
}
```

**Behavior:**
- Sets `is_active` to `false`
- Leadership records remain intact
- Faculty will not appear in default list (unless `include_inactive=true`)
- Does **not** soft delete the faculty

**Error Response:**
- `404 Not Found`: Faculty does not exist

### 6. Get Faculty Leaders

**Endpoint:** `GET /faculties/:id/leaders`

**Success Response:** `200 OK`
```json
{
  "leaders": [
    {
      "faculty_id": "7f3e8400-e29b-41d4-a716-446655440003",
      "user_id": "550e8400-e29b-41d4-a716-446655440001",
      "role": "Dean",
      "is_active": true,
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    },
    {
      "faculty_id": "7f3e8400-e29b-41d4-a716-446655440003",
      "user_id": "550e8400-e29b-41d4-a716-446655440002",
      "role": "Pro-Vice Chancellor",
      "is_active": true,
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ],
  "count": 2
}
```

**Error Response:**
- `404 Not Found`: Faculty does not exist

## Business Rules

### Faculty Creation
1. **Unique Code**: Faculty `code` must be unique across all faculties
2. **At Least One Leader**: Must provide at least one leader during creation
3. **Default Active**: New faculties are created with `is_active = true`

### Faculty Update
1. **Leader Replacement**: Providing `leaders` array replaces ALL existing leaders
2. **Minimum Leaders**: If updating leaders, must provide at least one
3. **Immutable Code**: Cannot change `code` after creation
4. **Partial Updates**: Only provided fields are updated

### Deactivation vs Soft Delete
- **Deactivation** (`is_active = false`):
  - Faculty still exists in database
  - Not shown in default listings
  - Can be reactivated
  - Leadership records preserved
  
- **Soft Delete** (`deleted_at != NULL`):
  - Faculty effectively removed
  - Never shown in any listing
  - Cannot be reactivated
  - Leadership records cascade deleted

## Audit Logging

All faculty operations are logged to the IAM service's audit log system:

### Events Logged

1. **FACULTY_CREATED**
   ```json
   {
     "action": "FACULTY_CREATED",
     "entity": "faculty",
     "entity_id": "7f3e8400-e29b-41d4-a716-446655440003",
     "user_id": 1,
     "email": "admin@university.edu",
     "changes": {
       "name": "Faculty of Computing",
       "code": "FOC",
       "description": "Computing Faculty",
       "leaders_count": 2
     },
     "metadata": {
       "leaders": [...]
     }
   }
   ```

2. **FACULTY_UPDATED**
   ```json
   {
     "action": "FACULTY_UPDATED",
     "entity": "faculty",
     "entity_id": "7f3e8400-e29b-41d4-a716-446655440003",
     "user_id": 1,
     "email": "admin@university.edu",
     "changes": {
       "name": {
         "old": "Faculty of Computing",
         "new": "Faculty of Information Technology"
       },
       "leaders_updated": true
     }
   }
   ```

3. **FACULTY_DEACTIVATED**
   ```json
   {
     "action": "FACULTY_DEACTIVATED",
     "entity": "faculty",
     "entity_id": "7f3e8400-e29b-41d4-a716-446655440003",
     "user_id": 1,
     "email": "admin@university.edu",
     "changes": {
       "is_active": {
         "old": true,
         "new": false
       }
     }
   }
   ```

## Authentication & Authorization

### Required Headers
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

### JWT Claims Required
```json
{
  "user_id": 1,
  "email": "admin@university.edu",
  "roles": ["super_admin"],
  "permissions": [...]
}
```

### Access Control
- **All endpoints require**: Authenticated user with `super_admin` role
- **Middleware applied**: 
  1. `AuthMiddleware` - Validates JWT token
  2. `RequireRole("super_admin")` - Checks for super admin role

### Error Responses
- `401 Unauthorized`: Missing or invalid token
- `403 Forbidden`: User lacks super_admin role

## Testing

### Unit Tests

**Repository Tests** (`internal/repository/faculty_repository_test.go`):
- ✅ Create faculty
- ✅ Duplicate code handling
- ✅ Update faculty
- ✅ Get by ID
- ✅ Get by code
- ✅ List faculties (with/without inactive)
- ✅ Soft delete
- ✅ Faculty existence check
- ✅ Create leaders
- ✅ Get leaders by faculty
- ✅ Delete leaders
- ✅ Deactivate leaders
- ✅ Preload leaders with faculty

**Service Tests** (`internal/service/faculty_service_test.go`):
- ✅ Create faculty success
- ✅ Create with duplicate code
- ✅ Create with no leaders (validation)
- ✅ Create with invalid name
- ✅ Update faculty success
- ✅ Update with leaders replacement
- ✅ Update with no leaders (validation)
- ✅ Update non-existent faculty
- ✅ Deactivate faculty
- ✅ Get faculty by ID
- ✅ List faculties
- ✅ Get faculty leaders

**Handler Tests** (`internal/handler/faculty_handler_test.go`):
- ✅ Create faculty endpoint
- ✅ Invalid request handling
- ✅ List faculties endpoint
- ✅ Get faculty endpoint
- ✅ Update faculty endpoint
- ✅ Deactivate faculty endpoint
- ✅ Get faculty leaders endpoint

### Running Tests

```bash
# Run all tests
cd apps/services/academic-service
go test ./...

# Run repository tests
go test ./internal/repository -v

# Run service tests
go test ./internal/service -v

# Run handler tests
go test ./internal/handler -v

# Run with coverage
go test ./... -cover
```

## Bruno API Collection

API requests are available in the Bruno collection:

```
bruno/academics/Faculties/
├── Create Faculty.bru
├── List Faculties.bru
├── Get Faculty.bru
├── Update Faculty.bru
├── Deactivate Faculty.bru
└── Get Faculty Leaders.bru
```

### Environment Variables
Set in Bruno:
- `base_url`: http://localhost:8083
- `access_token`: Your JWT token
- `faculty_id`: UUID of a faculty (for GET/PUT/PATCH operations)

## Error Handling

### Standard Error Response Format
```json
{
  "code": 400,
  "message": "Descriptive error message"
}
```

### Common Error Codes
- `400`: Bad Request - Validation errors, invalid input
- `401`: Unauthorized - Missing or invalid authentication
- `403`: Forbidden - Insufficient permissions
- `404`: Not Found - Resource doesn't exist
- `409`: Conflict - Duplicate resource (e.g., code already exists)
- `500`: Internal Server Error - Server-side error

## Migration

### Auto-Migration
The tables are automatically created/updated on service startup via GORM AutoMigrate:

```go
db.AutoMigrate(
    &domain.Faculty{},
    &domain.FacultyLeadership{},
)
```

### Manual SQL Migration (if needed)

```sql
-- Create faculties table
CREATE TABLE IF NOT EXISTS faculties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP NULL
);

CREATE INDEX idx_faculties_deleted_at ON faculties(deleted_at);

-- Create faculty_leadership table
CREATE TABLE IF NOT EXISTS faculty_leadership (
    faculty_id UUID NOT NULL,
    user_id UUID NOT NULL,
    role VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP NULL,
    PRIMARY KEY (faculty_id, user_id),
    FOREIGN KEY (faculty_id) REFERENCES faculties(id) ON DELETE CASCADE
);

CREATE INDEX idx_faculty_leadership_deleted_at ON faculty_leadership(deleted_at);
```

## Environment Configuration

Required environment variables:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=academic_db
DB_SSLMODE=disable

# JWT
JWT_SECRET_KEY=your_secret_key

# IAM Service (for audit logs)
IAM_SERVICE_URL=http://localhost:8081

# Server
SERVER_PORT=8083
```

## Future Enhancements

Potential features for future iterations:

1. **Bulk Operations**: Import/export faculties via CSV
2. **Faculty Hierarchy**: Support for sub-faculties or departments
3. **Leader History**: Track historical leadership changes
4. **Notifications**: Email notifications to leaders on assignment
5. **Search & Filters**: Advanced search by name, code, leader
6. **Pagination**: For large faculty lists
7. **Soft Delete Recovery**: Endpoint to restore soft-deleted faculties
8. **Leader Permissions**: Define what leaders can do in their faculty

## Support

For issues or questions:
- Check logs: `apps/services/academic-service/logs/`
- Review audit logs in IAM service
- Verify JWT token has correct roles
- Ensure database migrations ran successfully

---

**Last Updated:** 2024-01-15  
**Version:** 1.0.0  
**Service:** Academic Management Service  
**Module:** Faculty Management