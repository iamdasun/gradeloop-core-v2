"use client";

import * as React from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { MobileSidebar } from "@/components/dashboard/mobile-sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AuthGuard } from "@/components/auth/auth-guard";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden bg-zinc-50/30 dark:bg-zinc-900">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:block">
          <Sidebar
            collapsed={sidebarCollapsed}
            onCollapsedChange={setSidebarCollapsed}
          />
        </aside>

        {/* Mobile Sidebar */}
        <MobileSidebar open={mobileMenuOpen} onOpenChange={setMobileMenuOpen} />

        {/* Main Content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar onMenuClick={() => setMobileMenuOpen(true)} />

          <main className="flex-1 overflow-hidden bg-gradient-to-br from-zinc-50 via-white to-zinc-50 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-900">
            <ScrollArea className="h-full">
              <div className="container mx-auto p-6 lg:p-8">{children}</div>
            </ScrollArea>
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}

