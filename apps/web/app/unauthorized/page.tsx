"use client";

import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

export default function UnauthorizedPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();

  const handleGoBack = () => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }

    // Redirect based on user role
    const role = user?.role;
    if (role === "admin" || role === "super_admin") {
      router.push("/admin/dashboard");
    } else if (role === "instructor") {
      router.push("/instructor/dashboard");
    } else if (role === "student") {
      router.push("/student/dashboard");
    } else {
      router.push("/login");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted/20 p-4">
      <div className="w-full max-w-md space-y-8 text-center">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="rounded-full bg-destructive/10 p-6">
            <ShieldAlert className="h-16 w-16 text-destructive" />
          </div>
        </div>

        {/* Heading */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Access Denied</h1>
          <p className="text-lg text-muted-foreground">
            You don&apos;t have permission to access this page.
          </p>
        </div>

        {/* Description */}
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
          <p className="text-sm text-muted-foreground">
            {isAuthenticated
              ? "This area is restricted to users with specific roles. If you believe this is an error, please contact your administrator."
              : "Please log in to access this resource."}
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <Button
            onClick={handleGoBack}
            size="lg"
            className="w-full font-semibold"
          >
            {isAuthenticated ? "Go to Dashboard" : "Go to Login"}
          </Button>
          <Button
            onClick={() => router.back()}
            variant="outline"
            size="lg"
            className="w-full"
          >
            Go Back
          </Button>
        </div>

        {/* Footer */}
        {isAuthenticated && user && (
          <div className="text-xs text-muted-foreground">
            Logged in as: <span className="font-medium">{user.email}</span> (
            {user.role})
          </div>
        )}
      </div>
    </div>
  );
}
