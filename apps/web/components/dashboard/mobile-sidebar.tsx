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
  ChevronDown,
  ClipboardList,
  Users2,
  Plus
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/authStore";
import { useLogoutMutation } from "@/lib/hooks/useAuthMutation";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

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
      { title: "Faculties", href: "/admin/academics/faculties", icon: Landmark },
      { title: "Departments", href: "/admin/academics/departments", icon: Building2 },
      { title: "Degrees", href: "/admin/academics/degrees", icon: Award },
      { title: "Courses", href: "/admin/academics/courses", icon: BookOpen },
      { title: "Semesters", href: "/admin/academics/semesters", icon: Calendar },
      { title: "Groups", href: "/admin/academics/groups", icon: Users2 },
      { title: "Enrollment", href: "/admin/academics/enrollment", icon: ClipboardList },
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

interface MobileSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileSidebar({ open, onOpenChange }: MobileSidebarProps) {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const { mutate: logout, isLoading: isLoggingOut } = useLogoutMutation();

  const isInstructor = user?.user_type?.toLowerCase().trim() === "instructor";
  const navItems = isInstructor ? instructorNavItems : adminNavItems;
  const homeHref = isInstructor ? "/instructor" : "/admin";

  const displayName = user?.full_name || user?.email || "—";
  const initials = user?.full_name
    ? user.full_name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() || "??";

  const [openGroups, setOpenGroups] = React.useState<Set<string>>(() => {
    const initial = new Set<string>();
    navItems.forEach((item) => {
      if (item.subItems && item.subItems.length > 0) {
        if (item.subItems.some((c) => pathname.startsWith(c.href))) {
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-72 p-0 flex flex-col bg-background border-r">
        {/* Logo Area */}
        <SheetHeader className="h-[72px] flex flex-row items-center border-b px-6 m-0">
          <Link
            href={homeHref}
            className="flex items-center gap-3 w-full"
            onClick={() => onOpenChange(false)}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <GraduationCap className="h-6 w-6" />
            </div>
            <SheetTitle className="font-bold text-lg font-heading tracking-tight mt-1">
              GradeLoop
            </SheetTitle>
          </Link>
        </SheetHeader>

        {/* Navigation */}
        <ScrollArea className="flex-1 px-4 py-6">
          <nav className="flex flex-col gap-2">
            {navItems.map((item) => {
              const hasSubItems = item.subItems && item.subItems.length > 0;
              const isActive = pathname === item.href || (hasSubItems && pathname.startsWith(item.href));
              const isOpen = openGroups.has(item.title);
              const Icon = item.icon;

              if (hasSubItems) {
                return (
                  <div key={item.title} className="flex flex-col">
                    <Button
                      variant="ghost"
                      className={cn(
                        "w-full justify-start gap-3 h-11 px-4 rounded-xl font-medium transition-all",
                        isActive && !isOpen
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-accent text-foreground"
                      )}
                      onClick={() => toggleGroup(item.title)}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="flex-1 text-left">{item.title}</span>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 transition-transform duration-200 opacity-50",
                          isOpen && "rotate-180"
                        )}
                      />
                    </Button>
                    <div
                      className={cn(
                        "overflow-hidden transition-all duration-200 mt-1",
                        isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                      )}
                    >
                      <div className="ml-6 flex flex-col gap-1 border-l-2 border-border pl-4">
                        {item.subItems!.map((child) => {
                          const isChildActive = pathname === child.href || pathname.startsWith(child.href + "/");
                          const ChildIcon = child.icon;
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              onClick={() => onOpenChange(false)}
                            >
                              <Button
                                variant="ghost"
                                className={cn(
                                  "h-10 w-full justify-start gap-2 px-4 rounded-lg text-sm transition-all",
                                  isChildActive
                                    ? "bg-primary text-primary-foreground shadow-sm"
                                    : "hover:bg-accent text-muted-foreground hover:text-foreground"
                                )}
                              >
                                {ChildIcon && <ChildIcon className="h-4 w-4 shrink-0" />}
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

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => onOpenChange(false)}
                >
                  <Button
                    variant="ghost"
                    className={cn(
                      "w-full justify-start gap-3 h-11 px-4 rounded-xl font-medium transition-all",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "hover:bg-accent text-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="flex-1 text-left">{item.title}</span>
                  </Button>
                </Link>
              );
            })}
          </nav>
        </ScrollArea>

        {/* User Profile Section */}
        <div className="p-4 bg-muted/30 border-t">
          <div className="flex items-center gap-3 px-2 py-2 mb-3">
            <Avatar className="h-10 w-10 border border-border shadow-sm">
              <AvatarFallback className="bg-primary/20 text-primary font-bold">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col flex-1 overflow-hidden">
              <span className="font-semibold text-sm truncate">{displayName}</span>
              <span className="text-xs text-muted-foreground truncate capitalize">{user?.user_type || 'Member'}</span>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/50 border-border"
            onClick={() => {
              logout();
              onOpenChange(false);
            }}
            disabled={isLoggingOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            {isLoggingOut ? "Logging out..." : "Log out"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
