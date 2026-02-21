"use client";

import * as React from "react";
import { TopNavbar } from "./top-navbar";
import { useAuth } from "@/hooks/use-auth";
import { getNavItemsForRole, NavItem } from "@/lib/nav-config";
import {
  GraduationCap,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuthStore } from "@/store/auth-store";
import { useSidebarStore } from "@/store/sidebar-store";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { role } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();

  // Use Zustand store instead of Context API
  const { collapsed, toggleCollapsed } = useSidebarStore();

  const navItems = React.useMemo(() => getNavItemsForRole(role), [role]);

  const handleLogout = async () => {
    await logout();
    router.push("/auth/login");
  };

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Collapsible Sidebar */}
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
              "flex h-16 items-center border-b border-white/10 transition-all duration-300",
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
              "flex-1 overflow-y-auto py-4 space-y-1 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent",
              collapsed ? "px-2" : "px-4",
            )}
          >
            {navItems
              .filter((item): item is Required<NavItem> => !!item.icon)
              .map((item) => (
                <SidebarItem
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  collapsed={collapsed}
                />
              ))}
          </nav>

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
                <TooltipContent
                  side="right"
                  className="bg-slate-900 text-white"
                >
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

      {/* Main Content Area */}
      <div
        className={cn(
          "flex flex-1 flex-col overflow-hidden transition-all duration-300",
          collapsed ? "md:ml-[70px]" : "md:ml-64",
        )}
      >
        {/* Header Area with Navbar */}
        <header className="sticky top-0 z-30 flex h-16 items-center border-b border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 px-4 backdrop-blur-md sm:px-6">
          <div className="mx-auto w-full max-w-7xl flex items-center gap-4">
            {/* Sidebar Toggle Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleCollapsed}
              className="text-muted-foreground hover:text-foreground"
            >
              {collapsed ? (
                <PanelLeftOpen className="h-5 w-5" />
              ) : (
                <PanelLeftClose className="h-5 w-5" />
              )}
            </Button>

            <TopNavbar />
          </div>
        </header>

        {/* Main Page Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

interface SidebarItemProps {
  item: {
    label: string;
    href: string;
    icon?: React.ReactNode;
  };
  pathname: string;
  collapsed: boolean;
}

function SidebarItem({ item, pathname, collapsed }: SidebarItemProps) {
  const isActive =
    pathname === item.href || pathname.startsWith(item.href + "/");

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
            <span className="h-5 w-5 flex items-center justify-center">
              {item.icon}
            </span>
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
      {item.icon && (
        <span className="h-5 w-5 flex items-center justify-center shrink-0">
          {item.icon}
        </span>
      )}
      <span>{item.label}</span>
    </Link>
  );
}
