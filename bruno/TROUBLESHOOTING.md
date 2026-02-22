# Bruno API Requests - Troubleshooting Guide

## Common Issues and Solutions

### 1. 401 Unauthorized Error - Academic Service

**Problem:** Getting "Invalid token" error when accessing Academic Service endpoints (e.g., creating faculty).

**Root Cause:** There is a JWT payload structure incompatibility between IAM Service and Academic Service:

- **IAM Service JWT** contains:
  ```json
  {
    "user_id": "uuid-string",
    "username": "string",
    "role_name": "Super Admin",  // singular, space-separated
    "permissions": ["array"]
  }
  ```

- **Academic Service expects**:
  ```json
  {
    "user_id": 123,              // numeric, not UUID
    "email": "string",
    "roles": ["super_admin"],    // array, underscore-separated
    "permissions": ["array"]
  }
  ```

**Solution (Backend Fix Required):**

This is a **backend architecture issue** that needs to be resolved by the development team. The services should use a common JWT structure. Options:

1. **Preferred:** Update Academic Service to accept IAM Service JWT format
2. **Alternative:** Create a shared JWT library with common Claims structure
3. **Workaround:** Use IAM Service validation endpoint to verify tokens

**Temporary Workaround for Testing:**

Until the backend is fixed, you cannot test Academic Service endpoints through Bruno as they require valid JWT tokens that match their expected structure.

**For Developers:** Check that:
- Both services use the same `JWT_SECRET_KEY` environment variable ✅
- JWT Claims structures are aligned across services ❌ (Currently mismatched)
- Role names match (e.g., "Super Admin" vs "super_admin") ❌

---

### 2. 500 Internal Server Error

If you're getting a 500 Internal Server Error when making user management requests, check the following:

#### Issue: Expired or Missing Access Token

**Problem:** The hardcoded JWT tokens in the requests have expired or the `ACCESS_TOKEN` environment variable is not set.

**Solution:**
1. Run the `Login` request first (in `Auth` folder)
2. The login request will automatically save the access token to the environment variable `ACCESS_TOKEN`
3. All other requests will use `{{ACCESS_TOKEN}}` from the environment

#### Issue: Invalid role_id in Create User Request

**Problem:** The `role_id` provided in the Create User request is not a valid UUID or doesn't exist in the database.

**Solution:**
1. Run the `List Roles` request (in `Roles` folder) to get available role IDs
2. Copy a valid role ID from the response
3. Replace `REPLACE_WITH_VALID_ROLE_ID_FROM_LIST_ROLES` in the Create User request body with the actual role ID

Example valid roles (IDs will vary):
- Super Admin
- Admin
- Student
- Employee

#### Issue: Missing Required Permissions

**Problem:** Your user account doesn't have the required permissions.

**Solution:**
- For `List Users`: Requires `users:read` permission
- For `Create User`: Requires `users:write` permission
- Login with a user that has these permissions (e.g., Super Admin)

### 2. 403 Forbidden Error

**Problem:** Your access token is valid, but you don't have the required permission for the operation.

**Solution:**
- Ensure you're logged in with an account that has the necessary permissions
- Super Admin has all permissions by default
- Check your role's permissions in the database

### 3. 401 Unauthorized Error

**Problem:** Your access token is invalid, expired, or missing.

**Solution:**
1. Run the `Login` request to get a fresh access token
2. Verify that the `ACCESS_TOKEN` environment variable is set correctly
3. Check that the token is being included in the request headers

### 4. 400 Bad Request Error

**Problem:** The request body is malformed or missing required fields.

**Solution for Create User:**
- Ensure all required fields are present:
  - `username` (string, required)
  - `email` (string, valid email format, required)
  - `role_id` (UUID string, required)
  - `user_type` (string, must be "student" or "employee", required)
- Optional fields:
  - `student_id` (string, for student user type)
  - `designation` (string, for employee user type)

### 5. 409 Conflict Error

**Problem:** The username or email already exists in the database.

**Solution:**
- Use a different username and email combination
- Check existing users with the `List Users` request

## How to Use Bruno Requests

### Step-by-Step Guide

1. **Set up the environment**
   - The `GradeLoop` environment is already configured
   - Ensure the `BASE_URL` points to your running IAM service (default: `http://localhost:8000`)

2. **Authenticate**
   - Open `IAM Service > Auth > Login`
   - Update the credentials if needed (default: `superadmin@gradeloop.com` / `Admin@1234`)
   - Run the request
   - The access token will be automatically saved to `ACCESS_TOKEN` environment variable

3. **List Available Roles**
   - Open `IAM Service > Roles > List Roles`
   - Run the request
   - Copy a role ID from the response for creating users

4. **Create a User**
   - Open `IAM Service > Users > Create User`
   - Replace `REPLACE_WITH_VALID_ROLE_ID_FROM_LIST_ROLES` with an actual role ID
   - Update the username and email to unique values
   - Choose appropriate `user_type`: "student" or "employee"
   - Add optional fields as needed
   - Run the request

5. **List Users**
   - Open `IAM Service > Users > List Users`
   - Adjust query parameters if needed:
     - `page`: Page number
     - `limit`: Results per page
     - `user_type`: "student", "employee", or "all"
   - Run the request

## Environment Variables

The following environment variables are available in the `GradeLoop` environment:

- `BASE_URL`: Base URL of the API (default: `http://localhost:8000`)
- `AUTH_URL_V1`: Auth endpoint URL (`{{BASE_URL}}/api/v1/auth`)
- `USERS_URL_V1`: Users endpoint URL (`{{BASE_URL}}/api/v1/users`)
- `ACCESS_TOKEN`: JWT access token (automatically set by Login request)

## Default Seeded Data

The IAM service seeds the following default data:

### Roles
- **Super Admin**: Has all permissions
- **Admin**: Has most permissions except delete operations
- **Student**: Basic student role
- **Employee**: Basic employee role

### Default Super Admin User
- Email: `superadmin@gradeloop.com` (configurable via env)
- Password: `Admin@1234` (configurable via env)
- Role: Super Admin

## Permissions Reference

### User Permissions
- `users:read` - List and view users
- `users:write` - Create and update users
- `users:delete` - Delete users

### Role Permissions
- `roles:read` - List and view roles
- `roles:write` - Create and update roles
- `roles:delete` - Delete roles

### Permission Management
- `permissions:read` - List permissions
- `permissions:write` - Create permissions

## API Response Formats

### Successful Create User Response
```json
{
  "id": "uuid",
  "username": "string",
  "email": "string",
  "role_id": "uuid",
  "is_active": false,
  "activation_link": "string",
  "message": "User created successfully. Activation email sent."
}
```

### Successful List Users Response
```json
{
  "users": [
    {
      "id": "uuid",
      "username": "string",
      "email": "string",
      "role_id": "uuid",
      "role_name": "string",
      "user_type": "employee|student",
      "student_id": "string",
      "designation": "string",
      "is_active": boolean,
      "last_login_at": "timestamp",
      "created_at": "timestamp"
    }
  ],
  "total_count": 0,
  "page": 1,
  "limit": 10
}
```

## Need More Help?

- Check the API documentation at `/api/docs` (if Swagger is enabled)
- Review the service logs for detailed error messages
- Ensure the IAM service is running: `docker-compose up iam-service`
- Verify database connectivity and migrations are applied