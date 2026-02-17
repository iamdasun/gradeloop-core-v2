# Role Permission Configuration - Implementation

## Overview
Complete implementation of Role-Based Access Control (RBAC) permission configuration interface following strict Next.js + shadcn/ui + TanStack Query patterns.

## Features Implemented

### ✅ Core Functionality
- **Role Details Management**: Edit role name, description, and active status
- **Permission Matrix**: Visual grid showing modules, resources, and CRUD+Manage permissions
- **Toggle Controls**: Custom Switch components for each permission
- **Search & Filter**: Real-time search across modules and resources
- **Bulk Actions**: Select All functionality per module
- **Locked Permissions**: Support for read-only permissions that cannot be changed
- **Not Applicable State**: Display "-" for permissions that don't apply to certain resources
- **Unsaved Changes Detection**: Track local changes before commit
- **Optimistic Updates**: Immediate UI feedback with TanStack Query

### ✅ Data Architecture (Golden Pipeline)

**Schemas** (`schemas/role-permission.schema.ts`):
- `PermissionActionSchema` - View, Create, Edit, Delete, Manage
- `ResourcePermissionSchema` - Individual resource with its actions
- `ModulePermissionSchema` - Module containing multiple resources
- `RoleWithPermissionsSchema` - Complete role with full permission tree
- `UpdateRoleSchema`, `UpdatePermissionsSchema` - Mutation payloads

**API Layer** (`features/role-permissions/api/roles.ts`):
- `getRoleWithPermissions()` - Fetch role with full permission tree
- `getRoles()` - List all roles (minimal data)
- `updateRole()` - Update role basic info
- `updateRolePermissions()` - Batch update permissions
- `deleteRole()` - Remove role
- All responses validated with Zod

**Hooks** (`features/role-permissions/hooks/use-roles.ts`):
- `useRoleWithPermissions()` - Query hook with caching
- `useRoles()` - List query
- `useUpdateRole()` - Mutation for role info
- `useUpdateRolePermissions()` - Mutation for permissions
- `useDeleteRole()` - Delete mutation
- Automatic cache invalidation on mutations

### ✅ UI Components

**Main Page** (`components/role-permission-config-page.tsx`):
- Sticky header with breadcrumbs and action buttons
- Two-column layout (sidebar + matrix)
- Search functionality
- Unsaved changes tracking
- Save/Cancel with confirmation

**Sidebar** (`components/role-details-sidebar.tsx`):
- Editable role name and description
- Active status toggle
- Assigned users count display
- System role protection (read-only for system roles)

**Module Section** (`components/module-section.tsx`):
- Collapsible module sections
- Icon support per module
- Select All per module
- Resource rows with permission toggles
- Hover states for better UX

**Permission Toggle** (`components/permission-toggle.tsx`):
- Custom Switch component
- Locked state support
- Not Applicable display
- Tooltip for locked permissions

### ✅ New shadcn/ui Components Added
- **Switch** (`components/ui/switch.tsx`) - Radix UI Switch with custom styling
- **Textarea** (`components/ui/textarea.tsx`) - Multi-line text input

### ✅ Dependencies Installed
- `@radix-ui/react-switch` - Switch primitive

## File Structure

```
schemas/
└── role-permission.schema.ts

features/role-permissions/
├── api/
│   └── roles.ts
├── hooks/
│   └── use-roles.ts
└── components/
    ├── role-permission-config-page.tsx
    ├── role-details-sidebar.tsx
    ├── module-section.tsx
    └── permission-toggle.tsx

app/admin/roles/
└── [roleId]/
    └── page.tsx

components/ui/
├── switch.tsx (NEW)
└── textarea.tsx (NEW)
```

## Usage

### Access the Page
Navigate to: `/admin/roles/{roleId}`

Example: `/admin/roles/123e4567-e89b-12d3-a456-426614174000`

### Expected API Contract

**GET** `/roles/{roleId}/permissions`
```json
{
  "id": "uuid",
  "name": "Department Head",
  "description": "Full access to course content...",
  "is_active": true,
  "is_system_role": false,
  "assigned_users_count": 24,
  "modules": [
    {
      "module_id": "user-management",
      "module_name": "User Management",
      "resources": [
        {
          "resource_id": "users",
          "resource_name": "Users",
          "resource_description": "Manage student and faculty accounts",
          "actions": {
            "view": true,
            "create": true,
            "edit": true,
            "delete": false,
            "manage": false
          },
          "locked_actions": ["delete"]
        }
      ]
    }
  ]
}
```

**PATCH** `/roles/{roleId}`
```json
{
  "name": "Updated Role Name",
  "description": "Updated description",
  "is_active": true
}
```

**PATCH** `/roles/{roleId}/permissions`
```json
{
  "role_id": "uuid",
  "permissions": [
    {
      "module_id": "user-management",
      "resource_id": "users",
      "action": "view",
      "enabled": true
    }
  ]
}
```

## Key Features

### Permission States
1. **Enabled** - Toggle is ON, permission granted
2. **Disabled** - Toggle is OFF, permission denied
3. **Locked** - Cannot be changed (grayed out with tooltip)
4. **Not Applicable** - Shows "-", action doesn't apply to this resource

### Module Icons
Predefined icons for common modules:
- `user-management` → Users icon
- `courses` → School icon
- `evaluations` → FileCheck icon
- Default: Users icon

### System Role Protection
Roles with `is_system_role: true` cannot be edited (all inputs disabled).

### Local State Management
- Uses React state for immediate UI updates
- Tracks changes in a `Map<string, boolean>`
- Only saves changed permissions (not entire state)
- Displays "Save Changes" button only when changes exist

## Styling

- Uses semantic tokens from `globals.css`
- Primary color: `oklch(0.58 0.12 195)` 
- Hover states with primary color tint
- Smooth transitions on all interactive elements
- Sticky header for persistent actions
- Responsive grid layout (mobile-friendly)

## Compliance Checklist

✅ Bun package manager  
✅ Next.js 16 App Router (dynamic route with async params)  
✅ shadcn/ui components  
✅ TanStack Query v5  
✅ Axios with Zod validation  
✅ No `as Type` assertions  
✅ Strict TypeScript  
✅ lucide-react icons (no Material Icons)  
✅ Semantic color tokens  
✅ Accessible (WCAG 2.1 AA)  
✅ Keyboard navigable  

## Testing

```bash
# Development
cd apps/web
bun run dev
# Visit: http://localhost:3000/admin/roles/{roleId}

# Production build
bun run build
# ✓ Route shows as: ƒ /admin/roles/[roleId]
```

## Future Enhancements

1. **Expand/Collapse All** - Toggle all modules at once
2. **Permission Presets** - Quick apply common permission sets
3. **Copy from Role** - Duplicate permissions from another role
4. **Change History** - Audit log of permission changes
5. **Bulk Edit Mode** - Select multiple resources at once
6. **Permission Dependencies** - Auto-enable required permissions
7. **Custom Permissions** - Add role-specific permissions
8. **Export/Import** - JSON export of permission configuration
