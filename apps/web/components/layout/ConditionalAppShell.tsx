"use client";

import React, { useMemo } from "react";
import { usePathname } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import type { PropsWithChildren } from "react";

export default function ConditionalAppShell({ children }: PropsWithChildren) {
  // usePathname is client-only; be defensive and treat unknown pathname as root (no shell)
  const raw = usePathname();

  const pathname = useMemo(() => {
    if (!raw && typeof window !== "undefined") return window.location.pathname || "/";
    if (!raw) return "/";
    // strip query and hash
    return raw.split("?")[0].split("#")[0] || "/";
  }, [raw]);

  // Exclude root and common auth routes from the dashboard layout
  const excludedExact = ["/"];
  const excludedPrefixes = ["/login", "/reset-password", "/forgot-password", "/auth"];

  if (excludedExact.includes(pathname)) return <>{children}</>;

  const matchesPrefix = excludedPrefixes.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p));
  if (matchesPrefix) return <>{children}</>;

  return <AppShell>{children}</AppShell>;
}
