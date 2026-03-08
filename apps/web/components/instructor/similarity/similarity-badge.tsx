"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type RiskLevel = "high" | "medium" | "low";

interface SimilarityBadgeProps {
  similarity: number;
  className?: string;
}

export function SimilarityBadge({ similarity, className }: SimilarityBadgeProps) {
  const level: RiskLevel = similarity >= 0.85 ? "high" : similarity >= 0.75 ? "medium" : "low";
  
  const colors = {
    high: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    medium: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    low: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  };

  const label = {
    high: "High Risk",
    medium: "Med Risk",
    low: "Low Risk",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
        colors[level],
        className
      )}
    >
      {label[level]}
    </span>
  );
}

interface SimilarityScoreProps {
  score: number;
  showBar?: boolean;
  className?: string;
}

export function SimilarityScore({ score, showBar = false, className }: SimilarityScoreProps) {
  const percentage = Math.round(score * 100);
  const level: RiskLevel = score >= 0.85 ? "high" : score >= 0.75 ? "medium" : "low";
  
  const barColors = {
    high: "bg-red-500",
    medium: "bg-orange-500",
    low: "bg-yellow-500",
  };

  const textColors = {
    high: "text-red-600 dark:text-red-400",
    medium: "text-orange-600 dark:text-orange-400",
    low: "text-yellow-600 dark:text-yellow-400",
  };

  if (showBar) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <div className="w-24 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div 
            className={cn("h-full", barColors[level])}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span className={cn("text-sm font-bold", textColors[level])}>
          {percentage}%
        </span>
      </div>
    );
  }

  return (
    <span className={cn("text-sm font-bold", textColors[level], className)}>
      {percentage}%
    </span>
  );
}
