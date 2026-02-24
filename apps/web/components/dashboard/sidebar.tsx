"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  FileText,
  Settings,
  GraduationCap,
  BarChart3,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LogOut,
  School,
  Building2,
  Award,
  Landmark,
  Users2,
  ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthStore } from "@/lib/stores/authStore";
import { useLogoutMutation } from "@/lib/hooks/useAuthMutation";

// ── Nav item type system ──────────────────────────────────────────────────────

interface NavLink {
  type?: "link";
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

interface NavChild {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  type: "group";
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Treated as the active root for pathname detection and collapsed-mode link */
  baseHref: string;
  children: NavChild[];
}

type NavItem = NavLink | NavGroup;

// ── Nav configuration ─────────────────────────────────────────────────────────

const adminNavItems: NavItem[] = [
  {
    title: "Dashboard",
    href: "/admin",
    icon: LayoutDashboard,
  },
  {
    title: "Users",
    href: "/admin/users",
    icon: Users,
  },
  {
    type: "group",
    title: "Academics",
    icon: School,
    baseHref: "/admin/academics",
    children: [
      {
        title: "Faculties",
        href: "/admin/academics/faculties",
        icon: Landmark,
      },
      {
        title: "Departments",
        href: "/admin/academics/departments",
        icon: Building2,
      },
      { title: "Degrees", href: "/admin/academics/degrees", icon: Award },
      { title: "Courses", href: "/admin/academics/courses", icon: BookOpen },
      {
        title: "Semesters",
        href: "/admin/academics/semesters",
        icon: Calendar,
      },
      { title: "Groups", href: "/admin/academics/groups", icon: Users2 },
      {
        title: "Enrollment",
        href: "/admin/academics/enrollment",
        icon: ClipboardList,
      },
    ],
  },
  {
    title: "Assignments",
    href: "/admin/assignments",
    icon: FileText,
  },
  {
    title: "Students",
    href: "/admin/students",
    icon: GraduationCap,
  },
  {
    title: "Analytics",
    href: "/admin/analytics",
    icon: BarChart3,
  },
  {
    title: "Calendar",
    href: "/admin/calendar",
    icon: Calendar,
  },
  {
    title: "Settings",
    href: "/admin/settings",
    icon: Settings,
  },
];

const instructorNavItems: NavItem[] = [
  {
    title: "Dashboard",
    href: "/instructor",
    icon: LayoutDashboard,
  },
  {
    title: "My Courses",
    href: "/instructor/courses",
    icon: BookOpen,
  },
  {
    title: "Assessments",
    href: "/instructor/assessments",
    icon: FileText,
  },
  {
    title: "Students",
    href: "/instructor/students",
    icon: GraduationCap,
  },
  {
    title: "Settings",
    href: "/instructor/settings",
    icon: Settings,
  },
];

interface SidebarProps {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

export function Sidebar({ collapsed, onCollapsedChange }: SidebarProps) {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const { mutate: logout, isLoading: isLoggingOut } = useLogoutMutation();

  const isEmployee = user?.role_name?.toLowerCase().trim() === "employee";
  const navItems = isEmployee ? instructorNavItems : adminNavItems;
  const homeHref = isEmployee ? "/instructor" : "/admin";

  const displayName = user?.full_name || user?.email || "—";
  const initials = user?.full_name
    ? user.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() || "??";

  // Auto-open any group whose child is active on mount
  const [openGroups, setOpenGroups] = React.useState<Set<string>>(() => {
    const initial = new Set<string>();
    navItems.forEach((item) => {
      if (item.type === "group") {
        if (item.children.some((c) => pathname.startsWith(c.href))) {
          initial.add(item.title);
        }
      }
    });
    return initial;
  });

  const toggleGroup = React.useCallback((key: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  return (
    <div
      className={cn(
        "relative flex h-screen flex-col border-r bg-sidebar-background text-sidebar-foreground shadow-sm transition-all duration-300",
        collapsed ? "w-16" : "w-64",
      )}
    >
      {/* Logo Area */}
      <div className="flex h-16 items-center border-b bg-sidebar-background/50 backdrop-blur-sm px-4">
        {!collapsed ? (
          <Link href={homeHref} className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-900 dark:bg-zinc-50">
              <GraduationCap className="h-5 w-5 text-zinc-50 dark:text-zinc-900" />
            </div>
            <span className="font-semibold text-lg">GradeLoop</span>
          </Link>
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-900 dark:bg-zinc-50 mx-auto">
            <GraduationCap className="h-5 w-5 text-zinc-50 dark:text-zinc-900" />
          </div>
        )}
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => {
            // ── Group item ──────────────────────────────────────────────────
            if (item.type === "group") {
              const isGroupActive = pathname.startsWith(item.baseHref);
              const isOpen = openGroups.has(item.title);
              const GroupIcon = item.icon;

              if (collapsed) {
                // Collapsed: icon only, link to baseHref (overview)
                return (
                  <Link key={item.title} href={item.baseHref}>
                    <Button
                      variant="ghost"
                      className={cn(
                        "w-full justify-start gap-3 px-2",
                        isGroupActive
                          ? "bg-sidebar-primary text-sidebar-primary-foreground"
                          : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      )}
                      title={item.title}
                    >
                      <GroupIcon className="h-5 w-5 shrink-0" />
                    </Button>
                  </Link>
                );
              }

              return (
                <div key={item.title} className="flex flex-col">
                  <Button
                    variant="ghost"
                    className={cn(
                      "w-full justify-start gap-3 px-3",
                      isGroupActive && !isOpen
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                    onClick={() => toggleGroup(item.title)}
                  >
                    <GroupIcon className="h-5 w-5 shrink-0" />
                    <span className="flex-1 text-left text-sm font-medium">
                      {item.title}
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-zinc-400 transition-transform duration-200",
                        isOpen && "rotate-180",
                      )}
                    />
                  </Button>

                  {/* Children */}
                  <div
                    className={cn(
                      "overflow-hidden transition-all duration-200",
                      isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0",
                    )}
                  >
                    <div className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-zinc-200 pl-2 dark:border-zinc-800">
                      {item.children.map((child) => {
                        const isChildActive =
                          pathname === child.href ||
                          pathname.startsWith(child.href + "/");
                        const ChildIcon = child.icon;
                        return (
                          <Link key={child.href} href={child.href}>
                            <Button
                              variant="ghost"
                              className={cn(
                                "h-8 w-full justify-start gap-2 px-3 text-sm",
                                isChildActive
                                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                                  : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                              )}
                            >
                              <ChildIcon className="h-4 w-4 shrink-0" />
                              <span>{child.title}</span>
                            </Button>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            }

            // ── Regular link item ───────────────────────────────────────────
            const navLink = item as NavLink;
            const isActive = pathname === navLink.href;
            const Icon = navLink.icon;

            return (
              <Link key={navLink.href} href={navLink.href}>
                <Button
                  variant="ghost"
                  className={cn(
                    "w-full justify-start gap-3",
                    collapsed ? "px-2" : "px-3",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                  title={collapsed ? navLink.title : undefined}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {!collapsed && (
                    <span className="flex-1 text-left">{navLink.title}</span>
                  )}
                  {!collapsed && navLink.badge && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-xs text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900">
                      {navLink.badge}
                    </span>
                  )}
                </Button>
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      {/* User Profile Section */}
      <div className="border-t bg-sidebar-background/50 p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                "w-full gap-3",
                collapsed ? "px-2" : "justify-start px-3",
              )}
            >
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="flex flex-1 items-center text-left text-sm">
                  <span className="font-medium truncate max-w-[150px]">
                    {displayName}
                  </span>
                </div>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link
                href="/profile"
                className="flex w-full cursor-pointer items-center"
              >
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>Settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => logout()}
              disabled={isLoggingOut}
              className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400 gap-2"
            >
              <LogOut className="h-4 w-4" />
              {isLoggingOut ? "Logging out…" : "Log out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Collapse Toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute -right-3 top-20 z-10 h-6 w-6 rounded-full border bg-sidebar-background shadow-md hover:shadow-lg hover:scale-110 transition-all"
        onClick={() => onCollapsedChange(!collapsed)}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
