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
        return () => {
            mounted = false;
            setPageTitle(null);
            setSecondarySidebar(null);
        };
    }, [instanceId, basePath, setPageTitle, setSecondarySidebar]);

    // Assignment detail pages have their own full-page layout
    const isInsideAssignment = /\/assignments\/[^/]+/.test(pathname);
    if (isInsideAssignment) {
        return <>{children}</>;
    }

    return (
        <>
            {/* Mobile only: back link + horizontal tab bar */}
            <div className="lg:hidden mb-6">
                <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    className="mb-3 h-8 px-2 text-muted-foreground hover:text-foreground justify-start -ml-2"
                >
                    <Link href="/instructor/courses">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Courses
                    </Link>
                </Button>
                <div className="flex items-center gap-5 overflow-x-auto border-b border-border/40">
                    {NAV_ITEMS.map(({ name, href, icon: Icon }) => {
                        const fullHref = `${basePath}${href}`;
                        const isActive = href === ""
                            ? pathname === basePath
                            : pathname.startsWith(fullHref);
                        return (
                            <Link
                                key={name}
                                href={fullHref}
                                className={cn(
                                    "flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                                    isActive
                                        ? "border-primary text-primary"
                                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                                )}
                            >
                                <Icon className="h-4 w-4" />
                                {name}
                            </Link>
                        );
                    })}
                </div>
            </div>

            {children}
        </>
    );
}

