"use client";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Bell, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/store/auth-store";
import { Badge } from "@/components/ui/badge";

const getRoleBadgeVariant = (role?: string) => {
  switch (role) {
    case "admin":
    case "super_admin":
      return "destructive";
    case "instructor":
      return "default";
    case "student":
      return "secondary";
    default:
      return "outline";
  }
};

const formatRole = (role?: string) => {
  if (!role) return "";
  return role.charAt(0).toUpperCase() + role.slice(1);
};

export function DashboardTopbar() {
  const { user } = useAuthStore();

  return (
    <div className="flex items-center justify-between p-4 border-b bg-white dark:bg-neutral-900 w-full h-16 shrink-0">
      <div className="flex items-center gap-4">
        <Breadcrumbs />
      </div>

      <div className="flex items-center gap-4">
        <div className="relative hidden md:flex">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search..."
            className="w-64 rounded-lg bg-zinc-50 pl-8 focus:bg-white dark:bg-zinc-900 dark:focus:bg-zinc-950"
          />
        </div>

        {user?.role && (
          <Badge variant={getRoleBadgeVariant(user.role)}>
            {formatRole(user.role)}
          </Badge>
        )}

        <Button variant="ghost" size="icon" className="text-muted-foreground">
          <Bell className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
