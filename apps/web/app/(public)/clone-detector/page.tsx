"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  Info,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SubmissionsForm } from "@/components/clone-detector/SubmissionsForm";
import { CollusionGroupCard } from "@/components/clone-detector/CollusionGroupCard";
import { clusterAssignment } from "@/lib/api/cipas-client";
import type {
  AssignmentClusterRequest,
  AssignmentClusterResponse,
  SubmissionItem,
} from "@/types/cipas";

export default function CloneDetectorPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AssignmentClusterResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSubmissions, setLastSubmissions] = useState<SubmissionItem[]>([]);

  const handleSubmit = async (req: AssignmentClusterRequest) => {
    setIsLoading(true);
    setError(null);
    setResult(null);
    setLastSubmissions(req.submissions);
    try {
      const res = await clusterAssignment(req);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Top bar */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-orange-500" />
          <div>
            <h1 className="text-lg font-semibold leading-tight">Clone Detector</h1>
            <p className="text-xs text-zinc-500">
              CIPAS Syntactics · Plagiarism &amp; Collusion Analysis
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Instructions banner */}
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 p-4 text-sm text-blue-800 dark:text-blue-300">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            Paste student submissions below and click{" "}
            <strong>Detect Collusion</strong>. The engine will fragment each
            submission, compute LSH fingerprints, and cascade through NiCAD
            (Type-1/2) and TomA (Type-3) phases to identify clone groups.
          </p>
        </div>

        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assignment Submissions</CardTitle>
          </CardHeader>
          <CardContent>
            <SubmissionsForm onSubmit={handleSubmit} isLoading={isLoading} />
          </CardContent>
        </Card>

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center gap-3 py-12 text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Running clone detection pipeline…</span>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-800 dark:text-red-300">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Request failed</p>
              <p className="mt-0.5 font-mono text-xs">{error}</p>
            </div>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-6">
            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard
                label="Submissions"
                value={result.submission_count}
                sub={`${result.processed_count} processed`}
              />
              <StatCard
                label="Clone Pairs"
                value={result.total_clone_pairs}
                alert={result.total_clone_pairs > 0}
              />
              <StatCard
                label="Collusion Groups"
                value={result.collusion_groups.length}
                alert={result.collusion_groups.length > 0}
              />
              <StatCard
                label="Failed"
                value={result.failed_count}
                alert={result.failed_count > 0}
              />
            </div>

            <Separator />

            {/* Clean result */}
            {result.collusion_groups.length === 0 && (
              <div className="flex items-center gap-3 rounded-lg border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-800 dark:text-green-300">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <p>
                  No collusion groups detected. All submissions appear
                  independent.
                </p>
              </div>
            )}

            {/* Collusion groups */}
            {result.collusion_groups.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold">Collusion Groups</h2>
                  <Badge variant="destructive">
                    {result.collusion_groups.length}
                  </Badge>
                </div>
                {result.collusion_groups.map((group, idx) => (
                  <CollusionGroupCard
                    key={group.group_id}
                    group={group}
                    submissions={lastSubmissions}
                    index={idx}
                  />
                ))}
              </div>
            )}

            {/* Per-submission breakdown */}
            <div className="space-y-3">
              <h2 className="text-base font-semibold">Per-Submission Breakdown</h2>
              <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-700">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-xs text-zinc-500 uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">Submission</th>
                      <th className="px-4 py-2.5 text-left font-medium">Student</th>
                      <th className="px-4 py-2.5 text-right font-medium">Fragments</th>
                      <th className="px-4 py-2.5 text-right font-medium">Candidates</th>
                      <th className="px-4 py-2.5 text-right font-medium">Confirmed Clones</th>
                      <th className="px-4 py-2.5 text-left font-medium">Errors</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
                    {result.per_submission.map((ps) => (
                      <tr
                        key={ps.submission_id}
                        className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
                      >
                        <td className="px-4 py-2.5 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                          {ps.submission_id}
                        </td>
                        <td className="px-4 py-2.5">{ps.student_id}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {ps.fragment_count}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {ps.candidate_pair_count}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {ps.confirmed_clone_count > 0 ? (
                            <span className="text-red-500 font-semibold">
                              {ps.confirmed_clone_count}
                            </span>
                          ) : (
                            <span className="text-green-600 dark:text-green-400">0</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-red-500">
                          {ps.errors.length > 0
                            ? ps.errors.join("; ")
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  alert,
}: {
  label: string;
  value: number;
  sub?: string;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        alert && value > 0
          ? "border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20"
          : "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
      }`}
    >
      <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium">
        {label}
      </p>
      <p
        className={`text-3xl font-bold tabular-nums mt-1 ${
          alert && value > 0
            ? "text-red-600 dark:text-red-400"
            : "text-zinc-900 dark:text-zinc-100"
        }`}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-zinc-400 mt-0.5">{sub}</p>}
    </div>
  );
}
