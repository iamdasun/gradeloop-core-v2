# Layout System Documentation

## Overview

This document describes the layout system implemented for the Gradeloop application, which provides role-based layouts with dark mode support for Admin, Instructor, and Student users.

## Features

### 1. **Theme Switching (Dark Mode)**
- Implemented using `next-themes` package
- Supports three modes: Light, Dark, and System (follows OS preference)
- Theme toggle button in the top navbar
- Smooth transitions between themes
- Persists user preference across sessions

### 2. **Role-Based Navigation**
The application automatically shows different navigation items based on the user's role:

#### Admin Navigation (`/admin` routes)
- Overview - Dashboard with system statistics
- User Management - Manage all users, roles, and permissions

#### Instructor Navigation (`/instructor` routes)
- Dashboard - Course and student overview
- Courses - Manage course content
- Assignments - Create and grade assignments
- Students - View enrolled students
- Analytics - Performance metrics

#### Student Navigation (`/student` routes)
- Dashboard - Personal academic overview
- My Courses - Enrolled courses
- Assignments - View and submit work
- Grades - Academic performance
- Calendar - Schedule and deadlines

### 3. **Shared Layout Components**
All user roles share the same layout structure with:
- Collapsible sidebar with smooth animations
- Top navigation bar with breadcrumbs
- Search functionality
- Notifications bell
- User profile avatar
- Theme toggle button

## File Structure

```
apps/web/
├── app/
│   ├── layout.tsx                    # Root layout with ThemeProvider
│   ├── admin/
│   │   ├── layout.tsx                # Admin layout wrapper
│   │   ├── page.tsx                  # Admin overview/dashboard
│   │   └── users/
│   │       └── page.tsx              # User management page
│   ├── instructor/
│   │   ├── layout.tsx                # Instructor layout wrapper
│   │   └── page.tsx                  # Instructor dashboard
│   └── student/
│       ├── layout.tsx                # Student layout wrapper
│       └── page.tsx                  # Student dashboard
├── components/
│   ├── app-layout.tsx                # Main layout component with sidebar
│   ├── top-navbar.tsx                # Top navigation bar
│   ├── theme-provider.tsx            # Theme provider wrapper
│   ├── theme-toggle.tsx              # Theme toggle button
│   └── ui/                           # Reusable UI components
├── hooks/
│   └── use-auth.ts                   # Authentication hook
└── lib/
    └── nav-config.tsx                # Navigation configuration by role
```

## Components

### ThemeProvider
Located in `components/theme-provider.tsx`

Wraps the entire application to provide theme context.

```tsx
<ThemeProvider
  attribute="class"
  defaultTheme="system"
  enableSystem
  disableTransitionOnChange
>
  {children}
</ThemeProvider>
```

### ThemeToggle
Located in `components/theme-toggle.tsx`

Dropdown menu with three theme options:
- Light mode (Sun icon)
- Dark mode (Moon icon)
- System preference (Monitor icon)

### AppLayout
Located in `components/app-layout.tsx`

Main layout component that includes:
- Animated collapsible sidebar
- Logo with expand/collapse animation
- Role-based navigation links
- Settings link at the bottom
- Top navbar area
- Main content area with max-width container

### Navigation Configuration
Located in `lib/nav-config.tsx`

Exports navigation items for each role:
- `ADMIN_NAV_ITEMS`
- `INSTRUCTOR_NAV_ITEMS`
- `STUDENT_NAV_ITEMS`
- `getNavItemsForRole(role)` - Returns nav items based on role
- `filterNavByRole(items, role)` - Filters items by role

## Usage

### Creating a New Role-Specific Page

1. **Create the route folder** (if it doesn't exist):
```bash
mkdir -p app/[role]/[page-name]
```

2. **Add the page component**:
```tsx
// app/admin/new-page/page.tsx
"use client";

export default function NewPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Page Title</h1>
      {/* Your content */}
    </div>
  );
}
```

3. **Add navigation link** in `lib/nav-config.tsx`:
```tsx
export const ADMIN_NAV_ITEMS: NavItem[] = [
  // ... existing items
  {
    label: "New Page",
    href: "/admin/new-page",
    icon: <YourIcon className="h-5 w-5" />,
    roles: ["admin"],
  },
];
```

### Using the Layout

Each role directory has its own `layout.tsx` that wraps children with `AppLayout`:

```tsx
// app/admin/layout.tsx
import { AppLayout } from "@/components/app-layout";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppLayout>{children}</AppLayout>;
}
```

This ensures all pages within that role automatically get:
- The sidebar with role-specific navigation
- The top navbar with theme toggle
- Consistent styling and structure

### Accessing User Information

Use the `useAuth` hook to access user data:

```tsx
import { useAuth } from "@/hooks/use-auth";

export default function MyPage() {
  const { user, role, permissions, isAuthenticated } = useAuth();
  
  return (
    <div>
      <h1>Welcome, {user?.name}</h1>
      <p>Role: {role}</p>
    </div>
  );
}
```

### Theme-Aware Styling

The application uses Tailwind CSS with dark mode support. Use the `dark:` prefix for dark mode styles:

```tsx
<div className="bg-white dark:bg-zinc-900 text-black dark:text-white">
  Content that adapts to theme
</div>
```

## Middleware Protection

Routes are protected by middleware in `middleware.ts`:
- `/admin/*` - Admin only
- `/instructor/*` - Instructor only
- `/student/*` - Student only

Authentication is checked via the `refresh_token` cookie. Unauthenticated users are redirected to `/auth/login`.

## UI Components

The application uses shadcn/ui components with custom theming:

### Cards
```tsx
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>
    Content
  </CardContent>
</Card>
```

### Badges
```tsx
import { Badge } from "@/components/ui/badge";

<Badge variant="default">Active</Badge>
<Badge variant="destructive">High Priority</Badge>
<Badge variant="secondary">Low Priority</Badge>
```

### Buttons
```tsx
import { Button } from "@/components/ui/button";

<Button variant="default">Primary</Button>
<Button variant="outline">Secondary</Button>
<Button variant="ghost">Tertiary</Button>
```

## Styling System

### Color Scheme
The application uses a consistent color scheme defined in `app/globals.css`:
- Primary: Purple/blue accent color
- Background: White (light) / Dark gray (dark)
- Foreground: Dark (light) / Light (dark)
- Muted: Subtle background variations
- Accent: Hover and focus states

### Responsive Design
- Mobile-first approach
- Breakpoints: `sm`, `md`, `lg`, `xl`, `2xl`
- Sidebar collapses on mobile
- Grid layouts adapt to screen size

### Animations
- Sidebar expand/collapse with framer-motion
- Smooth theme transitions
- Hover effects on interactive elements
- Loading states and skeletons

## Best Practices

1. **Always use "use client" directive** for components with interactivity
2. **Keep layouts minimal** - let page components define their content
3. **Use the useAuth hook** instead of directly accessing the auth store
4. **Follow the role-based structure** for new pages
5. **Test in both light and dark modes** when adding new components
6. **Use semantic HTML** and proper ARIA labels for accessibility
7. **Keep navigation items in sync** with actual routes

## Extending the System

### Adding a New Role

1. Create middleware protection in `middleware.ts`
2. Add navigation items in `lib/nav-config.tsx`
3. Create route folder: `app/[new-role]/`
4. Add layout: `app/[new-role]/layout.tsx`
5. Add dashboard: `app/[new-role]/page.tsx`
6. Update `getNavItemsForRole()` function

### Adding Theme Colors

Edit `app/globals.css`:
```css
:root {
  --your-color: oklch(...);
}

.dark {
  --your-color: oklch(...);
}
```

Then use in Tailwind:
```tsx
<div className="text-[color:var(--your-color)]">
  Content
</div>
```

## Troubleshooting

### Theme not persisting
- Check if `suppressHydrationWarning` is on the `<html>` tag
- Verify ThemeProvider is wrapping the app
- Check browser localStorage for theme preference

### Navigation not showing
- Verify user role is correctly set in auth store
- Check if navigation items include the user's role
- Ensure routes match navigation hrefs

### Layout not applying
- Confirm layout.tsx exists in the route folder
- Check if AppLayout is properly imported
- Verify middleware is allowing access to the route

## Future Enhancements

- [ ] Add user profile dropdown menu
- [ ] Implement notification system
- [ ] Add customizable dashboard widgets
- [ ] Support for multiple themes beyond light/dark
- [ ] Add keyboard shortcuts for navigation
- [ ] Implement breadcrumb navigation
- [ ] Add loading states for route transitions
- [ ] Support for nested navigation items