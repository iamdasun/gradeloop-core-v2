"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";

interface RoleBadgeProps extends React.ComponentProps<typeof Badge> {
  role: string;
  className?: string;
}

export function RoleBadge({ role, className, ...props }: RoleBadgeProps) {
  const getVariant = (
    role: string,
  ): VariantProps<typeof badgeVariants>["variant"] => {
    switch (role.toLowerCase()) {
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

  const formatRole = (role: string) => {
    return role.charAt(0).toUpperCase() + role.slice(1).replace(/_/g, " ");
  };

  return (
    <Badge
      variant={getVariant(role)}
      className={cn("font-medium", className)}
      {...props}
    >
      {formatRole(role)}
    </Badge>
  );
}
