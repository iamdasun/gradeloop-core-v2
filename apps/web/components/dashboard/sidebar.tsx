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
  Menu
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
    title: "Users",
    href: "/admin/users",
    icon: Users,
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
  primaryCollapsed: boolean;
  onPrimaryCollapsedChange: (collapsed: boolean) => void;
  secondaryCollapsed: boolean;
  onSecondaryCollapsedChange: (collapsed: boolean) => void;
}

export function Sidebar({ primaryCollapsed, onPrimaryCollapsedChange, secondaryCollapsed, onSecondaryCollapsedChange }: SidebarProps) {
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

  return (
    <div className="flex h-screen overflow-hidden text-sidebar-foreground transition-all duration-300">
      {/* Primary Sidebar */}
      <div className={cn(
        "relative z-20 flex flex-col items-center border-r bg-sidebar text-sidebar-foreground py-4 transition-all duration-300",
        primaryCollapsed ? "w-16" : "w-64 items-start"
      )}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onPrimaryCollapsedChange(!primaryCollapsed)}
          className="absolute -right-3 top-6 z-50 h-6 w-6 rounded-full border bg-background text-foreground shadow-sm hover:bg-accent flex items-center justify-center p-0"
        >
          {primaryCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>

        {/* Logo */}
        <div className={cn("flex w-full mb-6", primaryCollapsed ? "justify-center" : "justify-start px-4")}>
          <Link href={homeHref} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-transform hover:scale-105">
            <GraduationCap className="h-6 w-6" />
          </Link>
          {!primaryCollapsed && (
            <div className="ml-3 flex flex-col justify-center overflow-hidden">
              <span className="font-bold text-lg leading-tight truncate">Gradeloop</span>
            </div>
          )}
        </div>

        {/* Primary Navigation Icons */}
        <nav className={cn("flex flex-1 flex-col gap-3 w-full", primaryCollapsed ? "px-2 items-center" : "px-4 items-stretch overflow-y-auto")}>
          {navItems.map((item) => {
            const isActive = activeRoot.title === item.title;
            const Icon = item.icon;
            return (
              <Link key={item.title} href={item.href} className="w-full">
                <Button
                  variant="ghost"
                  className={cn(
                    "h-12 w-full flex items-center rounded-xl transition-colors",
                    primaryCollapsed ? "justify-center p-0" : "justify-start px-4 gap-3",
                    isActive
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                  title={primaryCollapsed ? item.title : undefined}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {!primaryCollapsed && <span className="truncate">{item.title}</span>}
                </Button>
              </Link>
            );
          })}
        </nav>

        {/* Bottom Primary Actions */}
        <div className={cn("mt-auto flex flex-col gap-3 w-full", primaryCollapsed ? "px-2 items-center" : "px-4 items-stretch")}>
          <Button variant="ghost" className={cn("h-12 w-full rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground", primaryCollapsed ? "justify-center p-0" : "justify-start px-4 gap-3")}>
            <Plus className="h-5 w-5 shrink-0" />
            {!primaryCollapsed && <span className="truncate">Create New</span>}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className={cn("h-12 w-full rounded-xl hover:bg-sidebar-accent border-0", primaryCollapsed ? "p-0 justify-center" : "px-3 justify-start gap-3")}>
                <Avatar className="h-8 w-8 ring-2 ring-primary/20 shrink-0">
                  <AvatarFallback className="bg-primary/20 text-xs text-primary">{initials}</AvatarFallback>
                </Avatar>
                {!primaryCollapsed && (
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
      <div className={cn("relative transition-all duration-300", secondaryCollapsed ? "w-0" : "w-64")}>
        <div className={cn(
          "absolute inset-y-0 left-0 flex w-64 flex-col border-r bg-sidebar-background transition-transform duration-300",
          secondaryCollapsed ? "-translate-x-full" : "translate-x-0"
        )}>
          <div className="flex h-16 items-center px-6">
            <h2 className="text-lg font-semibold tracking-tight text-foreground font-heading">{activeRoot?.title || "Overview"}</h2>
          </div>
          <ScrollArea className="flex-1 px-4">
            <div className="flex flex-col gap-6 py-2">
              {/* Contextual Sub-navigation */}
              {hasSecondaryContent ? (
                <div className="flex flex-col gap-1">
                  {activeRoot.subItems!.map((subItem) => {
                    const isChildActive = pathname === subItem.href || pathname.startsWith(subItem.href + "/");
                    return (
                      <Link key={subItem.title} href={subItem.href}>
                        <Button
                          variant="ghost"
                          className={cn(
                            "w-full justify-start text-sm h-9 rounded-lg px-3 transition-all",
                            isChildActive
                              ? "bg-primary/10 text-primary font-medium"
                              : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                          )}
                        >
                          {subItem.icon && <subItem.icon className="mr-2 h-4 w-4" />}
                          {subItem.title}
                        </Button>
                      </Link>
                    )
                  })}
                </div>
              ) : (
                /* Generic Secondary Nav Elements when no sub-items */
                <>
                  <div className="flex flex-col gap-1">
                    <Button variant="ghost" className="w-full justify-start text-sm h-9 text-muted-foreground hover:text-foreground">
                      <History className="mr-2 h-4 w-4" /> Recents
                    </Button>
                    <Button variant="ghost" className="w-full justify-start text-sm h-9 text-muted-foreground hover:text-foreground">
                      <Share2 className="mr-2 h-4 w-4" /> Shared Content
                    </Button>
                    <Button variant="ghost" className="w-full justify-start text-sm h-9 text-muted-foreground hover:text-foreground">
                      <Archive className="mr-2 h-4 w-4" /> Archived
                    </Button>
                    <Button variant="ghost" className="w-full justify-start text-sm h-9 text-muted-foreground hover:text-foreground">
                      <LayoutTemplate className="mr-2 h-4 w-4" /> Templates
                    </Button>
                  </div>

                  <div className="flex flex-col gap-1 mt-4">
                    <div className="flex items-center justify-between px-2 mb-1">
                      <span className="text-xs font-semibold text-muted-foreground">Favorites</span>
                      <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">3</span>
                    </div>
                    <Button variant="ghost" className="w-full justify-start text-sm h-9 text-muted-foreground hover:text-foreground">
                      <Star className="mr-2 h-4 w-4 text-amber-500" /> Figma Basic
                    </Button>
                    <Button variant="ghost" className="w-full justify-start text-sm h-9 text-muted-foreground hover:text-foreground">
                      <FolderOpen className="mr-2 h-4 w-4 text-emerald-500" /> Folder NEW 2024
                    </Button>
                    <Button variant="ghost" className="w-full justify-start text-sm h-9 text-muted-foreground hover:text-foreground">
                      <FileText className="mr-2 h-4 w-4 text-purple-500" /> Assignment 101
                    </Button>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Toggle Secondary Sidebar Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onSecondaryCollapsedChange(!secondaryCollapsed)}
          className={cn(
            "absolute top-16 z-50 h-6 w-6 rounded-full border bg-background text-foreground shadow-sm hover:bg-accent transition-all duration-300 flex items-center justify-center p-0",
            secondaryCollapsed ? "left-[-0.75rem]" : "left-[calc(16rem-0.75rem)]"
          )}
        >
          {secondaryCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
