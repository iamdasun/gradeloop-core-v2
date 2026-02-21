"use client";

import { useAuthStore } from "@/store/auth-store";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export function AdminGuard({ children }: { children: React.ReactNode }) {
    const { isLoading, isAuthenticated, user } = useAuthStore();
    const router = useRouter();
    const [accessChecked, setAccessChecked] = useState(false);

    useEffect(() => {
        if (!isLoading) {
            if (!isAuthenticated) {
                router.push("/login");
                return;
            }

            // Accept admin and super_admin
            if (user?.role !== "admin" && user?.role !== "super_admin") {
                toast.error("Unauthorized access. Admins only.");
                router.push("/unauthorized");
                return;
            }

            setAccessChecked(true);
        }
    }, [isLoading, isAuthenticated, user, router]);

    if (isLoading || !accessChecked) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-gray-100 dark:bg-neutral-900">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return <>{children}</>;
}
