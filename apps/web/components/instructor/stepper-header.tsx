import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StepperStep {
    id: string;
    title: string;
    description?: string;
}

interface StepperHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
    steps: StepperStep[];
    currentStep: number;
}

export function StepperHeader({ steps, currentStep, className, ...props }: StepperHeaderProps) {
    return (
        <div className={cn("w-full py-4", className)} {...props}>
            <div className="flex items-center justify-between w-full relative">
                {/* Progress Line */}
                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-border -translate-y-1/2 hidden md:block" />
                <div
                    className="absolute top-1/2 left-0 h-0.5 bg-primary -translate-y-1/2 transition-all duration-300 hidden md:block"
                    style={{ width: `${((Math.max(1, currentStep) - 1) / (Math.max(1, steps.length - 1))) * 100}%` }}
                />

                {steps.map((step, idx) => {
                    const stepNumber = idx + 1;
                    const isCompleted = stepNumber < currentStep;
                    const isCurrent = stepNumber === currentStep;
                    const isUpcoming = stepNumber > currentStep;

                    return (
                        <div
                            key={step.id}
                            className={cn(
                                "relative z-10 flex flex-col items-center gap-2",
                                "flex-1 md:flex-none"
                            )}
                        >
                            {/* Mobile Progress Line */}
                            {idx !== 0 && (
                                <div className={cn(
                                    "absolute top-4 -left-1/2 right-1/2 h-0.5 -translate-y-1/2 block md:hidden",
                                    isCompleted || isCurrent ? "bg-primary" : "bg-border"
                                )} />
                            )}

                            <div
                                className={cn(
                                    "flex items-center justify-center w-8 h-8 rounded-full border-2 text-sm font-semibold transition-colors duration-200 z-10",
                                    isCompleted
                                        ? "bg-primary border-primary text-primary-foreground"
                                        : isCurrent
                                            ? "bg-background border-primary text-primary ring-4 ring-primary/20"
                                            : "bg-background border-muted text-muted-foreground"
                                )}
                            >
                                {isCompleted ? <Check className="w-4 h-4" /> : stepNumber}
                            </div>

                            <div className="hidden md:flex flex-col items-center text-center max-w-[120px]">
                                <span className={cn(
                                    "text-sm font-semibold whitespace-nowrap",
                                    isCurrent ? "text-foreground" : "text-muted-foreground"
                                )}>
                                    {step.title}
                                </span>
                                {step.description && (
                                    <span className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
                                        {step.description}
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
