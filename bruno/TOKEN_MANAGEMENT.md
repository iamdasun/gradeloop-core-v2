# Token Management Guide - Bruno Collection

This document explains how authentication tokens are automatically managed in the GradeLoop Bruno API collection.

## 🔐 Automatic Token Management

All authentication tokens are **automatically saved and used** across requests. You never need to manually copy tokens!

---

## How It Works

### 1. Login Request (`IAM Service > Auth > Login`)

When you successfully login, the post-response script automatically:

✅ Saves `access_token` to `{{ACCESS_TOKEN}}` environment variable
✅ Saves `refresh_token` to `{{REFRESH_TOKEN}}` environment variable
✅ Logs token details to console for debugging

```javascript
// Post-response script in Login.bru
if (res.status === 200) {
  if (res.body.access_token) {
    bru.setEnvVar("ACCESS_TOKEN", res.body.access_token);
    console.log("✅ Access token saved to environment");
  }
  if (res.body.refresh_token) {
    bru.setEnvVar("REFRESH_TOKEN", res.body.refresh_token);
    console.log("✅ Refresh token saved to environment");
  }
}
```

### 2. Refresh Request (`IAM Service > Auth > Refresh`)

When you refresh your token, the same automatic saving happens:

✅ New `access_token` is saved to `{{ACCESS_TOKEN}}`
✅ New `refresh_token` is saved to `{{REFRESH_TOKEN}}`

### 3. All Authenticated Requests

Every authenticated request uses the environment variable:

```
auth:bearer {
  token: {{ACCESS_TOKEN}}
}
```

This means:
- ✅ Token is always up-to-date
- ✅ No manual copying needed
- ✅ Works across all services
- ✅ Survives Bruno restarts (stored in environment)

---

## Token Lifecycle

```
┌─────────────────────────────────────────────────────────┐
│ 1. Login                                                │
│    POST /api/v1/auth/login                             │
│    ↓                                                    │
│    Returns: access_token + refresh_token               │
│    ↓                                                    │
│    Auto-saved to: {{ACCESS_TOKEN}} & {{REFRESH_TOKEN}} │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 2. Use Token                                           │
│    All authenticated requests automatically use:        │
│    Authorization: Bearer {{ACCESS_TOKEN}}              │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 3. Token Expires (after 15 minutes)                    │
│    ↓                                                    │
│    401 Unauthorized error                              │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 4. Refresh Token                                       │
│    POST /api/v1/auth/refresh                           │
│    ↓                                                    │
│    Returns: new access_token + refresh_token           │
│    ↓                                                    │
│    Auto-saved to: {{ACCESS_TOKEN}} & {{REFRESH_TOKEN}} │
└─────────────────────────────────────────────────────────┘
                         ↓
                  Back to Step 2
```

---

## Token Details

### Access Token
- **Purpose**: Authenticate API requests
- **Lifetime**: 15 minutes (900 seconds)
- **Storage**: `{{ACCESS_TOKEN}}` environment variable
- **Usage**: Automatically included in all authenticated requests
- **Format**: JWT (JSON Web Token)

### Refresh Token
- **Purpose**: Get new access tokens without re-login
- **Lifetime**: 7 days (configurable)
- **Storage**: `{{REFRESH_TOKEN}}` environment variable
- **Usage**: Used by the Refresh endpoint
- **Format**: JWT (JSON Web Token)

---

## JWT Token Structure (IAM Service)

The access token contains the following claims:

```json
{
  "user_id": "uuid-string",
  "username": "superadmin@gradeloop.com",
  "role_name": "Super Admin",
  "permissions": [
    "users:read",
    "users:write",
    "users:delete",
    "roles:read",
    "roles:write",
    "roles:delete",
    "permissions:read",
    "permissions:write"
  ],
  "iss": "iam-service",
  "sub": "user-uuid",
  "exp": 1234567890,
  "nbf": 1234567890,
  "iat": 1234567890,
  "jti": "token-id"
}
```

### Decoding Tokens

The Login request includes a debug script that decodes and displays the token payload in the console:

```javascript
try {
  const tokenParts = res.body.access_token.split('.');
  const payload = JSON.parse(atob(tokenParts[1]));
  console.log("Token payload:", JSON.stringify(payload, null, 2));
} catch (e) {
  console.log("Could not decode token:", e.message);
}
```

---

## Checking Token Status

### View Current Tokens

1. Click on the environment dropdown in Bruno
2. Select "Configure"
3. View the `ACCESS_TOKEN` and `REFRESH_TOKEN` values

### Verify Token is Valid

If you're getting 401 errors:

1. Check if token is set: `echo {{ACCESS_TOKEN}}`
2. Check if token is expired (use JWT decoder or check console logs)
3. Try refreshing: Run `IAM Service > Auth > Refresh`
4. If refresh fails: Run `IAM Service > Auth > Login` again

---

## Common Scenarios

### Scenario 1: First Time Using Collection

```
1. Run: IAM Service > Auth > Login
2. ✅ Tokens automatically saved
3. Make any authenticated request
4. ✅ Token automatically used
```

### Scenario 2: Token Expired

```
1. Try to make request
2. ❌ Get 401 Unauthorized
3. Run: IAM Service > Auth > Refresh
4. ✅ New tokens automatically saved
5. Retry original request
6. ✅ Success
```

### Scenario 3: Refresh Token Expired

```
1. Try to refresh
2. ❌ Get 401 Unauthorized
3. Run: IAM Service > Auth > Login
4. ✅ Fresh tokens saved
5. Continue working
```

### Scenario 4: Starting New Session

```
1. Open Bruno (environment persists)
2. ✅ Tokens still available from last session
3. Make request
4. If expired: Follow Scenario 2 or 3
```

---

## Requests That Auto-Save Tokens

### ✅ Login
- **File**: `IAM Service/Auth/Login.bru`
- **Saves**: `ACCESS_TOKEN` and `REFRESH_TOKEN`
- **Trigger**: Successful login (200 OK)

### ✅ Refresh
- **File**: `IAM Service/Auth/Refresh.bru`
- **Saves**: `ACCESS_TOKEN` and `REFRESH_TOKEN`
- **Trigger**: Successful refresh (200 OK)

---

## Requests That Use Tokens

### IAM Service (Authenticated Endpoints)

**Users:**
- List Users → `GET /api/v1/users`
- Create User → `POST /api/v1/users`
- Update User → `PUT /api/v1/users/:id`
- Delete User → `DELETE /api/v1/users/:id`
- Restore User → `POST /api/v1/users/:id/restore`

**Roles:**
- List Roles → `GET /api/v1/roles`
- Get Role by ID → `GET /api/v1/roles/:id`
- Create Role → `POST /api/v1/roles`
- Update Role → `PUT /api/v1/roles/:id`
- Delete Role → `DELETE /api/v1/roles/:id`
- Assign Permission → `POST /api/v1/roles/:id/permissions`

**Permissions:**
- List Permissions → `GET /api/v1/permissions`
- Create Permission → `POST /api/v1/permissions`

**Admin:**
- Revoke User Sessions → `POST /api/v1/admin/users/:id/revoke-sessions`

**Auth (Authenticated):**
- Change Password → `POST /api/v1/auth/change-password`

### Academic Service (All Endpoints)

**Faculties:**
- List Faculties → `GET /api/v1/faculties`
- Create Faculty → `POST /api/v1/faculties`
- Get Faculty by ID → `GET /api/v1/faculties/:id`
- Update Faculty → `PUT /api/v1/faculties/:id`
- Deactivate Faculty → `PATCH /api/v1/faculties/:id/deactivate`
- Get Faculty Leaders → `GET /api/v1/faculties/:id/leaders`

**Note**: Academic Service requires `super_admin` role.

---

## Requests That DON'T Use Tokens

### IAM Service (Public Endpoints)

**Health:**
- Service Info → `GET /`
- Health Check → `GET /health`

**Auth (Public):**
- Login → `POST /api/v1/auth/login`
- Refresh → `POST /api/v1/auth/refresh`
- Logout → `POST /api/v1/auth/logout`
- Activate → `POST /api/v1/auth/activate`
- Forgot Password → `POST /api/v1/auth/forgot-password`
- Reset Password → `POST /api/v1/auth/reset-password`

### Email Service (All Endpoints)

**Note**: Email Service is an internal service and doesn't require authentication.

- Health Check → `GET /health`
- Send Email (Template) → `POST /api/v1/emails/send`
- Send Email (Custom) → `POST /api/v1/emails/send`
- Create Template → `POST /api/v1/emails/templates`
- Get Template → `GET /api/v1/emails/templates/:id`
- Get Email Status → `GET /api/v1/emails/status/:id`

### Academic Service (Public Endpoints)

**Health:**
- Service Info → `GET /`
- Health Check → `GET /health`

---

## Troubleshooting Token Issues

### Issue: "Missing authorization header"

**Cause**: Token not set in environment

**Solution**:
1. Run Login request
2. Check console logs for "✅ Access token saved"
3. Verify in environment configuration

### Issue: "Invalid token"

**Cause**: Token expired or malformed

**Solution**:
1. Run Refresh request
2. If refresh fails, run Login again
3. Check token format in environment (should start with "eyJ")

### Issue: "Insufficient permissions"

**Cause**: User doesn't have required permission

**Solution**:
1. Login with an account that has the required permission
2. For admin operations, use super_admin account
3. Check role permissions in database

### Issue: Academic Service returns 401

**Cause**: JWT structure incompatibility (see TROUBLESHOOTING.md)

**Solution**:
- This is a backend architecture issue
- IAM and Academic services have incompatible JWT structures
- Backend fix required

### Issue: Token not being saved

**Cause**: Login request failed or script error

**Solution**:
1. Check response status is 200
2. Check response body has `access_token` field
3. Check Bruno console for errors
4. Verify post-response script is present in Login.bru

---

## Security Best Practices

### ✅ DO:
- Use environment variables for tokens
- Keep tokens secure and don't commit to git
- Use different environments for dev/staging/prod
- Refresh tokens before they expire
- Logout when done

### ❌ DON'T:
- Hardcode tokens in request files
- Share tokens between users
- Commit tokens to version control
- Use production tokens in development
- Store tokens in insecure locations

---

## Environment Configuration

### Default Environment (`GradeLoop`)

```
BASE_URL: http://localhost:8000
IAM_BASE_URL: {{BASE_URL}}
EMAIL_BASE_URL: {{BASE_URL}}
ACADEMIC_BASE_URL: {{BASE_URL}}
AUTH_URL_V1: {{BASE_URL}}/api/v1/auth
USERS_URL_V1: {{BASE_URL}}/api/v1/users
ROLES_URL_V1: {{BASE_URL}}/api/v1/roles
PERMISSIONS_URL_V1: {{BASE_URL}}/api/v1/permissions
ADMIN_URL_V1: {{BASE_URL}}/api/v1/admin
EMAIL_URL_V1: {{BASE_URL}}/api/v1/emails
FACULTIES_URL_V1: {{BASE_URL}}/api/v1/faculties
ACCESS_TOKEN: (auto-set on login)
REFRESH_TOKEN: (auto-set on login)
```

### Creating New Environments

For staging or production:

1. Duplicate the GradeLoop environment
2. Rename to "Staging" or "Production"
3. Update `BASE_URL` to match your environment
4. Login with appropriate credentials
5. Tokens will be saved to that environment

---

## Testing Token Management

### Test 1: Verify Auto-Save

1. Run `IAM Service > Auth > Login`
2. Check console output
3. Should see: "✅ Access token saved to environment"
4. Should see: "✅ Refresh token saved to environment"
5. Should see: "Token payload: {...}"

### Test 2: Verify Token Usage

1. After login, run `IAM Service > Users > List Users`
2. Request should succeed (200 OK)
3. Token is automatically included in Authorization header

### Test 3: Verify Refresh

1. Wait for token to expire (15 minutes) or manually expire it
2. Try any authenticated request
3. Should get 401 Unauthorized
4. Run `IAM Service > Auth > Refresh`
5. Check console for token save confirmation
6. Retry original request
7. Should succeed (200 OK)

---

## FAQ

**Q: Do I need to copy tokens manually?**
A: No! Tokens are automatically saved and used.

**Q: How long are tokens valid?**
A: Access tokens: 15 minutes. Refresh tokens: 7 days (configurable).

**Q: What happens when my token expires?**
A: You'll get a 401 error. Run the Refresh request to get a new token.

**Q: Can I use the same token across environments?**
A: No, each environment has its own tokens. Login separately for dev/staging/prod.

**Q: Where are tokens stored?**
A: In Bruno's environment configuration. They persist across sessions.

**Q: Can I see my current token?**
A: Yes, check the environment configuration or console logs after login.

**Q: Why do Academic Service requests fail with 401?**
A: There's a JWT structure incompatibility. See TROUBLESHOOTING.md for details.

**Q: Do Email Service requests need tokens?**
A: No, Email Service is internal and doesn't require authentication.

---

## Related Documentation

- [README.md](./README.md) - Complete collection guide
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Common issues and solutions
- [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) - Quick lookup guide
- [API_DOCUMENTATION.md](../API_DOCUMENTATION.md) - Complete API specs

---

## Support

If you encounter token-related issues:

1. Check this document first
2. Review TROUBLESHOOTING.md
3. Check Bruno console logs
4. Verify environment configuration
5. Try logging in again
6. Contact the development team

---

**Remember**: Tokens are automatically managed. Just login and start making requests! 🚀