"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CollusionGroup } from "@/types/cipas";

interface NetworkGraphProps {
  clusters: CollusionGroup[];
  className?: string;
}

export function NetworkGraph({ clusters, className }: NetworkGraphProps) {
  // Simple visualization using positioned nodes
  // For a real implementation, you'd use D3.js or Recharts
  
  const getClusterColor = (confidence: number) => {
    if (confidence >= 0.85) return "border-red-500 bg-red-500/10";
    if (confidence >= 0.75) return "border-orange-500 bg-orange-500/10";
    return "border-yellow-500 bg-yellow-500/10";
  };

  const getClusterSize = (memberCount: number) => {
    // Scale cluster size based on member count
    const baseSize = 100;
    const scale = Math.min(1 + (memberCount / 10), 2);
    return baseSize * scale;
  };

  return (
    <Card className={cn("relative bg-slate-50 dark:bg-slate-950/50 overflow-hidden", className)}>
      {/* Grid background */}
      <div 
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
          backgroundSize: "24px 24px"
        }}
      />

      {/* Clusters */}
      <div className="relative w-full h-full min-h-[500px] p-8">
        {clusters.slice(0, 4).map((cluster, idx) => {
          const size = getClusterSize(cluster.member_count);
          const positions = [
            { top: "15%", left: "15%" },
            { top: "20%", right: "20%" },
            { bottom: "20%", left: "30%" },
            { bottom: "15%", right: "15%" },
          ];
          const pos = positions[idx] || positions[0];

          return (
            <div
              key={cluster.group_id}
              className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer group"
              style={{ ...pos, width: size, height: size }}
            >
              <div
                className={cn(
                  "w-full h-full rounded-full border-2 flex flex-col items-center justify-center transition-all",
                  getClusterColor(cluster.max_confidence),
                  "hover:scale-105 hover:shadow-lg"
                )}
              >
                <div className="flex -space-x-2 mb-1">
                  {Array.from({ length: Math.min(cluster.member_count, 3) }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "w-6 h-6 rounded-full border-2 border-white dark:border-slate-900",
                        cluster.max_confidence >= 0.85
                          ? "bg-red-500"
                          : cluster.max_confidence >= 0.75
                          ? "bg-orange-500"
                          : "bg-yellow-500"
                      )}
                    />
                  ))}
                  {cluster.member_count > 3 && (
                    <div className="w-6 h-6 rounded-full border-2 border-white dark:border-slate-900 bg-slate-400 flex items-center justify-center text-[10px] font-bold text-white">
                      +{cluster.member_count - 3}
                    </div>
                  )}
                </div>
                <span className="text-xs font-bold">
                  Cluster {String.fromCharCode(64 + cluster.group_id)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {Math.round(cluster.max_confidence * 100)}% Match
                </span>
              </div>

              {/* Tooltip on hover */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                {cluster.member_count} students • {cluster.edge_count} connections
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-900 dark:border-t-slate-100" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 right-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-[10px] flex gap-4">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span>High Risk (&gt;85%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-orange-500" />
          <span>Med Risk (75-85%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-yellow-500" />
          <span>Low Risk (&lt;75%)</span>
        </div>
      </div>
    </Card>
  );
}
