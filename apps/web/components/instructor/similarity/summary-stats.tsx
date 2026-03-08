"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Flag, FileText } from "lucide-react";

interface SummaryStatsProps {
  totalSubmissions: number;
  flaggedCases: number;
  highRisk: number;
  mediumRisk: number;
  lowRisk: number;
  aiInsight?: string;
  className?: string;
}

export function SummaryStats({
  totalSubmissions,
  flaggedCases,
  highRisk,
  mediumRisk,
  lowRisk,
  aiInsight,
  className,
}: SummaryStatsProps) {
  const flaggedPercentage = totalSubmissions > 0 
    ? Math.round((flaggedCases / totalSubmissions) * 100) 
    : 0;

  const highRiskWidth = totalSubmissions > 0 ? (highRisk / totalSubmissions) * 100 : 0;
  const mediumRiskWidth = totalSubmissions > 0 ? (mediumRisk / totalSubmissions) * 100 : 0;

  return (
    <div className={cn("space-y-6", className)}>
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
            Batch Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-end">
            <div>
              <p className="text-2xl font-black">{totalSubmissions}</p>
              <p className="text-xs text-muted-foreground">Total Submissions</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black text-red-500">{flaggedCases}</p>
              <p className="text-xs text-muted-foreground">Flagged Cases</p>
            </div>
          </div>

          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden flex">
            <div 
              className="bg-red-500 h-full" 
              style={{ width: `${highRiskWidth}%` }}
              title={`High Risk: ${highRisk}`}
            />
            <div 
              className="bg-orange-500 h-full" 
              style={{ width: `${mediumRiskWidth}%` }}
              title={`Medium Risk: ${mediumRisk}`}
            />
            <div 
              className="bg-primary/20 h-full flex-1"
              title={`Low/No Risk: ${totalSubmissions - highRisk - mediumRisk}`}
            />
          </div>

          {flaggedPercentage > 0 && (
            <div className="pt-2">
              <p className="text-[11px] leading-relaxed text-muted-foreground italic">
                {flaggedPercentage}% of submissions flagged for review. 
                {flaggedPercentage > 15 && " Significantly higher than typical baseline."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {aiInsight && (
        <Card className="bg-primary/5 dark:bg-primary/10 border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-primary flex items-center gap-2">
              <FileText className="h-4 w-4" />
              AI Insight
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs leading-relaxed">
              {aiInsight}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
