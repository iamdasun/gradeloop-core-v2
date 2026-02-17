"use client";

import React, { useEffect, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import type { PropsWithChildren } from "react";

export default function AppShell({ children }: PropsWithChildren) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("gradeloop:theme");
      const prefersDark = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      const theme = stored ?? (prefersDark ? "dark" : "light");
      applyTheme(theme);
    } catch (e) {
      // defensive: localStorage/matchMedia may throw in some environments
    }

    function onToggle() {
      const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
      const next = current === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("gradeloop:theme", next);
      } catch (_) {}
      applyTheme(next);
    }

    window.addEventListener("gradeloop:toggle-theme", onToggle as EventListener);
    return () => window.removeEventListener("gradeloop:toggle-theme", onToggle as EventListener);
  }, []);

  function applyTheme(theme: string) {
    document.documentElement.dataset.theme = theme;
    if (theme === "dark") document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }

  useEffect(() => {
    if (sidebarOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
  }, [sidebarOpen]);

  return (
    <div className="min-h-screen flex bg-[var(--background)] text-[var(--foreground)]">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 bg-primary text-white px-2 py-1 rounded">Skip to content</a>

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} collapsed={collapsed} onToggleCollapse={() => setCollapsed((s) => !s)} />

      <div className={`flex-1 flex flex-col h-screen overflow-hidden ${collapsed ? 'lg:pl-[72px]' : 'lg:pl-[280px]'}`}>
        <TopBar onToggleSidebar={() => setSidebarOpen((s) => !s)} isCollapsed={collapsed} onToggleCollapse={() => setCollapsed((s) => !s)} />

        <main id="main-content" className="flex-1 overflow-y-auto p-4">
          {children}
        </main>
      </div>
    </div>
  );
}
