import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface EmptyStateCardProps extends React.HTMLAttributes<HTMLDivElement> {
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    description: string;
    action?: React.ReactNode;
}

export function EmptyStateCard({
    icon: Icon,
    title,
    description,
    action,
    className,
    ...props
}: EmptyStateCardProps) {
    return (
        <Card className={cn("border-dashed border-border/60 bg-background overflow-hidden", className)} {...props}>
            <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                <div className="h-16 w-16 md:h-20 md:w-20 rounded-2xl bg-muted/50 dark:bg-muted/20 flex items-center justify-center mb-6">
                    <Icon className="h-8 w-8 md:h-10 md:w-10 text-muted-foreground/60" />
                </div>
                <h3 className="text-xl md:text-2xl font-bold tracking-tight mb-2 text-foreground">
                    {title}
                </h3>
                <p className="text-sm md:text-base text-muted-foreground max-w-sm mx-auto mb-6">
                    {description}
                </p>
                {action && (
                    <div className="mt-2">
                        {action}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
