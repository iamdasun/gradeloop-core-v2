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
  LogOut,
  School,
  Building2,
  Award,
  Landmark,
  Users2,
  ClipboardList,
  MessageSquare,
  Search,
  FolderOpen,
  History,
  Share2,
  Archive,
  LayoutTemplate,
  Star,
  Plus,
  ChevronLeft,
  ChevronRight,
  Menu,
  UserCog,
  Key
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuthStore } from "@/lib/stores/authStore";
import { useLogoutMutation } from "@/lib/hooks/useAuthMutation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SubNavLink {
  title: string;
  href: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  subItems?: SubNavLink[];
}

const adminNavItems: NavItem[] = [
  {
    title: "Dashboard",
    href: "/admin",
    icon: LayoutDashboard,
  },
  {
    title: "Users Management",
    href: "/admin/users",
    icon: Users,
    subItems: [
      { title: "Users", href: "/admin/users", icon: Users },
      { title: "Roles", href: "/admin/roles", icon: UserCog },
      { title: "Permissions", href: "/admin/permissions", icon: Key },
    ],
  },
  {
    title: "Academics",
    href: "/admin/academics",
    icon: School,
    subItems: [
      { title: "Faculties", href: "/admin/academics/faculties" },
      { title: "Departments", href: "/admin/academics/departments" },
      { title: "Degrees", href: "/admin/academics/degrees" },
      { title: "Courses", href: "/admin/academics/courses" },
      { title: "Semesters", href: "/admin/academics/semesters" },
      { title: "Groups", href: "/admin/academics/groups" },
      { title: "Enrollment", href: "/admin/academics/enrollment" },
    ],
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

  // Determine active primary item
  const activeRoot = navItems.find((item) =>
    pathname.startsWith(item.href) && item.href !== homeHref
      ? true
      : pathname === item.href
  ) || navItems[0];

  const hasSecondaryContent = activeRoot?.subItems && activeRoot.subItems.length > 0;
  const [isHovered, setIsHovered] = React.useState(false);

  const isPrimaryCollapsed = hasSecondaryContent ? !isHovered : collapsed;

  return (
    <div className="relative flex h-screen text-sidebar-foreground transition-all duration-300 z-20">
      {/* Primary Sidebar */}
      <div
        className={cn(
          "relative z-20 flex flex-col items-center border-r bg-sidebar text-sidebar-foreground py-4 transition-all duration-300",
          isPrimaryCollapsed ? "w-16" : "w-64 items-start"
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Logo */}
        <div className={cn("flex w-full mb-6", isPrimaryCollapsed ? "justify-center" : "justify-start px-4")}>
          <Link href={homeHref} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-transform hover:scale-105">
            <GraduationCap className="h-6 w-6" />
          </Link>
          {!isPrimaryCollapsed && (
            <div className="ml-3 flex flex-col justify-center overflow-hidden">
              <span className="font-bold text-lg leading-tight truncate">Gradeloop</span>
            </div>
          )}
        </div>

        {/* Primary Navigation Icons */}
        <nav className={cn("flex flex-1 flex-col gap-3 w-full", isPrimaryCollapsed ? "px-2 items-center" : "px-4 items-stretch overflow-y-auto")}>
          {navItems.map((item) => {
            const isActive = activeRoot.title === item.title;
            const Icon = item.icon;
            return (
              <Link key={item.title} href={item.href} className="w-full">
                <Button
                  variant="ghost"
                  className={cn(
                    "h-12 w-full flex items-center rounded-xl transition-colors",
                    isPrimaryCollapsed ? "justify-center p-0" : "justify-start px-4 gap-3",
                    isActive
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                  title={isPrimaryCollapsed ? item.title : undefined}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {!isPrimaryCollapsed && <span className="truncate">{item.title}</span>}
                </Button>
              </Link>
            );
          })}
        </nav>

        {/* Bottom Primary Actions */}
        <div className={cn("mt-auto flex flex-col gap-3 w-full", isPrimaryCollapsed ? "px-2 items-center" : "px-4 items-stretch")}>
          <Button variant="ghost" className={cn("h-12 w-full rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground", isPrimaryCollapsed ? "justify-center p-0" : "justify-start px-4 gap-3")}>
            <Plus className="h-5 w-5 shrink-0" />
            {!isPrimaryCollapsed && <span className="truncate">Create New</span>}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className={cn("h-12 w-full rounded-xl hover:bg-sidebar-accent border-0", isPrimaryCollapsed ? "p-0 justify-center" : "px-3 justify-start gap-3")}>
                <Avatar className="h-8 w-8 ring-2 ring-primary/20 shrink-0">
                  <AvatarFallback className="bg-primary/20 text-xs text-primary">{initials}</AvatarFallback>
                </Avatar>
                {!isPrimaryCollapsed && (
                  <div className="flex flex-col items-start overflow-hidden text-left flex-1">
                    <span className="text-sm font-medium text-foreground truncate w-full">{displayName}</span>
                    {isEmployee && <span className="text-xs text-muted-foreground truncate w-full">Instructor</span>}
                  </div>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="right" className="w-56 mb-2 ml-2">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/profile" className="flex w-full cursor-pointer items-center">Profile</Link>
              </DropdownMenuItem>
              <DropdownMenuItem>Settings</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => logout()}
                disabled={isLoggingOut}
                className="text-red-600 gap-2 cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                {isLoggingOut ? "Logging out…" : "Log out"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {/* Secondary Sidebar Area */}
      {hasSecondaryContent && (
        <div
          className={cn("relative transition-all duration-300 z-10 w-64")}
        >
          <div className={cn(
            "absolute inset-y-0 left-0 flex flex-col border-r bg-sidebar-background transition-all duration-300 h-full w-64 items-start"
          )}>
            <div className={cn("flex h-16 items-center w-full px-6")}>
              <h2 className="text-lg font-semibold tracking-tight text-foreground font-heading">{activeRoot?.title || "Overview"}</h2>
            </div>
            <ScrollArea className={cn("flex-1 w-full px-4")}>
              <div className="flex flex-col gap-3 py-2 w-full items-center">
                {/* Contextual Sub-navigation */}
                <div className="flex flex-col gap-1 w-full">
                  {activeRoot.subItems!.map((subItem) => {
                    const isChildActive = pathname === subItem.href || pathname.startsWith(subItem.href + "/");
                    return (
                      <Link key={subItem.title} href={subItem.href} className="w-full text-left">
                        <Button
                          variant="ghost"
                          className={cn(
                            "h-10 w-full flex items-center rounded-lg transition-colors justify-start px-3",
                            isChildActive
                              ? "bg-primary/10 text-primary font-medium"
                              : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                          )}
                        >
                          <span className="truncate text-sm">{subItem.title}</span>
                        </Button>
                      </Link>
                    )
                  })}
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>
      )}

      {/* Toggle Sidebar Button */}
      {!hasSecondaryContent && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onCollapsedChange(!collapsed)}
          className="absolute -right-3 top-6 z-50 h-6 w-6 rounded-full border bg-background text-foreground shadow-sm hover:bg-accent transition-all duration-300 flex items-center justify-center p-0"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      )}
    </div>
  );
}
