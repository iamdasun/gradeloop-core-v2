# User Management System - Admin Interface

## Overview

This is a comprehensive user management system for administrators that provides full CRUD operations for users, integrated with the IAM (Identity and Access Management) backend service.

## Features

### ✨ Core Functionality

1. **User Management**
   - Create new users (students and employees)
   - Edit existing users (role and active status)
   - Soft delete users
   - View detailed user information
   - Real-time data synchronization with backend

2. **User Types**
   - **Students**: Require Student ID
   - **Employees**: Require Designation (e.g., Lecturer, Professor)

3. **Search & Filtering**
   - Search by username, email, role, student ID, or designation
   - Filter by user type (All, Students, Employees)
   - Filter by status (All, Active, Inactive)

4. **Statistics Dashboard**
   - Total users count
   - Active/Inactive users
   - Students count
   - Employees count

5. **Activation System**
   - Users are created with `is_active: false`
   - Activation link is generated and displayed to admin
   - Users must activate their account using the link before logging in

## File Structure

```
app/admin/users/
├── page.tsx                          # Main user management page
├── components/
│   ├── user-stats.tsx               # Statistics cards
│   ├── users-table.tsx              # Data table with filters
│   ├── create-user-dialog.tsx       # Create user form
│   ├── edit-user-dialog.tsx         # Edit user form
│   └── delete-user-dialog.tsx       # Delete confirmation
└── README.md                        # This file

lib/
├── api/
│   └── iam.ts                       # IAM API client
└── types/
    └── iam.ts                       # TypeScript type definitions
```

## Components

### 1. UserStats Component
Displays real-time statistics about users in the system.

**Props:**
- `users: User[]` - Array of users
- `isLoading?: boolean` - Loading state

**Statistics Shown:**
- Total Users
- Active Users
- Inactive Users
- Students
- Employees

### 2. UsersTable Component
Main data table with search, filter, and action capabilities.

**Props:**
- `users: User[]` - Array of users to display
- `isLoading?: boolean` - Loading state
- `onEditUser: (user: User) => void` - Edit callback
- `onDeleteUser: (user: User) => void` - Delete callback
- `onRefresh: () => void` - Refresh data callback

**Features:**
- Search across multiple fields
- Filter by user type and status
- Sort by columns
- Row actions (Edit, Delete)
- Responsive design

### 3. CreateUserDialog Component
Form dialog for creating new users with validation.

**Props:**
- `open: boolean` - Dialog visibility
- `onOpenChange: (open: boolean) => void` - Dialog state handler
- `onUserCreated: () => void` - Success callback
- `roles: Role[]` - Available roles

**Fields:**
- Username* (required, min 3 characters)
- Email* (required, valid email format)
- Role* (required, dropdown)
- User Type* (required, radio: Student/Employee)
- Student ID* (required if Student)
- Designation* (required if Employee)

**Validation:**
- All required fields must be filled
- Email format validation
- Username minimum length (3 characters)
- Conditional validation based on user type

**Success Flow:**
1. User is created successfully
2. Activation link is displayed
3. Admin can copy the link to share with user
4. User must use link to activate account

### 4. EditUserDialog Component
Form dialog for editing existing users.

**Props:**
- `open: boolean` - Dialog visibility
- `onOpenChange: (open: boolean) => void` - Dialog state handler
- `user: User | null` - User to edit
- `onUserUpdated: () => void` - Success callback
- `roles: Role[]` - Available roles

**Editable Fields:**
- Role (dropdown)
- Active Status (toggle switch)

**Read-Only Fields:**
- Username
- Email
- User Type
- Student ID / Designation

**Notes:**
- Only role and active status can be modified
- Shows clear indication of read-only fields
- Explains what active/inactive means

### 5. DeleteUserDialog Component
Confirmation dialog for deleting users.

**Props:**
- `open: boolean` - Dialog visibility
- `onOpenChange: (open: boolean) => void` - Dialog state handler
- `user: User | null` - User to delete
- `onUserDeleted: () => void` - Success callback

**Features:**
- Shows user information before deletion
- Confirms that deletion is soft delete (can be restored)
- Destructive action styling
- Loading state during deletion

## API Integration

### Backend Service
- **Base URL**: `process.env.NEXT_PUBLIC_IAM_SERVICE_URL` or `http://localhost:8081`
- **Authentication**: Bearer token from cookies (`access_token`)

### API Endpoints

#### Users
```typescript
GET    /users?page=1&limit=50&user_type=all
POST   /users
PUT    /users/:id
DELETE /users/:id          // Soft delete
POST   /users/:id/restore  // Restore deleted user
```

#### Roles
```typescript
GET    /roles
GET    /roles/:id
POST   /roles
PUT    /roles/:id
DELETE /roles/:id
```

#### Permissions
```typescript
GET    /permissions
POST   /permissions
POST   /roles/:id/permissions  // Assign permission to role
```

### Error Handling
All API calls include comprehensive error handling:
- Network errors
- Authentication errors
- Validation errors
- Server errors

Errors are displayed using toast notifications with descriptive messages.

## Data Types

### User
```typescript
interface User {
  id: string;
  username: string;
  email: string;
  role_id: string;
  role_name: string;
  user_type: "student" | "employee" | "all";
  student_id?: string;
  designation?: string;
  is_active: boolean;
  last_login_at?: string;
  created_at: string;
}
```

### Role
```typescript
interface Role {
  id: string;
  name: string;
  is_system_role: boolean;
  permissions: Permission[];
}
```

### Permission
```typescript
interface Permission {
  id: string;
  name: string;
  description: string;
}
```

## Environment Variables

Create a `.env.local` file in the web app root:

```env
NEXT_PUBLIC_IAM_SERVICE_URL=http://localhost:8081
```

## Usage

### Accessing the Page
Navigate to `/admin/users` in your browser.

### Creating a User
1. Click "Add User" button
2. Fill in the form:
   - Enter username (min 3 characters)
   - Enter valid email
   - Select a role
   - Choose user type (Student or Employee)
   - If Student: Enter Student ID
   - If Employee: Enter Designation
3. Click "Create User"
4. Copy the activation link
5. Share the activation link with the user

### Editing a User
1. Click the actions menu (⋮) for the user
2. Select "Edit User"
3. Change role or active status
4. Click "Save Changes"

### Deleting a User
1. Click the actions menu (⋮) for the user
2. Select "Delete User"
3. Confirm deletion
4. User is soft-deleted (can be restored later)

### Searching and Filtering
- Use the search bar to find users by name, email, role, or ID
- Use "User Type" dropdown to filter by student/employee
- Use "Status" dropdown to filter by active/inactive
- Click refresh icon to reload data

## Pagination

- Default page size: 50 users per page
- Pagination controls shown when total users > page size
- Shows current page and total pages
- Previous/Next navigation buttons

## Permissions Required

To access this page, users must have the following permissions:
- `users:read` - View users
- `users:write` - Create/Update users
- `users:delete` - Delete users

## Best Practices

### Security
- All API calls use authentication tokens
- Tokens are stored in secure HTTP-only cookies
- Sensitive data (password hashes) never sent to frontend

### UX
- Loading states for all async operations
- Success/error feedback via toast notifications
- Disabled states during operations
- Clear validation messages
- Confirmation dialogs for destructive actions

### Performance
- Pagination to limit data fetched
- Efficient filtering on client-side
- Lazy loading of components
- Optimized re-renders using React best practices

## Troubleshooting

### Common Issues

**Issue**: "Failed to load data" error
- **Solution**: Check if IAM service is running on port 8081
- **Solution**: Verify `NEXT_PUBLIC_IAM_SERVICE_URL` in `.env.local`

**Issue**: "Unauthorized" error
- **Solution**: Check if user is logged in
- **Solution**: Verify authentication token in cookies
- **Solution**: Check user has required permissions

**Issue**: User not appearing after creation
- **Solution**: Click the refresh button
- **Solution**: Check if filters are applied
- **Solution**: Verify user was created successfully in backend

**Issue**: Activation link not working
- **Solution**: Check if token is not expired
- **Solution**: Verify IAM service is handling activation endpoint
- **Solution**: Check frontend activation page is configured

### Debug Mode

To enable detailed logging:
1. Open browser DevTools
2. Check Network tab for API calls
3. Check Console for error messages
4. Verify request/response payloads

## Future Enhancements

### Planned Features
- [ ] Bulk user import via CSV
- [ ] Export users to CSV/Excel
- [ ] Advanced filtering options
- [ ] User activity logs
- [ ] Password reset functionality
- [ ] Email integration for activation links
- [ ] Bulk operations (delete, activate multiple users)
- [ ] User profile pictures
- [ ] Audit trail for user changes

### API Enhancements Needed
- [ ] Search endpoint with backend filtering
- [ ] Bulk operations endpoint
- [ ] User activity logging
- [ ] Email service integration
- [ ] Restore deleted users endpoint (already exists)

## Contributing

When making changes to this module:

1. **Follow the existing patterns**
   - Use TypeScript for type safety
   - Follow component structure
   - Use existing UI components

2. **Test thoroughly**
   - Test all user flows
   - Test error scenarios
   - Test with different user types
   - Test permissions

3. **Update documentation**
   - Update this README
   - Add JSDoc comments to new functions
   - Update type definitions

4. **Code quality**
   - Run linter before committing
   - Fix all TypeScript errors
   - Follow React best practices

## Support

For issues or questions:
1. Check this documentation
2. Review API documentation in backend service
3. Check browser console for errors
4. Contact the development team

## License

Internal use only - Gradeloop Platform