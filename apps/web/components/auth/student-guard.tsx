"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/authStore";
import { Loader2, ShieldX } from "lucide-react";

interface StudentGuardProps {
    children: React.ReactNode;
}

/**
 * Protects routes under /student.
 *
 * - Unauthenticated users → /login
 * - Admin / super_admin  → /admin
 * - instructor → /instructor
 * - student → render children
 * - Any other user type → access-denied screen
 */
export function StudentGuard({ children }: StudentGuardProps) {
    const router = useRouter();
    const { user, isHydrated, isLoading, isAuthenticated } = useAuthStore();

    const userType = user?.user_type?.toLowerCase().trim() ?? "";

    const isStudent = userType === "student";
    const isAdmin = userType === "admin" || userType === "super_admin";
    const isInstructor = userType === "instructor";

    useEffect(() => {
        if (!isHydrated || isLoading) return;

        if (!isAuthenticated) {
            router.replace("/login");
            return;
        }
        if (isAdmin) {
            router.replace("/admin");
            return;
        }
        if (isInstructor) {
            router.replace("/instructor");
        }
    }, [isHydrated, isLoading, isAuthenticated, isAdmin, isInstructor, router]);

    // Waiting for hydration / token restore
    if (!isHydrated || isLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-7 w-7 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Verifying access…</p>
                </div>
            </div>
        );
    }

    // Redirect in-flight
    if (!isAuthenticated || isAdmin || isInstructor) return null;

    // Wrong user type (not student)
    if (!isStudent) {
        return (
            <div className="flex h-screen flex-col items-center justify-center gap-4 text-muted-foreground">
                <ShieldX className="h-12 w-12 text-destructive" />
                <p className="text-base font-medium text-destructive">
                    You don&apos;t have permission to view the student portal.
                </p>
            </div>
        );
    }

    return <>{children}</>;
}
