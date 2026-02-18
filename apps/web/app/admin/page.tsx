"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { UserManagementPage } from "@/features/user-management/components/user-management-page";

/**
 * Admin landing page (mounted at /admin)
 * - Only renders the User Management UI for users with SUPER_ADMIN or ADMIN role.
 * - Non-admin users are shown an access denied message and redirected to home.
 *
 * Note: Authorization check is performed client-side using the auth store.
 * If you want server-side protection, implement middleware or a server-side check.
 */
export default function AdminIndexPage() {
  const { hasRole } = useAuthStore();
  const router = useRouter();

  const isAdmin = hasRole("SUPER_ADMIN") || hasRole("ADMIN");

  useEffect(() => {
    // If not admin, redirect to home after rendering the access denied message briefly.
    if (!isAdmin) {
      // Replace the history entry so the user can't go back to /admin with the back button.
      router.replace("/");
    }
  }, [isAdmin, router]);

  if (!isAdmin) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">Administration</h1>
          <p className="text-sm text-muted-foreground">Admin area</p>
        </header>

        <div className="bg-white border rounded-xl p-6 text-center">
          <h2 className="text-lg font-medium mb-2">Access denied</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            You must be a Super Admin or Admin to view the administration area.
          </p>
          <Link href="/" className="inline-block text-sm font-medium text-primary underline">
            Go back home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Page header */}
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Administration</h1>
        <p className="text-sm text-muted-foreground">Overview and user management</p>
      </header>

      {/* For admins, mount the full User Management UI as the admin dashboard */}
      <UserManagementPage />
    </div>
  );
}
