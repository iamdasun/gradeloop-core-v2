"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, CheckSquare, Settings, BarChart3 } from "lucide-react";
import { instructorAssessmentsApi } from "@/lib/api/assessments";
import { useUIStore } from "@/lib/stores/uiStore";
import { cn } from "@/lib/utils";

export default function AssignmentLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ instanceId: string; assignmentId: string }>;
}) {
    const { instanceId, assignmentId } = React.use(params);
    const pathname = usePathname();

    const pushSecondarySidebar = useUIStore((s) => s.pushSecondarySidebar);
    const popSecondarySidebar = useUIStore((s) => s.popSecondarySidebar);
    const updateTopSecondarySidebar = useUIStore((s) => s.updateTopSecondarySidebar);
    const setPageTitle = useUIStore((s) => s.setPageTitle);

    const coursePath = `/instructor/courses/${instanceId}/assignments`;
    const basePath = `${coursePath}/${assignmentId}`;

    const [assignmentTitle, setAssignmentTitle] = React.useState("Assignment");

    // Fetch assignment title
    React.useEffect(() => {
        let mounted = true;
        async function fetchData() {
            try {
                const assignments = await instructorAssessmentsApi.listMyAssignments();
                const found = assignments.find((a) => a.id === assignmentId);
                if (mounted && found) setAssignmentTitle(found.title);
            } catch {
                // keep default
            }
        }
        fetchData();
        return () => { mounted = false; };
    }, [assignmentId]);

    // Push sidebar on mount, pop on unmount
    React.useEffect(() => {
        pushSecondarySidebar({
            title: "Assignment",
            subtitle: "Assessment",
            backHref: coursePath,
            backLabel: "Assignments",
            basePath,
            items: [
                { name: "Overview", href: basePath },
                { name: "Submissions", href: `${basePath}/submissions` },
                { name: "Similarity", href: `${basePath}/similarity` },
                { name: "Settings", href: `${basePath}/settings` },
            ],
        });
        return () => {
            popSecondarySidebar();
            setPageTitle(null);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [assignmentId]);

    // Update title once fetched
    React.useEffect(() => {
        setPageTitle(assignmentTitle);
        updateTopSecondarySidebar({
            title: assignmentTitle,
            subtitle: "Assessment",
            backHref: coursePath,
            backLabel: "Assignments",
            basePath,
            items: [
                { name: "Overview", href: basePath },
                { name: "Submissions", href: `${basePath}/submissions` },
                { name: "Similarity", href: `${basePath}/similarity` },
                { name: "Settings", href: `${basePath}/settings` },
            ],
        });
    }, [assignmentTitle, assignmentId, basePath, coursePath, setPageTitle, updateTopSecondarySidebar]);

    // Mobile-only tab strip
    const mobileTabs = [
        { name: "Overview", href: basePath, icon: LayoutDashboard },
        { name: "Submissions", href: `${basePath}/submissions`, icon: CheckSquare },
        { name: "Similarity", href: `${basePath}/similarity`, icon: BarChart3 },
        { name: "Settings", href: `${basePath}/settings`, icon: Settings },
    ];

    return (
        <div className="animate-in fade-in duration-300 flex flex-col min-h-0">
            {/* Mobile-only compact tab bar — hidden ≥ lg */}
            <nav className="lg:hidden flex items-center gap-1 overflow-x-auto border-b border-border/40 bg-background/95 backdrop-blur px-4 py-2 shrink-0 sticky top-0 z-10">
                {mobileTabs.map((tab) => {
                    const isActive = tab.href === basePath
                        ? pathname === basePath
                        : pathname.startsWith(tab.href);
                    const Icon = tab.icon;
                    return (
                        <Link
                            key={tab.name}
                            href={tab.href}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
                                isActive
                                    ? "bg-primary/10 text-primary"
                                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                            )}
                        >
                            <Icon className="h-3.5 w-3.5" />
                            {tab.name}
                        </Link>
                    );
                })}
            </nav>

            {/* Content */}
            <div className="flex-1 w-full">
                {children}
            </div>
        </div>
    );
}
