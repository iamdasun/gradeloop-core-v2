"use client";

import { usePermissions } from "@/hooks/use-permissions";
import { DASHBOARD_NAV_ITEMS } from "@/lib/nav-config";
import { filterNavByPermissions } from "@/lib/permission-utils";
import { Sidebar, SidebarBody, SidebarLink } from "@/components/ui/sidebar";
import { Link as UserIcon, GraduationCap, LogOut } from "lucide-react"; // Renamed to avoid strict mode conflict if any
import Link from "next/link";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import { useRouter } from "next/navigation";

export function DashboardSidebar() {
    const { permissions, user } = usePermissions();

    // Filter navigation items based on user permissions
    const filteredNav = useMemo(() =>
        filterNavByPermissions(DASHBOARD_NAV_ITEMS, permissions),
        [permissions]);

    const [open, setOpen] = useState(false);
    const { logout } = useAuthStore();
    const router = useRouter();

    const handleLogout = async () => {
        await logout();
        router.push("/login");
    };

    return (
        <Sidebar open={open} setOpen={setOpen}>
            <SidebarBody className="justify-between gap-10">
                <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
                    <Logo />
                    <div className="mt-8 flex flex-col gap-2">
                        {filteredNav.map((item, idx) => (
                            <SidebarLink key={idx} link={{
                                label: item.label,
                                href: item.href,
                                icon: item.icon || <UserIcon className="h-5 w-5 flex-shrink-0" />
                            }} />
                        ))}
                    </div>
                </div>
                <div className="flex flex-col gap-2">
                    <SidebarLink
                        link={{
                            label: "",
                            href: "#",
                            icon: (
                                <div className="flex items-center gap-2">
                                    <div className="h-7 w-7 flex-shrink-0 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-xs font-bold">
                                        {user?.name?.[0] || "U"}
                                    </div>
                                    <div className="flex flex-col overflow-hidden">
                                        <span className="text-sm font-medium text-black dark:text-white truncate">
                                            {user?.name || "User"}
                                        </span>
                                        <span className="text-xs text-neutral-500 dark:text-neutral-400 capitalize truncate">
                                            {user?.role?.replace("_", " ") || "Guest"}
                                        </span>
                                    </div>
                                </div>
                            ),
                        }}
                    />
                    <button
                        onClick={handleLogout}
                        className="flex items-center justify-start gap-2 group/sidebar py-2 px-0 translate-x-1"
                    >
                        <LogOut className="h-5 w-5 flex-shrink-0 text-neutral-700 dark:text-neutral-200" />
                        <motion.span
                            animate={{
                                display: open ? "inline-block" : "none",
                                opacity: open ? 1 : 0,
                            }}
                            className="text-neutral-700 dark:text-neutral-200 text-sm group-hover/sidebar:translate-x-1 transition duration-150 whitespace-pre"
                        >
                            Logout
                        </motion.span>
                    </button>
                </div>
            </SidebarBody>
        </Sidebar>
    );
}

const Logo = () => {
    return (
        <Link
            href="#"
            className="font-normal flex space-x-2 items-center text-sm text-black py-1 relative z-20"
        >
            <div className="h-5 w-6 bg-black dark:bg-white rounded-br-lg rounded-tr-sm rounded-tl-lg rounded-bl-sm flex-shrink-0 flex items-center justify-center">
                <GraduationCap className="h-3 w-3 text-white dark:text-black" />
            </div>
            <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="font-medium text-black dark:text-white whitespace-pre"
            >
                Gradeloop
            </motion.span>
        </Link>
    );
};
