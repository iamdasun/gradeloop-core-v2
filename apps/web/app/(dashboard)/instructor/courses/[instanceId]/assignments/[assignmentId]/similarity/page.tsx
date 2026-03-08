"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { getSimilarityReport, clusterAssignment, getSimilarityReportMetadata, getAnnotations } from "@/lib/api/cipas-client";
import { instructorAssessmentsApi, assessmentsApi } from "@/lib/api/assessments";
import type { AssignmentClusterResponse, CollusionGroup, SubmissionItem, AnnotationResponse } from "@/types/cipas";
import type { AssignmentResponse, SubmissionResponse } from "@/types/assessments.types";
import { SectionHeader } from "@/components/instructor/section-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DataTable, type ColumnDef } from "@/components/instructor/data-table";
import { NetworkGraph } from "@/components/instructor/similarity/network-graph";
import { ClusterCard } from "@/components/instructor/similarity/cluster-card";
import { SummaryStats } from "@/components/instructor/similarity/summary-stats";
import { SimilarityBadge, SimilarityScore } from "@/components/instructor/similarity/similarity-badge";
import { 
  RefreshCw, 
  Download, 
  Search, 
  AlertCircle, 
  Loader2,
  Eye,
  Filter,
  BarChart3,
} from "lucide-react";
import { format } from "date-fns";

export default function SimilarityOverviewPage() {
  const params = useParams();
  const router = useRouter();
  const assignmentId = params.assignmentId as string;
  const instanceId = params.instanceId as string;

  const [report, setReport] = React.useState<AssignmentClusterResponse | null>(null);
  const [assignment, setAssignment] = React.useState<AssignmentResponse | null>(null);
  const [annotations, setAnnotations] = React.useState<AnnotationResponse[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRunning, setIsRunning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [thresholdFilter, setThresholdFilter] = React.useState("0.7");
  const [sortBy, setSortBy] = React.useState("high-risk");
  const [statusFilter, setStatusFilter] = React.useState("all");

  // Fetch cached report, assignment data, and annotations
  React.useEffect(() => {
    let mounted = true;

    async function fetchData() {
      try {
        setIsLoading(true);
        setError(null);

        const [cachedReport, assignments] = await Promise.all([
          getSimilarityReport(assignmentId),
          instructorAssessmentsApi.listMyAssignments(),
        ]);

        if (mounted) {
          setReport(cachedReport);
          const found = assignments.find((a) => a.id === assignmentId);
          if (found) setAssignment(found);

          // Fetch annotations if report exists
          if (cachedReport) {
            try {
              const annotationsData = await getAnnotations(assignmentId);
              setAnnotations(annotationsData);
            } catch {
              // Non-critical if annotations fail to load
              setAnnotations([]);
            }
          }
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load similarity report");
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    fetchData();
    return () => {
      mounted = false;
    };
  }, [assignmentId]);

  // Run similarity analysis
  const handleRunAnalysis = async () => {
    try {
      setIsRunning(true);
      setError(null);

      // Fetch all submissions for this assignment
      const submissions = await instructorAssessmentsApi.listSubmissions(assignmentId);

      if (submissions.length < 2) {
        setError("At least 2 submissions are required for similarity analysis");
        return;
      }

      // Fetch code for each submission
      const submissionsWithRawCode = await Promise.all(
        submissions.map(async (sub: SubmissionResponse) => {
          try {
            const code = await assessmentsApi.getSubmissionCode(sub.id);
            return {
              submission_id: sub.id,
              student_id: sub.user_id || "unknown",
              source_code: code.code || "",
            };
          } catch {
            return null;
          }
        })
      );

      const submissionsWithCode = submissionsWithRawCode.filter(
        (r): r is SubmissionItem => r !== null
      );

      if (submissionsWithCode.length < 2) {
        setError("Not enough submissions with code to analyze");
        return;
      }

      // Determine language from assignment (default to Python)
      const language = assignment?.language_id || "python";
      const languageStr = typeof language === "string" ? language.toLowerCase() : "python";

      // Run clustering
      const clusterResponse = await clusterAssignment({
        assignment_id: assignmentId,
        language: languageStr,
        submissions: submissionsWithCode,
        lsh_threshold: parseFloat(thresholdFilter),
        min_confidence: 0.0,
      });

      setReport(clusterResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run similarity analysis");
    } finally {
      setIsRunning(false);
    }
  };

  // Handle export
  const handleExport = async () => {
    try {
      const { exportSimilarityReport } = await import("@/lib/api/cipas-client");
      const blob = await exportSimilarityReport(assignmentId, "csv");
      
      // Download the file
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `similarity-report-${assignmentId}-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Export failed:", err);
      setError("Failed to export report. Please try again.");
    }
  };

  // Filter and sort clusters
  const filteredClusters = React.useMemo(() => {
    if (!report) return [];

    let clusters = [...report.collusion_groups];

    // Apply search filter
    if (searchQuery) {
      clusters = clusters.filter((c) =>
        c.member_ids.some((id) => id.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    // Apply threshold filter
    const threshold = parseFloat(thresholdFilter);
    clusters = clusters.filter((c) => c.max_confidence >= threshold);

    // Apply annotation status filter
    if (statusFilter !== "all") {
      clusters = clusters.filter((c) => {
        const annotation = annotations.find((a) => a.group_id === c.group_id.toString());
        return annotation?.status === statusFilter;
      });
    }

    // Sort
    if (sortBy === "high-risk") {
      clusters.sort((a, b) => b.max_confidence - a.max_confidence);
    } else if (sortBy === "size") {
      clusters.sort((a, b) => b.member_count - a.member_count);
    }

    return clusters;
  }, [report, searchQuery, thresholdFilter, sortBy, statusFilter, annotations]);

  // Calculate summary stats
  const stats = React.useMemo(() => {
    if (!report) {
      return { highRisk: 0, mediumRisk: 0, lowRisk: 0, flaggedCases: 0 };
    }

    const highRisk = report.collusion_groups.filter((c) => c.max_confidence >= 0.85).length;
    const mediumRisk = report.collusion_groups.filter(
      (c) => c.max_confidence >= 0.75 && c.max_confidence < 0.85
    ).length;
    const lowRisk = report.collusion_groups.filter((c) => c.max_confidence < 0.75).length;
    
    // Count unique flagged students
    const flaggedStudents = new Set<string>();
    report.collusion_groups.forEach((group) => {
      group.member_ids.forEach((id) => flaggedStudents.add(id));
    });

    return { highRisk, mediumRisk, lowRisk, flaggedCases: flaggedStudents.size };
  }, [report]);

  // Table columns
  const columns: ColumnDef<CollusionGroup>[] = [
    {
      accessorKey: "group_id",
      header: "Cluster ID",
      cell: ({ row }) => {
        const clusterId = String.fromCharCode(64 + row.original.group_id);
        const annotation = annotations.find((a) => a.group_id === row.original.group_id.toString());
        
        const statusConfig: Record<string, { icon: React.ReactNode; color: string }> = {
          confirmed_plagiarism: { icon: "⚠", color: "text-red-600" },
          false_positive: { icon: "✓", color: "text-green-600" },
        };

        const status = annotation?.status && statusConfig[annotation.status];

        return (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-sm relative">
              {clusterId}
              {status && (
                <span className={`absolute -top-1 -right-1 text-xs ${status.color}`}>
                  {status.icon}
                </span>
              )}
            </div>
            <div className="flex flex-col">
              <span className="font-medium">{row.original.dominant_type}</span>
              {annotation && (
                <span className="text-xs text-muted-foreground capitalize">
                  {annotation.status.replace(/_/g, " ")}
                </span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "member_count",
      header: "Submissions",
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.member_count} students</span>
      ),
    },
    {
      accessorKey: "max_confidence",
      header: "Avg Similarity",
      cell: ({ row }) => <SimilarityScore score={row.original.max_confidence} showBar />,
    },
    {
      accessorKey: "risk",
      header: "Risk Level",
      cell: ({ row }) => <SimilarityBadge similarity={row.original.max_confidence} />,
    },
    {
      id: "actions",
      header: () => <div className="text-right">Action</div>,
      cell: ({ row }) => (
        <div className="text-right">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleViewCluster(row.original)}
            className="gap-1.5"
          >
            <Eye className="h-3.5 w-3.5" />
            View Cluster
          </Button>
        </div>
      ),
    },
  ];

  const handleViewCluster = (cluster: CollusionGroup) => {
    router.push(
      `/instructor/courses/${instanceId}/assignments/${assignmentId}/similarity/cluster/${cluster.group_id}`
    );
  };

  if (error && !report) {
    return (
      <div className="p-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  // No report yet - show empty state
  if (!report) {
    return (
      <div className="p-8">
        <SectionHeader
          title="Similarity Analysis"
          description="Detect code similarity and potential plagiarism across submissions"
        />

        <Card className="mt-8">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BarChart3 className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Analysis Run Yet</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
              Run similarity analysis to detect code clones and potential collusion among submissions.
              This may take 10-30 seconds depending on the number of submissions.
            </p>
            <Button onClick={handleRunAnalysis} disabled={isRunning} size="lg">
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Run Similarity Analysis
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-8 pb-16">
      <SectionHeader
        title="Similarity Overview"
        description={`Analyzed ${report.submission_count} submissions • ${report.collusion_groups.length} clusters detected`}
        action={
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export Report
            </Button>
            <Button onClick={handleRunAnalysis} disabled={isRunning}>
              {isRunning ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Re-run Analysis
            </Button>
          </div>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Filter Bar */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 py-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Threshold
            </span>
            <Select value={thresholdFilter} onValueChange={setThresholdFilter}>
              <SelectTrigger className="w-24 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0.5">50%</SelectItem>
                <SelectItem value="0.6">60%</SelectItem>
                <SelectItem value="0.7">70%</SelectItem>
                <SelectItem value="0.8">80%</SelectItem>
                <SelectItem value="0.9">90%</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="h-6 w-px bg-border mx-2" />

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Sort By
            </span>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-40 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high-risk">High Risk First</SelectItem>
                <SelectItem value="size">Cluster Size</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="h-6 w-px bg-border mx-2" />

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Status
            </span>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Clusters</SelectItem>
                <SelectItem value="pending_review">Pending Review</SelectItem>
                <SelectItem value="confirmed_plagiarism">Confirmed</SelectItem>
                <SelectItem value="false_positive">False Positive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="ml-auto">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search student or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-64 h-8"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Visual Graph + Summary Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Network Cluster Visualization
              </CardTitle>
            </CardHeader>
            <CardContent>
              <NetworkGraph clusters={filteredClusters.slice(0, 4)} />
            </CardContent>
          </Card>
        </div>

        <div>
          <SummaryStats
            totalSubmissions={report.submission_count}
            flaggedCases={stats.flaggedCases}
            highRisk={stats.highRisk}
            mediumRisk={stats.mediumRisk}
            lowRisk={stats.lowRisk}
            aiInsight={
              stats.highRisk > 0
                ? `${stats.highRisk} high-confidence clusters detected. Review submissions for structural similarities and shared logic patterns.`
                : undefined
            }
          />
        </div>
      </div>

      {/* Clusters Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detected Clusters</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filteredClusters}
            searchPlaceholder="Search clusters..."
          />
        </CardContent>
      </Card>
    </div>
  );
}
