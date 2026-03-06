"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FileText, Users } from "lucide-react";
import { instructorCoursesApi } from "@/lib/api/academics";
import { useUIStore } from "@/lib/stores/uiStore";
import { cn } from "@/lib/utils";

export default function CourseInstanceLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ instanceId: string }>;
}) {
    const { instanceId } = React.use(params);
    const pathname = usePathname();

    const pushSecondarySidebar = useUIStore((s) => s.pushSecondarySidebar);
    const popSecondarySidebar = useUIStore((s) => s.popSecondarySidebar);
    const updateTopSecondarySidebar = useUIStore((s) => s.updateTopSecondarySidebar);
    const setPageTitle = useUIStore((s) => s.setPageTitle);

    const basePath = `/instructor/courses/${instanceId}`;

    const [courseCode, setCourseCode] = React.useState("");
    const [courseTitle, setCourseTitle] = React.useState("Course Details");

    // Fetch course metadata
    React.useEffect(() => {
        let mounted = true;
        async function fetchCourseData() {
            try {
                const courses = await instructorCoursesApi.listMyCourses();
                const found = courses.find((c) => c.course_instance_id === instanceId);
                if (mounted && found) {
                    setCourseTitle(found.course_title ?? "Course Details");
                    setCourseCode(found.course_code ?? "");
                }
            } catch {
                // keep defaults
            }
        }
        fetchCourseData();
        return () => { mounted = false; };
    }, [instanceId]);

    // Push sidebar on mount (with defaults), pop on unmount
    React.useEffect(() => {
        pushSecondarySidebar({
            title: "Course Details",
            subtitle: undefined,
            backHref: "/instructor/courses",
            backLabel: "My Courses",
            basePath,
            items: [
                { name: "Overview", href: basePath },
                { name: "Assignments", href: `${basePath}/assignments` },
                { name: "Students", href: `${basePath}/students` },
            ],
        });
        return () => {
            popSecondarySidebar();
            setPageTitle(null);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [instanceId]);

    // Update sidebar title/subtitle once data is fetched
    React.useEffect(() => {
        setPageTitle(courseTitle);
        updateTopSecondarySidebar({
            title: courseTitle,
            subtitle: courseCode || undefined,
            backHref: "/instructor/courses",
            backLabel: "My Courses",
            basePath,
            items: [
                { name: "Overview", href: basePath },
                { name: "Assignments", href: `${basePath}/assignments` },
                { name: "Students", href: `${basePath}/students` },
            ],
        });
    }, [courseTitle, courseCode, instanceId, basePath, setPageTitle, updateTopSecondarySidebar]);

    // Mobile-only tab strip — hidden on desktop where the secondary sidebar takes over
    const mobileTabs = [
        { name: "Overview", href: basePath, icon: LayoutDashboard },
        { name: "Assignments", href: `${basePath}/assignments`, icon: FileText },
        { name: "Students", href: `${basePath}/students`, icon: Users },
    ];

    // Only show the course-level mobile tabs when NOT inside an assignment detail
    const isInsideAssignmentDetail = /\/assignments\/[^/]+$|\/assignments\/[^/]+\//.test(pathname);
    const isInsideCreate = pathname.includes("/assignments/create");

    return (
        <div className="animate-in fade-in duration-300 flex flex-col min-h-0">
            {/* Mobile-only compact tab bar — hidden ≥ lg */}
            {!isInsideAssignmentDetail && !isInsideCreate && (
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
            )}
            {children}
        </div>
    );
}

