"use client";

import * as React from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionHeader } from "@/components/instructor/section-header";
import { SimilarityScore } from "@/components/instructor/similarity/similarity-badge";
import { 
  AlertCircle, 
  ArrowLeft,
  Code2,
  GitCompare,
  Download,
  Check,
  X,
  FileCode,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface CodeLine {
  lineNumber: number;
  content: string;
  isClone?: boolean;
  cloneType?: "Type-1" | "Type-2" | "Type-3";
}

interface SubmissionData {
  id: string;
  studentName: string;
  code: string;
  language: string;
  lines: CodeLine[];
}

export default function DiffViewerPage({
  params,
}: {
  params: Promise<{ assignmentId: string; instanceId: string }>;
}) {
  const { assignmentId, instanceId } = React.use(params);
  const searchParams = useSearchParams();
  const router = useRouter();

  const submission1Id = searchParams.get("submission1");
  const submission2Id = searchParams.get("submission2");

  const [submission1, setSubmission1] = React.useState<SubmissionData | null>(null);
  const [submission2, setSubmission2] = React.useState<SubmissionData | null>(null);
  const [similarity, setSimilarity] = React.useState(92.5);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [viewMode, setViewMode] = React.useState<"side-by-side" | "unified">("side-by-side");

  React.useEffect(() => {
    if (!submission1Id || !submission2Id) {
      setError("Missing submission IDs");
      setIsLoading(false);
      return;
    }

    let mounted = true;

    async function fetchData() {
      try {
        setIsLoading(true);
        setError(null);

        // TODO: Replace with actual API calls to fetch submission code
        // For now, using mock data
        await new Promise((resolve) => setTimeout(resolve, 800));

        if (mounted) {
          // Mock data - in production, fetch from assessment API
          const mockCode1 = `def calculate_fibonacci(n):
    """Calculate nth Fibonacci number"""
    if n <= 0:
        return 0
    elif n == 1:
        return 1
    else:
        return calculate_fibonacci(n-1) + calculate_fibonacci(n-2)

def main():
    number = int(input("Enter a number: "))
    result = calculate_fibonacci(number)
    print(f"Fibonacci({number}) = {result}")

if __name__ == "__main__":
    main()`;

          const mockCode2 = `def fib(num):
    # Returns the Fibonacci value
    if num <= 0:
        return 0
    elif num == 1:
        return 1
    else:
        return fib(num - 1) + fib(num - 2)

def run():
    n = int(input("Enter a number: "))
    answer = fib(n)
    print(f"Fibonacci({n}) = {answer}")

if __name__ == "__main__":
    run()`;

          const lines1: CodeLine[] = mockCode1.split("\n").map((content, idx) => ({
            lineNumber: idx + 1,
            content,
            isClone: idx >= 1 && idx <= 7,
            cloneType: idx >= 1 && idx <= 7 ? "Type-2" : undefined,
          }));

          const lines2: CodeLine[] = mockCode2.split("\n").map((content, idx) => ({
            lineNumber: idx + 1,
            content,
            isClone: idx >= 1 && idx <= 7,
            cloneType: idx >= 1 && idx <= 7 ? "Type-2" : undefined,
          }));

          setSubmission1({
            id: submission1Id!,
            studentName: `Student ${submission1Id!.substring(0, 8)}`,
            code: mockCode1,
            language: "python",
            lines: lines1,
          });

          setSubmission2({
            id: submission2Id!,
            studentName: `Student ${submission2Id!.substring(0, 8)}`,
            code: mockCode2,
            language: "python",
            lines: lines2,
          });
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load submissions");
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    fetchData();
    return () => {
      mounted = false;
    };
  }, [submission1Id, submission2Id]);

  const getLineBackground = (line: CodeLine) => {
    if (!line.isClone) return "";
    
    switch (line.cloneType) {
      case "Type-1":
        return "bg-red-50 dark:bg-red-950/20 border-l-4 border-l-red-500";
      case "Type-2":
        return "bg-orange-50 dark:bg-orange-950/20 border-l-4 border-l-orange-500";
      case "Type-3":
        return "bg-blue-50 dark:bg-blue-950/20 border-l-4 border-l-blue-500";
      default:
        return "";
    }
  };

  const handleExport = async () => {
    try {
      const { exportSimilarityReport } = await import("@/lib/api/cipas-client");
      const blob = await exportSimilarityReport(assignmentId, "csv");
      
      // Download the file
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `comparison-${submission1Id}-${submission2Id}-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Export failed:", err);
      setError("Failed to export report. Please try again.");
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

  if (isLoading || !submission1 || !submission2) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

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
          title="Code Comparison"
          description={`Comparing ${submission1.studentName} and ${submission2.studentName}`}
          action={
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Export Report
              </Button>
              <Button variant="default">
                <Check className="h-4 w-4 mr-2" />
                Mark Review Complete
              </Button>
            </div>
          }
        />
      </div>

      {/* Similarity Summary Card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground uppercase font-bold tracking-widest">
                  Overall Similarity
                </span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-4xl font-bold text-primary">{similarity}%</span>
                  <Badge variant="destructive" className="mb-1">High Risk</Badge>
                </div>
              </div>

              <div className="h-12 w-px bg-border" />

              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground uppercase font-bold tracking-widest">
                  Clone Type
                </span>
                <span className="text-2xl font-bold mt-1">Type-2</span>
              </div>

              <div className="h-12 w-px bg-border" />

              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground uppercase font-bold tracking-widest">
                  Matching Segments
                </span>
                <span className="text-2xl font-bold mt-1">8</span>
              </div>
            </div>

            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
              <TabsList>
                <TabsTrigger value="side-by-side">Side by Side</TabsTrigger>
                <TabsTrigger value="unified">Unified</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center gap-6 text-xs">
            <span className="font-bold text-muted-foreground uppercase tracking-widest">
              Clone Types:
            </span>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-sm" />
              <span>Type-1 (Exact)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-orange-500 rounded-sm" />
              <span>Type-2 (Renamed)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500 rounded-sm" />
              <span>Type-3 (Gapped)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Code Comparison View */}
      {viewMode === "side-by-side" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left: Submission 1 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                <div className="flex items-center gap-2">
                  <FileCode className="h-4 w-4" />
                  {submission1.studentName}
                </div>
                <Badge variant="secondary" className="font-mono text-xs">
                  {submission1.language}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="relative">
                {/* Code view with line numbers */}
                <pre className="font-mono text-xs overflow-x-auto">
                  {submission1.lines.map((line) => (
                    <div
                      key={line.lineNumber}
                      className={cn(
                        "flex hover:bg-slate-100 dark:hover:bg-slate-800",
                        getLineBackground(line)
                      )}
                    >
                      <span className="inline-block w-12 shrink-0 text-right pr-4 text-muted-foreground select-none border-r bg-slate-50 dark:bg-slate-900">
                        {line.lineNumber}
                      </span>
                      <code className="flex-1 px-4 py-0.5 whitespace-pre">
                        {line.content || " "}
                      </code>
                    </div>
                  ))}
                </pre>
              </div>
            </CardContent>
          </Card>

          {/* Right: Submission 2 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                <div className="flex items-center gap-2">
                  <FileCode className="h-4 w-4" />
                  {submission2.studentName}
                </div>
                <Badge variant="secondary" className="font-mono text-xs">
                  {submission2.language}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="relative">
                <pre className="font-mono text-xs overflow-x-auto">
                  {submission2.lines.map((line) => (
                    <div
                      key={line.lineNumber}
                      className={cn(
                        "flex hover:bg-slate-100 dark:hover:bg-slate-800",
                        getLineBackground(line)
                      )}
                    >
                      <span className="inline-block w-12 shrink-0 text-right pr-4 text-muted-foreground select-none border-r bg-slate-50 dark:bg-slate-900">
                        {line.lineNumber}
                      </span>
                      <code className="flex-1 px-4 py-0.5 whitespace-pre">
                        {line.content || " "}
                      </code>
                    </div>
                  ))}
                </pre>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        /* Unified View */
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Unified Diff View</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="relative">
              <pre className="font-mono text-xs overflow-x-auto">
                {submission1.lines.map((line1, idx) => {
                  const line2 = submission2.lines[idx];
                  const isDifferent = line1.content !== line2?.content;

                  return (
                    <React.Fragment key={idx}>
                      {/* Submission 1 line */}
                      <div
                        className={cn(
                          "flex hover:bg-slate-100 dark:hover:bg-slate-800",
                          getLineBackground(line1),
                          isDifferent && "bg-red-50/50 dark:bg-red-950/10"
                        )}
                      >
                        <span className="inline-block w-12 shrink-0 text-right pr-4 text-muted-foreground select-none border-r bg-slate-50 dark:bg-slate-900">
                          {line1.lineNumber}
                        </span>
                        <span className="inline-block w-4 shrink-0 text-center text-red-500 font-bold">
                          {isDifferent ? "-" : " "}
                        </span>
                        <code className="flex-1 px-3 py-0.5 whitespace-pre">
                          {line1.content || " "}
                        </code>
                      </div>
                      
                      {/* Submission 2 line */}
                      {line2 && (
                        <div
                          className={cn(
                            "flex hover:bg-slate-100 dark:hover:bg-slate-800",
                            getLineBackground(line2),
                            isDifferent && "bg-green-50/50 dark:bg-green-950/10"
                          )}
                        >
                          <span className="inline-block w-12 shrink-0 text-right pr-4 text-muted-foreground select-none border-r bg-slate-50 dark:bg-slate-900">
                            {line2.lineNumber}
                          </span>
                          <span className="inline-block w-4 shrink-0 text-center text-green-500 font-bold">
                            {isDifferent ? "+" : " "}
                          </span>
                          <code className="flex-1 px-3 py-0.5 whitespace-pre">
                            {line2.content || " "}
                          </code>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Segment Map Sidebar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Similarity Segments</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { start: 2, end: 8, type: "Type-2", confidence: 95.2 },
              { start: 10, end: 13, type: "Type-2", confidence: 88.7 },
            ].map((segment, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 rounded-lg border bg-orange-50/50 dark:bg-orange-950/10 border-orange-200 dark:border-orange-800"
              >
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="font-mono text-xs">
                    L{segment.start}-{segment.end}
                  </Badge>
                  <span className="text-sm font-medium">{segment.type}</span>
                </div>
                <SimilarityScore score={segment.confidence / 100} showBar={false} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
