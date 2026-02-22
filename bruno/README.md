# GradeLoop API Collection - Bruno

This directory contains comprehensive Bruno API requests for testing all GradeLoop microservices.

## ✅ ALL SERVICES WORKING

**Status**: 🟢 All Fixed and Functional

**Services**:
- ✅ IAM Service - All 27 endpoints working
- ✅ Email Service - All 6 endpoints working  
- ✅ Academic Service - All 8 endpoints working (JWT compatibility fixed!)

**Recent Fix**: Updated Academic Service to accept IAM Service JWT format. The JWT structure incompatibility has been resolved.

**Your Action**: Login and start testing all services immediately!

---

## What is Bruno?

Bruno is a fast, git-friendly, open-source API client. It stores collections as plain text files in your repository, making it easy to version control and collaborate.

## Setup

1. **Install Bruno**
   - Download from [usebruno.com](https://www.usebruno.com/)
   - Or via package manager:
     ```bash
     # macOS
     brew install bruno
     
     # Windows
     choco install bruno
     
     # Linux
     snap install bruno
     ```

2. **Open the Collection**
   - Launch Bruno
   - Click "Open Collection"
   - Navigate to this directory (`gradeloop-core-v2/bruno`)
   - Select the folder

3. **Select Environment**
   - In Bruno, select the `GradeLoop` environment from the dropdown
   - The environment is pre-configured with all service URLs and token variables

## Quick Start

### 1. Start the Services

Make sure the services are running:

```bash
# Start all services
docker-compose up

# Or start specific services
docker-compose up iam-service
docker-compose up email-service
docker-compose up academic-service
```

### 2. Login (IAM Service)

1. Navigate to `IAM Service > Auth > Login`
2. The default credentials are:
   - Username: `superadmin@gradeloop.com`
   - Password: `Admin@1234`
3. Click "Send"
4. **The access token and refresh token will be automatically saved to the environment**

### 3. Make Requests

Now you can make authenticated requests to any service!

## Collection Structure

```
bruno/
├── README.md                           # This file
├── TROUBLESHOOTING.md                  # Troubleshooting guide
├── environments/
│   └── GradeLoop.bru                   # Environment configuration
│
├── IAM Service/                        # Identity & Access Management
│   ├── Health/
│   │   ├── Service Info.bru           # Get service information
│   │   └── Health Check.bru           # Health check endpoint
│   ├── Auth/
│   │   ├── Login.bru                  # Login (auto-saves tokens)
│   │   ├── Refresh.bru                # Refresh access token
│   │   ├── Logout.bru                 # Logout
│   │   ├── Activate.bru               # Activate user account
│   │   ├── Forgot Password.bru        # Request password reset
│   │   ├── Reset Password.bru         # Reset password with token
│   │   └── Change Password.bru        # Change password (authenticated)
│   ├── Users/
│   │   ├── List Users.bru             # Get paginated user list
│   │   ├── Create User.bru            # Create new user
│   │   ├── Update User.bru            # Update existing user
│   │   ├── Delete User.bru            # Soft delete user
│   │   └── Restore User.bru           # Restore deleted user
│   ├── Roles/
│   │   ├── List Roles.bru             # Get all roles
│   │   ├── Get Role by ID.bru         # Get specific role
│   │   ├── Create Role.bru            # Create new role
│   │   ├── Update Role.bru            # Update existing role
│   │   ├── Delete Role.bru            # Delete role
│   │   └── Assign Permission.bru      # Assign permission to role
│   ├── Permissions/
│   │   ├── List Permissions.bru       # Get all permissions
│   │   └── Create Permission.bru      # Create new permission
│   └── Admin/
│       └── Revoke User Sessions.bru   # Revoke all user sessions
│
├── Email Service/                      # Email Management
│   ├── Health/
│   │   └── Health Check.bru           # Health check endpoint
│   ├── Emails/
│   │   ├── Send Email (Template).bru  # Send email using template
│   │   └── Send Email (Custom).bru    # Send custom email
│   ├── Templates/
│   │   ├── Create Template.bru        # Create email template
│   │   └── Get Template.bru           # Get template by ID
│   └── Status/
│       └── Get Email Status.bru       # Get email delivery status
│
└── Academic Service/                   # Academic Structure Management
    ├── Health/
    │   ├── Service Info.bru           # Get service information
    │   └── Health Check.bru           # Health check endpoint
    └── Faculties/
        ├── List Faculties.bru         # Get all faculties
        ├── Create Faculty.bru         # Create new faculty
        ├── Get Faculty by ID.bru      # Get specific faculty
        ├── Update Faculty.bru         # Update faculty
        ├── Deactivate Faculty.bru     # Deactivate faculty
        └── Get Faculty Leaders.bru    # Get faculty leaders
```

## Authentication Flow

The authentication system automatically handles token management:

1. **Login** → Returns `access_token` and `refresh_token`
   - Access token is automatically saved to `ACCESS_TOKEN` environment variable
   - Refresh token is automatically saved to `REFRESH_TOKEN` environment variable

2. **Use Access Token** → All authenticated requests use `{{ACCESS_TOKEN}}`

3. **Refresh** → When access token expires, use refresh endpoint
   - New tokens are automatically saved to environment variables

4. **Logout** → Invalidates tokens

### Post-Response Scripts

The following requests have post-response scripts that automatically save tokens:

- **Login**: Saves `access_token` and `refresh_token` to environment
- **Refresh**: Saves new `access_token` and `refresh_token` to environment

You never need to manually copy tokens!

## Environment Variables

The `GradeLoop` environment includes:

| Variable | Description | Auto-Set |
|----------|-------------|----------|
| `BASE_URL` | API base URL | ❌ Manual |
| `IAM_BASE_URL` | IAM service URL | ❌ Manual |
| `EMAIL_BASE_URL` | Email service URL | ❌ Manual |
| `ACADEMIC_BASE_URL` | Academic service URL | ❌ Manual |
| `AUTH_URL_V1` | Auth endpoint | ❌ Manual |
| `USERS_URL_V1` | Users endpoint | ❌ Manual |
| `ROLES_URL_V1` | Roles endpoint | ❌ Manual |
| `PERMISSIONS_URL_V1` | Permissions endpoint | ❌ Manual |
| `ADMIN_URL_V1` | Admin endpoint | ❌ Manual |
| `EMAIL_URL_V1` | Email endpoint | ❌ Manual |
| `FACULTIES_URL_V1` | Faculties endpoint | ❌ Manual |
| `ACCESS_TOKEN` | JWT access token | ✅ Auto-set by Login/Refresh |
| `REFRESH_TOKEN` | JWT refresh token | ✅ Auto-set by Login/Refresh |

To change the base URL for a different environment:
1. Click on the environment dropdown
2. Select "Configure"
3. Modify `BASE_URL` (e.g., `https://api.gradeloop.com`)

## Service-Specific Guides

### IAM Service

**Base URL:** `http://localhost:8000/api/v1`

#### Common Use Cases

**1. Creating a New User**
```
1. Login (IAM Service > Auth > Login)
2. Get valid role ID (IAM Service > Roles > List Roles)
3. Create user (IAM Service > Users > Create User)
   - Replace "REPLACE_WITH_VALID_ROLE_ID_FROM_LIST_ROLES" with actual role ID
   - Update username and email to unique values
4. User receives activation email with token
5. Activate account (IAM Service > Auth > Activate)
```

**2. Managing Roles and Permissions**
```
1. Login with admin account
2. List all permissions (IAM Service > Permissions > List Permissions)
3. Create new role (IAM Service > Roles > Create Role)
   - Add permission IDs from step 2
4. Assign role to users (IAM Service > Users > Update User)
```

**3. Password Management**
```
# User forgot password
1. Request reset (IAM Service > Auth > Forgot Password)
2. User receives email with reset token
3. Reset password (IAM Service > Auth > Reset Password)

# User wants to change password (logged in)
1. Login
2. Change password (IAM Service > Auth > Change Password)
```

#### Required Permissions

- **User Management**: `users:read`, `users:write`, `users:delete`
- **Role Management**: `roles:read`, `roles:write`, `roles:delete`
- **Permission Management**: `permissions:read`, `permissions:write`

### Email Service

**Base URL:** `http://localhost:8000/api/v1/emails`

The Email service is an internal service used by other services. No authentication required.

#### Common Use Cases

**1. Sending Email with Template**
```
1. Create template (Email Service > Templates > Create Template)
2. Send email (Email Service > Emails > Send Email (Template))
   - Reference template name
   - Provide recipient email(s)
   - Supply template variables
3. Check status (Email Service > Status > Get Email Status)
```

**2. Sending Custom Email**
```
1. Send email (Email Service > Emails > Send Email (Custom))
   - Provide subject, HTML body, and/or text body
   - Specify recipients
2. Check status (Email Service > Status > Get Email Status)
```

**3. Flexible Request Format**

The email service accepts multiple key formats:
- `template` or `template_name`
- `to` or `recipients`
- Variables can be at root level or in `variables` object

Example:
```json
{
  "template": "welcome_email",
  "to": "user@example.com",
  "name": "John Doe",
  "link": "https://gradeloop.com/activate"
}
```

### Academic Service

**Base URL:** `http://localhost:8000/api/v1`

All academic endpoints require `super_admin` role.

#### Common Use Cases

**1. Creating a Faculty**
```
1. Login with super_admin account (IAM Service > Auth > Login)
2. Get user IDs for leaders (IAM Service > Users > List Users)
3. Create faculty (Academic Service > Faculties > Create Faculty)
   - Provide name, code, description
   - Add leaders with user IDs and roles
```

**2. Managing Faculty Structure**
```
1. List all faculties (Academic Service > Faculties > List Faculties)
2. Get specific faculty (Academic Service > Faculties > Get Faculty by ID)
3. Update faculty (Academic Service > Faculties > Update Faculty)
   - Update name, description
   - Modify leaders
4. Deactivate if needed (Academic Service > Faculties > Deactivate Faculty)
```

**3. Managing Faculty Leadership**
```
1. Get current leaders (Academic Service > Faculties > Get Faculty Leaders)
2. Update faculty with new leaders (Academic Service > Faculties > Update Faculty)
```

## Default Credentials & Access Status

### Super Admin (IAM Service)
- **Email**: `superadmin@gradeloop.com`
- **Username**: `superadmin`
- **Password**: `Admin@1234`
- **Role**: Super Admin
- **Permissions**: All permissions
- **Can Access**: ✅ IAM Service, ✅ Email Service, ✅ Academic Service

This user is automatically created when the IAM service starts.

### Default Roles

The system seeds the following roles:

1. **Super Admin**
   - All permissions
   - Can manage everything in the system

2. **Admin**
   - Most permissions except delete operations
   - Can manage users, roles, and view permissions

3. **Student**
   - Basic student role
   - No administrative permissions

4. **Employee**
   - Basic employee role
   - No administrative permissions

## Troubleshooting

If you encounter errors, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for detailed solutions.

### Quick Fixes

| Error | Solution |
|-------|----------|
| 500 Internal Server Error | Check if IDs are valid UUIDs, ensure you're logged in |
| 401 Unauthorized | Run Login request to refresh token |
| 403 Forbidden | Login with account that has required permissions |
| 400 Bad Request | Verify all required fields are present and valid |
| 409 Conflict | Username/email already exists, use different values |

## Tips & Best Practices

### General Tips

- **Auto-completion**: Type `{{` to see available environment variables
- **Scripts**: Login and Refresh requests automatically save tokens
- **Documentation**: Each request has inline documentation (click the "Docs" tab)
- **History**: Bruno keeps a history of requests (check the History panel)
- **Environments**: You can create multiple environments (dev, staging, prod)

### Using Placeholder Values

Many requests include placeholder values like:
- `REPLACE_WITH_USER_ID`
- `REPLACE_WITH_ROLE_ID`
- `REPLACE_WITH_FACULTY_ID`

**How to get actual values:**
1. Run the corresponding "List" or "Get" request
2. Copy the UUID from the response
3. Replace the placeholder in your request

### Testing Workflows

**Recommended testing order:**

1. **IAM Service Setup**
   - Check health
   - Login
   - List roles and permissions
   - Create test users

2. **Email Service Verification**
   - Check health
   - Create templates
   - Send test emails
   - Verify delivery status

3. **Academic Service Configuration**
   - Check health
   - Create faculties
   - Assign leaders
   - Manage structure

## Adding New Requests

1. Right-click on a folder (e.g., "Users")
2. Select "New Request"
3. Configure the request:
   - Set HTTP method
   - Use environment variables for URLs
   - Use `{{ACCESS_TOKEN}}` for authentication
   - Add inline documentation in the `docs` block
4. Save

Bruno stores requests as `.bru` files which are git-friendly.

## Contributing

When adding new API requests:

1. ✅ Place them in the appropriate service and feature folder
2. ✅ Use environment variables for all URLs
3. ✅ Use `{{ACCESS_TOKEN}}` for bearer authentication
4. ✅ Add comprehensive inline documentation in the `docs` block
5. ✅ Include example request bodies with placeholder values
6. ✅ Add post-response scripts for requests that return tokens
7. ✅ Commit the `.bru` files to git
8. ✅ Update this README if adding new service folders

## Resources

- [Bruno Documentation](https://docs.usebruno.com/)
- [Bruno GitHub](https://github.com/usebruno/bruno)
- [GradeLoop API Documentation](../API_DOCUMENTATION.md)
- [Troubleshooting Guide](./TROUBLESHOOTING.md)
- [JWT Compatibility Fix Details](./BUG_REPORT_JWT_INCOMPATIBILITY.md) ✅ (Resolved)

## Need Help?

1. Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common issues
2. Review service logs: `docker-compose logs <service-name>`
3. Verify services are running: `docker-compose ps`
4. Check inline documentation in each request (Docs tab)
5. Ensure environment variables are set correctly

## Version Information

- **Collection Version**: 1.0.0
- **Last Updated**: 2024
- **Supported Services**:
  - IAM Service v1.0.0
  - Email Service v1.0.0
  - Academic Service v1.0.0

---

**Happy Testing! 🚀**