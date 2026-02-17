"use client";
import React from "react";
import { useUser } from "@/hooks/useUser";

export default function RoleGuard({ allowed, children }: { allowed: string[]; children: React.ReactNode }) {
  // placeholder: use actual auth/user hook
  const { user } = useUser?.() ?? { user: { role: "super_admin" } };
  if (!user) return null;
  return allowed.includes(user.role) ? <>{children}</> : null;
}
