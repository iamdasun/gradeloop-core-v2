"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SimilarityBadge, SimilarityScore } from "./similarity-badge";
import { Eye, Users } from "lucide-react";
import type { CollusionGroup } from "@/types/cipas";
import { cn } from "@/lib/utils";

interface ClusterCardProps {
  cluster: CollusionGroup;
  onViewDetails: (cluster: CollusionGroup) => void;
  className?: string;
}

export function ClusterCard({ cluster, onViewDetails, className }: ClusterCardProps) {
  const maxConfidence = cluster.max_confidence;
  
  return (
    <Card className={cn("hover:shadow-md transition-shadow", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg",
              maxConfidence >= 0.85 
                ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                : maxConfidence >= 0.75
                ? "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400"
                : "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400"
            )}>
              {String.fromCharCode(64 + cluster.group_id)}
            </div>
            <div>
              <CardTitle className="text-base">
                Cluster {String.fromCharCode(64 + cluster.group_id)}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {cluster.dominant_type}
              </p>
            </div>
          </div>
          <SimilarityBadge similarity={maxConfidence} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Users className="h-4 w-4" />
            <span className="font-medium">{cluster.member_count} students</span>
          </div>
          <div className="text-muted-foreground">
            <span className="font-medium">{cluster.edge_count}</span> connections
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <SimilarityScore score={maxConfidence} showBar />
          <Button 
            size="sm" 
            variant="outline"
            onClick={() => onViewDetails(cluster)}
            className="gap-1.5"
          >
            <Eye className="h-3.5 w-3.5" />
            View Cluster
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
