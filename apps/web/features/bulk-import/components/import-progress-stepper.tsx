"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ImportStep } from "@/schemas/bulk-import.schema";

interface Step {
  id: ImportStep;
  label: string;
  href?: string;
}

const steps: Step[] = [
  { id: "upload", label: "Upload" },
  { id: "map", label: "Map Fields" },
  { id: "validate", label: "Validate" },
  { id: "import", label: "Import" },
];

interface ImportProgressStepperProps {
  currentStep: ImportStep;
}

export function ImportProgressStepper({
  currentStep,
}: ImportProgressStepperProps) {
  const currentStepIndex = steps.findIndex((step) => step.id === currentStep);

  return (
    <nav aria-label="Progress" className="mb-10">
      <ol className="flex items-center" role="list">
        {steps.map((step, index) => {
          const isCompleted = index < currentStepIndex;
          const isCurrent = index === currentStepIndex;
          const isUpcoming = index > currentStepIndex;

          return (
            <li
              key={step.id}
              className={cn("relative", index !== steps.length - 1 && "pr-8 sm:pr-20")}
            >
              {/* Connector line */}
              {index !== steps.length - 1 && (
                <div
                  aria-hidden="true"
                  className="absolute inset-0 flex items-center"
                >
                  <div
                    className={cn(
                      "h-0.5 w-full",
                      isCompleted
                        ? "bg-primary"
                        : "bg-gray-200 dark:bg-border-color"
                    )}
                  />
                </div>
              )}

              {/* Step circle */}
              <a
                className={cn(
                  "relative flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                  isCompleted &&
                    "bg-primary hover:bg-primary-hover cursor-pointer",
                  isCurrent &&
                    "border-2 border-primary bg-background-light dark:bg-background-dark",
                  isUpcoming &&
                    "border-2 border-gray-300 dark:border-gray-600 bg-background-light dark:bg-background-dark hover:border-gray-400 cursor-pointer"
                )}
                href={step.href || "#"}
              >
                {isCompleted && (
                  <Check className="h-4 w-4 text-white" aria-hidden="true" />
                )}
                {isCurrent && (
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 rounded-full bg-primary"
                  />
                )}
                {isUpcoming && (
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 rounded-full bg-transparent group-hover:bg-gray-300 dark:group-hover:bg-gray-600"
                  />
                )}
                <span className="sr-only">Step {index + 1}</span>
              </a>

              {/* Step label */}
              <span
                className={cn(
                  "absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-medium whitespace-nowrap",
                  isCurrent && "text-primary font-bold",
                  isCompleted && "text-primary",
                  isUpcoming && "text-gray-500 dark:text-gray-400"
                )}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
