import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
    status: string;
    className?: string;
    variant?: "default" | "outline" | "secondary";
}

export function StatusBadge({ status, className, variant = "secondary" }: StatusBadgeProps) {
    const s = status.toLowerCase();

    // Define semantic color mappings based on globals.css tokens
    let colorClass = "";

    // Active / Success states (Green/Emerald)
    if (["active", "published", "enrolled", "graded", "completed", "success", "allowed"].includes(s)) {
        colorClass = "bg-[#d1fae5] text-[#065f46] hover:bg-[#d1fae5]/80 dark:bg-[#064e3b] dark:text-[#34d399] border-[#a7f3d0] dark:border-[#065f46]";
    }
    // Warning / Attention states (Amber/Yellow)
    else if (["pending", "late", "draft", "warning", "planned", "missing"].includes(s)) {
        colorClass = "bg-[#fef3c7] text-[#92400e] hover:bg-[#fef3c7]/80 dark:bg-[#451a03] dark:text-[#fbbf24] border-[#fde68a] dark:border-[#78350f]";
    }
    // Error / Destructive states (Red)
    else if (["closed", "dropped", "failed", "cancelled", "suspended", "withdrawn", "error", "not allowed"].includes(s)) {
        colorClass = "bg-[#fee2e2] text-[#991b1b] hover:bg-[#fee2e2]/80 dark:bg-[#450a0a] dark:text-[#f87171] border-[#fecaca] dark:border-[#7f1d1d]";
    }
    // Info / Brand states (Indigo/Purple)
    else if (["instructor", "lead instructor", "ta", "info", "enabled", "acafs", "cipas", "blaim", "viva voce"].includes(s)) {
        colorClass = "bg-[#e0e7ff] text-[#3730a3] hover:bg-[#e0e7ff]/80 dark:bg-[#1e1b4b] dark:text-[#818cf8] border-[#c7d2fe] dark:border-[#312e81]";
    }

    return (
        <Badge
            variant={variant}
            className={cn(
                "font-semibold uppercase tracking-wider text-[10px] px-2 py-0.5",
                colorClass,
                className
            )}
        >
            {status}
        </Badge>
    );
}
