"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  GraduationCap,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Users,
  Shield,
  LogOut,
  UserCircle,
  BookOpen,
  Settings,
  BarChart3,
  Code,
} from "lucide-react";
import { useAuthStore } from "@/store/auth-store";
import { useSidebarStore } from "@/store/sidebar-store";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Role = "admin" | "super_admin" | "instructor" | "student";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  children?: NavItem[];
}

const getNavItemsByRole = (role: Role): NavItem[] => {
  switch (role) {
    case "admin":
    case "super_admin":
      return [
        {
          label: "Dashboard",
          href: "/admin/dashboard",
          icon: <LayoutDashboard className="h-5 w-5" />,
        },
        {
          label: "Users",
          href: "/admin/users",
          icon: <Users className="h-5 w-5" />,
        },
        {
          label: "Roles",
          href: "/admin/roles",
          icon: <Shield className="h-5 w-5" />,
        },
        {
          label: "Courses",
          href: "/admin/courses",
          icon: <BookOpen className="h-5 w-5" />,
        },
        {
          label: "Autograders",
          href: "/admin/autograders",
          icon: <Code className="h-5 w-5" />,
        },
        {
          label: "Reports",
          href: "/admin/reports",
          icon: <BarChart3 className="h-5 w-5" />,
        },
        {
          label: "System Settings",
          href: "/admin/settings",
          icon: <Settings className="h-5 w-5" />,
        },
        {
          label: "Profile",
          href: "/admin/profile",
          icon: <UserCircle className="h-5 w-5" />,
        },
      ];
    case "instructor":
      return [
        {
          label: "Dashboard",
          href: "/instructor/dashboard",
          icon: <LayoutDashboard className="h-5 w-5" />,
        },
        {
          label: "My Courses",
          href: "/instructor/courses",
          icon: <BookOpen className="h-5 w-5" />,
        },
        {
          label: "Students",
          href: "/instructor/students",
          icon: <GraduationCap className="h-5 w-5" />,
        },
        {
          label: "Reports",
          href: "/instructor/reports",
          icon: <BarChart3 className="h-5 w-5" />,
        },
        {
          label: "Profile",
          href: "/instructor/profile",
          icon: <UserCircle className="h-5 w-5" />,
        },
      ];
    case "student":
      return [
        {
          label: "Dashboard",
          href: "/student/dashboard",
          icon: <LayoutDashboard className="h-5 w-5" />,
        },
        {
          label: "My Courses",
          href: "/student/my-courses",
          icon: <BookOpen className="h-5 w-5" />,
        },
        {
          label: "Enrollments",
          href: "/student/enrollments",
          icon: <GraduationCap className="h-5 w-5" />,
        },
        {
          label: "Profile",
          href: "/student/profile",
          icon: <UserCircle className="h-5 w-5" />,
        },
      ];
    default:
      return [];
  }
};

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();

  // Use Zustand store instead of local state
  const { collapsed, setCollapsed } = useSidebarStore();

  // Determine role from user or pathname
  const role: Role =
    user?.role === "admin" || user?.role === "super_admin"
      ? "admin"
      : (user?.role as Role) || "admin";

  const navItems = getNavItemsByRole(role);

  const handleLogout = async () => {
    await logout();
    router.push("/auth/login");
  };

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 hidden md:flex flex-col border-r bg-primary transition-all duration-300 ease-in-out",
          collapsed ? "w-[70px]" : "w-64",
        )}
      >
        {/* Header */}
        <div
          className={cn(
            "flex h-14 items-center border-b border-white/10 transition-all duration-300",
            collapsed ? "justify-center px-3" : "gap-3 px-6",
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/20 text-white">
            <GraduationCap className="h-5 w-5" />
          </div>
          {!collapsed && (
            <span className="text-xl font-bold tracking-tight text-white">
              Gradeloop
            </span>
          )}
        </div>

        {/* Navigation */}
        <nav
          className={cn(
            "flex-1 overflow-y-auto py-4 space-y-1",
            collapsed ? "px-2" : "px-4",
          )}
        >
          {navItems.map((item) => (
            <SidebarItem
              key={item.href}
              item={item}
              pathname={pathname}
              collapsed={collapsed}
            />
          ))}
        </nav>

        {/* Collapse Button */}
        <div
          className={cn(
            "border-t border-white/10 p-2",
            collapsed ? "flex justify-center" : "flex justify-end",
          )}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed(!collapsed)}
            className="text-white/70 hover:text-white hover:bg-white/10 h-8 w-8 p-0"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* User Section */}
        <div className="border-t border-white/10 p-4 space-y-2">
          <div
            className={cn(
              "flex items-center rounded-lg bg-white/5 transition-all duration-300",
              collapsed ? "justify-center p-2" : "gap-3 p-3",
            )}
          >
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="h-9 w-9 rounded-full bg-white/90 flex items-center justify-center shrink-0 border border-white/20 font-semibold text-sm text-primary cursor-pointer">
                    {user?.name
                      ?.split(" ")
                      .map((n) => n[0])
                      .join("") || "U"}
                  </div>
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  className="bg-slate-900 text-white"
                >
                  <div className="text-sm font-medium">
                    {user?.name || "User"}
                  </div>
                  <div className="text-xs text-slate-400">
                    {user?.email || ""}
                  </div>
                </TooltipContent>
              </Tooltip>
            ) : (
              <>
                <div className="h-10 w-10 rounded-full bg-white/90 flex items-center justify-center shrink-0 border border-white/20 font-semibold text-sm text-primary">
                  {user?.name
                    ?.split(" ")
                    .map((n) => n[0])
                    .join("") || "U"}
                </div>
                <div className="flex flex-col truncate min-w-0">
                  <span className="text-sm font-semibold text-white truncate">
                    {user?.name || "User"}
                  </span>
                  <span className="text-xs text-white/60 truncate">
                    {user?.email || ""}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Logout Button */}
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center justify-center rounded-lg p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <LogOut className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-slate-900 text-white">
                Logout
              </TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-5 w-5" />
              <span>Logout</span>
            </button>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}

function SidebarItem({
  item,
  pathname,
  collapsed,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
}) {
  const isActive = pathname === item.href;

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={item.href}
            className={cn(
              "flex items-center justify-center rounded-lg p-2.5 transition-colors group",
              isActive
                ? "bg-white/10 text-white"
                : "text-white/70 hover:text-white hover:bg-white/5",
            )}
          >
            {item.icon}
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right" className="bg-slate-900 text-white">
          {item.label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors group",
        isActive
          ? "bg-white/10 text-white"
          : "text-white/70 hover:text-white hover:bg-white/5",
      )}
    >
      {item.icon}
      <span>{item.label}</span>
    </Link>
  );
}
