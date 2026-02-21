"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap, ChevronRight, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { getNavItemsForRole, NavItem } from "@/lib/nav-config";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/animate-ui/components/radix/sidebar";

export function SidebarNav() {
  const pathname = usePathname();
  const { user, role } = useAuth();
  const { state } = useSidebar();

  const filteredNav = React.useMemo(() => getNavItemsForRole(role), [role]);

  return (
    <Sidebar collapsible="icon" className="dark">
      <SidebarHeader className="h-14 border-b flex items-center justify-between px-4">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary shadow-lg shadow-primary/20">
            <GraduationCap className="h-5 w-5 text-white" />
          </div>
          {state === "expanded" && (
            <span className="text-xl font-bold tracking-tight text-white whitespace-nowrap">
              Gradeloop
            </span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="py-4">
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredNav.map((item) => (
                <SidebarMenuItem key={item.href}>
                  {item.children ? (
                    <CollapsibleMenuItem item={item} pathname={pathname} />
                  ) : (
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === item.href}
                      tooltip={item.label}
                    >
                      <Link href={item.href}>
                        {item.icon}
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t p-4">
        {user ? (
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20 font-semibold text-xs text-primary">
              {user.name
                ?.split(" ")
                .map((n) => n[0])
                .join("") || "U"}
            </div>
            {state === "expanded" && (
              <div className="flex flex-col truncate">
                <span className="text-sm font-medium text-white">
                  {user.name}
                </span>
                <span className="text-xs text-zinc-500 truncate">
                  {user.email}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20 font-semibold text-xs text-primary">
              ?
            </div>
            {state === "expanded" && (
              <div className="flex flex-col truncate">
                <span className="text-sm font-medium text-white">
                  Not logged in
                </span>
              </div>
            )}
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

function CollapsibleMenuItem({
  item,
  pathname,
}: {
  item: NavItem;
  pathname: string;
}) {
  const isActive =
    pathname === item.href ||
    (item.children && item.children.some((c) => pathname === c.href));
  const [isOpen, setIsOpen] = React.useState(isActive);
  const { state } = useSidebar();

  return (
    <div className="space-y-1">
      <SidebarMenuButton
        isActive={isActive}
        onClick={() => setIsOpen(!isOpen)}
        tooltip={item.label}
      >
        {item.icon}
        <span>{item.label}</span>
        <ChevronDown
          className={cn(
            "ml-auto h-4 w-4 transition-transform",
            isOpen && "rotate-180",
          )}
        />
      </SidebarMenuButton>
      {isOpen && state === "expanded" && (
        <SidebarMenuSub>
          {item.children?.map((child) => (
            <SidebarMenuSubItem key={child.href}>
              <SidebarMenuSubButton asChild isActive={pathname === child.href}>
                <Link href={child.href}>
                  <span>{child.label}</span>
                </Link>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      )}
    </div>
  );
}
