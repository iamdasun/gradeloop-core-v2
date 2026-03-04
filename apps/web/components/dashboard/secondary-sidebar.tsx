"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/lib/stores/uiStore";

/**
 * SecondarySidebar — rendered at the dashboard-layout level, sitting between
 * the primary sidebar and <main>. Config is pushed into the uiStore by nested
 * layouts (e.g. course instance). When config is null the component renders
 * nothing, so it doesn't affect layouts that don't need it.
 */
export function SecondarySidebar() {
    const config = useUIStore((s) => s.secondarySidebar);
    const pathname = usePathname();

    if (!config) return null;

    return (
        <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r bg-sidebar-background h-full overflow-hidden">
            {/* Header — same h-16 / px-6 as admin secondary sidebar */}
            <div className="flex h-16 flex-col justify-center w-full px-6 border-b border-sidebar-border gap-0.5 shrink-0">
                <Link
                    href={config.backHref}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ArrowLeft className="h-3 w-3" />
                    {config.backLabel}
                </Link>
                <h2 className="text-sm font-semibold tracking-tight text-foreground font-heading truncate leading-snug">
                    {config.subtitle && (
                        <span className="text-primary font-mono mr-1.5 text-[11px] font-bold uppercase">
                            {config.subtitle}
                        </span>
                    )}
                    {config.title}
                </h2>
            </div>

            {/* Nav items — same Button pattern as admin secondary sidebar */}
            <ScrollArea className="flex-1 w-full px-4">
                <div className="flex flex-col gap-1 w-full py-3">
                    {config.items.map(({ name, href }) => {
                        const isFirst = href === config.basePath;
                        const isActive = isFirst
                            ? pathname === config.basePath
                            : pathname.startsWith(href);
                        return (
                            <Link key={name} href={href} className="w-full text-left">
                                <Button
                                    variant="ghost"
                                    className={cn(
                                        "h-10 w-full flex items-center rounded-lg transition-colors justify-start px-3",
                                        isActive
                                            ? "bg-primary/10 text-primary font-medium"
                                            : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                                    )}
                                >
                                    <span className="truncate text-sm">{name}</span>
                                </Button>
                            </Link>
                        );
                    })}
                </div>
            </ScrollArea>
        </aside>
    );
}
