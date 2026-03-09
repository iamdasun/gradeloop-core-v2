"use client";

import { useState } from "react";
import { AlertTriangle, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DiffViewer } from "./DiffViewer";
import { AILikelihoodBadge } from "./AILikelihoodBadge";
import type {
  CollusionGroup,
  CollusionEdge,
  SubmissionItem,
  AIDetectionResponse,
} from "@/types/cipas";

const CLONE_TYPE_VARIANT: Record<
  string,
  "destructive" | "secondary" | "outline"
> = {
  "Type-1": "destructive",
  "Type-2": "destructive",
  "Type-3": "secondary",
};

const CONFIDENCE_COLOR = (c: number) => {
  if (c >= 0.85) return "text-red-600 dark:text-red-400";
  if (c >= 0.6) return "text-orange-500 dark:text-orange-400";
  return "text-yellow-600 dark:text-yellow-400";
};

interface CollusionGroupCardProps {
  group: CollusionGroup;
  submissions: SubmissionItem[];
  index: number;
  /** Optional AI detection results map keyed by submission_id */
  aiDetectionMap?: Record<string, AIDetectionResponse>;
}

export function CollusionGroupCard({
  group,
  submissions,
  index,
  aiDetectionMap,
}: CollusionGroupCardProps) {
  // group.member_ids contain student_id values (set by cascade_worker from frag.student_id)
  const groupSubs = group.member_ids
    .map((id) => submissions.find((s) => s.student_id === id))
    .filter((s): s is SubmissionItem => s !== undefined);

  const firstEdge = group.edges[0];
  const [activeEdge, setActiveEdge] = useState<CollusionEdge | null>(
    firstEdge ?? null,
  );

  const members = groupSubs
    .map((s) => `${s.student_id} (${s.submission_id})`)
    .join(", ");

  return (
    <Card className="border-red-200 dark:border-red-900/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <span>Collusion Group {index + 1}</span>
          <Badge variant="destructive" className="ml-auto">
            {group.dominant_type}
          </Badge>
        </CardTitle>

        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <div className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            <span>{group.member_count} members</span>
          </div>
          <span>·</span>
          <span>{group.edge_count} clone pairs</span>
          <span>·</span>
          <span
            className={`font-semibold ${CONFIDENCE_COLOR(group.max_confidence)}`}
          >
            max confidence {(group.max_confidence * 100).toFixed(0)}%
          </span>
        </div>

        <p
          className="text-xs text-zinc-600 dark:text-zinc-400 truncate"
          title={members}
        >
          {members}
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Edge picker */}
        {group.edges.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
              Clone pairs — click to view diff
            </p>
            <div className="flex flex-wrap gap-2">
              {group.edges.map((edge, i) => {
                const subA = submissions.find(
                  (s) => s.submission_id === edge.student_a,
                );
                const subB = submissions.find(
                  (s) => s.submission_id === edge.student_b,
                );
                const isActive =
                  activeEdge?.student_a === edge.student_a &&
                  activeEdge?.student_b === edge.student_b;

                return (
                  <button
                    key={i}
                    onClick={() => setActiveEdge(edge)}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                      isActive
                        ? "bg-red-100 dark:bg-red-950/50 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300"
                        : "bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <span>{subA?.student_id ?? edge.student_a}</span>
                    <span className="opacity-50">↔</span>
                    <span>{subB?.student_id ?? edge.student_b}</span>
                    <Badge
                      variant={CLONE_TYPE_VARIANT[edge.clone_type] ?? "outline"}
                      className="text-[10px] px-1 py-0 h-4 ml-0.5"
                    >
                      {edge.clone_type}
                    </Badge>
                    <span
                      className={`font-mono ${CONFIDENCE_COLOR(edge.confidence)}`}
                    >
                      {(edge.confidence * 100).toFixed(0)}%
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Diff viewer */}
        {activeEdge && groupSubs.length >= 2 ? (
          <DiffViewer
            key={`${activeEdge.student_a}-${activeEdge.student_b}`}
            submissions={groupSubs}
            initialLeftId={activeEdge.student_a}
            initialRightId={activeEdge.student_b}
            aiDetectionMap={aiDetectionMap}
          />
        ) : (
          <p className="text-sm text-zinc-400 text-center py-4">
            No source code available for diff.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
