"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/authStore";
import { Loader2, ShieldX } from "lucide-react";

interface AdminGuardProps {
    children: React.ReactNode;
}

/**
 * Protects routes under /admin.
 *
 * - Unauthenticated users → /login
 * - Instructor → /instructor  (instructors have their own dashboard)
 * - Student → /student  (students have their own dashboard)
 * - admin / super_admin → render children
 * - Any other user type → access-denied screen
 */
export function AdminGuard({ children }: AdminGuardProps) {
    const router = useRouter();
    const { user, isHydrated, isLoading, isAuthenticated } = useAuthStore();

    const userType = user?.user_type?.toLowerCase().trim() ?? "";
    const isAdmin = userType === "admin" || userType === "super_admin";
    const isInstructor = userType === "instructor";
    const isStudent = userType === "student";

    useEffect(() => {
        if (!isHydrated || isLoading) return;

        if (!isAuthenticated) {
            router.replace("/login");
            return;
        }
        if (isInstructor) {
            router.replace("/instructor");
            return;
        }
        if (isStudent) {
            router.replace("/student");
        }
    }, [isHydrated, isLoading, isAuthenticated, isInstructor, isStudent, router]);

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
    if (!isAuthenticated || isInstructor || isStudent) return null;

    // Wrong user type (not admin or super_admin)
    if (!isAdmin) {
        return (
            <div className="flex h-screen flex-col items-center justify-center gap-4 text-zinc-400">
                <ShieldX className="h-12 w-12 text-red-400" />
                <p className="text-base font-medium text-red-500">
                    You don&apos;t have permission to view the admin dashboard.
                </p>
            </div>
        );
    }

    return <>{children}</>;
}
