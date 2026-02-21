"use client";

import { Bell, Search, User } from "lucide-react";
import { Breadcrumbs } from "./breadcrumbs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "./theme-toggle";

export function TopNavbar() {
  return (
    <div className="flex flex-1 items-center gap-4">
      <div className="flex flex-1 items-center gap-4">
        <Breadcrumbs />
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <div className="relative hidden md:flex">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search..."
            className="w-64 rounded-lg bg-zinc-50 pl-8 focus:bg-white dark:bg-zinc-900 dark:focus:bg-zinc-950"
          />
        </div>

        <ThemeToggle />

        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground relative"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute top-2 right-2 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
          </span>
        </Button>

        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
          <User className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}
