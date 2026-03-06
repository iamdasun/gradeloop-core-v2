import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatsCardProps extends React.HTMLAttributes<HTMLDivElement> {
    title: string;
    icon: React.ComponentType<{ className?: string }>;
    value: React.ReactNode;
    subtitle?: string;
    isLoading?: boolean;
    badge?: string;
    badgeVariant?: "default" | "secondary" | "destructive" | "outline";
}

export function StatsCard({
    title,
    icon: Icon,
    value,
    subtitle,
    isLoading,
    badge,
    badgeVariant = "outline",
    className,
    ...props
}: StatsCardProps) {
    return (
        <Card className={cn("border-border/60 shadow-sm transition-all duration-200 hover:shadow-md hover:border-primary/20", className)} {...props}>
            <CardContent className="p-6">
                <div className="flex items-center justify-between gap-4">
                    {/* Left: label + value + subtitle */}
                    <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {title}
                        </p>
                        <div className="text-3xl font-black tracking-tight text-foreground mt-1 tabular-nums">
                            {isLoading ? (
                                <Loader2 className="h-7 w-7 animate-spin text-muted-foreground/50 mt-1" />
                            ) : (
                                value
                            )}
                        </div>
                        {subtitle && (
                            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1" title={subtitle}>
                                {subtitle}
                            </p>
                        )}
                    </div>

                    {/* Right: icon + optional badge */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                        <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Icon className="h-5 w-5 text-primary" />
                        </div>
                        {badge && (
                            <Badge variant={badgeVariant} className="text-[10px] font-semibold">
                                {badge}
                            </Badge>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
