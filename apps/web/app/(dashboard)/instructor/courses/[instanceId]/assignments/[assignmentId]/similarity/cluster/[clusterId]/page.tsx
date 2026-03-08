"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { getSimilarityReport } from "@/lib/api/cipas-client";
import type { AssignmentClusterResponse, CollusionGroup, CollusionEdge } from "@/types/cipas";
import { SectionHeader } from "@/components/instructor/section-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { SimilarityBadge, SimilarityScore } from "@/components/instructor/similarity/similarity-badge";
import { AnnotationPanel } from "@/components/instructor/similarity/annotation-panel";
import { 
  AlertCircle, 
  Download, 
  Flag,
  MessageSquare,
  ArrowLeft,
  Users,
  Link2,
  GitCompare,
} from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function ClusterInspectionPage({
  params,
}: {
  params: Promise<{ assignmentId: string; instanceId: string; clusterId: string }>;
}) {
  const { assignmentId, instanceId, clusterId: clusterIdParam } = React.use(params);

  const [report, setReport] = React.useState<AssignmentClusterResponse | null>(null);
  const [cluster, setCluster] = React.useState<CollusionGroup | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Fetch report and find cluster
  React.useEffect(() => {
    let mounted = true;

    async function fetchData() {
      try {
        setIsLoading(true);
        setError(null);

        const cachedReport = await getSimilarityReport(assignmentId);

        if (mounted) {
          setReport(cachedReport);
          
          if (cachedReport) {
            const found = cachedReport.collusion_groups.find(
              (g) => g.group_id === parseInt(clusterIdParam, 10)
            );
            
            if (found) {
              setCluster(found);
            } else {
              setError("Cluster not found");
            }
          } else {
            setError("Similarity report not found. Please run analysis first.");
          }
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load cluster details");
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    fetchData();
    return () => {
      mounted = false;
    };
  }, [assignmentId, clusterIdParam]);

  const handleCompare = (edge: CollusionEdge) => {
    // Navigate to diff viewer
    const searchParams = new URLSearchParams({
      submission1: edge.student_a,
      submission2: edge.student_b,
    });
    window.open(
      `/instructor/courses/${instanceId}/assignments/${assignmentId}/similarity/compare?${searchParams}`,
      "_blank"
    );
  };

  const handleExport = async () => {
    try {
      const { exportSimilarityReport } = await import("@/lib/api/cipas-client");
      const blob = await exportSimilarityReport(assignmentId, "csv");
      
      // Download the file
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cluster-${clusterId}-report-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Export failed:", err);
      setError("Failed to export evidence. Please try again.");
    }
  };

  if (error) {
    return (
      <div className="p-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Link href={`/instructor/courses/${instanceId}/assignments/${assignmentId}/similarity`}>
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Overview
          </Button>
        </Link>
      </div>
    );
  }

  if (isLoading || !cluster) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const clusterId = String.fromCharCode(64 + cluster.group_id);
  
  // Find highest similarity edge
  const maxEdge = cluster.edges.reduce((max, edge) => 
    edge.confidence > max.confidence ? edge : max
  , cluster.edges[0]);

  return (
    <div className="flex flex-col gap-6 p-8 pb-16">
      <div>
        <Link href={`/instructor/courses/${instanceId}/assignments/${assignmentId}/similarity`}>
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Overview
          </Button>
        </Link>

        <SectionHeader
          title={`Cluster ${clusterId} (${cluster.member_count} Submissions)`}
          description={`${cluster.dominant_type} • Average Similarity: ${Math.round(cluster.max_confidence * 100)}%`}
          action={
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Export Evidence
              </Button>
              <Button variant="destructive">
                <Flag className="h-4 w-4 mr-2" />
                Flag for Review
              </Button>
            </div>
          }
        />

        <div className="flex items-center gap-3 mt-4">
          <SimilarityBadge similarity={cluster.max_confidence} />
          <span className="text-sm text-muted-foreground">
            Last updated: {format(new Date(), "MMM d, yyyy 'at' h:mm a")}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Network Graph + Submission Table */}
        <div className="lg:col-span-2 space-y-6">
          {/* Network Graph */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5 text-primary" />
                Network Similarity Graph
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative w-full aspect-video bg-slate-50 dark:bg-slate-950 rounded-lg border border-dashed border-slate-200 dark:border-slate-800">
                {/* Simple node visualization */}
                <svg className="absolute inset-0 w-full h-full">
                  {cluster.edges.map((edge, idx) => {
                    // Calculate positions for demo (in production, use D3.js)
                    const positions = [
                      { x1: "25%", y1: "25%", x2: "50%", y2: "50%" },
                      { x1: "75%", y1: "25%", x2: "50%", y2: "50%" },
                      { x1: "25%", y1: "75%", x2: "50%", y2: "50%" },
                      { x1: "75%", y1: "75%", x2: "50%", y2: "50%" },
                    ];
                    const pos = positions[idx % positions.length];
                    
                    return (
                      <line
                        key={idx}
                        className="text-primary/40"
                        stroke="currentColor"
                        strokeWidth="2"
                        {...pos}
                      />
                    );
                  })}
                </svg>

                {/* Nodes */}
                {cluster.member_ids.slice(0, 5).map((memberId, idx) => {
                  const positions = [
                    { top: "25%", left: "25%" },
                    { top: "25%", right: "25%" },
                    { bottom: "25%", left: "25%" },
                    { bottom: "25%", right: "25%" },
                    { top: "50%", left: "50%" },
                  ];
                  const pos = positions[idx];

                  return (
                    <div
                      key={memberId}
                      className="absolute -translate-x-1/2 -translate-y-1/2"
                      style={pos}
                    >
                      <div className="flex flex-col items-center">
                        <div className="size-12 rounded-full bg-primary ring-2 ring-primary/20 flex items-center justify-center text-white font-bold shadow-lg">
                          {memberId.substring(0, 2).toUpperCase()}
                        </div>
                        <span className="mt-2 text-xs font-medium text-center max-w-[80px] truncate">
                          {memberId}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Submission Table */}
          <Card>
            <CardHeader>
              <CardTitle>Submission Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {cluster.member_ids.map((memberId, idx) => {
                  // Find edges involving this member
                  const memberEdges = cluster.edges.filter(
                    (e) => e.student_a === memberId || e.student_b === memberId
                  );
                  const avgSimilarity = memberEdges.length > 0
                    ? memberEdges.reduce((sum, e) => sum + e.confidence, 0) / memberEdges.length
                    : 0;

                  return (
                    <div
                      key={memberId}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg border",
                        idx === 0 ? "bg-primary/5 border-primary/20" : "hover:bg-slate-50 dark:hover:bg-slate-800"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className="size-8 rounded bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                          {memberId.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium">Student {memberId}</p>
                          {idx === 0 && (
                            <Badge variant="secondary" className="text-[10px] mt-0.5">
                              Primary
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <SimilarityScore score={avgSimilarity} showBar />
                        <Button size="sm" variant="outline">
                          Compare
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Summary + Activity */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Cluster Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border">
                <p className="text-xs text-muted-foreground uppercase font-bold tracking-widest mb-1">
                  Most Significant Connection
                </p>
                <p className="text-lg font-bold">
                  {maxEdge.student_a.substring(0, 6)} ↔ {maxEdge.student_b.substring(0, 6)} ({Math.round(maxEdge.confidence * 100)}%)
                </p>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border">
                <p className="text-xs text-muted-foreground uppercase font-bold tracking-widest mb-1">
                  Clone Type Distribution
                </p>
                <div className="space-y-2 mt-2">
                  {["Type-1", "Type-2", "Type-3"].map((type) => {
                    const count = cluster.edges.filter((e) => e.clone_type === type).length;
                    if (count === 0) return null;
                    
                    return (
                      <div key={type} className="flex justify-between text-sm">
                        <span>{type}</span>
                        <span className="font-bold">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Annotation Panel */}
          <AnnotationPanel 
            assignmentId={assignmentId} 
            clusterId={cluster.group_id} 
          />

          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                <GitCompare className="h-6 w-6 text-primary shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-primary mb-1">Next Steps</h4>
                  <p className="text-sm leading-relaxed mb-3">
                    Comparing <strong>{maxEdge.student_a.substring(0, 8)}</strong> and{" "}
                    <strong>{maxEdge.student_b.substring(0, 8)}</strong> side-by-side is recommended
                    due to their {Math.round(maxEdge.confidence * 100)}% structural similarity score.
                  </p>
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => handleCompare(maxEdge)}
                    className="w-full"
                  >
                    Launch Comparator →
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edges/Connections Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Clone Connections ({cluster.edges.length})</span>
            <Badge variant="outline">{cluster.dominant_type}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {cluster.edges.map((edge, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 rounded-lg border hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 font-mono text-sm">
                    <span className="font-medium">{edge.student_a.substring(0, 8)}</span>
                    <span className="text-muted-foreground">↔</span>
                    <span className="font-medium">{edge.student_b.substring(0, 8)}</span>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {edge.clone_type}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {edge.match_count} {edge.match_count === 1 ? "match" : "matches"}
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  <SimilarityScore score={edge.confidence} showBar />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCompare(edge)}
                  >
                    <GitCompare className="h-3.5 w-3.5 mr-1.5" />
                    Compare
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
