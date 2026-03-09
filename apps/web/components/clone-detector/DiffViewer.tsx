"use client";

/**
 * DiffViewer — side-by-side diff with independent submission selectors.
 *
 * - Amber  = cloned lines (equal on both sides)
 * - Red    = only in left submission
 * - Green  = only in right submission
 * - Arrows on each panel header to cycle through submissions independently
 * - Jump prev/next buttons to navigate between clone blocks
 * - AI likelihood badges shown in panel headers
 */

import { useRef, useState, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
} from "lucide-react";
import type { SubmissionItem, AIDetectionResponse } from "@/types/cipas";
import { AILikelihoodBadge } from "./AILikelihoodBadge";

type LineTag = "equal" | "insert" | "delete";

interface DiffLine {
  tag: LineTag;
  left?: string;
  right?: string;
}

function computeLCS(a: string[], b: string[]): boolean[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        dp[i][j] = 1 + dp[i + 1][j + 1];
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }
  // Backtrack to mark matching pairs
  const matched: boolean[][] = Array.from({ length: m }, () =>
    new Array(n).fill(false),
  );
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      matched[i][j] = true;
      i++;
      j++;
    } else if (dp[i + 1]?.[j] >= dp[i]?.[j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return matched;
}

function diffLines(leftCode: string, rightCode: string): DiffLine[] {
  const left = leftCode.split("\n");
  const right = rightCode.split("\n");

  // For large files, fall back to a simpler O(N) indexed diff
  if (left.length * right.length > 100_000) {
    const result: DiffLine[] = [];
    const maxLen = Math.max(left.length, right.length);
    for (let i = 0; i < maxLen; i++) {
      const l = left[i];
      const r = right[i];
      if (l === undefined) result.push({ tag: "insert", right: r });
      else if (r === undefined) result.push({ tag: "delete", left: l });
      else if (l === r) result.push({ tag: "equal", left: l, right: r });
      else {
        result.push({ tag: "delete", left: l });
        result.push({ tag: "insert", right: r });
      }
    }
    return result;
  }

  const matched = computeLCS(left, right);
  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && matched[i][j]) {
      result.push({ tag: "equal", left: left[i], right: right[j] });
      i++;
      j++;
    } else {
      // Scan ahead to emit deletions/insertions before the next equal
      let hasDelete = false;
      let hasInsert = false;
      // check if next match in left is at i+x
      if (i < left.length) {
        // Find the first match in row i at or after current j
        const nextMatchI = matched[i].findIndex((v, col) => v && col >= j);
        if (nextMatchI === -1) {
          // No future match for this left line — emit as deletion
          result.push({ tag: "delete", left: left[i] });
          i++;
          hasDelete = true;
        }
        // else: a future match exists; emit inserts to advance j toward it
      }
      if (!hasDelete && j < right.length) {
        result.push({ tag: "insert", right: right[j] });
        j++;
        hasInsert = true;
      }
      if (!hasDelete && !hasInsert) break;
    }
  }
  return result;
}

/** Groups consecutive equal-tag lines into blocks, returning their start indices. */
function cloneBlockIndices(lines: DiffLine[]): number[] {
  const starts: number[] = [];
  let inBlock = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].tag === "equal") {
      if (!inBlock) {
        starts.push(i);
        inBlock = true;
      }
    } else {
      inBlock = false;
    }
  }
  return starts;
}

interface PanelHeaderProps {
  label: string;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  side: "left" | "right";
  aiDetection?: AIDetectionResponse;
}

function PanelHeader({
  label,
  index,
  total,
  onPrev,
  onNext,
  side,
  aiDetection,
}: PanelHeaderProps) {
  const base =
    side === "left"
      ? "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400"
      : "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400";
  return (
    <div
      className={`flex items-center gap-2 px-2 py-1.5 ${base} border-b border-zinc-200 dark:border-zinc-700`}
    >
      <button
        onClick={onPrev}
        disabled={total <= 1}
        className="rounded p-0.5 hover:bg-black/5 disabled:opacity-30 shrink-0"
        title="Previous submission"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <span
        className="flex-1 text-xs font-semibold truncate text-center"
        title={label}
      >
        {label}
        {total > 1 && (
          <span className="ml-1 font-normal opacity-60">
            ({index + 1}/{total})
          </span>
        )}
      </span>
      {aiDetection && (
        <AILikelihoodBadge
          aiLikelihood={aiDetection.ai_likelihood}
          humanLikelihood={aiDetection.human_likelihood}
          showLabel={false}
          size="sm"
        />
      )}
      <button
        onClick={onNext}
        disabled={total <= 1}
        className="rounded p-0.5 hover:bg-black/5 disabled:opacity-30 shrink-0"
        title="Next submission"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export interface DiffViewerProps {
  /** All submissions available for selection on either side */
  submissions: SubmissionItem[];
  initialLeftId: string;
  initialRightId: string;
  /** Optional AI detection results map keyed by submission_id */
  aiDetectionMap?: Record<string, AIDetectionResponse>;
}

export function DiffViewer({
  submissions,
  initialLeftId,
  initialRightId,
  aiDetectionMap,
}: DiffViewerProps) {
  // initialLeftId / initialRightId are student_id values (from edge.student_a/b)
  const [leftIdx, setLeftIdx] = useState(() =>
    Math.max(
      0,
      submissions.findIndex((s) => s.student_id === initialLeftId),
    ),
  );
  const [rightIdx, setRightIdx] = useState(() =>
    Math.max(
      0,
      submissions.findIndex((s) => s.student_id === initialRightId),
    ),
  );
  const [cloneBlockCursor, setCloneBlockCursor] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  const leftSub = submissions[leftIdx];
  const rightSub = submissions[rightIdx];

  const cycle = (cur: number, delta: number) =>
    (cur + delta + submissions.length) % submissions.length;

  const lines =
    leftSub && rightSub
      ? diffLines(leftSub.source_code, rightSub.source_code)
      : [];

  const cloneStarts = cloneBlockIndices(lines);

  const jumpToBlock = useCallback(
    (direction: "prev" | "next") => {
      if (cloneStarts.length === 0) return;
      const next =
        direction === "next"
          ? (cloneBlockCursor + 1) % cloneStarts.length
          : (cloneBlockCursor - 1 + cloneStarts.length) % cloneStarts.length;
      setCloneBlockCursor(next);
      const row = rowRefs.current[cloneStarts[next]];
      row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    },
    [cloneBlockCursor, cloneStarts],
  );

  if (!leftSub || !rightSub) {
    return (
      <p className="text-xs text-zinc-400 text-center py-4">
        Source code not available.
      </p>
    );
  }

  return (
    <div className="font-mono text-xs rounded-md border border-zinc-200 dark:border-zinc-700 overflow-hidden">
      {/* Panel headers with submission selectors */}
      <div className="grid grid-cols-2">
        <PanelHeader
          side="left"
          label={`${leftSub.student_id} (${leftSub.submission_id})`}
          index={leftIdx}
          total={submissions.length}
          onPrev={() => setLeftIdx((i) => cycle(i, -1))}
          onNext={() => setLeftIdx((i) => cycle(i, 1))}
          aiDetection={aiDetectionMap?.[leftSub.submission_id]}
        />
        <div className="border-l border-zinc-200 dark:border-zinc-700">
          <PanelHeader
            side="right"
            label={`${rightSub.student_id} (${rightSub.submission_id})`}
            index={rightIdx}
            total={submissions.length}
            onPrev={() => setRightIdx((i) => cycle(i, -1))}
            onNext={() => setRightIdx((i) => cycle(i, 1))}
            aiDetection={aiDetectionMap?.[rightSub.submission_id]}
          />
        </div>
      </div>

      {/* Clone block jump controls */}
      {cloneStarts.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400">
          <span className="text-xs font-medium flex-1">
            {cloneStarts.length} clone block
            {cloneStarts.length !== 1 ? "s" : ""} detected
          </span>
          <button
            onClick={() => jumpToBlock("prev")}
            className="rounded p-0.5 hover:bg-amber-200/50 dark:hover:bg-amber-800/30"
            title="Previous clone block"
          >
            <ChevronsUp className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => jumpToBlock("next")}
            className="rounded p-0.5 hover:bg-amber-200/50 dark:hover:bg-amber-800/30"
            title="Next clone block"
          >
            <ChevronsDown className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Diff rows */}
      <div ref={scrollRef} className="max-h-[480px] overflow-y-auto">
        {lines.map((line, idx) => {
          if (line.tag === "equal") {
            return (
              <div
                key={idx}
                ref={(el) => {
                  rowRefs.current[idx] = el;
                }}
                className="grid grid-cols-2 bg-amber-50 dark:bg-amber-950/25"
              >
                <div className="px-3 py-0.5 whitespace-pre-wrap break-all text-amber-900 dark:text-amber-200 border-l-2 border-amber-400 dark:border-amber-600">
                  {line.left}
                </div>
                <div className="px-3 py-0.5 whitespace-pre-wrap break-all text-amber-900 dark:text-amber-200 border-l border-amber-200 dark:border-amber-800">
                  {line.right}
                </div>
              </div>
            );
          }
          if (line.tag === "delete") {
            return (
              <div
                key={idx}
                ref={(el) => {
                  rowRefs.current[idx] = el;
                }}
                className="grid grid-cols-2"
              >
                <div className="px-3 py-0.5 whitespace-pre-wrap break-all bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border-l-2 border-red-400 dark:border-red-600">
                  {line.left}
                </div>
                <div className="px-3 py-0.5 bg-zinc-50 dark:bg-zinc-800/40 border-l border-zinc-200 dark:border-zinc-700" />
              </div>
            );
          }
          return (
            <div
              key={idx}
              ref={(el) => {
                rowRefs.current[idx] = el;
              }}
              className="grid grid-cols-2"
            >
              <div className="px-3 py-0.5 bg-zinc-50 dark:bg-zinc-800/40" />
              <div className="px-3 py-0.5 whitespace-pre-wrap break-all bg-green-50 dark:bg-green-950/40 text-green-800 dark:text-green-300 border-l border-green-200 dark:border-green-800">
                {line.right}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-3 py-1.5 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/30 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-300 dark:bg-amber-700" />
          Cloned
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-300 dark:bg-red-700" />
          Only left
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-300 dark:bg-green-700" />
          Only right
        </span>
      </div>
    </div>
  );
}
