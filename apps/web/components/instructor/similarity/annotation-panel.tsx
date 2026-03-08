"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertCircle,
  Save,
  MessageSquare,
  Calendar,
  User,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  FileText,
} from "lucide-react";
import { format } from "date-fns";
import { createAnnotation, updateAnnotation, getAnnotations } from "@/lib/api/cipas-client";
import type { AnnotationResponse, AnnotationStatus, CreateAnnotationRequest } from "@/types/cipas";

interface AnnotationFormProps {
  assignmentId: string;
  clusterId: number;
  variant?: "create" | "update";
  existingAnnotation?: AnnotationResponse;
  onSuccess?: () => void;
}

const STATUS_CONFIG: Record<
  AnnotationStatus,
  { label: string; icon: React.ElementType; variant: "default" | "destructive" | "secondary" | "outline" }
> = {
  pending_review: {
    label: "Pending Review",
    icon: Clock,
    variant: "secondary",
  },
  confirmed_plagiarism: {
    label: "Confirmed Plagiarism",
    icon: XCircle,
    variant: "destructive",
  },
  false_positive: {
    label: "False Positive",
    icon: CheckCircle2,
    variant: "outline",
  },
  acceptable_collaboration: {
    label: "Acceptable Collaboration",
    icon: CheckCircle2,
    variant: "outline",
  },
  requires_investigation: {
    label: "Requires Investigation",
    icon: AlertTriangle,
    variant: "default",
  },
};

export function AnnotationForm({
  assignmentId,
  clusterId,
  variant = "create",
  existingAnnotation,
  onSuccess,
}: AnnotationFormProps) {
  const [status, setStatus] = React.useState<AnnotationStatus>(
    existingAnnotation?.status || "pending_review"
  );
  const [comments, setComments] = React.useState(existingAnnotation?.comments || "");
  const [actionTaken, setActionTaken] = React.useState(existingAnnotation?.action_taken || "");
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      if (variant === "create") {
        // TODO: Get actual instructor ID from auth context
        const payload: CreateAnnotationRequest = {
          assignment_id: assignmentId,
          instructor_id: "temp-instructor-id", // Placeholder
          group_id: clusterId.toString(),
          status,
          comments: comments.trim() || undefined,
          action_taken: actionTaken.trim() || undefined,
        };

        await createAnnotation(payload);
      } else if (existingAnnotation) {
        await updateAnnotation(existingAnnotation.id, {
          status,
          comments: comments.trim() || undefined,
          action_taken: actionTaken.trim() || undefined,
        });
      }

      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save annotation");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="status">Status</Label>
        <Select value={status} onValueChange={(v) => setStatus(v as AnnotationStatus)}>
          <SelectTrigger id="status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(STATUS_CONFIG).map(([value, config]) => {
              const Icon = config.icon;
              return (
                <SelectItem key={value} value={value}>
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {config.label}
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="comments">Comments</Label>
        <Textarea
          id="comments"
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          placeholder="Add notes about this cluster (evidence, context, etc.)"
          rows={4}
          className="resize-none"
        />
        <p className="text-xs text-muted-foreground">
          Document your findings and reasoning for the status change.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="actionTaken">Action Taken</Label>
        <Textarea
          id="actionTaken"
          value={actionTaken}
          onChange={(e) => setActionTaken(e.target.value)}
          placeholder="Describe any actions taken (contacted students, filed report, etc.)"
          rows={3}
          className="resize-none"
        />
      </div>

      <Button type="submit" disabled={isSaving} className="w-full">
        <Save className="h-4 w-4 mr-2" />
        {isSaving ? "Saving..." : variant === "create" ? "Create Annotation" : "Update Annotation"}
      </Button>
    </form>
  );
}

interface AnnotationHistoryProps {
  assignmentId: string;
  clusterId?: number;
}

export function AnnotationHistory({ assignmentId, clusterId }: AnnotationHistoryProps) {
  const [annotations, setAnnotations] = React.useState<AnnotationResponse[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;

    async function fetchAnnotations() {
      try {
        setIsLoading(true);
        setError(null);

        const data = await getAnnotations(assignmentId);
        
        if (mounted) {
          // Filter by cluster if specified
          const filtered = clusterId !== undefined
            ? data.filter((a) => a.group_id === clusterId.toString())
            : data;
          
          setAnnotations(filtered.sort((a, b) => 
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          ));
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load annotations");
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    fetchAnnotations();
    return () => {
      mounted = false;
    };
  }, [assignmentId, clusterId]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-24 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (annotations.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-20" />
        <p className="text-sm">No annotations yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {annotations.map((annotation) => {
        const config = STATUS_CONFIG[annotation.status];
        const Icon = config.icon;

        return (
          <Card key={annotation.id} className="border-l-4 border-l-primary">
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant={config.variant} className="flex items-center gap-1">
                    <Icon className="h-3 w-3" />
                    {config.label}
                  </Badge>
                  {clusterId === undefined && annotation.group_id && (
                    <Badge variant="outline" className="text-xs">
                      Group {annotation.group_id.substring(0, 8)}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(annotation.created_at), "MMM d, yyyy")}
                </div>
              </div>

              {annotation.comments && (
                <div className="text-sm">
                  <p className="font-medium text-muted-foreground mb-1">Comments:</p>
                  <p className="text-foreground leading-relaxed">{annotation.comments}</p>
                </div>
              )}

              {annotation.action_taken && (
                <div className="text-sm">
                  <p className="font-medium text-muted-foreground mb-1">Action Taken:</p>
                  <p className="text-foreground leading-relaxed">{annotation.action_taken}</p>
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
                <User className="h-3 w-3" />
                <span>Instructor {annotation.instructor_id.substring(0, 8)}</span>
                {annotation.updated_at !== annotation.created_at && (
                  <>
                    <span>•</span>
                    <span>Updated {format(new Date(annotation.updated_at), "MMM d 'at' h:mm a")}</span>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

interface AnnotationPanelProps {
  assignmentId: string;
  clusterId: number;
}

export function AnnotationPanel({ assignmentId, clusterId }: AnnotationPanelProps) {
  const [existingAnnotation, setExistingAnnotation] = React.useState<AnnotationResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [refreshKey, setRefreshKey] = React.useState(0);

  React.useEffect(() => {
    let mounted = true;

    async function checkExisting() {
      try {
        setIsLoading(true);
        const data = await getAnnotations(assignmentId);
        
        if (mounted) {
          const found = data.find((a) => a.group_id === clusterId.toString());
          setExistingAnnotation(found || null);
        }
      } catch (err) {
        console.error("Failed to fetch annotations:", err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    checkExisting();
    return () => {
      mounted = false;
    };
  }, [assignmentId, clusterId, refreshKey]);

  const handleSuccess = () => {
    setRefreshKey((prev) => prev + 1);
  };

  if (isLoading) {
    return <div className="h-48 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {existingAnnotation ? "Update Annotation" : "Add Annotation"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AnnotationForm
            assignmentId={assignmentId}
            clusterId={clusterId}
            variant={existingAnnotation ? "update" : "create"}
            existingAnnotation={existingAnnotation || undefined}
            onSuccess={handleSuccess}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Annotation History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AnnotationHistory assignmentId={assignmentId} clusterId={clusterId} />
        </CardContent>
      </Card>
    </div>
  );
}
