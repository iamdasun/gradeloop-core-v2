"use client";

import * as React from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { MobileSidebar } from "@/components/dashboard/mobile-sidebar";
import { SecondarySidebar } from "@/components/dashboard/secondary-sidebar";
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
      <div className="flex h-screen overflow-hidden bg-background transition-colors duration-300">
        {/* Desktop Primary Sidebar */}
        <aside className="hidden lg:block">
          <Sidebar
            collapsed={sidebarCollapsed}
            onCollapsedChange={setSidebarCollapsed}
          />
        </aside>

        {/* Desktop Secondary Sidebar — rendered at layout level so it sits
            flush, full-height, outside the scrollable content area */}
        <SecondarySidebar />

        {/* Mobile Sidebar */}
        <MobileSidebar open={mobileMenuOpen} onOpenChange={setMobileMenuOpen} />

        {/* Main Content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar onMenuClick={() => setMobileMenuOpen(true)} />

          <main className="flex-1 overflow-hidden bg-background">
            <ScrollArea className="h-full">
              <div className="container mx-auto p-6 lg:p-8">{children}</div>
            </ScrollArea>
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}

