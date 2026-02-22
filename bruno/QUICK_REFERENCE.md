# Bruno Collection - Quick Reference Guide

## 🚀 Quick Start

1. **Login**: `IAM Service > Auth > Login` (saves tokens automatically)
2. **Make requests**: All authenticated endpoints use `{{ACCESS_TOKEN}}`
3. **Refresh token**: `IAM Service > Auth > Refresh` (when token expires)

---

## 📋 All Endpoints at a Glance

### IAM Service (`http://localhost:8000`)

#### Health & Info
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | ❌ | Service information |
| GET | `/health` | ❌ | Health check |

#### Authentication
| Method | Endpoint | Auth | Permission | Description |
|--------|----------|------|------------|-------------|
| POST | `/api/v1/auth/login` | ❌ | - | Login (returns tokens) |
| POST | `/api/v1/auth/refresh` | ❌ | - | Refresh access token |
| POST | `/api/v1/auth/logout` | ❌ | - | Logout |
| POST | `/api/v1/auth/activate` | ❌ | - | Activate user account |
| POST | `/api/v1/auth/forgot-password` | ❌ | - | Request password reset |
| POST | `/api/v1/auth/reset-password` | ❌ | - | Reset password with token |
| POST | `/api/v1/auth/change-password` | ✅ | - | Change password (authenticated) |

#### User Management
| Method | Endpoint | Auth | Permission | Description |
|--------|----------|------|------------|-------------|
| GET | `/api/v1/users` | ✅ | `users:read` | List users (paginated) |
| POST | `/api/v1/users` | ✅ | `users:write` | Create new user |
| PUT | `/api/v1/users/:id` | ✅ | `users:write` | Update user |
| DELETE | `/api/v1/users/:id` | ✅ | `users:delete` | Delete user (soft) |
| POST | `/api/v1/users/:id/restore` | ✅ | `users:write` | Restore deleted user |

#### Role Management
| Method | Endpoint | Auth | Permission | Description |
|--------|----------|------|------------|-------------|
| GET | `/api/v1/roles` | ✅ | - | List all roles |
| GET | `/api/v1/roles/:id` | ✅ | - | Get role by ID |
| POST | `/api/v1/roles` | ✅ | `roles:write` | Create new role |
| PUT | `/api/v1/roles/:id` | ✅ | `roles:write` | Update role |
| DELETE | `/api/v1/roles/:id` | ✅ | `roles:delete` | Delete role |
| POST | `/api/v1/roles/:id/permissions` | ✅ | `roles:write` | Assign permission to role |

#### Permission Management
| Method | Endpoint | Auth | Permission | Description |
|--------|----------|------|------------|-------------|
| GET | `/api/v1/permissions` | ✅ | - | List all permissions |
| POST | `/api/v1/permissions` | ✅ | `permissions:write` | Create new permission |

#### Admin
| Method | Endpoint | Auth | Permission | Description |
|--------|----------|------|------------|-------------|
| POST | `/api/v1/admin/users/:id/revoke-sessions` | ✅ | Admin | Revoke user sessions |

---

### Email Service (`http://localhost:8000`)

#### Health
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | ❌ | Health check |

#### Email Operations
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/v1/emails/send` | ❌ | Send email (template or custom) |

#### Template Management
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/v1/emails/templates` | ❌ | Create email template |
| GET | `/api/v1/emails/templates/:id` | ❌ | Get template by ID |

#### Status Tracking
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/emails/status/:id` | ❌ | Get email delivery status |

---

### Academic Service (`http://localhost:8000`)

#### Health & Info
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | ❌ | Service information |
| GET | `/health` | ❌ | Health check |

#### Faculty Management
| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET | `/api/v1/faculties` | ✅ | `super_admin` | List all faculties |
| POST | `/api/v1/faculties` | ✅ | `super_admin` | Create new faculty |
| GET | `/api/v1/faculties/:id` | ✅ | `super_admin` | Get faculty by ID |
| PUT | `/api/v1/faculties/:id` | ✅ | `super_admin` | Update faculty |
| PATCH | `/api/v1/faculties/:id/deactivate` | ✅ | `super_admin` | Deactivate faculty |
| GET | `/api/v1/faculties/:id/leaders` | ✅ | `super_admin` | Get faculty leaders |

---

## 🔑 Default Credentials

```json
{
  "username": "superadmin@gradeloop.com",
  "password": "Admin@1234"
}
```

---

## 🌐 Environment Variables

| Variable | Value | Auto-Set |
|----------|-------|----------|
| `BASE_URL` | `http://localhost:8000` | ❌ |
| `IAM_BASE_URL` | `{{BASE_URL}}` | ❌ |
| `EMAIL_BASE_URL` | `{{BASE_URL}}` | ❌ |
| `ACADEMIC_BASE_URL` | `{{BASE_URL}}` | ❌ |
| `AUTH_URL_V1` | `{{BASE_URL}}/api/v1/auth` | ❌ |
| `USERS_URL_V1` | `{{BASE_URL}}/api/v1/users` | ❌ |
| `ROLES_URL_V1` | `{{BASE_URL}}/api/v1/roles` | ❌ |
| `PERMISSIONS_URL_V1` | `{{BASE_URL}}/api/v1/permissions` | ❌ |
| `ADMIN_URL_V1` | `{{BASE_URL}}/api/v1/admin` | ❌ |
| `EMAIL_URL_V1` | `{{BASE_URL}}/api/v1/emails` | ❌ |
| `FACULTIES_URL_V1` | `{{BASE_URL}}/api/v1/faculties` | ❌ |
| `ACCESS_TOKEN` | Auto-set on login | ✅ |
| `REFRESH_TOKEN` | Auto-set on login | ✅ |

---

## 📝 Common Request Bodies

### Create User
```json
{
  "username": "john.doe@example.com",
  "email": "john.doe@example.com",
  "role_id": "uuid-from-list-roles",
  "user_type": "employee",
  "designation": "Software Engineer"
}
```

### Update User
```json
{
  "role_id": "uuid-from-list-roles",
  "is_active": true
}
```

### Create Role
```json
{
  "name": "Custom Role",
  "user_type": "employee",
  "is_system_role": false,
  "permission_ids": ["uuid1", "uuid2"]
}
```

### Update Role
```json
{
  "name": "Updated Role Name",
  "user_type": "employee",
  "permission_ids": ["uuid1", "uuid2"]
}
```

### Create Permission
```json
{
  "name": "custom:permission",
  "description": "Description of the permission"
}
```

### Send Email (Template)
```json
{
  "template_name": "welcome_email",
  "recipients": ["user@example.com"],
  "variables": {
    "name": "John Doe",
    "link": "https://gradeloop.com/activate/token"
  }
}
```

### Send Email (Custom)
```json
{
  "subject": "Email Subject",
  "body_html": "<h1>Hello!</h1><p>Content</p>",
  "body_text": "Hello! Content",
  "recipients": ["user@example.com"]
}
```

### Create Template
```json
{
  "name": "custom_template",
  "subject": "Welcome to {{app_name}}",
  "body_html": "<html><body><h1>Hello {{name}}</h1></body></html>",
  "body_text": "Hello {{name}}"
}
```

### Create Faculty
```json
{
  "name": "Faculty of Computing",
  "code": "FOC",
  "description": "Faculty of Computing and IT",
  "leaders": [
    {
      "user_id": "uuid-from-list-users",
      "role": "Dean"
    }
  ]
}
```

### Update Faculty
```json
{
  "name": "Updated Faculty Name",
  "description": "Updated description",
  "leaders": [
    {
      "user_id": "uuid-from-list-users",
      "role": "Dean"
    }
  ],
  "is_active": true
}
```

### Deactivate Faculty
```json
{
  "is_active": false
}
```

---

## 🔄 Common Workflows

### 1. Create and Activate User
```
1. Login                    → IAM Service > Auth > Login
2. Get Role ID             → IAM Service > Roles > List Roles
3. Create User             → IAM Service > Users > Create User
4. Get Activation Token    → Copy from response
5. Activate Account        → IAM Service > Auth > Activate
```

### 2. Create Custom Role
```
1. Login                    → IAM Service > Auth > Login
2. Get Permissions         → IAM Service > Permissions > List Permissions
3. Create Role             → IAM Service > Roles > Create Role
4. Verify Role             → IAM Service > Roles > Get Role by ID
```

### 3. Send Email with Template
```
1. Create Template         → Email Service > Templates > Create Template
2. Send Email             → Email Service > Emails > Send Email (Template)
3. Check Status           → Email Service > Status > Get Email Status
```

### 4. Create Faculty Structure
```
1. Login                    → IAM Service > Auth > Login (super_admin)
2. Get User IDs            → IAM Service > Users > List Users
3. Create Faculty          → Academic Service > Faculties > Create Faculty
4. Verify Faculty          → Academic Service > Faculties > Get Faculty by ID
```

### 5. Password Reset Flow
```
1. Forgot Password         → IAM Service > Auth > Forgot Password
2. Get Reset Token         → From email (check email service logs)
3. Reset Password          → IAM Service > Auth > Reset Password
4. Login                   → IAM Service > Auth > Login
```

---

## 🎯 Query Parameters

### List Users
- `page` (default: 1) - Page number
- `limit` (default: 10) - Items per page
- `user_type` (default: "all") - "student", "employee", or "all"

**Example**: `/api/v1/users?page=1&limit=20&user_type=employee`

---

## ⚠️ Common Errors

| Code | Message | Solution |
|------|---------|----------|
| 400 | Bad Request | Check required fields and data types |
| 401 | Unauthorized | Login or refresh your token |
| 403 | Forbidden | Check if you have required permissions |
| 404 | Not Found | Verify the ID exists |
| 409 | Conflict | Username/email already exists |
| 500 | Internal Server Error | Check request body format and IDs |

---

## 🔒 Permissions Reference

### User Permissions
- `users:read` - View users
- `users:write` - Create and update users
- `users:delete` - Delete users

### Role Permissions
- `roles:read` - View roles
- `roles:write` - Create and update roles
- `roles:delete` - Delete roles

### Permission Permissions
- `permissions:read` - View permissions
- `permissions:write` - Create permissions

---

## 📦 Default Seeded Data

### Roles
1. **Super Admin** - All permissions
2. **Admin** - Most permissions (except delete)
3. **Student** - Basic permissions
4. **Employee** - Basic permissions

### Permissions
- `users:read`, `users:write`, `users:delete`
- `roles:read`, `roles:write`, `roles:delete`
- `permissions:read`, `permissions:write`

### Users
- **Super Admin**: `superadmin@gradeloop.com` / `Admin@1234`

---

## 🛠️ Tips

- ✅ Use `{{ACCESS_TOKEN}}` for all authenticated requests
- ✅ Tokens are auto-saved on login/refresh
- ✅ Replace placeholder IDs with actual UUIDs from responses
- ✅ Check inline docs (Docs tab) for each request
- ✅ Email Service endpoints don't require authentication
- ✅ Academic Service requires `super_admin` role
- ✅ Use query parameters for filtering (List Users)

---

## 📚 More Resources

- [README.md](./README.md) - Full documentation
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Common issues
- [API_DOCUMENTATION.md](../API_DOCUMENTATION.md) - API specs

---

**Quick Access**: Press `Ctrl/Cmd + K` in Bruno to search for any request!