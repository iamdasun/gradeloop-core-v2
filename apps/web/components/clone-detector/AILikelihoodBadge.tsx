"use client";

import { Badge } from "@/components/ui/badge";
import type { AIDetectionResponse } from "@/types/cipas";

interface AILikelihoodBadgeProps {
  aiLikelihood: number;
  humanLikelihood: number;
  showLabel?: boolean;
  size?: "sm" | "md";
}

/**
 * Displays AI likelihood as a colored badge with progress bar.
 * Green = Human-written, Red = AI-generated
 */
export function AILikelihoodBadge({
  aiLikelihood,
  humanLikelihood,
  showLabel = true,
  size = "md",
}: AILikelihoodBadgeProps) {
  const isAI = aiLikelihood > 0.5;
  const confidence = Math.max(aiLikelihood, humanLikelihood);
  const percentage = Math.round(confidence * 100);

  const isHighConfidence = confidence >= 0.85;
  const isMediumConfidence = confidence >= 0.6;

  // Determine color scheme based on likelihood and confidence
  const getColorScheme = () => {
    if (isAI) {
      if (isHighConfidence) return { bg: "bg-red-100 dark:bg-red-950/50", text: "text-red-700 dark:text-red-300", bar: "bg-red-500" };
      if (isMediumConfidence) return { bg: "bg-orange-100 dark:bg-orange-950/50", text: "text-orange-700 dark:text-orange-300", bar: "bg-orange-500" };
      return { bg: "bg-yellow-100 dark:bg-yellow-950/50", text: "text-yellow-700 dark:text-yellow-300", bar: "bg-yellow-500" };
    } else {
      if (isHighConfidence) return { bg: "bg-green-100 dark:bg-green-950/50", text: "text-green-700 dark:text-green-300", bar: "bg-green-500" };
      if (isMediumConfidence) return { bg: "bg-teal-100 dark:bg-teal-950/50", text: "text-teal-700 dark:text-teal-300", bar: "bg-teal-500" };
      return { bg: "bg-blue-100 dark:bg-blue-950/50", text: "text-blue-700 dark:text-blue-300", bar: "bg-blue-500" };
    }
  };

  const colors = getColorScheme();
  const label = isAI ? "AI-Generated" : "Human-Written";

  if (size === "sm") {
    return (
      <div className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 ${colors.bg} ${colors.text}`}>
        <div className="w-12 h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
          <div
            className={`h-full ${colors.bar} transition-all duration-300`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span className="text-[10px] font-medium">{percentage}%</span>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 ${colors.bg} ${colors.text}`}>
      <div className="flex flex-col gap-0.5 min-w-[80px]">
        <div className="flex items-center justify-between gap-2">
          {showLabel && (
            <span className="text-xs font-semibold uppercase tracking-wide">
              {label}
            </span>
          )}
          <span className="text-xs font-bold tabular-nums">{percentage}%</span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
          <div
            className={`h-full ${colors.bar} transition-all duration-300`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Compact version for table cells
 */
export function AILikelihoodCompact({
  aiLikelihood,
  humanLikelihood,
}: {
  aiLikelihood: number;
  humanLikelihood: number;
}) {
  const isAI = aiLikelihood > 0.5;
  const confidence = Math.max(aiLikelihood, humanLikelihood);
  const percentage = Math.round(confidence * 100);

  const colorClass = isAI
    ? confidence >= 0.85
      ? "text-red-600 dark:text-red-400"
      : confidence >= 0.6
      ? "text-orange-500 dark:text-orange-400"
      : "text-yellow-600 dark:text-yellow-400"
    : confidence >= 0.85
    ? "text-green-600 dark:text-green-400"
    : confidence >= 0.6
    ? "text-teal-500 dark:text-teal-400"
    : "text-blue-600 dark:text-blue-400";

  return (
    <div className={`flex items-center gap-2 ${colorClass}`}>
      <div className="w-16 h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
        <div
          className={`h-full ${isAI ? 'bg-red-500' : 'bg-green-500'} transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs font-semibold tabular-nums">{percentage}%</span>
    </div>
  );
}
