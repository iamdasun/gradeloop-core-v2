# Faculty Management - Quick Start Guide

## Prerequisites

- Go 1.25.6 or higher
- PostgreSQL database running
- IAM service running (for audit logs)
- JWT token with `super_admin` role

## Setup

### 1. Environment Configuration

Create `.env` file in `apps/services/academic-service/`:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=academic_db
DB_SSLMODE=disable

# JWT
JWT_SECRET_KEY=your_secret_key_here

# IAM Service
IAM_SERVICE_URL=http://localhost:8081

# Server
SERVER_PORT=8083
```

### 2. Start the Service

```bash
cd apps/services/academic-service
go run cmd/main.go
```

The service will:
- Connect to PostgreSQL
- Run database migrations automatically
- Start HTTP server on port 8083

## Quick API Test

### 1. Get JWT Token

First, authenticate with the IAM service to get a token with `super_admin` role:

```bash
# Login via IAM service
curl -X POST http://localhost:8081/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@university.edu",
    "password": "your_password"
  }'

# Save the access_token from response
export TOKEN="your_jwt_token_here"
```

### 2. Create Your First Faculty

```bash
curl -X POST http://localhost:8083/api/v1/faculties \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Faculty of Computing",
    "code": "FOC",
    "description": "The Faculty of Computing offers programs in CS, IT, and Software Engineering",
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
  }'
```

**Response (201 Created):**
```json
{
  "id": "7f3e8400-e29b-41d4-a716-446655440003",
  "name": "Faculty of Computing",
  "code": "FOC",
  "description": "The Faculty of Computing offers programs in CS, IT, and Software Engineering",
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

### 3. List All Faculties

```bash
curl http://localhost:8083/api/v1/faculties \
  -H "Authorization: Bearer ${TOKEN}"
```

### 4. Get Faculty Details

```bash
# Replace with your faculty ID
export FACULTY_ID="7f3e8400-e29b-41d4-a716-446655440003"

curl http://localhost:8083/api/v1/faculties/${FACULTY_ID} \
  -H "Authorization: Bearer ${TOKEN}"
```

### 5. Update Faculty

```bash
curl -X PUT http://localhost:8083/api/v1/faculties/${FACULTY_ID} \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Faculty of Computing and Information Technology",
    "description": "Updated description",
    "leaders": [
      {
        "user_id": "550e8400-e29b-41d4-a716-446655440001",
        "role": "Dean"
      }
    ]
  }'
```

### 6. Get Faculty Leaders

```bash
curl http://localhost:8083/api/v1/faculties/${FACULTY_ID}/leaders \
  -H "Authorization: Bearer ${TOKEN}"
```

### 7. Deactivate Faculty

```bash
curl -X PATCH http://localhost:8083/api/v1/faculties/${FACULTY_ID}/deactivate \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"is_active": false}'
```

## Using Bruno API Client

### Setup

1. Open Bruno
2. Navigate to the `academics/Faculties` folder
3. Set environment variables:
   - `base_url`: http://localhost:8083
   - `access_token`: Your JWT token
   - `faculty_id`: UUID of a faculty

### Available Requests

1. **Create Faculty** - Creates a new faculty with leaders
2. **List Faculties** - Gets all faculties (with optional inactive filter)
3. **Get Faculty** - Gets a specific faculty by ID
4. **Update Faculty** - Updates faculty details and/or leaders
5. **Deactivate Faculty** - Sets faculty as inactive
6. **Get Faculty Leaders** - Gets all leaders for a faculty

## Common Operations

### Create Multiple Faculties

```bash
# Faculty of Engineering
curl -X POST http://localhost:8083/api/v1/faculties \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Faculty of Engineering",
    "code": "FOE",
    "description": "Engineering programs",
    "leaders": [{"user_id": "uuid-here", "role": "Dean"}]
  }'

# Faculty of Medicine
curl -X POST http://localhost:8083/api/v1/faculties \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Faculty of Medicine",
    "code": "FOM",
    "description": "Medical programs",
    "leaders": [{"user_id": "uuid-here", "role": "Dean"}]
  }'
```

### List Including Inactive Faculties

```bash
curl "http://localhost:8083/api/v1/faculties?include_inactive=true" \
  -H "Authorization: Bearer ${TOKEN}"
```

### Replace All Leaders

```bash
curl -X PUT http://localhost:8083/api/v1/faculties/${FACULTY_ID} \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "leaders": [
      {"user_id": "new-uuid-1", "role": "Dean"},
      {"user_id": "new-uuid-2", "role": "Deputy Dean"},
      {"user_id": "new-uuid-3", "role": "Academic Panel Member"}
    ]
  }'
```

## Validation Rules

### Faculty Name
- ✅ Required
- ✅ 3-255 characters
- ❌ Empty string
- ❌ Less than 3 characters

### Faculty Code
- ✅ Required
- ✅ 2-50 characters
- ✅ Must be unique
- ❌ Duplicate code
- ❌ Empty string

### Leaders
- ✅ At least 1 leader required
- ✅ Each leader needs valid UUID for user_id
- ✅ Each leader needs role (3-100 chars)
- ❌ Empty leaders array
- ❌ Invalid UUID format
- ❌ Missing role

## Common Errors

### 400 Bad Request

**Problem:** Validation error
```json
{
  "code": 400,
  "message": "faculty must have at least one leader"
}
```

**Solution:** Ensure you provide at least one leader in the request.

### 401 Unauthorized

**Problem:** Missing or invalid token
```json
{
  "code": 401,
  "message": "Missing authorization header"
}
```

**Solution:** Include valid JWT token in Authorization header.

### 403 Forbidden

**Problem:** User lacks super_admin role
```json
{
  "code": 403,
  "message": "Insufficient role"
}
```

**Solution:** Ensure your JWT token has `super_admin` role.

### 409 Conflict

**Problem:** Duplicate faculty code
```json
{
  "code": 409,
  "message": "faculty with this code already exists"
}
```

**Solution:** Use a different, unique code.

## Testing

### Run Tests

```bash
cd apps/services/academic-service

# All tests
go test ./... -v

# Repository tests
go test ./internal/repository -v

# Service tests
go test ./internal/service -v

# Handler tests
go test ./internal/handler -v

# With coverage
go test ./... -cover
```

### Test Database

Tests use SQLite in-memory database, so no PostgreSQL setup needed for testing.

## Troubleshooting

### Service won't start

1. **Check database connection:**
   ```bash
   psql -h localhost -U postgres -d academic_db
   ```

2. **Verify environment variables:**
   ```bash
   cat .env
   ```

3. **Check logs:**
   ```bash
   # Service logs errors on startup
   go run cmd/main.go
   ```

### Can't create faculty

1. **Verify JWT token:**
   - Token not expired
   - Has `super_admin` role
   - Valid signature

2. **Check request body:**
   - Valid JSON format
   - All required fields present
   - Valid UUIDs

3. **Database issues:**
   - Faculty code already exists
   - Database connection lost

### Audit logs not appearing

1. **Check IAM service:**
   ```bash
   curl http://localhost:8081/health
   ```

2. **Verify IAM_SERVICE_URL:**
   ```bash
   echo $IAM_SERVICE_URL
   ```

3. **Review service logs** - Audit failures are logged as warnings

## Next Steps

- Read full documentation: `docs/FACULTY_MANAGEMENT.md`
- Explore Bruno collection: `bruno/academics/Faculties/`
- Review implementation: `docs/IMPLEMENTATION_SUMMARY.md`
- Check audit logs in IAM service

## Support

- **Logs:** Check console output for errors
- **Database:** Verify migrations ran successfully
- **Auth:** Ensure IAM service is accessible
- **API:** Use Bruno for request debugging

---

**Service Port:** 8083  
**Base URL:** http://localhost:8083/api/v1  
**Health Check:** http://localhost:8083/health  
**Authentication:** JWT Bearer Token (Super Admin)