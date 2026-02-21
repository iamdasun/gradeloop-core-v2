# Quick Start Guide - Layout System

## 🚀 Getting Started

The layout system is ready to use! Here's everything you need to know to get started quickly.

## ✅ What's Included

### 1. **Dark Mode Support**
- Toggle between Light, Dark, and System themes
- Look for the sun/moon icon in the top-right corner
- Your preference is automatically saved

### 2. **Role-Based Dashboards**
Three pre-built dashboards for different user roles:

- **Admin Dashboard** → `/admin`
  - System overview with statistics
  - User management page
  
- **Instructor Dashboard** → `/instructor`
  - Course management
  - Student overview
  - Quick actions for common tasks
  
- **Student Dashboard** → `/student`
  - Enrolled courses
  - Upcoming assignments
  - Recent grades

## 🎨 Using Dark Mode

The theme toggle is located in the top navigation bar. Click it to choose:
- ☀️ **Light Mode** - Bright, clean interface
- 🌙 **Dark Mode** - Easy on the eyes
- 💻 **System** - Follows your OS preference

## 🧭 Navigation

Each role has a custom sidebar with relevant links:

### Admin
```
📊 Overview
👥 User Management
⚙️ Settings
```

### Instructor
```
📊 Dashboard
📚 Courses
📝 Assignments
🎓 Students
📈 Analytics
⚙️ Settings
```

### Student
```
📊 Dashboard
📚 My Courses
📝 Assignments
📈 Grades
📅 Calendar
⚙️ Settings
```

## 🔐 Authentication & Routing

The middleware automatically protects routes:
- `/admin/*` - Admins only
- `/instructor/*` - Instructors only
- `/student/*` - Students only

Unauthenticated users are redirected to login.

## 🛠️ Creating a New Page

### Step 1: Create the Page File
```bash
# For admin
touch app/admin/my-page/page.tsx

# For instructor
touch app/instructor/my-page/page.tsx

# For student
touch app/student/my-page/page.tsx
```

### Step 2: Write Your Component
```tsx
"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function MyPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Page</h1>
        <p className="text-muted-foreground mt-2">
          Page description goes here
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Card Title</CardTitle>
        </CardHeader>
        <CardContent>
          Your content here
        </CardContent>
      </Card>
    </div>
  );
}
```

### Step 3: Add Navigation Link
Edit `lib/nav-config.tsx`:

```tsx
import { YourIcon } from "lucide-react";

export const ADMIN_NAV_ITEMS: NavItem[] = [
  // ... existing items
  {
    label: "My Page",
    href: "/admin/my-page",
    icon: <YourIcon className="h-5 w-5" />,
    roles: ["admin"],
  },
];
```

## 📦 Available UI Components

### Cards
```tsx
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>
    Content
  </CardContent>
</Card>
```

### Buttons
```tsx
<Button variant="default">Primary</Button>
<Button variant="outline">Secondary</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="destructive">Danger</Button>
```

### Badges
```tsx
<Badge variant="default">Default</Badge>
<Badge variant="secondary">Secondary</Badge>
<Badge variant="destructive">Error</Badge>
<Badge variant="outline">Outline</Badge>
```

### Stats Card
```tsx
<Card>
  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
    <CardTitle className="text-sm font-medium">Total Users</CardTitle>
    <Users className="h-4 w-4 text-muted-foreground" />
  </CardHeader>
  <CardContent>
    <div className="text-2xl font-bold">1,234</div>
    <p className="text-xs text-muted-foreground">
      <span className="text-green-600 dark:text-green-400">+12.5%</span> from last month
    </p>
  </CardContent>
</Card>
```

## 🎨 Dark Mode Styling

Use the `dark:` prefix for dark mode styles:

```tsx
<div className="bg-white dark:bg-zinc-900">
  <p className="text-black dark:text-white">
    Adapts to theme
  </p>
</div>
```

Common patterns:
```tsx
// Backgrounds
className="bg-white dark:bg-zinc-900"
className="bg-zinc-50 dark:bg-zinc-800"

// Text
className="text-zinc-900 dark:text-zinc-100"
className="text-zinc-600 dark:text-zinc-400"

// Borders
className="border-zinc-200 dark:border-zinc-800"

// Hover states
className="hover:bg-zinc-100 dark:hover:bg-zinc-800"
```

## 🔍 Using User Data

Access authenticated user information:

```tsx
"use client";

import { useAuth } from "@/hooks/use-auth";

export default function MyComponent() {
  const { user, role, permissions, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <div>Please log in</div>;
  }

  return (
    <div>
      <h1>Welcome, {user?.name}!</h1>
      <p>Your role: {role}</p>
      <p>Permissions: {permissions.join(", ")}</p>
    </div>
  );
}
```

## 📱 Responsive Design

The layout is fully responsive:
- **Mobile** - Sidebar collapses to icon-only
- **Tablet** - Compact sidebar
- **Desktop** - Full sidebar with labels

Use Tailwind breakpoints:
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
  {/* Responsive grid */}
</div>
```

## 🎯 Common Patterns

### Stats Grid
```tsx
<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
  <Card>...</Card>
  <Card>...</Card>
  <Card>...</Card>
  <Card>...</Card>
</div>
```

### Content with Sidebar
```tsx
<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
  <Card className="col-span-4">
    {/* Main content */}
  </Card>
  <Card className="col-span-3">
    {/* Sidebar content */}
  </Card>
</div>
```

### List Items
```tsx
<div className="space-y-4">
  {items.map((item) => (
    <div 
      key={item.id}
      className="flex items-start gap-4 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
    >
      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium">{item.title}</p>
        <p className="text-xs text-muted-foreground">{item.description}</p>
      </div>
    </div>
  ))}
</div>
```

## 🎭 Icons

Use Lucide React icons:

```tsx
import { 
  Users, 
  BookOpen, 
  FileText, 
  Settings,
  Bell,
  Search 
} from "lucide-react";

<Users className="h-5 w-5" />
<BookOpen className="h-4 w-4 text-muted-foreground" />
```

Browse all icons: https://lucide.dev

## 🐛 Troubleshooting

### Theme not switching?
- Refresh the page
- Check browser console for errors
- Clear browser cache and localStorage

### Navigation not showing?
- Verify you're logged in with the correct role
- Check `lib/nav-config.tsx` for your role's nav items
- Ensure the route exists

### Layout not applying?
- Make sure your route has a `layout.tsx` file
- Verify `AppLayout` is imported correctly
- Check middleware allows access to the route

## 📚 Additional Resources

- Full documentation: See `LAYOUT_SYSTEM.md`
- UI components: `components/ui/`
- Navigation config: `lib/nav-config.tsx`
- Auth hook: `hooks/use-auth.ts`

## 🎉 You're Ready!

The layout system is ready to use. Start building your features and the layout will automatically adapt based on the user's role and theme preference.

Happy coding! 🚀