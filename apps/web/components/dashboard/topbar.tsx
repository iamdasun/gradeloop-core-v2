"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Search, Bell, Menu, Plus, Upload, LayoutGrid, List } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/stores/authStore";
import { useUIStore } from "@/lib/stores/uiStore";

interface TopbarProps {
  onMenuClick?: () => void;
  className?: string;
}

export function Topbar({ onMenuClick, className }: TopbarProps) {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const pageTitle = useUIStore((s) => s.pageTitle);

  // Format pathname as Title
  const paths = pathname.split("/").filter(Boolean);
  const pathDerivedTitle = paths[paths.length - 1]
    ? paths[paths.length - 1].charAt(0).toUpperCase() + paths[paths.length - 1].slice(1)
    : "Dashboard";

  const currentPath = pageTitle || pathDerivedTitle;

  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex h-[72px] items-center justify-between border-b bg-background/95 backdrop-blur-xl px-6 lg:px-8 transition-colors duration-300",
        className,
      )}
    >
      {/* Left section: Mobile menu & Contextual Title / Avatars */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" />
        </Button>

        <div className="hidden md:flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LayoutGrid className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold font-heading">{currentPath}</h1>
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
              Workspace Active
            </p>
          </div>
        </div>
      </div>

      {/* Right section: Search & Actions */}
      <div className="flex items-center gap-3">

        <ThemeToggle />

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative h-9 w-9 rounded-full hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute right-1 top-1 flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
              <span className="sr-only">Notifications</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 rounded-xl shadow-lg border-border">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h4 className="font-semibold font-heading">Notifications</h4>
              <Button variant="ghost" size="sm" className="h-auto p-0 text-xs text-primary hover:text-primary">
                Mark all as read
              </Button>
            </div>
            <div className="py-2">
              <DropdownMenuItem className="flex flex-col items-start gap-1 p-3 mx-2 rounded-lg cursor-pointer">
                <div className="flex w-full items-start justify-between">
                  <p className="text-sm font-medium">New assignment submitted</p>
                  <span className="text-xs text-muted-foreground">5m ago</span>
                </div>
                <p className="text-xs text-muted-foreground">John Doe submitted Assignment #5</p>
              </DropdownMenuItem>
              {/* More items... */}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
