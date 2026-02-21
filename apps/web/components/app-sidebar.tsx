"use client";

import * as React from "react";
import { GraduationCap, LogOut, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { getNavItemsForRole } from "@/lib/nav-config";
import { useAuthStore } from "@/store/auth-store";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const { role } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const navItems = React.useMemo(() => getNavItemsForRole(role), [role]);

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  const userInitials = React.useMemo(() => {
    return (
      user?.name
        ?.split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase() || "U"
    );
  }, [user?.name]);

  return (
    <Sidebar
      collapsible="icon"
      style={
        {
          "--sidebar": "var(--primary)",
          "--sidebar-foreground": "var(--primary-foreground)",
          "--sidebar-primary": "var(--primary-foreground)",
          "--sidebar-primary-foreground": "var(--primary)",
          "--sidebar-accent": "rgba(255, 255, 255, 0.1)",
          "--sidebar-accent-foreground": "var(--primary-foreground)",
          "--sidebar-border": "rgba(255, 255, 255, 0.1)",
          "--sidebar-ring": "var(--ring)",
        } as React.CSSProperties
      }
      {...props}
    >
      <SidebarHeader className="h-16 flex items-center border-b border-white/10 p-0">
        <div className="flex items-center gap-3 px-6 w-full group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/20 text-white">
            <GraduationCap className="h-5 w-5" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white group-data-[collapsible=icon]:hidden">
            Gradeloop
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent className="py-4">
        <SidebarMenu className="px-2 space-y-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const hasChildren = item.children && item.children.length > 0;
            const isChildActive =
              hasChildren &&
              item.children?.some(
                (child) =>
                  pathname === child.href ||
                  pathname.startsWith(child.href + "/"),
              );

            if (hasChildren) {
              return (
                <Collapsible
                  key={item.href}
                  asChild
                  defaultOpen={isChildActive}
                  className="group/collapsible"
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        tooltip={item.label}
                        className="text-white hover:text-white hover:bg-white/10 data-[state=open]:bg-white/10"
                      >
                        <span className="h-5 w-5 flex items-center justify-center shrink-0">
                          {item.icon}
                        </span>
                        <span className="font-medium ml-3">{item.label}</span>
                        <ChevronRight className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {item.children?.map((child) => {
                          const isChildItemActive =
                            pathname === child.href ||
                            pathname.startsWith(child.href + "/");
                          return (
                            <SidebarMenuSubItem key={child.href}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={isChildItemActive}
                                className="text-white/80 hover:text-white hover:bg-white/10 data-[active=true]:bg-white/20 data-[active=true]:text-white"
                              >
                                <Link href={child.href}>
                                  <span className="h-4 w-4 flex items-center justify-center shrink-0">
                                    {child.icon}
                                  </span>
                                  <span>{child.label}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          );
                        })}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              );
            }

            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  tooltip={item.label}
                  className="text-white hover:text-white hover:bg-white/10 data-[active=true]:bg-white/20 data-[active=true]:text-white"
                >
                  <Link href={item.href} className="flex items-center">
                    <span className="h-5 w-5 flex items-center justify-center shrink-0 group-data-[collapsible=icon]:mx-auto">
                      {item.icon}
                    </span>
                    <span className="font-medium ml-3 group-data-[collapsible=icon]:hidden">
                      {item.label}
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="border-t border-white/10 p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-white/10 data-[state=open]:text-white text-white hover:text-white hover:bg-white/10 group-data-[collapsible=icon]:justify-center"
                >
                  <Avatar className="h-8 w-8 rounded-lg shrink-0">
                    <AvatarFallback className="rounded-lg bg-white/20 text-white font-semibold">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight ml-2 group-data-[collapsible=icon]:hidden">
                    <span className="truncate font-semibold text-white">
                      {user?.name || "User"}
                    </span>
                    <span className="truncate text-xs text-white/70">
                      {user?.email || ""}
                    </span>
                  </div>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                side="top"
                align="end"
                sideOffset={4}
              >
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="cursor-pointer text-red-600 focus:text-red-700 focus:bg-red-50"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
