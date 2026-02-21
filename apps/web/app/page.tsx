"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import { Loader2 } from "lucide-react";

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, user, isLoading } = useAuthStore();

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        router.push("/login");
        return;
      }

      // Redirect based on role
      if (user?.role === "admin" || user?.role === "super_admin") {
        router.push("/admin/");
        return;
      }

      if (user?.role === "instructor") {
        router.push("/instructor/");
        return;
      }

      if (user?.role === "student") {
        router.push("/student/");
        return;
      }

      // Fallback - should not happen
      router.push("/login");
    }
  }, [isAuthenticated, user, isLoading, router]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-gray-100 dark:bg-neutral-900">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}
