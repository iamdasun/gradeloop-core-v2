"use client"

import React from "react";
import { Providers } from "@/components/providers";
import Sidebar from "@/components/layout/AppShell";

export default function AcademicsLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1">{children}</main>
      </div>
    </Providers>
  );
}
