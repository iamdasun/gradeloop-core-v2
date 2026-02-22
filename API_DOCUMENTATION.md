# GradeLoop Core API Documentation

This document provides comprehensive API documentation for all three microservices in the GradeLoop Core v2 system.

## Table of Contents

1. [IAM Service](#iam-service)
2. [Email Service](#email-service)
3. [Academic Service](#academic-service)

---

## IAM Service

**Base URL:** `http://localhost:8000/api/v1`

The IAM (Identity and Access Management) service handles authentication, authorization, user management, roles, and permissions.

### Health Check

#### Get Service Info
- **Endpoint:** `GET /`
- **Authentication:** None
- **Response:**
```json
{
  "service": "iam-service",
  "version": "1.0.0",
  "status": "running"
}
```

#### Health Check
- **Endpoint:** `GET /health`
- **Authentication:** None
- **Response:**
```json
{
  "status": "ok"
}
```

---

### Authentication Endpoints

#### Login
- **Endpoint:** `POST /api/v1/auth/login`
- **Authentication:** None (Public)
- **Method:** `POST`
- **Request Body:**
```json
{
  "username": "string (required)",
  "password": "string (required)"
}
```
- **Response (200 OK):**
```json
{
  "access_token": "string",
  "refresh_token": "",
  "expires_in": 900
}
```
- **Notes:** 
  - Refresh token is set as an HTTP-only cookie
  - Access token expires in 15 minutes (900 seconds)
  - Rate limited: 20 requests per minute

#### Refresh Token
- **Endpoint:** `POST /api/v1/auth/refresh`
- **Authentication:** None (uses refresh token from cookie)
- **Method:** `POST`
- **Request:** Cookie: `refresh_token`
- **Response (200 OK):**
```json
{
  "access_token": "string",
  "refresh_token": "",
  "expires_in": 900
}
```

#### Logout
- **Endpoint:** `POST /api/v1/auth/logout`
- **Authentication:** None
- **Method:** `POST`
- **Response (200 OK):**
```json
{
  "message": "Logged out successfully"
}
```

#### Activate User Account
- **Endpoint:** `POST /api/v1/auth/activate`
- **Authentication:** None (Public)
- **Method:** `POST`
- **Request Body:**
```json
{
  "token": "string (required)",
  "password": "string (required, min 8 characters)"
}
```
- **Response (200 OK):**
```json
{
  "message": "string",
  "username": "string"
}
```

#### Forgot Password
- **Endpoint:** `POST /api/v1/auth/forgot-password`
- **Authentication:** None (Public)
- **Method:** `POST`
- **Request Body:**
```json
{
  "email": "string (required, valid email)"
}
```
- **Response (200 OK):**
```json
{
  "message": "Password reset email sent"
}
```

#### Reset Password
- **Endpoint:** `POST /api/v1/auth/reset-password`
- **Authentication:** None (Public)
- **Method:** `POST`
- **Request Body:**
```json
{
  "token": "string (required)",
  "new_password": "string (required, min 8 characters)"
}
```
- **Response (200 OK):**
```json
{
  "message": "Password reset successfully"
}
```

#### Change Password
- **Endpoint:** `POST /api/v1/auth/change-password`
- **Authentication:** Required (Bearer Token)
- **Method:** `POST`
- **Headers:**
```
Authorization: Bearer <access_token>
```
- **Request Body:**
```json
{
  "current_password": "string (required)",
  "new_password": "string (required, min 8 characters)"
}
```
- **Response (200 OK):**
```json
{
  "message": "Password changed successfully"
}
```

---

### User Management Endpoints

All user management endpoints require authentication and specific permissions.

#### Get Users (List)
- **Endpoint:** `GET /api/v1/users`
- **Authentication:** Required (Bearer Token)
- **Permission:** `users:read`
- **Method:** `GET`
- **Headers:**
```
Authorization: Bearer <access_token>
```
- **Query Parameters:**
  - `page` (optional, default: 1) - Page number
  - `limit` (optional, default: 10) - Items per page
  - `user_type` (optional, default: "all") - Filter by user type: "student", "employee", or "all"
- **Response (200 OK):**
```json
{
  "users": [
    {
      "id": "uuid",
      "username": "string",
      "email": "string",
      "role_id": "uuid",
      "role_name": "string",
      "user_type": "string",
      "student_id": "string",
      "designation": "string",
      "is_active": true,
      "last_login_at": "string or null",
      "created_at": "timestamp",
      "updated_at": "timestamp"
    }
  ],
  "total_count": 100,
  "page": 1,
  "limit": 10
}
```

#### Create User
- **Endpoint:** `POST /api/v1/users`
- **Authentication:** Required (Bearer Token)
- **Permission:** `users:write`
- **Method:** `POST`
- **Headers:**
```
Authorization: Bearer <access_token>
```
- **Request Body:**
```json
{
  "username": "string (required)",
  "email": "string (required, valid email)",
  "role_id": "uuid (required)",
  "user_type": "string (required, one of: student, employee, all)",
  "student_id": "string (optional, required if user_type is student)",
  "designation": "string (optional, used for employees)"
}
```
- **Response (201 Created):**
```json
{
  "id": "uuid",
  "username": "string",
  "email": "string",
  "role_id": "uuid",
  "is_active": false,
  "activation_link": "string",
  "message": "User created successfully"
}
```

#### Update User
- **Endpoint:** `PUT /api/v1/users/:id`
- **Authentication:** Required (Bearer Token)
- **Permission:** `users:write`
- **Method:** `PUT`
- **Headers:**
```
Authorization: Bearer <access_token>
```
- **URL Parameters:**
  - `id` - User UUID
- **Request Body:**
```json
{
  "role_id": "uuid (optional)",
  "is_active": "boolean (optional)"
}
```
- **Response (200 OK):**
```json
{
  "id": "uuid",
  "username": "string",
  "email": "string",
  "role_id": "uuid",
  "is_active": true,
  "message": "User updated successfully"
}
```

#### Delete User (Soft Delete)
- **Endpoint:** `DELETE /api/v1/users/:id`
- **Authentication:** Required (Bearer Token)
- **Permission:** `users:delete`
- **Method:** `DELETE`
- **Headers:**
```
Authorization: Bearer <access_token>
```
- **URL Parameters:**
  - `id` - User UUID
- **Response:** `204 No Content`

#### Restore User
- **Endpoint:** `POST /api/v1/users/:id/restore`
- **Authentication:** Required (Bearer Token)
- **Permission:** `users:write`
- **Method:** `POST`
- **Headers:**
```
Authorization: Bearer <access_token>
```
- **URL Parameters:**
  - `id` - User UUID
- **Response:** `200 OK`

---

### Role Management Endpoints

#### Get All Roles
- **Endpoint:** `GET /api/v1/roles`
- **Authentication:** Required (Bearer Token)
- **Method:** `GET`
- **Headers:**
```
Authorization: Bearer <access_token>
```
- **Response (200 OK):**
```json
{
  "roles": [
    {
      "id": "uuid",
      "name": "string",
      "user_type": "string",
      "is_system_role": true,
      "permissions": [
        {
          "id": "uuid",
          "name": "string",
          "description": "string"
        }
      ]
    }
  ]
}
```

#### Get Role by ID
- **Endpoint:** `GET /api/v1/roles/:id`
- **Authentication:** Required (Bearer Token)
- **Method:** `GET`
- **Headers:**
```
Authorization: Bearer <access_token>
```
- **URL Parameters:**
  - `id` - Role UUID
- **Response (200 OK):**
```json
{
  "id": "uuid",
  "name": "string",
  "user_type": "string",
  "is_system_role": true,
  "permissions": [
    {
      "id": "uuid",
      "name": "string",
      "description": "string"
    }
  ]
}
```

#### Create Role
- **Endpoint:** `POST /api/v1/roles`
- **Authentication:** Required (Bearer Token)
- **Permission:** `roles:write`
- **Method:** `POST`
- **Headers:**
```
Authorization: Bearer <access_token>
```
- **Request Body:**
```json
{
  "name": "string (required)",
  "user_type": "string (required, one of: student, employee, all)",
  "is_system_role": false,
  "permission_ids": ["uuid", "uuid"]
}
```
- **Response (201 Created):**
```json
{
  "id": "uuid",
  "name": "string",
  "user_type": "string",
  "is_system_role": false,
  "permissions": [
    {
      "id": "uuid",
      "name": "string",
      "description": "string"
    }
  ]
}
```

#### Update Role
- **Endpoint:** `PUT /api/v1/roles/:id`
- **Authentication:** Required (Bearer Token)
- **Permission:** `roles:write`
- **Method:** `PUT`
- **Headers:**
```
Authorization: Bearer <access_token>
```
- **URL Parameters:**
  - `id` - Role UUID
- **Request Body:**
```json
{
  "name": "string (required)",
  "user_type": "string (required, one of: student, employee, all)",
  "permission_ids": ["uuid", "uuid"]
}
```
- **Response (200 OK):**
```json
{
  "id": "uuid",
  "name": "string",
  "user_type": "string",
  "is_system_role": false,
  "permissions": [
    {
      "id": "uuid",
      "name": "string",
      "description": "string"
    }
  ]
}
```

#### Delete Role
- **Endpoint:** `DELETE /api/v1/roles/:id`
- **Authentication:** Required (Bearer Token)
- **Permission:** `roles:delete`
- **Method:** `DELETE`
- **Headers:**
```
Authorization: Bearer <access_token>
```
- **URL Parameters:**
  - `id` - Role UUID
- **Response:** `204 No Content`

#### Assign Permission to Role
- **Endpoint:** `POST /api/v1/roles/:id/permissions`
- **Authentication:** Required (Bearer Token)
- **Permission:** `roles:write`
- **Method:** `POST`
- **Headers:**
```
Authorization: Bearer <access_token>
```
- **URL Parameters:**
  - `id` - Role UUID
- **Request Body:**
```json
{
  "permission_id": "uuid (required)"
}
```
- **Response (200 OK):**
```json
{
  "message": "Permission assigned successfully"
}
```

---

### Permission Management Endpoints

#### Get All Permissions
- **Endpoint:** `GET /api/v1/permissions`
- **Authentication:** Required (Bearer Token)
- **Method:** `GET`
- **Headers:**
```
Authorization: Bearer <access_token>
```
- **Response (200 OK):**
```json
{
  "permissions": [
    {
      "id": "uuid",
      "name": "string",
      "description": "string"
    }
  ]
}
```

#### Create Permission
- **Endpoint:** `POST /api/v1/permissions`
- **Authentication:** Required (Bearer Token)
- **Permission:** `permissions:write`
- **Method:** `POST`
- **Headers:**
```
Authorization: Bearer <access_token>
```
- **Request Body:**
```json
{
  "name": "string (required)",
  "description": "string (optional)"
}
```
- **Response (201 Created):**
```json
{
  "id": "uuid",
  "name": "string",
  "description": "string"
}
```

---

### Admin Endpoints

#### Revoke User Sessions
- **Endpoint:** `POST /api/v1/admin/users/:id/revoke-sessions`
- **Authentication:** Required (Bearer Token)
- **Method:** `POST`
- **Headers:**
```
Authorization: Bearer <access_token>
```
- **URL Parameters:**
  - `id` - User UUID
- **Response (200 OK):**
```json
{
  "message": "User sessions revoked successfully"
}
```

---

## Email Service

**Base URL:** `http://localhost:8000/api/v1/emails`

The Email service handles email sending, templating, and tracking.

### Health Check

#### Health Check
- **Endpoint:** `GET /health`
- **Authentication:** None
- **Response:**
```json
{
  "status": "ok",
  "service": "email-service"
}
```

---

### Email Endpoints

#### Send Email
- **Endpoint:** `POST /api/v1/emails/send`
- **Authentication:** None (Internal service)
- **Method:** `POST`
- **Request Body (Using Template):**
```json
{
  "template_name": "string (optional)",
  "recipients": ["email@example.com"],
  "variables": {
    "name": "John Doe",
    "link": "https://example.com/activate",
    "custom_var": "value"
  }
}
```
- **Request Body (Custom Email):**
```json
{
  "subject": "string (required if no template)",
  "body_html": "string (optional)",
  "body_text": "string (optional)",
  "recipients": ["email@example.com"],
  "variables": {
    "name": "John Doe"
  }
}
```
- **Alternative Request Format (Flexible):**
```json
{
  "template": "welcome_email",
  "to": "user@example.com",
  "name": "John Doe",
  "link": "https://example.com"
}
```
- **Response (202 Accepted):**
```json
{
  "message": "Email queued for sending",
  "id": "uuid",
  "status": "queued"
}
```
- **Notes:**
  - The service accepts flexible key formats (e.g., "template" or "template_name", "to" or "recipients")
  - Variables can be embedded at the root level or in a "variables" object
  - Automatically normalizes "link" and "reset_link" variables

---

### Template Endpoints

#### Create Template
- **Endpoint:** `POST /api/v1/emails/templates`
- **Authentication:** None (Internal service)
- **Method:** `POST`
- **Request Body:**
```json
{
  "name": "string (required)",
  "subject": "string (required)",
  "body_html": "string (required)",
  "body_text": "string (optional)"
}
```
- **Response (201 Created):**
```json
{
  "id": "uuid",
  "name": "string",
  "subject": "string",
  "body_html": "string",
  "body_text": "string",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

#### Get Template
- **Endpoint:** `GET /api/v1/emails/templates/:id`
- **Authentication:** None (Internal service)
- **Method:** `GET`
- **URL Parameters:**
  - `id` - Template UUID
- **Response (200 OK):**
```json
{
  "id": "uuid",
  "name": "string",
  "subject": "string",
  "body_html": "string",
  "body_text": "string",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

---

### Status Tracking Endpoints

#### Get Email Status
- **Endpoint:** `GET /api/v1/emails/status/:id`
- **Authentication:** None (Internal service)
- **Method:** `GET`
- **URL Parameters:**
  - `id` - Message UUID
- **Response (200 OK):**
```json
{
  "id": "uuid",
  "status": "string (queued, sent, failed)",
  "subject": "string",
  "template_name": "string",
  "retry_count": 0,
  "created_at": "timestamp",
  "updated_at": "timestamp",
  "recipients": [
    {
      "id": "uuid",
      "email": "string",
      "status": "string",
      "open_count": 0,
      "click_count": 0
    }
  ]
}
```

---

## Academic Service

**Base URL:** `http://localhost:8000/api/v1`

The Academic service handles academic structure management including faculties, departments, and leadership.

### Health Check

#### Get Service Info
- **Endpoint:** `GET /`
- **Authentication:** None
- **Response:**
```json
{
  "service": "academic-service",
  "version": "1.0.0",
  "status": "running"
}
```

#### Health Check
- **Endpoint:** `GET /health`
- **Authentication:** None
- **Response:**
```json
{
  "status": "ok"
}
```

---

### Faculty Endpoints

All faculty endpoints require authentication and `super_admin` role.

#### Create Faculty
- **Endpoint:** `POST /api/v1/faculties`
- **Authentication:** Required (Bearer Token)
- **Role:** `super_admin`
- **Method:** `POST`
- **Headers:**
```
Authorization: Bearer <access_token>
```
- **Request Body:**
```json
{
  "name": "string (required, min 3, max 255)",
  "code": "string (required, min 2, max 50)",
  "description": "string (optional)",
  "leaders": [
    {
      "user_id": "uuid (required)",
      "role": "string (required, min 3, max 100)"
    }
  ]
}
```
- **Response (201 Created):**
```json
{
  "id": "uuid",
  "name": "string",
  "code": "string",
  "description": "string",
  "is_active": true,
  "created_at": "timestamp",
  "updated_at": "timestamp",
  "leaders": [
    {
      "faculty_id": "uuid",
      "user_id": "uuid",
      "role": "string",
      "is_active": true,
      "created_at": "timestamp",
      "updated_at": "timestamp"
    }
  ]
}
```

#### List Faculties
- **Endpoint:** `GET /api/v1/faculties`
- **Authentication:** Required (Bearer Token)
- **Role:** `super_admin`
- **Method:** `GET`
- **Headers:**
```
Authorization: Bearer <access_token>
```
- **Response (200 OK):**
```json
{
  "faculties": [
    {
      "id": "uuid",
      "name": "string",
      "code": "string",
      "description": "string",
      "is_active": true,
      "created_at": "timestamp",
      "updated_at": "timestamp",
      "leaders": [
        {
          "faculty_id": "uuid",
          "user_id": "uuid",
          "role": "string",
          "is_active": true,
          "created_at": "timestamp",
          "updated_at": "timestamp"
        }
      ]
    }
  ]
}
```

#### Get Faculty by ID
- **Endpoint:** `GET /api/v1/faculties/:id`
- **Authentication:** Required (Bearer Token)
- **Role:** `super_admin`
- **Method:** `GET`
- **Headers:**
```
Authorization: Bearer <access_token>
```
- **URL Parameters:**
  - `id` - Faculty UUID
- **Response (200 OK):**
```json
{
  "id": "uuid",
  "name": "string",
  "code": "string",
  "description": "string",
  "is_active": true,
  "created_at": "timestamp",
  "updated_at": "timestamp",
  "leaders": [
    {
      "faculty_id": "uuid",
      "user_id": "uuid",
      "role": "string",
      "is_active": true,
      "created_at": "timestamp",
      "updated_at": "timestamp"
    }
  ]
}
```

#### Update Faculty
- **Endpoint:** `PUT /api/v1/faculties/:id`
- **Authentication:** Required (Bearer Token)
- **Role:** `super_admin`
- **Method:** `PUT`
- **Headers:**
```
Authorization: Bearer <access_token>
```
- **URL Parameters:**
  - `id` - Faculty UUID
- **Request Body:**
```json
{
  "name": "string (optional, min 3, max 255)",
  "description": "string (optional)",
  "leaders": [
    {
      "user_id": "uuid (required)",
      "role": "string (required, min 3, max 100)"
    }
  ],
  "is_active": true
}
```
- **Response (200 OK):**
```json
{
  "id": "uuid",
  "name": "string",
  "code": "string",
  "description": "string",
  "is_active": true,
  "created_at": "timestamp",
  "updated_at": "timestamp",
  "leaders": [
    {
      "faculty_id": "uuid",
      "user_id": "uuid",
      "role": "string",
      "is_active": true,
      "created_at": "timestamp",
      "updated_at": "timestamp"
    }
  ]
}
```

#### Deactivate Faculty
- **Endpoint:** `PATCH /api/v1/faculties/:id/deactivate`
- **Authentication:** Required (Bearer Token)
- **Role:** `super_admin`
- **Method:** `PATCH`
- **Headers:**
```
Authorization: Bearer <access_token>
```
- **URL Parameters:**
  - `id` - Faculty UUID
- **Request Body:**
```json
{
  "is_active": false
}
```
- **Response:** `204 No Content`

#### Get Faculty Leaders
- **Endpoint:** `GET /api/v1/faculties/:id/leaders`
- **Authentication:** Required (Bearer Token)
- **Role:** `super_admin`
- **Method:** `GET`
- **Headers:**
```
Authorization: Bearer <access_token>
```
- **URL Parameters:**
  - `id` - Faculty UUID
- **Response (200 OK):**
```json
{
  "leaders": [
    {
      "faculty_id": "uuid",
      "user_id": "uuid",
      "role": "string",
      "is_active": true,
      "created_at": "timestamp",
      "updated_at": "timestamp"
    }
  ]
}
```

---

## Common Error Responses

All services use consistent error response formats:

### 400 Bad Request
```json
{
  "code": 400,
  "message": "Invalid request body"
}
```

### 401 Unauthorized
```json
{
  "code": 401,
  "message": "Missing authorization header"
}
```

```json
{
  "code": 401,
  "message": "Invalid token"
}
```

```json
{
  "code": 401,
  "message": "Token expired"
}
```

### 403 Forbidden
```json
{
  "code": 403,
  "message": "Permission denied"
}
```

```json
{
  "code": 403,
  "message": "Insufficient role"
}
```

### 404 Not Found
```json
{
  "code": 404,
  "message": "Not Found"
}
```

```json
{
  "code": 404,
  "message": "User not found"
}
```

### 409 Conflict
```json
{
  "code": 409,
  "message": "Username already exists"
}
```

```json
{
  "code": 409,
  "message": "Email already exists"
}
```

### 500 Internal Server Error
```json
{
  "code": 500,
  "message": "Internal server error"
}
```

---

## Authentication

Most endpoints require JWT authentication. Include the access token in the Authorization header:

```
Authorization: Bearer <access_token>
```

Access tokens expire after 15 minutes. Use the refresh token (stored in HTTP-only cookie) to obtain a new access token via the `/api/v1/auth/refresh` endpoint.

---

## Rate Limiting

The following rate limits are applied via Traefik:

- **Login endpoint:** 20 requests per minute (burst: 10)
- **Global rate limit:** 1000 requests per minute (burst: 100)
- **Request size limit:** 1MB maximum

---

## Permissions

The IAM service uses a granular permission system. Common permissions include:

- `users:read` - View users
- `users:write` - Create and update users
- `users:delete` - Delete users
- `roles:read` - View roles
- `roles:write` - Create and update roles
- `roles:delete` - Delete roles
- `permissions:read` - View permissions
- `permissions:write` - Create permissions
- `students:read` - View students
- `students:write` - Manage students
- `employees:read` - View employees
- `employees:write` - Manage employees

---

## Service Communication

Services communicate internally:

- **IAM Service ↔ Email Service:** IAM sends activation and password reset emails
- **Academic Service → IAM Service:** Validates tokens and retrieves user information
- **Academic Service → Email Service:** Sends notifications

Internal service calls do not require authentication tokens.

---

## Notes

1. All timestamps are in ISO 8601 format
2. UUIDs are used for all resource identifiers
3. All endpoints accept and return JSON (Content-Type: application/json)
4. Soft deletes are used for users - deleted users can be restored
5. The email service uses RabbitMQ for asynchronous processing
6. Template variables support Mustache-style templating (e.g., `{{variable_name}}`)

---

**Last Updated:** 2024
**API Version:** v1