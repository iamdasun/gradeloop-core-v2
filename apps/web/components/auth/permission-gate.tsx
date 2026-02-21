"use client";

import { useAuthStore } from "@/store/auth-store";
import React from "react";

interface PermissionGateProps {
    children: React.ReactNode;
    permission: string | string[];
    fallback?: React.ReactNode;
    all?: boolean; // If true, all permissions must be present. If false, at least one.
}

export function PermissionGate({
    children,
    permission,
    fallback = null,
    all = false,
}: PermissionGateProps) {
    const { user } = useAuthStore();
    const userPermissions = user?.permissions || [];

    const hasPermission = () => {
        if (typeof permission === "string") {
            return userPermissions.includes(permission);
        }

        if (all) {
            return permission.every((p) => userPermissions.includes(p));
        }

        return permission.some((p) => userPermissions.includes(p));
    };

    if (!hasPermission()) {
        return <>{fallback}</>;
    }

    return <>{children}</>;
}
