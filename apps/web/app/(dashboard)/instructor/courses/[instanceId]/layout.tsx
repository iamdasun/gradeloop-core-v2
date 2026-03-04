"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, LayoutDashboard, FileText, Users } from "lucide-react";
import { instructorCoursesApi } from "@/lib/api/academics";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/lib/stores/uiStore";

const NAV_ITEMS = [
    { name: "Overview",    href: "",             icon: LayoutDashboard },
    { name: "Assignments", href: "/assignments",  icon: FileText },
    { name: "Students",    href: "/students",     icon: Users },
];

export default function CourseInstanceLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ instanceId: string }>;
}) {
    const { instanceId } = React.use(params);
    const pathname = usePathname();

    const setPageTitle       = useUIStore((s) => s.setPageTitle);
    const setSecondarySidebar = useUIStore((s) => s.setSecondarySidebar);

    const basePath = `/instructor/courses/${instanceId}`;

    React.useEffect(() => {
        let mounted = true;
        async function fetchCourseData() {
            try {
                const courses = await instructorCoursesApi.listMyCourses();
                const found = courses.find((c) => c.course_instance_id === instanceId);
                if (mounted) {
                    const title = found?.course_title ?? "Course Details";
                    const code  = found?.course_code  ?? "";
                    setPageTitle(title);
                    setSecondarySidebar({
                        title,
                        subtitle:  code || undefined,
                        backHref:  "/instructor/courses",
                        backLabel: "My Courses",
                        basePath,
                        items: NAV_ITEMS.map((item) => ({
                            name: item.name,
                            href: `${basePath}${item.href}`,
                        })),
                    });
                }
            } catch {
                if (mounted) {
                    setPageTitle("Course");
                    setSecondarySidebar({
                        title:     "Course",
                        backHref:  "/instructor/courses",
                        backLabel: "My Courses",
                        basePath,
                        items: NAV_ITEMS.map((item) => ({
                            name: item.name,
                            href: `${basePath}${item.href}`,
                        })),
                    });
                }
            }
        }
        fetchCourseData();
        return () => { mounted = false; };
    }, [instanceId]);

    const basePath = `/instructor/courses/${instanceId}`;
    const tabs = [
        { name: "Overview", href: basePath, icon: LayoutDashboard },
        { name: "Assignments", href: `${basePath}/assignments`, icon: FileText },
        { name: "Students", href: `${basePath}/students`, icon: Users },
    ];

    // Hide the course-level tab bar when inside an assignment detail page —
    // the assignment layout renders its own secondary bar there.
    const isInsideAssignment = /\/assignments\/[^/]+/.test(pathname);

    return (
        <div className="flex-1 flex flex-col overflow-hidden w-full animate-in fade-in duration-300">
            {/* Horizontal Header / Tabs — hidden when inside an assignment detail page */}
            {!isInsideAssignment && (
            <div className="border-b border-border/40 bg-background/95 backdrop-blur z-10 sticky top-0 px-4 md:px-8 pt-6 shrink-0">
                <div className="max-w-6xl mx-auto w-full">
                    <Button variant="ghost" size="sm" asChild className="mb-4 h-8 px-2 text-muted-foreground hover:text-foreground -ml-2">
                        <Link href="/instructor/courses">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to Courses
                        </Link>
                    </Button>
                    <div className="mb-6">
                        <div className="text-xs font-mono font-bold text-primary mb-1 uppercase tracking-wider">{courseCode}</div>
                        <h2 className="text-3xl font-bold font-heading text-foreground tracking-tight" title={courseTitle}>
                            {courseTitle}
                        </h2>
                    </div>

                    <div className="flex items-center gap-6 overflow-x-auto">
                        {tabs.map((tab) => {
                            const isActive = tab.href === basePath
                                ? pathname === basePath
                                : pathname.startsWith(tab.href);
                            const Icon = tab.icon;

                            return (
                                <Link
                                    key={tab.name}
                                    href={tab.href}
                                    className={cn(
                                        "flex items-center gap-2 pb-3 font-medium text-sm border-b-2 transition-colors whitespace-nowrap",
                                        isActive
                                            ? "border-primary text-primary"
                                            : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                                    )}
                                >
                                    <Icon className="h-4 w-4" />
                                    {tab.name}
                                </Link>
                            )
                        })}
                    </div>
                </div>
            </div>
            )}

            {children}
        </>
    );
}

