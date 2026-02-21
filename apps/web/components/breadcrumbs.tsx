"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

export function Breadcrumbs() {
    const pathname = usePathname();
    const paths = pathname.split("/").filter(Boolean);

    if (paths.length === 0) return null;

    return (
        <nav aria-label="Breadcrumb" className="flex items-center text-sm text-muted-foreground">
            <ol className="flex items-center space-x-2">
                <li>
                    <Link
                        href="/dashboard"
                        className="hover:text-foreground transition-colors"
                    >
                        <Home className="h-4 w-4" />
                    </Link>
                </li>
                {paths.map((path, index) => {
                    const href = `/${paths.slice(0, index + 1).join("/")}`;
                    const isLast = index === paths.length - 1;
                    const label = path.charAt(0).toUpperCase() + path.slice(1).replace(/-/g, " ");

                    return (
                        <li key={path} className="flex items-center space-x-2">
                            <ChevronRight className="h-4 w-4 shrink-0 opacity-50" />
                            {isLast ? (
                                <span className="font-medium text-foreground truncate max-w-[150px] sm:max-w-[300px]">
                                    {label}
                                </span>
                            ) : (
                                <Link
                                    href={href}
                                    className="hover:text-foreground transition-colors truncate max-w-[150px] sm:max-w-[300px]"
                                >
                                    {label}
                                </Link>
                            )}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}
