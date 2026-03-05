"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/authStore";
import { Loader2, ShieldX } from "lucide-react";

interface InstructorGuardProps {
    children: React.ReactNode;
}

/**
 * Protects routes under /instructor.
 *
 * - Unauthenticated users → /login
 * - Admin / super_admin → /admin  (admins have their own dashboard)
 * - instructor → render children
 * - Any other user type (e.g. student) → access-denied screen
 */
export function InstructorGuard({ children }: InstructorGuardProps) {
    const router = useRouter();
    const { user, isHydrated, isLoading, isAuthenticated } = useAuthStore();

    const userType = user?.user_type?.toLowerCase().trim() ?? "";
    const isInstructor = userType === "instructor";
    const isAdmin = userType === "admin" || userType === "super_admin";

    useEffect(() => {
        if (!isHydrated || isLoading) return;

        if (!isAuthenticated) {
            router.replace("/login");
            return;
        }
        if (isAdmin) {
            router.replace("/admin");
        }
    }, [isHydrated, isLoading, isAuthenticated, isAdmin, router]);

    // Waiting for hydration
    if (!isHydrated || isLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-7 w-7 animate-spin text-primary" />
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">Verifying access…</p>
                </div>
            </div>
        );
    }

    // Redirect in-flight
    if (!isAuthenticated || isAdmin) return null;

    // Wrong user type (not instructor, not admin)
    if (!isInstructor) {
        return (
            <div className="flex h-screen flex-col items-center justify-center gap-4 text-zinc-400">
                <ShieldX className="h-12 w-12 text-red-400" />
                <p className="text-base font-medium text-red-500">
                    You don&apos;t have permission to view the instructor dashboard.
                </p>
            </div>
        );
    }

    return <>{children}</>;
}
