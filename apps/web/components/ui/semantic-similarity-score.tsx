"use client";

import { cn } from "@/lib/utils/cn";

export interface SemanticSimilarityScoreProps {
  /**
   * The semantic similarity score (0-100)
   */
  score: number;
  /**
   * Optional change percentage (e.g., +2.4 or -1.2)
   */
  change?: number;
  /**
   * Show compact version (smaller size)
   */
  compact?: boolean;
  /**
   * Show the score as a badge only (no label)
   */
  badgeOnly?: boolean;
  /**
   * Custom className for the container
   */
  className?: string;
  /**
   * Whether to show the trend indicator (up/down arrow)
   */
  showTrend?: boolean;
  /**
   * Size variant
   */
  size?: "sm" | "md" | "lg";
  /**
   * Whether to show the colored background card
   */
  showCard?: boolean;
  /**
   * Custom label to display above the score
   */
  label?: string;
  /**
   * onClick handler for interactive usage
   */
  onClick?: () => void;
}

/**
 * Determines the color scheme based on score value
 */
function getScoreScheme(score: number) {
  if (score >= 90) {
    return {
      text: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-100 dark:bg-emerald-900/30",
      border: "border-emerald-200 dark:border-emerald-800",
      ring: "ring-emerald-500",
      gradient: "from-emerald-500 to-green-500",
    };
  }
  if (score >= 75) {
    return {
      text: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-100 dark:bg-amber-900/30",
      border: "border-amber-200 dark:border-amber-800",
      ring: "ring-amber-500",
      gradient: "from-amber-500 to-orange-500",
    };
  }
  if (score >= 50) {
    return {
      text: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-100 dark:bg-blue-900/30",
      border: "border-blue-200 dark:border-blue-800",
      ring: "ring-blue-500",
      gradient: "from-blue-500 to-cyan-500",
    };
  }
  return {
    text: "text-slate-600 dark:text-slate-400",
    bg: "bg-slate-100 dark:bg-slate-900/30",
    border: "border-slate-200 dark:border-slate-800",
    ring: "ring-slate-500",
    gradient: "from-slate-500 to-gray-500",
  };
}

/**
 * Determines the semantic label based on score
 */
function getSemanticLabel(score: number): string {
  if (score >= 90) return "Very High Similarity";
  if (score >= 75) return "High Similarity";
  if (score >= 50) return "Moderate Similarity";
  if (score >= 25) return "Low Similarity";
  return "Very Low Similarity";
}

/**
 * A reusable component to display semantic similarity scores
 * with optional trend indicators and various display modes.
 */
export function SemanticSimilarityScore({
  score,
  change,
  compact = false,
  badgeOnly = false,
  className,
  showTrend = true,
  size = "md",
  showCard = false,
  label,
  onClick,
}: SemanticSimilarityScoreProps) {
  const scheme = getScoreScheme(score);
  const semanticLabel = label || getSemanticLabel(score);

  const sizeClasses = {
    sm: {
      score: "text-lg",
      change: "text-xs",
      label: "text-[10px]",
      padding: "px-2 py-1",
      gap: "gap-1",
    },
    md: {
      score: "text-2xl",
      change: "text-sm",
      label: "text-xs",
      padding: "px-3 py-1.5",
      gap: "gap-2",
    },
    lg: {
      score: "text-4xl",
      change: "text-base",
      label: "text-sm",
      padding: "px-4 py-2",
      gap: "gap-3",
    },
  };

  const currentSize = sizeClasses[size];

  // Badge-only mode (minimal display)
  if (badgeOnly) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full font-bold",
          scheme.bg,
          scheme.text,
          currentSize.padding,
          onClick && "cursor-pointer hover:opacity-80 transition-opacity",
          className,
        )}
        onClick={onClick}
      >
        <span className={cn("font-bold", currentSize.score)}>{score}%</span>
        {change !== undefined && showTrend && (
          <span
            className={cn(
              "flex items-center font-bold",
              currentSize.change,
              change >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400",
            )}
          >
            {change >= 0 ? "↑" : "↓"}
            {Math.abs(change)}%
          </span>
        )}
      </div>
    );
  }

  // Card mode (with background)
  if (showCard) {
    return (
      <div
        className={cn(
          "flex flex-col gap-1 rounded-xl p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm",
          onClick && "cursor-pointer hover:shadow-md transition-shadow",
          className,
        )}
        onClick={onClick}
      >
        <p
          className={cn(
            "text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider",
            currentSize.label,
          )}
        >
          {semanticLabel}
        </p>
        <div className={cn("flex items-baseline gap-2", currentSize.gap)}>
          <p className={cn("font-bold", scheme.text, currentSize.score)}>
            {score}%
          </p>
          {change !== undefined && showTrend && (
            <p
              className={cn(
                "font-bold flex items-center gap-0.5",
                currentSize.change,
                change >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400",
              )}
            >
              {change >= 0 ? "↑" : "↓"}
              {Math.abs(change)}%
            </p>
          )}
        </div>
      </div>
    );
  }

  // Default inline mode
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2",
        onClick && "cursor-pointer hover:opacity-80 transition-opacity",
        className,
      )}
      onClick={onClick}
    >
      <div className={cn("flex items-baseline gap-2", currentSize.gap)}>
        <span className={cn("font-bold", scheme.text, currentSize.score)}>
          {score}%
        </span>
        {change !== undefined && showTrend && (
          <span
            className={cn(
              "flex items-center font-bold",
              currentSize.change,
              change >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400",
            )}
          >
            {change >= 0 ? "↑" : "↓"}
            {Math.abs(change)}%
          </span>
        )}
      </div>
      {!compact && (
        <span
          className={cn(
            "text-xs font-medium text-slate-500 dark:text-slate-400",
            currentSize.label,
          )}
        >
          {semanticLabel}
        </span>
      )}
    </div>
  );
}

/**
 * Props for the semantic similarity bar chart component
 */
export interface SemanticSimilarityBarProps {
  score: number;
  height?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
  animated?: boolean;
}

/**
 * A horizontal bar visualization for semantic similarity scores
 */
export function SemanticSimilarityBar({
  score,
  height = "md",
  showLabel = true,
  className,
  animated = true,
}: SemanticSimilarityBarProps) {
  const scheme = getScoreScheme(score);

  const heightClasses = {
    sm: "h-1.5",
    md: "h-2.5",
    lg: "h-4",
  };

  const barHeight = heightClasses[height];

  return (
    <div className={cn("w-full", className)}>
      <div
        className={cn(
          "flex items-center justify-between mb-1",
          !showLabel && "mb-0",
        )}
      >
        {showLabel && (
          <>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Semantic Similarity
            </span>
            <span className={cn("text-sm font-bold", scheme.text)}>
              {score}%
            </span>
          </>
        )}
      </div>
      <div
        className={cn(
          "w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden",
          barHeight,
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            `bg-gradient-to-r ${scheme.gradient}`,
            animated && "animate-pulse",
          )}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Props for the semantic similarity gauge component
 */
export interface SemanticSimilarityGaugeProps {
  score: number;
  size?: "sm" | "md" | "lg";
  showValue?: boolean;
  className?: string;
}

/**
 * A circular gauge visualization for semantic similarity scores
 */
export function SemanticSimilarityGauge({
  score,
  size = "md",
  showValue = true,
  className,
}: SemanticSimilarityGaugeProps) {
  const scheme = getScoreScheme(score);

  const sizeClasses = {
    sm: { width: 60, strokeWidth: 6, fontSize: "text-sm" },
    md: { width: 100, strokeWidth: 8, fontSize: "text-xl" },
    lg: { width: 140, strokeWidth: 10, fontSize: "text-3xl" },
  };

  const currentSize = sizeClasses[size];
  const radius = (currentSize.width - currentSize.strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center",
        className,
      )}
    >
      <svg
        width={currentSize.width}
        height={currentSize.width}
        className="transform -rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={currentSize.width / 2}
          cy={currentSize.width / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={currentSize.strokeWidth}
          className="text-slate-200 dark:text-slate-800"
        />
        {/* Progress circle */}
        <circle
          cx={currentSize.width / 2}
          cy={currentSize.width / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={currentSize.strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={cn("transition-all duration-700 ease-out", scheme.text)}
        />
      </svg>
      {showValue && (
        <div
          className={cn(
            "absolute font-bold",
            scheme.text,
            currentSize.fontSize,
          )}
        >
          {score}%
        </div>
      )}
    </div>
  );
}

export default SemanticSimilarityScore;
