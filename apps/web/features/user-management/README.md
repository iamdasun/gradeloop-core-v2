# User Management Feature

This feature provides a comprehensive user management interface for administrators to manage institute members.

## Structure

```
features/user-management/
├── api/
│   └── get-users.ts          # API fetchers with Zod validation
├── hooks/
│   └── use-users.ts           # TanStack Query hooks
├── components/
│   ├── user-management-page.tsx  # Main page component
│   ├── user-row.tsx           # Individual user row
│   ├── table-header.tsx       # Table header with sorting
│   ├── filter-controls.tsx    # Search and filter controls
│   └── pagination-controls.tsx # Pagination UI
```

## Tech Stack

- **State Management**: React hooks + TanStack Query
- **Validation**: Zod schemas
- **UI Components**: shadcn/ui (Radix UI primitives)
- **Styling**: TailwindCSS v4
- **Date Formatting**: date-fns

## Features

- ✅ User listing with pagination
- ✅ Search by name, email, or ID
- ✅ Filter by role and status
- ✅ Sort by name, role, status, and last login
- ✅ Bulk selection
- ✅ Individual user actions (edit, delete, status change)
- ✅ Responsive design
- ✅ Tab filtering (All Users, Employees, Students)
- ✅ Real-time user counts

## API Endpoints

The feature expects the following API endpoints:

### GET `/users`
Query parameters:
- `search` (optional): Search term
- `role` (optional): Filter by role (admin, teacher, student, employee)
- `status` (optional): Filter by status (active, inactive, suspended)
- `page` (default: 1): Current page
- `per_page` (default: 10): Items per page

Response:
```typescript
{
  data: UserManagement[],
  total: number,
  page: number,
  per_page: number,
  total_pages: number
}
```

### GET `/users/:id`
Get a single user by ID.

### GET `/users/counts`
Get user counts for tabs.

Response:
```typescript
{
  all: number,
  employees: number,
  students: number
}
```

### DELETE `/users/:id`
Delete a user.

### PATCH `/users/:id/status`
Update user status.

Body:
```typescript
{
  status: "active" | "inactive" | "suspended"
}
```

## Usage

The page is accessible at `/admin/users`.

## Development

### Add New Columns
1. Update `UserManagementSchema` in `schemas/user-management.schema.ts`
2. Add column in `TableHeader` component
3. Display data in `UserRow` component

### Add New Filters
1. Add state in `UserManagementPage`
2. Add UI control in `FilterControls`
3. Include in `queryParams` useMemo

### Styling
All components use shadcn/ui with semantic tokens from globals.css. Follow the existing pattern for consistency.

## Notes

- Follow the "Golden Pipeline" pattern: Zod Schema → API Fetcher → TanStack Query Hook
- Never use raw API responses without validation
- All dates are ISO 8601 strings from the API
- Avatar fallbacks show user initials
- The page is fully type-safe with TypeScript strict mode
