"use client";

import { InstructorGuard } from "@/components/auth/instructor-guard";

export default function InstructorLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <InstructorGuard>{children}</InstructorGuard>;
}
