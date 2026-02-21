# User Management System - Setup & Testing Guide

## 🚀 Quick Start

### Prerequisites

1. **Backend Service (IAM Service) Running**
   - The IAM service must be running on `http://localhost:8081`
   - Database must be initialized with migrations
   - At least one role must exist in the database

2. **Frontend Dependencies Installed**
   ```bash
   cd apps/web
   bun install
   ```

3. **Environment Variables**
   Create `.env.local` in `apps/web/`:
   ```env
   NEXT_PUBLIC_IAM_SERVICE_URL=http://localhost:8081
   ```

### Running the Application

1. **Start the IAM Service**
   ```bash
   cd apps/services/iam-service
   go run cmd/main.go
   ```

2. **Start the Web Application**
   ```bash
   cd apps/web
   bun run dev
   ```

3. **Access the User Management Page**
   - Navigate to: `http://localhost:3000/admin/users`
   - Ensure you're logged in as an admin user

## 📁 What Was Implemented

### New Files Created

#### Type Definitions
- `apps/web/lib/types/iam.ts` - Complete TypeScript types for IAM entities

#### API Client
- `apps/web/lib/api/iam.ts` - Full API integration layer with error handling

#### UI Components
- `apps/web/components/ui/alert.tsx` - Alert component for notifications
- `apps/web/components/ui/radio-group.tsx` - Radio button group component

#### User Management Components
- `apps/web/app/admin/users/page.tsx` - Main page (completely rewritten)
- `apps/web/app/admin/users/components/user-stats.tsx` - Statistics cards
- `apps/web/app/admin/users/components/users-table.tsx` - Data table with filters
- `apps/web/app/admin/users/components/create-user-dialog.tsx` - Create user form
- `apps/web/app/admin/users/components/edit-user-dialog.tsx` - Edit user form
- `apps/web/app/admin/users/components/delete-user-dialog.tsx` - Delete confirmation

#### Documentation
- `apps/web/app/admin/users/README.md` - Comprehensive component documentation
- `USER_MANAGEMENT_SETUP.md` - This file

#### Dependencies Added
- `date-fns` - Date formatting utility
- `@radix-ui/react-radio-group` - Radio button primitive

### Features Implemented

✅ **User CRUD Operations**
- Create users (with student/employee profiles)
- Read/List users (with pagination)
- Update users (role and active status)
- Delete users (soft delete)

✅ **User Type Support**
- Student users (with Student ID)
- Employee users (with Designation)
- Conditional form fields based on type

✅ **Search & Filtering**
- Search by username, email, role, student ID, designation
- Filter by user type (all/student/employee)
- Filter by status (all/active/inactive)

✅ **Activation System**
- Generates activation links for new users
- Copy-to-clipboard functionality
- Clear user feedback

✅ **Real-time Statistics**
- Total users
- Active/Inactive counts
- Student/Employee counts

✅ **Error Handling**
- API error handling
- Form validation
- Toast notifications
- Loading states

✅ **Responsive Design**
- Mobile-friendly tables
- Adaptive layouts
- Touch-friendly controls

## 🧪 Testing Guide

### 1. Test User Creation

#### Test Case: Create a Student User
1. Click "Add User" button
2. Fill in the form:
   - Username: `john.doe`
   - Email: `john.doe@example.com`
   - Role: Select any available role
   - User Type: Select "Student"
   - Student ID: `S12345`
3. Click "Create User"
4. **Expected Result**: 
   - Success toast notification
   - Activation link displayed
   - User appears in the table after refresh

#### Test Case: Create an Employee User
1. Click "Add User" button
2. Fill in the form:
   - Username: `jane.smith`
   - Email: `jane.smith@example.com`
   - Role: Select any available role
   - User Type: Select "Employee"
   - Designation: `Lecturer`
3. Click "Create User"
4. **Expected Result**:
   - Success toast notification
   - Activation link displayed
   - User appears in the table

#### Test Case: Validation Errors
1. Click "Add User"
2. Try to submit with empty fields
3. **Expected Result**: Error messages for required fields

4. Enter invalid email (e.g., "notanemail")
5. **Expected Result**: Email format error

6. Enter username less than 3 characters
7. **Expected Result**: Username length error

### 2. Test User Editing

#### Test Case: Change User Role
1. Find a user in the table
2. Click actions menu (⋮) → "Edit User"
3. Change the role
4. Click "Save Changes"
5. **Expected Result**:
   - Success notification
   - Table refreshes with new role

#### Test Case: Toggle Active Status
1. Click actions menu → "Edit User"
2. Toggle the "Active Status" switch
3. Click "Save Changes"
4. **Expected Result**:
   - Status badge updates in table
   - User active/inactive status changed

### 3. Test User Deletion

#### Test Case: Delete User
1. Click actions menu → "Delete User"
2. Confirm deletion
3. **Expected Result**:
   - Success notification
   - User removed from table
   - User is soft-deleted (not permanently removed)

### 4. Test Search & Filtering

#### Test Case: Search Functionality
1. Enter a username in search box
2. **Expected Result**: Table filters to matching users

3. Enter an email
4. **Expected Result**: Table filters to matching users

5. Enter a student ID
6. **Expected Result**: Student with that ID appears

#### Test Case: User Type Filter
1. Select "Students" from user type dropdown
2. **Expected Result**: Only students shown

3. Select "Employees"
4. **Expected Result**: Only employees shown

#### Test Case: Status Filter
1. Select "Active" from status dropdown
2. **Expected Result**: Only active users shown

3. Select "Inactive"
4. **Expected Result**: Only inactive users shown

### 5. Test Statistics

#### Test Case: Stats Update
1. Note the current statistics
2. Create a new user
3. **Expected Result**: Total users count increases

4. Create a student
5. **Expected Result**: Students count increases

6. Create an employee
7. **Expected Result**: Employees count increases

### 6. Test Error Scenarios

#### Test Case: Duplicate Username
1. Try to create a user with existing username
2. **Expected Result**: "Username already exists" error

#### Test Case: Duplicate Email
1. Try to create a user with existing email
2. **Expected Result**: "Email already exists" error

#### Test Case: Backend Offline
1. Stop the IAM service
2. Try to load the page
3. **Expected Result**: Error alert with message

4. Try to create a user
5. **Expected Result**: Error notification

### 7. Test Pagination

#### Test Case: Pagination (if > 50 users)
1. If you have more than 50 users:
2. **Expected Result**: Pagination controls appear
3. Click "Next"
4. **Expected Result**: Next page of users loads
5. Click "Previous"
6. **Expected Result**: Previous page loads

## 🔍 Manual Testing Checklist

### Visual Testing
- [ ] All statistics cards display correctly
- [ ] Table is readable and formatted properly
- [ ] Badges show correct colors (role, type, status)
- [ ] Dialogs open and close smoothly
- [ ] Forms are well-aligned
- [ ] Buttons are accessible and styled correctly
- [ ] Loading spinners appear during async operations

### Functional Testing
- [ ] Can create student user
- [ ] Can create employee user
- [ ] Can edit user role
- [ ] Can toggle user active status
- [ ] Can delete user
- [ ] Can search users
- [ ] Can filter by user type
- [ ] Can filter by status
- [ ] Can refresh data
- [ ] Activation link can be copied

### Error Handling Testing
- [ ] Form validation works
- [ ] Duplicate username error shown
- [ ] Duplicate email error shown
- [ ] Backend offline handled gracefully
- [ ] Invalid data rejected
- [ ] Network errors show notifications

### Responsive Testing
- [ ] Works on mobile viewport
- [ ] Works on tablet viewport
- [ ] Works on desktop viewport
- [ ] Tables scroll horizontally on small screens
- [ ] Dialogs are responsive

## 🐛 Common Issues & Solutions

### Issue: "Failed to load data"
**Symptoms**: Error alert on page load
**Solutions**:
1. Check IAM service is running: `curl http://localhost:8081/health`
2. Verify `.env.local` has correct URL
3. Check browser console for CORS errors
4. Verify you're logged in (check cookies for `access_token`)

### Issue: "Unauthorized" error
**Symptoms**: 401 error when calling APIs
**Solutions**:
1. Log in again to refresh token
2. Check token in browser cookies (DevTools → Application → Cookies)
3. Verify user has correct permissions in backend

### Issue: User not appearing after creation
**Symptoms**: Success message but user not in table
**Solutions**:
1. Click the refresh button
2. Check if filters are hiding the user
3. Verify user was created in database
4. Check backend logs for errors

### Issue: Activation link not copying
**Symptoms**: Copy button doesn't work
**Solutions**:
1. Check browser supports clipboard API
2. Try manual copy (select and Ctrl+C)
3. Check console for errors

### Issue: Form validation not working
**Symptoms**: Can submit invalid data
**Solutions**:
1. Check browser console for errors
2. Verify all validation rules in `create-user-dialog.tsx`
3. Test each field individually

## 📊 Backend Integration Points

### Required Backend Endpoints
Ensure your IAM service has these endpoints working:

```
GET    /users?page=1&limit=50&user_type=all
POST   /users
PUT    /users/:id
DELETE /users/:id
GET    /roles
```

### Expected Request/Response Formats

#### Create User Request
```json
{
  "username": "john.doe",
  "email": "john.doe@example.com",
  "role_id": "uuid-here",
  "user_type": "student",
  "student_id": "S12345"
}
```

#### Create User Response
```json
{
  "id": "uuid-here",
  "username": "john.doe",
  "email": "john.doe@example.com",
  "role_id": "uuid-here",
  "is_active": false,
  "activation_link": "/auth/activate?token=xxx",
  "message": "User created successfully"
}
```

#### List Users Response
```json
{
  "users": [
    {
      "id": "uuid",
      "username": "john.doe",
      "email": "john.doe@example.com",
      "role_id": "uuid",
      "role_name": "Student",
      "user_type": "student",
      "student_id": "S12345",
      "is_active": true,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total_count": 1,
  "page": 1,
  "limit": 50
}
```

## 🔐 Security Considerations

### Authentication
- All API calls require valid JWT token
- Token stored in HTTP-only cookie named `access_token`
- Token automatically included in Authorization header

### Permissions
Users must have these permissions to access features:
- `users:read` - View users list
- `users:write` - Create/update users
- `users:delete` - Delete users

### Data Protection
- Passwords never sent to frontend
- Activation tokens have expiration
- Soft delete allows recovery
- User data validated on both client and server

## 📈 Performance Considerations

### Optimizations Implemented
- Client-side search and filtering (fast)
- Pagination to limit data transfer
- Lazy loading of dialogs
- Optimistic UI updates where possible

### Recommended Backend Optimizations
- Add server-side search endpoint
- Implement cursor-based pagination for large datasets
- Cache role data (changes infrequently)
- Add database indexes on commonly queried fields

## 🎯 Next Steps

After verifying everything works:

1. **Add Role Management UI** (similar structure)
   - Create, edit, delete roles
   - Assign permissions to roles

2. **Add Permission Management UI**
   - View all permissions
   - Create new permissions
   - Assign to roles

3. **Enhance User Management**
   - Bulk user import
   - Export users to CSV
   - User activity logs
   - Password reset flow

4. **Email Integration**
   - Send activation links via email
   - Welcome emails
   - Password reset emails

5. **Advanced Features**
   - Audit trail
   - User sessions management
   - Two-factor authentication
   - User groups/teams

## 📚 Additional Resources

- **Component Documentation**: `apps/web/app/admin/users/README.md`
- **IAM Service API**: `apps/services/iam-service/README.md` (if available)
- **Shadcn UI Components**: https://ui.shadcn.com/
- **React Hook Form**: https://react-hook-form.com/
- **TanStack Table**: https://tanstack.com/table/latest

## ✅ Verification Checklist

Before considering the implementation complete:

- [ ] All CRUD operations work
- [ ] Search and filters work
- [ ] Statistics display correctly
- [ ] All dialogs open/close properly
- [ ] Activation links are generated
- [ ] Error handling works
- [ ] Loading states appear
- [ ] Toast notifications work
- [ ] Responsive on all screen sizes
- [ ] No console errors
- [ ] No TypeScript errors
- [ ] Code is documented
- [ ] README is complete

---

**Implementation Status**: ✅ Complete

**Last Updated**: 2024

**Maintainer**: Development Team